pub mod study_plan_store;
pub mod study_store;
pub mod workspace_store;

use crate::application::workspace_service::WorkspaceError;

pub(crate) fn map_database_error(operation: &str, error: rusqlite::Error) -> WorkspaceError {
    WorkspaceError::Database(format!("{operation}: {error}"))
}
