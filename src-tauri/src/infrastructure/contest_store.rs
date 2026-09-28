use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::contest_service::ContestStore;
use crate::application::material_service::MaterialStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::contest::{
    ContestStatus, ManualContestSummary, SaveManualContestInput, SetManualContestNoticeInput,
};
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
    Option<String>,
    Option<String>,
);

impl ContestStore for LocalWorkspaceStore {
    fn list_manual_contests(&self) -> Result<Vec<ManualContestSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT c.id, c.name, c.organization, c.role, c.board, c.source_url, c.status,
                        registration_starts_on, registration_ends_on, fee_deadline,
                        exam_date, notes, is_favorite, created_at, updated_at,
                        c.notice_material_id, m.original_name
                 FROM manual_contests c
                 LEFT JOIN materials m ON m.id = c.notice_material_id
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

    fn set_manual_contest_notice(
        &self,
        input: &SetManualContestNoticeInput,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        if let Some(material_id) = input.material_id.as_deref() {
            let connection = self.active_database()?;
            let is_pdf: Option<bool> = connection
                .query_row(
                    "SELECT COALESCE(source_url IS NULL AND mime_type = 'application/pdf', 0)
                     FROM materials WHERE id = ?1",
                    params![material_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("verificar edital importado", error))?;
            if is_pdf != Some(true) {
                return Err(WorkspaceError::InvalidInput(
                    "Escolha um PDF importado localmente para usar como edital offline."
                        .to_string(),
                ));
            }
            drop(connection);
            self.material_path(material_id)?;
        }

        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar vínculo do edital", error))?;
        let changed = transaction
            .execute(
                "UPDATE manual_contests
                 SET notice_material_id = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![input.material_id.as_deref(), input.contest_id.as_str()],
            )
            .map_err(|error| map_database_error("vincular edital ao concurso", error))?;
        if changed == 0 {
            return Err(WorkspaceError::InvalidInput(
                "O concurso escolhido não existe mais.".to_string(),
            ));
        }
        let summary = load_manual_contest(&transaction, &input.contest_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar vínculo do edital", error))?;
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
        row.get(15)?,
        row.get(16)?,
    ))
}

fn load_manual_contest(
    connection: &Connection,
    contest_id: &str,
) -> Result<ManualContestSummary, WorkspaceError> {
    let row = connection
        .query_row(
            "SELECT c.id, c.name, c.organization, c.role, c.board, c.source_url, c.status,
                    registration_starts_on, registration_ends_on, fee_deadline,
                    exam_date, notes, is_favorite, created_at, updated_at,
                    c.notice_material_id, m.original_name
             FROM manual_contests c
             LEFT JOIN materials m ON m.id = c.notice_material_id
             WHERE c.id = ?1",
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
        notice_material_id,
        notice_material_name,
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
        notice_material_id,
        notice_material_name,
        created_at,
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::contest_service::ContestStore;
    use crate::application::material_service::MaterialStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::study_service::StudyStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::contest::ContestStatus;
    use crate::domain::material::{ImportMaterialInput, RegisterMaterialLinkInput};
    use crate::domain::study::{CreateStudyTaskInput, StartStudySessionInput};
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
    fn keeps_favorite_notice_offline_and_rejects_external_links() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-notice-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-notice-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Edital de teste")
            .expect("o espaço deve ser criado");
        let contest = store
            .save_manual_contest(&SaveManualContestInput {
                id: None,
                name: "Concurso".to_string(),
                organization: None,
                role: None,
                board: None,
                source_url: None,
                status: ContestStatus::NoticePublished,
                registration_starts_on: None,
                registration_ends_on: None,
                fee_deadline: None,
                exam_date: None,
                notes: None,
            })
            .expect("o concurso deve ser criado");
        store
            .set_manual_contest_favorite(&contest.id, true)
            .expect("o concurso deve ser favorito");
        let original = app_data_dir.join("edital.pdf");
        fs::write(&original, b"%PDF-1.4\nfixture").expect("o PDF sintético deve existir");
        let material = store
            .import_material(&ImportMaterialInput {
                source_path: original.to_string_lossy().to_string(),
                subject_id: None,
            })
            .expect("o PDF deve ser copiado para o espaço");
        fs::remove_file(original).expect("o original pode ser removido");
        let linked = store
            .set_manual_contest_notice(&SetManualContestNoticeInput {
                contest_id: contest.id.clone(),
                material_id: Some(material.id.clone()),
            })
            .expect("o edital local deve ser vinculado");
        assert_eq!(linked.notice_material_name.as_deref(), Some("edital.pdf"));
        assert!(linked.is_favorite);
        assert!(store
            .material_path(&material.id)
            .expect("o PDF deve abrir")
            .is_file());

        let external = store
            .register_material_link(&RegisterMaterialLinkInput {
                url: "https://example.org/edital.pdf".to_string(),
                title: None,
                subject_id: None,
            })
            .expect("o link da fixture deve ser registrado");
        assert!(store
            .set_manual_contest_notice(&SetManualContestNoticeInput {
                contest_id: contest.id.clone(),
                material_id: Some(external.id),
            })
            .is_err());
        let loaded = store
            .list_manual_contests()
            .expect("o favorito deve sobreviver à leitura");
        assert_eq!(
            loaded[0].notice_material_id.as_deref(),
            Some(material.id.as_str())
        );
        assert!(loaded[0].is_favorite);

        let missing_blob = store
            .material_path(&material.id)
            .expect("a cópia local deve existir antes da falha simulada");
        fs::remove_file(missing_blob).expect("a cópia deve ser removida da fixture");
        assert!(store
            .set_manual_contest_notice(&SetManualContestNoticeInput {
                contest_id: contest.id,
                material_id: Some(material.id),
            })
            .is_err());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn migrates_version_nineteen_workspace_without_losing_sessions() {
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
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação anterior deve ser criada");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id.clone(),
                subject_id: None,
                material_id: None,
                title: "Sessão anterior à migração".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-01-01".to_string(),
            })
            .expect("a tarefa existente deve ser criada");
        let session = store
            .start_study_session(&StartStudySessionInput { task_id: task.id })
            .expect("a sessão ativa deve ser criada");

        let connection = store
            .active_database()
            .expect("o banco temporário deve abrir");
        connection
            .execute_batch(
                "ALTER TABLE study_sessions DROP COLUMN next_steps;
                  ALTER TABLE study_sessions DROP COLUMN difficulty;
                  ALTER TABLE study_sessions DROP COLUMN origin;
                  DROP TABLE study_session_duration_corrections;
                  DROP INDEX IF EXISTS idx_materials_source_url;
                   ALTER TABLE materials DROP COLUMN source_url;
                   DROP TABLE material_tags;
                   DROP INDEX IF EXISTS idx_preparations_reference_material;
                   ALTER TABLE preparations DROP COLUMN reference_document_status;
                   ALTER TABLE preparations DROP COLUMN board;
                   ALTER TABLE preparations DROP COLUMN reference_material_id;
                   ALTER TABLE preparations DROP COLUMN exam_rules_markdown;
                   ALTER TABLE subjects DROP COLUMN exam_weight;
                   DROP INDEX IF EXISTS idx_study_tasks_material;
                   ALTER TABLE study_tasks DROP COLUMN material_id;
                   DROP TABLE external_question_batches;
                   DROP INDEX IF EXISTS idx_manual_contests_notice_material;
                    ALTER TABLE manual_contests DROP COLUMN notice_material_id;
                    DELETE FROM schema_migrations WHERE version >= 20;",
            )
            .expect("a fixture deve representar um banco na versão 19");
        drop(connection);

        store
            .open_workspace(&workspace_path)
            .expect("a migração da versão 20 deve ser aplicada na abertura");
        let plan = store
            .study_plan()
            .expect("os dados existentes devem continuar disponíveis");
        let daily_plan = store
            .daily_plan("2032-01-01")
            .expect("a sessão existente deve continuar disponível");

        assert_eq!(plan.preparations.len(), 1);
        assert_eq!(plan.preparations[0].id, preparation.id);
        let migrated_session = daily_plan
            .active_session
            .expect("a sessão ativa deve continuar recuperável");
        assert_eq!(migrated_session.id, session.id);
        assert!(migrated_session.summary_markdown.is_none());
        assert!(migrated_session.difficulty.is_none());
        assert!(migrated_session.next_steps.is_none());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
