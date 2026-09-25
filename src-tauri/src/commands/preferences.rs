use crate::application::preferences_service::PreferencesService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::preferences::{AppPreferences, ThemePreference};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAppPreferencesRequest {
    pub theme: ThemePreference,
    pub reduced_motion: bool,
    pub high_contrast: bool,
    pub timezone: String,
    pub gamification_visible: bool,
}

#[tauri::command]
pub fn get_app_preferences(app: AppHandle) -> Result<AppPreferences, CommandError> {
    let store = local_workspace_store(&app)?;
    PreferencesService::new(store)
        .load()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn save_app_preferences(
    app: AppHandle,
    request: SaveAppPreferencesRequest,
) -> Result<AppPreferences, CommandError> {
    let store = local_workspace_store(&app)?;
    PreferencesService::new(store)
        .save(AppPreferences {
            theme: request.theme,
            reduced_motion: request.reduced_motion,
            high_contrast: request.high_contrast,
            timezone: request.timezone,
            gamification_visible: request.gamification_visible,
        })
        .map_err(CommandError::from)
}
