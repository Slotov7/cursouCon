use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::flashcard::{Flashcard, Rating};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRequest {
    pub as_of: String,
    pub offset: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {
    pub front: String,
    pub back: String,
    pub subject_id: Option<String>,
    pub today: String,
    pub legacy_schedule: Option<LegacySchedule>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySchedule {
    pub interval_days: i64,
    pub ease: i64,
    pub repetitions: i64,
    pub due_date: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequest {
    pub id: String,
    pub rating: Rating,
    pub today: String,
    pub operation_id: String,
}

#[tauri::command]
pub fn get_flashcards(
    app: AppHandle,
    request: ListRequest,
) -> Result<Vec<Flashcard>, CommandError> {
    local_workspace_store(&app)?
        .list_flashcards(&request.as_of, request.offset)
        .map_err(Into::into)
}

#[tauri::command]
pub fn create_flashcard(app: AppHandle, request: CreateRequest) -> Result<Flashcard, CommandError> {
    local_workspace_store(&app)?
        .create_flashcard(
            &request.front,
            &request.back,
            request.subject_id.as_deref(),
            &request.today,
            request.legacy_schedule.as_ref().map(|schedule| {
                (
                    schedule.interval_days,
                    schedule.ease,
                    schedule.repetitions,
                    schedule.due_date.as_str(),
                )
            }),
        )
        .map_err(Into::into)
}

#[tauri::command]
pub fn review_flashcard(app: AppHandle, request: ReviewRequest) -> Result<Flashcard, CommandError> {
    local_workspace_store(&app)?
        .review_flashcard(
            &request.id,
            request.rating,
            &request.today,
            &request.operation_id,
        )
        .map_err(Into::into)
}
