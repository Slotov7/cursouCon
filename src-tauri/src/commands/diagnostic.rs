use crate::application::diagnostic_service::DiagnosticService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::diagnostic::{DiagnosticExportResult, DiagnosticSnapshot};
use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDiagnosticRequest {
    pub destination_parent_path: String,
}

#[tauri::command]
pub fn get_app_diagnostic(app: AppHandle) -> Result<DiagnosticSnapshot, CommandError> {
    let store = local_workspace_store(&app)?;
    DiagnosticService::new(store)
        .snapshot()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn export_diagnostic(
    app: AppHandle,
    request: ExportDiagnosticRequest,
) -> Result<DiagnosticExportResult, CommandError> {
    let store = local_workspace_store(&app)?;
    DiagnosticService::new(store)
        .export(Path::new(&request.destination_parent_path))
        .map_err(CommandError::from)
}
