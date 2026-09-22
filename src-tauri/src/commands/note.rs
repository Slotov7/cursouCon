use crate::application::note_service::NoteService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::note::{NoteSummary, SaveNoteInput};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteRequest {
    pub id: Option<String>,
    pub title: String,
    pub content_markdown: String,
    pub material_id: Option<String>,
    pub subject_id: Option<String>,
}

#[tauri::command]
pub fn get_notes(app: AppHandle) -> Result<Vec<NoteSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    NoteService::new(store).list().map_err(CommandError::from)
}

#[tauri::command]
pub fn save_note(app: AppHandle, request: SaveNoteRequest) -> Result<NoteSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    NoteService::new(store)
        .save(SaveNoteInput {
            id: request.id,
            title: request.title,
            content_markdown: request.content_markdown,
            material_id: request.material_id,
            subject_id: request.subject_id,
        })
        .map_err(CommandError::from)
}
