use crate::application::backup_service::BackupService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::backup::BackupSummary;
use crate::domain::workspace::WorkspaceSummary;
use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBackupRequest {
    pub destination_parent_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupRequest {
    pub backup_path: String,
    pub destination_parent_path: String,
}

#[tauri::command]
pub fn create_workspace_backup(
    app: AppHandle,
    request: CreateBackupRequest,
) -> Result<BackupSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    BackupService::new(store)
        .create(Path::new(&request.destination_parent_path))
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn restore_workspace_backup(
    app: AppHandle,
    request: RestoreBackupRequest,
) -> Result<WorkspaceSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    BackupService::new(store)
        .restore(
            Path::new(&request.backup_path),
            Path::new(&request.destination_parent_path),
        )
        .map_err(CommandError::from)
}
