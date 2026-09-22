use crate::application::workspace_service::WorkspaceService;
use crate::commands::error::CommandError;
use crate::domain::workspace::WorkspaceSummary;
use crate::infrastructure::workspace_store::LocalWorkspaceStore;
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub workspace_path: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkspaceRequest {
    pub workspace_path: String,
}

pub(crate) fn local_workspace_store(app: &AppHandle) -> Result<LocalWorkspaceStore, CommandError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| CommandError {
        code: "app_data_unavailable".to_string(),
        message: format!("Não foi possível preparar o armazenamento local: {error}"),
    })?;

    Ok(LocalWorkspaceStore::new(app_data_dir))
}

fn workspace_service(
    app: &AppHandle,
) -> Result<WorkspaceService<LocalWorkspaceStore>, CommandError> {
    Ok(WorkspaceService::new(local_workspace_store(app)?))
}

#[tauri::command]
pub fn create_workspace(
    app: AppHandle,
    request: CreateWorkspaceRequest,
) -> Result<WorkspaceSummary, CommandError> {
    let service = workspace_service(&app)?;
    service
        .create(Path::new(&request.workspace_path), &request.name)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn open_workspace(
    app: AppHandle,
    request: OpenWorkspaceRequest,
) -> Result<WorkspaceSummary, CommandError> {
    let service = workspace_service(&app)?;
    service
        .open(Path::new(&request.workspace_path))
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_active_workspace(app: AppHandle) -> Result<Option<WorkspaceSummary>, CommandError> {
    let service = workspace_service(&app)?;
    service.active().map_err(CommandError::from)
}
