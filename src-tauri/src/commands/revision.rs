use crate::application::revision_service::RevisionService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::revision::{RevisionSummary, SyncDestinationSettings};
use crate::domain::workspace::WorkspaceSummary;
use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWorkspaceRevisionsRequest {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreWorkspaceRevisionRequest {
    pub workspace_path: String,
    pub revision_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishWorkspaceRevisionRequest {
    pub destination_parent_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureSyncDestinationRequest {
    pub enabled: bool,
    pub destination_parent_path: Option<String>,
}

#[tauri::command]
pub fn create_workspace_revision(app: AppHandle) -> Result<RevisionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .publish()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn publish_workspace_revision(
    app: AppHandle,
    request: PublishWorkspaceRevisionRequest,
) -> Result<RevisionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .publish_to(Path::new(&request.destination_parent_path))
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn publish_configured_workspace_revision(
    app: AppHandle,
) -> Result<RevisionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .publish_configured()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_sync_destination_settings(
    app: AppHandle,
) -> Result<SyncDestinationSettings, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .sync_settings()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn configure_sync_destination(
    app: AppHandle,
    request: ConfigureSyncDestinationRequest,
) -> Result<SyncDestinationSettings, CommandError> {
    let store = local_workspace_store(&app)?;
    let destination_path = request.destination_parent_path.as_deref().map(Path::new);
    RevisionService::new(store)
        .configure_sync(request.enabled, destination_path)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_workspace_revisions(
    app: AppHandle,
    request: ListWorkspaceRevisionsRequest,
) -> Result<Vec<RevisionSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .list(Path::new(&request.workspace_path))
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn restore_workspace_revision(
    app: AppHandle,
    request: RestoreWorkspaceRevisionRequest,
) -> Result<WorkspaceSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    RevisionService::new(store)
        .restore(Path::new(&request.workspace_path), &request.revision_id)
        .map_err(CommandError::from)
}
