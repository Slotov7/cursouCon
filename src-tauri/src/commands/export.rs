use crate::application::export_service::ExportService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::export::{StudyProgressCsvExportResult, WorkspaceDataExportResult};
use tauri::AppHandle;

#[tauri::command]
pub fn export_workspace_data(app: AppHandle) -> Result<WorkspaceDataExportResult, CommandError> {
    let store = local_workspace_store(&app)?;
    ExportService::new(store)
        .export_workspace_data()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn export_study_progress_csv(
    app: AppHandle,
) -> Result<StudyProgressCsvExportResult, CommandError> {
    let store = local_workspace_store(&app)?;
    ExportService::new(store)
        .export_study_progress_csv()
        .map_err(CommandError::from)
}
