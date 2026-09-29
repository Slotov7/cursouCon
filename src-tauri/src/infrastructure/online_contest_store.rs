use super::{
    map_database_error,
    material_store::{prepare_blob_bytes, register_prepared_material},
    workspace_store::LocalWorkspaceStore,
};
use crate::application::online_contest_service::OnlineContestStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::contest::ContestStatus;
use crate::domain::online_contest::{
    OnlineContestInput, OnlineContestNotice, OnlineContestRefreshResult, OnlineContestSnapshot,
    OnlineContestSourceState, OnlineContestSummary, SetOnlineContestFavoriteInput,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::fs;
use uuid::Uuid;

struct OnlineContestRow {
    id: String,
    source_name: String,
    source_key: String,
    source_url: String,
    name: String,
    organization: Option<String>,
    role: Option<String>,
    board: Option<String>,
    area: Option<String>,
    location: Option<String>,
    education: Option<String>,
    salary_text: Option<String>,
    salary_max: Option<f64>,
    vacancies_text: Option<String>,
    vacancies: Option<i64>,
    status: String,
    status_evidence: String,
    registration_starts_on: Option<String>,
    registration_ends_on: Option<String>,
    fee_deadline: Option<String>,
    exam_date: Option<String>,
    source_checked_at: String,
    is_favorite: i64,
    notice_material_id: Option<String>,
    has_changes: i64,
    created_at: String,
    updated_at: String,
}

impl OnlineContestStore for LocalWorkspaceStore {
    fn list_online_contests(&self) -> Result<OnlineContestSnapshot, WorkspaceError> {
        let connection = self.active_database()?;
        load_snapshot(&connection)
    }

    fn refresh_online_contests(
        &self,
        source_name: &str,
        source_url: &str,
        opportunities: &[OnlineContestInput],
    ) -> Result<OnlineContestRefreshResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar atualização de concursos", error))?;
        let mut imported_count = 0_i64;
        let mut updated_count = 0_i64;
        let mut unchanged_count = 0_i64;

        for opportunity in opportunities {
            let snapshot_json = serde_json::to_string(opportunity).map_err(|error| {
                WorkspaceError::Serialization(format!(
                    "serializar oportunidade de concurso: {error}"
                ))
            })?;
            let data_hash = hash_snapshot(&snapshot_json);
            let existing: Option<(String, String)> = transaction
                .query_row(
                    "SELECT id, data_hash FROM online_contest_opportunities
                     WHERE source_name = ?1 AND source_key = ?2",
                    params![opportunity.source_name, opportunity.source_key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|error| map_database_error("localizar oportunidade existente", error))?;

            let (opportunity_id, change_kind) = if let Some((id, previous_hash)) = existing {
                let changed = previous_hash != data_hash;
                update_opportunity(&transaction, &id, opportunity, &data_hash)?;
                if changed {
                    updated_count += 1;
                    (id, Some("changed"))
                } else {
                    unchanged_count += 1;
                    (id, None)
                }
            } else {
                let id = Uuid::new_v4().to_string();
                insert_opportunity(&transaction, &id, opportunity, &data_hash)?;
                imported_count += 1;
                (id, Some("initial"))
            };

            if let Some(change_kind) = change_kind {
                transaction
                    .execute(
                        "INSERT INTO online_contest_history
                            (id, opportunity_id, source_checked_at, data_hash, change_kind, snapshot_json)
                         VALUES (?1, ?2, CURRENT_TIMESTAMP, ?3, ?4, ?5)",
                        params![
                            Uuid::new_v4().to_string(),
                            opportunity_id,
                            data_hash,
                            change_kind,
                            snapshot_json,
                        ],
                    )
                    .map_err(|error| map_database_error("gravar histórico de concurso", error))?;
            }
        }

        transaction
            .execute(
                "INSERT INTO online_contest_source_state
                    (source_name, source_url, last_attempted_at, last_successful_at, last_error, updated_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
                 ON CONFLICT(source_name) DO UPDATE SET
                    source_url = excluded.source_url,
                    last_attempted_at = excluded.last_attempted_at,
                    last_successful_at = excluded.last_successful_at,
                    last_error = NULL,
                    updated_at = CURRENT_TIMESTAMP",
                params![source_name, source_url],
            )
            .map_err(|error| map_database_error("salvar estado da fonte de concursos", error))?;

        let snapshot = load_snapshot(&transaction)?;
        let source_checked_at = snapshot.source.last_successful_at.clone().ok_or_else(|| {
            WorkspaceError::Database("a consulta não registrou horário de sucesso".to_string())
        })?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar atualização de concursos", error))?;

        Ok(OnlineContestRefreshResult {
            source_name: source_name.to_string(),
            source_url: source_url.to_string(),
            source_checked_at,
            imported_count,
            updated_count,
            unchanged_count,
            opportunities: snapshot.opportunities,
        })
    }

    fn record_online_contest_source_failure(
        &self,
        source_name: &str,
        source_url: &str,
        message: &str,
    ) -> Result<(), WorkspaceError> {
        let connection = self.active_database()?;
        connection
            .execute(
                "INSERT INTO online_contest_source_state
                    (source_name, source_url, last_attempted_at, last_successful_at, last_error, updated_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP, NULL, ?3, CURRENT_TIMESTAMP)
                 ON CONFLICT(source_name) DO UPDATE SET
                    source_url = excluded.source_url,
                    last_attempted_at = excluded.last_attempted_at,
                    last_error = excluded.last_error,
                    updated_at = CURRENT_TIMESTAMP",
                params![source_name, source_url, truncate(message, 500)],
            )
            .map_err(|error| map_database_error("salvar falha da fonte de concursos", error))?;
        Ok(())
    }

    fn set_online_contest_favorite(
        &self,
        input: &SetOnlineContestFavoriteInput,
    ) -> Result<OnlineContestSnapshot, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar favorito de concurso", error))?;
        let changed = transaction
            .execute(
                "UPDATE online_contest_opportunities
                 SET is_favorite = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![
                    if input.is_favorite { 1_i64 } else { 0_i64 },
                    input.opportunity_id
                ],
            )
            .map_err(|error| map_database_error("atualizar favorito de concurso", error))?;
        if changed == 0 {
            return Err(WorkspaceError::InvalidInput(
                "A oportunidade escolhida não existe mais.".to_string(),
            ));
        }
        let snapshot = load_snapshot(&transaction)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar favorito de concurso", error))?;
        Ok(snapshot)
    }

    fn online_contest_source_url(&self, opportunity_id: &str) -> Result<String, WorkspaceError> {
        let connection = self.active_database()?;
        connection
            .query_row(
                "SELECT source_url FROM online_contest_opportunities WHERE id = ?1",
                params![opportunity_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("localizar origem do concurso", error))?
            .ok_or_else(|| {
                WorkspaceError::InvalidInput(
                    "A oportunidade escolhida não existe mais.".to_string(),
                )
            })
    }

    fn save_online_contest_notice(
        &self,
        opportunity_id: &str,
        notice: &OnlineContestNotice,
    ) -> Result<OnlineContestSnapshot, WorkspaceError> {
        let mut connection = self.active_database()?;
        let prepared = prepare_blob_bytes(self, notice.original_name.clone(), &notice.bytes)?;
        let transaction = match connection.transaction() {
            Ok(transaction) => transaction,
            Err(error) => {
                remove_prepared_blob(&prepared);
                return Err(map_database_error("iniciar salvamento do edital", error));
            }
        };
        let result = (|| {
            let material = register_prepared_material(&transaction, &prepared)?;
            let changed = transaction
                .execute(
                    "UPDATE online_contest_opportunities
                     SET notice_material_id = ?1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?2",
                    params![material.id, opportunity_id],
                )
                .map_err(|error| map_database_error("vincular edital ao concurso", error))?;
            if changed == 0 {
                return Err(WorkspaceError::InvalidInput(
                    "A oportunidade escolhida não existe mais.".to_string(),
                ));
            }
            load_snapshot(&transaction)
        })();

        let snapshot = match result {
            Ok(snapshot) => snapshot,
            Err(error) => {
                drop(transaction);
                remove_prepared_blob(&prepared);
                return Err(error);
            }
        };
        if let Err(error) = transaction.commit() {
            remove_prepared_blob(&prepared);
            return Err(map_database_error("confirmar salvamento do edital", error));
        }
        Ok(snapshot)
    }
}

fn remove_prepared_blob(prepared: &super::material_store::PreparedBlob) {
    if prepared.created_new_blob {
        let _ = fs::remove_file(&prepared.target_path);
    }
}

fn insert_opportunity(
    transaction: &Transaction<'_>,
    id: &str,
    opportunity: &OnlineContestInput,
    data_hash: &str,
) -> Result<(), WorkspaceError> {
    transaction
        .execute(
            "INSERT INTO online_contest_opportunities
                (id, source_name, source_key, source_url, name, organization, role, board,
                 area, location, education, salary_text, salary_max, vacancies_text, vacancies,
                 status, status_evidence, registration_starts_on, registration_ends_on,
                 fee_deadline, exam_date, source_checked_at, data_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                     ?16, ?17, ?18, ?19, ?20, ?21, CURRENT_TIMESTAMP, ?22)",
            params![
                id,
                opportunity.source_name,
                opportunity.source_key,
                opportunity.source_url,
                opportunity.name,
                opportunity.organization,
                opportunity.role,
                opportunity.board,
                opportunity.area,
                opportunity.location,
                opportunity.education,
                opportunity.salary_text,
                opportunity.salary_max,
                opportunity.vacancies_text,
                opportunity.vacancies,
                opportunity.status.as_str(),
                opportunity.status_evidence,
                opportunity.registration_starts_on,
                opportunity.registration_ends_on,
                opportunity.fee_deadline,
                opportunity.exam_date,
                data_hash,
            ],
        )
        .map_err(|error| map_database_error("gravar oportunidade de concurso", error))?;
    Ok(())
}

fn update_opportunity(
    transaction: &Transaction<'_>,
    id: &str,
    opportunity: &OnlineContestInput,
    data_hash: &str,
) -> Result<(), WorkspaceError> {
    transaction
        .execute(
            "UPDATE online_contest_opportunities SET
                source_url = ?1, name = ?2, organization = ?3, role = ?4, board = ?5,
                area = ?6, location = ?7, education = ?8, salary_text = ?9, salary_max = ?10,
                vacancies_text = ?11, vacancies = ?12, status = ?13, status_evidence = ?14,
                registration_starts_on = ?15, registration_ends_on = ?16, fee_deadline = ?17,
                exam_date = ?18, source_checked_at = CURRENT_TIMESTAMP, data_hash = ?19,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?20",
            params![
                opportunity.source_url,
                opportunity.name,
                opportunity.organization,
                opportunity.role,
                opportunity.board,
                opportunity.area,
                opportunity.location,
                opportunity.education,
                opportunity.salary_text,
                opportunity.salary_max,
                opportunity.vacancies_text,
                opportunity.vacancies,
                opportunity.status.as_str(),
                opportunity.status_evidence,
                opportunity.registration_starts_on,
                opportunity.registration_ends_on,
                opportunity.fee_deadline,
                opportunity.exam_date,
                data_hash,
                id,
            ],
        )
        .map_err(|error| map_database_error("atualizar oportunidade de concurso", error))?;
    Ok(())
}

fn load_snapshot(connection: &Connection) -> Result<OnlineContestSnapshot, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.source_name, c.source_key, c.source_url, c.name,
                    c.organization, c.role, c.board, c.area, c.location, c.education,
                    c.salary_text, c.salary_max, c.vacancies_text, c.vacancies, c.status,
                    c.status_evidence, c.registration_starts_on, c.registration_ends_on,
                    c.fee_deadline, c.exam_date, c.source_checked_at, c.is_favorite,
                    c.notice_material_id,
                    (SELECT COUNT(*) FROM online_contest_history h WHERE h.opportunity_id = c.id) > 1,
                    c.created_at, c.updated_at
             FROM online_contest_opportunities c
             ORDER BY c.is_favorite DESC,
                      COALESCE(c.registration_ends_on, c.exam_date, '9999-12-31'),
                      c.name COLLATE NOCASE
             LIMIT 1000",
        )
        .map_err(|error| map_database_error("preparar lista de oportunidades", error))?;
    let rows = statement
        .query_map([], read_online_contest_row)
        .map_err(|error| map_database_error("consultar oportunidades", error))?;
    let opportunities = rows
        .map(|row| {
            let row = row.map_err(|error| map_database_error("ler oportunidade", error))?;
            summary_from_row(row)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let source = connection
        .query_row(
            "SELECT source_name, source_url, last_attempted_at, last_successful_at, last_error
             FROM online_contest_source_state
             WHERE source_name = ?1",
            params![crate::domain::online_contest::ACHE_CONCURSOS_SOURCE_NAME],
            |row| {
                Ok(OnlineContestSourceState {
                    source_name: row.get(0)?,
                    source_url: row.get(1)?,
                    last_attempted_at: row.get(2)?,
                    last_successful_at: row.get(3)?,
                    last_error: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler estado da fonte de concursos", error))?
        .unwrap_or_else(|| OnlineContestSourceState {
            source_name: crate::domain::online_contest::ACHE_CONCURSOS_SOURCE_NAME.to_string(),
            source_url: crate::domain::online_contest::ACHE_CONCURSOS_SOURCE_URL.to_string(),
            last_attempted_at: None,
            last_successful_at: None,
            last_error: None,
        });

    Ok(OnlineContestSnapshot {
        opportunities,
        source,
    })
}

fn read_online_contest_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<OnlineContestRow> {
    Ok(OnlineContestRow {
        id: row.get(0)?,
        source_name: row.get(1)?,
        source_key: row.get(2)?,
        source_url: row.get(3)?,
        name: row.get(4)?,
        organization: row.get(5)?,
        role: row.get(6)?,
        board: row.get(7)?,
        area: row.get(8)?,
        location: row.get(9)?,
        education: row.get(10)?,
        salary_text: row.get(11)?,
        salary_max: row.get(12)?,
        vacancies_text: row.get(13)?,
        vacancies: row.get(14)?,
        status: row.get(15)?,
        status_evidence: row.get(16)?,
        registration_starts_on: row.get(17)?,
        registration_ends_on: row.get(18)?,
        fee_deadline: row.get(19)?,
        exam_date: row.get(20)?,
        source_checked_at: row.get(21)?,
        is_favorite: row.get(22)?,
        notice_material_id: row.get(23)?,
        has_changes: row.get(24)?,
        created_at: row.get(25)?,
        updated_at: row.get(26)?,
    })
}

fn summary_from_row(row: OnlineContestRow) -> Result<OnlineContestSummary, WorkspaceError> {
    let status = ContestStatus::from_storage(&row.status).ok_or_else(|| {
        WorkspaceError::Database("a oportunidade possui uma situação desconhecida".to_string())
    })?;
    Ok(OnlineContestSummary {
        id: row.id,
        source_name: row.source_name,
        source_key: row.source_key,
        source_url: row.source_url,
        name: row.name,
        organization: row.organization,
        role: row.role,
        board: row.board,
        area: row.area,
        location: row.location,
        education: row.education,
        salary_text: row.salary_text,
        salary_max: row.salary_max,
        vacancies_text: row.vacancies_text,
        vacancies: row.vacancies,
        status,
        status_evidence: row.status_evidence,
        registration_starts_on: row.registration_starts_on,
        registration_ends_on: row.registration_ends_on,
        fee_deadline: row.fee_deadline,
        exam_date: row.exam_date,
        source_checked_at: row.source_checked_at,
        is_favorite: row.is_favorite == 1,
        notice_material_id: row.notice_material_id,
        has_changes: row.has_changes == 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn hash_snapshot(snapshot_json: &str) -> String {
    let digest = Sha256::digest(snapshot_json.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}
