use crate::application::online_contest_service::OnlineContestService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::online_contest::{
    OnlineContestRefreshResult, OnlineContestSnapshot, ACHE_CONCURSOS_SOURCE_NAME,
    ACHE_CONCURSOS_SOURCE_URL,
};
use crate::infrastructure::contest_source::{fetch_ache_concursos, fetch_ache_notice};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetOnlineContestFavoriteRequest {
    pub opportunity_id: String,
    pub is_favorite: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOnlineContestNoticeRequest {
    pub opportunity_id: String,
}

#[tauri::command]
pub fn get_online_contests(app: AppHandle) -> Result<OnlineContestSnapshot, CommandError> {
    let store = local_workspace_store(&app)?;
    OnlineContestService::new(store)
        .list()
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn refresh_online_contests(
    app: AppHandle,
) -> Result<OnlineContestRefreshResult, CommandError> {
    let store = local_workspace_store(&app)?;
    let service = OnlineContestService::new(store);
    let fetched = match fetch_ache_concursos().await {
        Ok(fetched) => fetched,
        Err(error) => {
            let message = error.to_string();
            let _ = service.record_failure(
                ACHE_CONCURSOS_SOURCE_NAME,
                ACHE_CONCURSOS_SOURCE_URL,
                &message,
            );
            return Err(CommandError::from(error));
        }
    };
    service
        .refresh(
            ACHE_CONCURSOS_SOURCE_NAME,
            ACHE_CONCURSOS_SOURCE_URL,
            fetched,
        )
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn set_online_contest_favorite(
    app: AppHandle,
    request: SetOnlineContestFavoriteRequest,
) -> Result<OnlineContestSnapshot, CommandError> {
    let store = local_workspace_store(&app)?;
    OnlineContestService::new(store)
        .set_favorite(request.opportunity_id, request.is_favorite)
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn save_online_contest_notice(
    app: AppHandle,
    request: SaveOnlineContestNoticeRequest,
) -> Result<OnlineContestSnapshot, CommandError> {
    let store = local_workspace_store(&app)?;
    let service = OnlineContestService::new(store);
    let source_url = service
        .source_url(&request.opportunity_id)
        .map_err(CommandError::from)?;
    let notice = fetch_ache_notice(&source_url)
        .await
        .map_err(CommandError::from)?;
    service
        .save_notice(request.opportunity_id, notice)
        .map_err(CommandError::from)
}
