use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::contest_service::ContestStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::contest::{ContestStatus, ManualContestSummary, SaveManualContestInput};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

type ManualContestRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    String,
    String,
);

impl ContestStore for LocalWorkspaceStore {
    fn list_manual_contests(&self) -> Result<Vec<ManualContestSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, organization, role, board, source_url, status,
                        registration_starts_on, registration_ends_on, fee_deadline,
                        exam_date, notes, is_favorite, created_at, updated_at
                 FROM manual_contests
                 ORDER BY is_favorite DESC,
                          COALESCE(registration_ends_on, exam_date, '9999-12-31'),
                          name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar leitura dos concursos", error))?;
        let rows = statement
            .query_map([], read_manual_contest_row)
            .map_err(|error| map_database_error("consultar concursos", error))?;

        rows.map(|row| {
            let row = row.map_err(|error| map_database_error("ler concurso", error))?;
            summary_from_row(row)
        })
        .collect()
    }

    fn save_manual_contest(
        &self,
        input: &SaveManualContestInput,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar gravação do concurso", error))?;
        let contest_id = if let Some(id) = input.id.as_deref() {
            let changed = transaction
                .execute(
                    "UPDATE manual_contests
                     SET name = ?1, organization = ?2, role = ?3, board = ?4,
                         source_url = ?5, status = ?6, registration_starts_on = ?7,
                         registration_ends_on = ?8, fee_deadline = ?9, exam_date = ?10,
                         notes = ?11, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?12",
                    params![
                        input.name,
                        input.organization,
                        input.role,
                        input.board,
                        input.source_url,
                        input.status.as_str(),
                        input.registration_starts_on,
                        input.registration_ends_on,
                        input.fee_deadline,
                        input.exam_date,
                        input.notes,
                        id,
                    ],
                )
                .map_err(|error| map_database_error("atualizar concurso", error))?;
            if changed == 0 {
                return Err(WorkspaceError::InvalidInput(
                    "O concurso escolhido não existe mais.".to_string(),
                ));
            }
            id.to_string()
        } else {
            let id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO manual_contests (
                        id, name, organization, role, board, source_url, status,
                        registration_starts_on, registration_ends_on, fee_deadline,
                        exam_date, notes
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        id,
                        input.name,
                        input.organization,
                        input.role,
                        input.board,
                        input.source_url,
                        input.status.as_str(),
                        input.registration_starts_on,
                        input.registration_ends_on,
                        input.fee_deadline,
                        input.exam_date,
                        input.notes,
                    ],
                )
                .map_err(|error| map_database_error("gravar concurso", error))?;
            id
        };

        let summary = load_manual_contest(&transaction, &contest_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar gravação do concurso", error))?;
        Ok(summary)
    }

    fn set_manual_contest_favorite(
        &self,
        contest_id: &str,
        is_favorite: bool,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar alteração do favorito", error))?;
        let changed = transaction
            .execute(
                "UPDATE manual_contests
                 SET is_favorite = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![if is_favorite { 1_i64 } else { 0_i64 }, contest_id],
            )
            .map_err(|error| map_database_error("atualizar favorito do concurso", error))?;
        if changed == 0 {
            return Err(WorkspaceError::InvalidInput(
                "O concurso escolhido não existe mais.".to_string(),
            ));
        }

        let summary = load_manual_contest(&transaction, contest_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar alteração do favorito", error))?;
        Ok(summary)
    }
}

fn read_manual_contest_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManualContestRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
        row.get(12)?,
        row.get(13)?,
        row.get(14)?,
    ))
}

fn load_manual_contest(
    connection: &Connection,
    contest_id: &str,
) -> Result<ManualContestSummary, WorkspaceError> {
    let row = connection
        .query_row(
            "SELECT id, name, organization, role, board, source_url, status,
                    registration_starts_on, registration_ends_on, fee_deadline,
                    exam_date, notes, is_favorite, created_at, updated_at
             FROM manual_contests WHERE id = ?1",
            params![contest_id],
            read_manual_contest_row,
        )
        .optional()
        .map_err(|error| map_database_error("localizar concurso", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("O concurso escolhido não existe mais.".to_string())
        })?;
    summary_from_row(row)
}

fn summary_from_row(row: ManualContestRow) -> Result<ManualContestSummary, WorkspaceError> {
    let (
        id,
        name,
        organization,
        role,
        board,
        source_url,
        status,
        registration_starts_on,
        registration_ends_on,
        fee_deadline,
        exam_date,
        notes,
        is_favorite,
        created_at,
        updated_at,
    ) = row;
    let status = ContestStatus::from_storage(&status).ok_or_else(|| {
        WorkspaceError::Database("o concurso possui uma situação desconhecida".to_string())
    })?;

    Ok(ManualContestSummary {
        id,
        name,
        organization,
        role,
        board,
        source_url,
        status,
        registration_starts_on,
        registration_ends_on,
        fee_deadline,
        exam_date,
        notes,
        is_favorite: is_favorite == 1,
        created_at,
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::contest_service::ContestStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::study_service::StudyStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::contest::ContestStatus;
    use crate::domain::study_plan::CreatePreparationInput;
    use std::fs;

    #[test]
    fn saves_updates_and_favorites_manual_contests_in_sqlite() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-contest-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-contest-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Concursos de teste")
            .expect("o espaço temporário deve ser criado");

        let created = store
            .save_manual_contest(&SaveManualContestInput {
                id: None,
                name: "Analista de TI".to_string(),
                organization: Some("Órgão de teste".to_string()),
                role: Some("Analista".to_string()),
                board: None,
                source_url: Some("https://example.org/edital".to_string()),
                status: ContestStatus::Expected,
                registration_starts_on: None,
                registration_ends_on: Some("2028-06-30".to_string()),
                fee_deadline: None,
                exam_date: None,
                notes: None,
            })
            .expect("o concurso deve ser salvo");
        let updated = store
            .save_manual_contest(&SaveManualContestInput {
                id: Some(created.id.clone()),
                name: "Analista de TI - Edital publicado".to_string(),
                organization: created.organization.clone(),
                role: created.role.clone(),
                board: created.board.clone(),
                source_url: created.source_url.clone(),
                status: ContestStatus::NoticePublished,
                registration_starts_on: Some("2028-05-01".to_string()),
                registration_ends_on: created.registration_ends_on.clone(),
                fee_deadline: None,
                exam_date: None,
                notes: None,
            })
            .expect("o concurso deve ser atualizado");
        let favorited = store
            .set_manual_contest_favorite(&created.id, true)
            .expect("o favorito deve ser persistido");
        let loaded = store
            .list_manual_contests()
            .expect("a lista de concursos deve ser lida");

        assert_eq!(loaded.len(), 1);
        assert_eq!(updated.status, ContestStatus::NoticePublished);
        assert_eq!(favorited.name, "Analista de TI - Edital publicado");
        assert!(loaded[0].is_favorite);
        assert_eq!(
            loaded[0].registration_starts_on.as_deref(),
            Some("2028-05-01")
        );

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn migrates_version_twelve_workspace_without_losing_preparations() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-contest-upgrade-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-contest-upgrade-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Migração de concursos")
            .expect("o espaço temporário deve ser criado");
        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação existente".to_string(),
                organization: None,
                role: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação anterior deve ser criada");

        let connection = store
            .active_database()
            .expect("o banco temporário deve abrir");
        connection
            .execute_batch(
                "DROP TABLE study_reviews;
                 DROP TABLE manual_contests;
                 ALTER TABLE subjects DROP COLUMN study_status;
                 DELETE FROM schema_migrations WHERE version > 12;",
            )
            .expect("a fixture deve representar um banco na versão 12");
        drop(connection);

        store
            .open_workspace(&workspace_path)
            .expect("a migração da versão 13 deve ser aplicada na abertura");
        let plan = store
            .study_plan()
            .expect("os dados existentes devem continuar disponíveis");
        let contests = store
            .list_manual_contests()
            .expect("a nova tabela deve existir após a migração");
        let plan_for_review = store
            .daily_plan("2032-01-01")
            .expect("a tabela de revisões deve existir após a migração");

        assert_eq!(plan.preparations.len(), 1);
        assert_eq!(plan.preparations[0].id, preparation.id);
        assert!(contests.is_empty());
        assert!(plan_for_review.reviews.is_empty());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
