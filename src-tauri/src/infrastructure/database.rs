use super::{map_database_error, map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::workspace::WorkspaceManifest;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;

pub(crate) const CURRENT_SCHEMA_VERSION: i64 = 30;

impl LocalWorkspaceStore {
    pub(crate) fn prepare_active_database(
        &self,
        manifest: &WorkspaceManifest,
    ) -> Result<(), WorkspaceError> {
        let database_file = self.active_database_file(manifest.workspace_id);
        let database_directory = database_file.parent().ok_or_else(|| {
            WorkspaceError::Database(
                "Não foi possível determinar a pasta do banco local.".to_string(),
            )
        })?;

        fs::create_dir_all(database_directory)
            .map_err(|error| map_io_error("criar o banco local", error))?;
        let mut connection = Connection::open(&database_file)
            .map_err(|error| WorkspaceError::Database(format!("abrir o banco local: {error}")))?;
        enable_foreign_keys(&connection)?;
        apply_migrations(&mut connection)?;
        ensure_workspace_metadata(&connection, manifest)
    }

    pub(crate) fn active_database(&self) -> Result<Connection, WorkspaceError> {
        let record = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let database_file = self.active_database_file(record.manifest.workspace_id);
        let connection = Connection::open(database_file)
            .map_err(|error| WorkspaceError::Database(format!("abrir o banco local: {error}")))?;
        enable_foreign_keys(&connection)?;

        Ok(connection)
    }
}

fn enable_foreign_keys(connection: &Connection) -> Result<(), WorkspaceError> {
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| map_database_error("ativar integridade", error))
}

fn apply_migrations(connection: &mut Connection) -> Result<(), WorkspaceError> {
    let transaction = connection
        .transaction()
        .map_err(|error| map_database_error("iniciar migração", error))?;
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|error| map_database_error("criar controle de migração", error))?;

    let current_version: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("ler versão do esquema", error))?;

    if current_version > CURRENT_SCHEMA_VERSION {
        return Err(WorkspaceError::Database(
            "o banco local foi criado por uma versão mais nova".to_string(),
        ));
    }

    let migrations = [
        (1_i64, include_str!("../../migrations/001_initial.sql")),
        (
            2_i64,
            include_str!("../../migrations/002_study_plan_indexes.sql"),
        ),
        (
            3_i64,
            include_str!("../../migrations/003_study_tasks_indexes.sql"),
        ),
        (
            4_i64,
            include_str!("../../migrations/004_study_session_pause.sql"),
        ),
        (5_i64, include_str!("../../migrations/005_materials.sql")),
        (6_i64, include_str!("../../migrations/006_notes.sql")),
        (
            7_i64,
            include_str!("../../migrations/007_material_reading.sql"),
        ),
        (8_i64, include_str!("../../migrations/008_questions.sql")),
        (
            9_i64,
            include_str!("../../migrations/009_question_content_hash.sql"),
        ),
        (
            10_i64,
            include_str!("../../migrations/010_question_attachments.sql"),
        ),
        (
            11_i64,
            include_str!("../../migrations/011_question_error_notebook.sql"),
        ),
        (
            12_i64,
            include_str!("../../migrations/012_dynamic_notebook_filters.sql"),
        ),
        (
            13_i64,
            include_str!("../../migrations/013_manual_contests.sql"),
        ),
        (
            14_i64,
            include_str!("../../migrations/014_study_reviews.sql"),
        ),
        (
            15_i64,
            include_str!("../../migrations/015_subject_study_status.sql"),
        ),
        (
            16_i64,
            include_str!("../../migrations/016_study_planning.sql"),
        ),
        (
            17_i64,
            include_str!("../../migrations/017_study_review_reserve.sql"),
        ),
        (
            18_i64,
            include_str!("../../migrations/018_study_cycle_step.sql"),
        ),
        (
            19_i64,
            include_str!("../../migrations/019_cycle_slot_subject_scope.sql"),
        ),
        (
            20_i64,
            include_str!("../../migrations/020_study_session_reflection.sql"),
        ),
        (
            21_i64,
            include_str!("../../migrations/021_material_tags.sql"),
        ),
        (
            22_i64,
            include_str!("../../migrations/022_material_links.sql"),
        ),
        (
            23_i64,
            include_str!("../../migrations/023_manual_study_duration_corrections.sql"),
        ),
        (
            24_i64,
            include_str!("../../migrations/024_preparation_exam_config.sql"),
        ),
        (
            25_i64,
            include_str!("../../migrations/025_manual_contest_notice.sql"),
        ),
        (
            26_i64,
            include_str!("../../migrations/026_preparation_reference_status.sql"),
        ),
        (
            27_i64,
            include_str!("../../migrations/027_preparation_board.sql"),
        ),
        (
            28_i64,
            include_str!("../../migrations/028_study_task_material.sql"),
        ),
        (
            29_i64,
            include_str!("../../migrations/029_external_question_batches.sql"),
        ),
        (
            30_i64,
            include_str!("../../migrations/030_question_revisions.sql"),
        ),
    ];

    for (version, sql) in migrations {
        if current_version >= version {
            continue;
        }

        transaction
            .execute_batch(sql)
            .map_err(|error| map_database_error(&format!("executar migração {version}"), error))?;
        transaction
            .execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                params![version],
            )
            .map_err(|error| map_database_error(&format!("registrar migração {version}"), error))?;
    }

    transaction
        .commit()
        .map_err(|error| map_database_error("confirmar migração", error))
}

fn ensure_workspace_metadata(
    connection: &Connection,
    manifest: &WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    let existing: Option<(String, String, i64)> = connection
        .query_row(
            "SELECT workspace_id, name, format_version FROM workspace_metadata LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| map_database_error("ler metadados do espaço", error))?;

    if let Some((workspace_id, name, format_version)) = existing {
        let expected_id = manifest.workspace_id.to_string();
        if workspace_id != expected_id
            || name != manifest.name
            || format_version != i64::from(manifest.format_version)
        {
            return Err(WorkspaceError::InvalidWorkspace(
                "o banco local não corresponde ao manifesto".to_string(),
            ));
        }
        return Ok(());
    }

    connection
        .execute(
            "INSERT INTO workspace_metadata (workspace_id, name, format_version) VALUES (?1, ?2, ?3)",
            params![manifest.workspace_id.to_string(), &manifest.name, manifest.format_version],
        )
        .map_err(|error| map_database_error("gravar metadados do espaço", error))?;

    Ok(())
}
