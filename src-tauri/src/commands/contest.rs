use crate::application::contest_service::ContestService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::contest::{ContestStatus, ManualContestSummary, SaveManualContestInput};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManualContestRequest {
    pub id: Option<String>,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub source_url: Option<String>,
    pub status: ContestStatus,
    pub registration_starts_on: Option<String>,
    pub registration_ends_on: Option<String>,
    pub fee_deadline: Option<String>,
    pub exam_date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetManualContestFavoriteRequest {
    pub contest_id: String,
    pub is_favorite: bool,
}

#[tauri::command]
pub fn get_manual_contests(app: AppHandle) -> Result<Vec<ManualContestSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    ContestService::new(store)
        .list()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn save_manual_contest(
    app: AppHandle,
    request: SaveManualContestRequest,
) -> Result<ManualContestSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    ContestService::new(store)
        .save(SaveManualContestInput {
            id: request.id,
            name: request.name,
            organization: request.organization,
            role: request.role,
            board: request.board,
            source_url: request.source_url,
            status: request.status,
            registration_starts_on: request.registration_starts_on,
            registration_ends_on: request.registration_ends_on,
            fee_deadline: request.fee_deadline,
            exam_date: request.exam_date,
            notes: request.notes,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn set_manual_contest_favorite(
    app: AppHandle,
    request: SetManualContestFavoriteRequest,
) -> Result<ManualContestSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    ContestService::new(store)
        .set_favorite(&request.contest_id, request.is_favorite)
        .map_err(CommandError::from)
}
