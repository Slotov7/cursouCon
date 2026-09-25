use super::{
    database::CURRENT_SCHEMA_VERSION, map_database_error, map_io_error,
    workspace_store::LocalWorkspaceStore,
};
use crate::application::diagnostic_service::DiagnosticStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::diagnostic::{DiagnosticCounts, DiagnosticExportResult, DiagnosticSnapshot};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

impl DiagnosticStore for LocalWorkspaceStore {
    fn diagnostic_snapshot(&self) -> Result<DiagnosticSnapshot, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let connection = self.active_database()?;
        let counts = connection
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM preparations WHERE archived_at IS NULL),
                    (SELECT COUNT(*) FROM subjects WHERE archived_at IS NULL),
                    (SELECT COUNT(*) FROM materials),
                    (SELECT COUNT(*) FROM notes),
                    (SELECT COUNT(*) FROM questions),
                    (SELECT COUNT(*) FROM question_attempts),
                    (SELECT COUNT(*) FROM study_sessions)",
                [],
                |row| {
                    Ok(DiagnosticCounts {
                        preparations: row.get(0)?,
                        subjects: row.get(1)?,
                        materials: row.get(2)?,
                        notes: row.get(3)?,
                        questions: row.get(4)?,
                        question_attempts: row.get(5)?,
                        study_sessions: row.get(6)?,
                    })
                },
            )
            .map_err(|error| map_database_error("ler contagens do diagnóstico", error))?;

        Ok(DiagnosticSnapshot {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
            architecture: std::env::consts::ARCH.to_string(),
            workspace_format_version: workspace.manifest.format_version,
            schema_version: CURRENT_SCHEMA_VERSION,
            counts,
        })
    }

    fn export_diagnostic(
        &self,
        destination_parent_path: &Path,
    ) -> Result<DiagnosticExportResult, WorkspaceError> {
        let snapshot = self.diagnostic_snapshot()?;
        let destination = fs::canonicalize(destination_parent_path)
            .map_err(|error| map_io_error("normalizar destino do diagnóstico", error))?;
        if !destination.is_dir() {
            return Err(WorkspaceError::InvalidInput(
                "O destino do diagnóstico precisa ser uma pasta.".to_string(),
            ));
        }

        let path = destination.join(format!("cursoucon-diagnostic-{}.json", Uuid::new_v4()));
        let path_string = path.to_str().ok_or_else(|| {
            WorkspaceError::Io("o caminho do diagnóstico não é válido".to_string())
        })?;
        let serialized = serde_json::to_vec_pretty(&snapshot).map_err(|error| {
            WorkspaceError::Serialization(format!("serializar diagnóstico: {error}"))
        })?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| map_io_error("criar exportação de diagnóstico", error))?;
        if let Err(error) = file.write_all(&serialized).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = fs::remove_file(&path);
            return Err(map_io_error("gravar exportação de diagnóstico", error));
        }

        Ok(DiagnosticExportResult {
            path: path_string.to_string(),
            snapshot,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::diagnostic_service::DiagnosticStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::study_plan::CreatePreparationInput;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn diagnostic_export_contains_aggregate_data_without_material_content() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-diagnostic-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-diagnostic-data-{}", Uuid::new_v4()));
        let destination =
            std::env::temp_dir().join(format!("cursoucon-diagnostic-export-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Diagnóstico")
            .expect("o espaço deve ser criado");
        store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação privada".to_string(),
                organization: None,
                role: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação deve ser criada");
        fs::create_dir_all(&destination).expect("o destino deve ser criado");

        let snapshot = store
            .diagnostic_snapshot()
            .expect("o diagnóstico deve ser lido");
        let exported = store
            .export_diagnostic(&destination)
            .expect("o diagnóstico deve ser exportado");
        let contents = fs::read_to_string(&exported.path).expect("o diagnóstico deve ser legível");

        assert_eq!(snapshot.counts.preparations, 1);
        assert!(contents.contains("appVersion"));
        assert!(!contents.contains("Preparação privada"));
        assert!(!contents.contains("workspace.sqlite3"));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(destination);
    }
}
