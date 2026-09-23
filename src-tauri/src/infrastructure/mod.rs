pub mod backup_store;
pub mod contest_store;
pub mod database;
pub mod material_store;
pub mod note_store;
pub mod question_store;
pub mod revision_store;
pub mod study_plan_store;
pub mod study_store;
pub mod workspace_store;

use crate::application::workspace_service::WorkspaceError;

pub(crate) fn map_database_error(operation: &str, error: rusqlite::Error) -> WorkspaceError {
    WorkspaceError::Database(format!("{operation}: {error}"))
}

pub(crate) fn map_io_error(operation: &str, error: std::io::Error) -> WorkspaceError {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        WorkspaceError::PermissionDenied(format!("{operation}: {error}"))
    } else {
        WorkspaceError::Io(format!("{operation}: {error}"))
    }
}
