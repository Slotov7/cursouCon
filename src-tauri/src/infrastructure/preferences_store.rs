use super::{map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::preferences_service::PreferencesStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::preferences::{normalize_app_preferences, AppPreferences};
use std::fs;
use std::path::PathBuf;

const PREFERENCES_FILE: &str = "app-preferences.json";

impl LocalWorkspaceStore {
    fn preferences_file(&self) -> PathBuf {
        self.app_data_dir().join(PREFERENCES_FILE)
    }
}

impl PreferencesStore for LocalWorkspaceStore {
    fn load_preferences(&self) -> Result<AppPreferences, WorkspaceError> {
        let primary_path = self.preferences_file();
        let backup_path = super::workspace_store::backup_path(&primary_path)?;
        let mut sources = Vec::new();
        if primary_path.is_file() {
            sources.push(primary_path);
        }
        if backup_path.is_file() {
            sources.push(backup_path);
        }
        if sources.is_empty() {
            return Ok(AppPreferences::default());
        }

        let mut last_error = None;
        for source in sources {
            let contents = match fs::read_to_string(&source) {
                Ok(contents) => contents,
                Err(error) => {
                    last_error = Some(map_io_error("ler preferências", error));
                    continue;
                }
            };
            match serde_json::from_str::<AppPreferences>(&contents) {
                Ok(preferences) => match normalize_app_preferences(preferences) {
                    Ok(preferences) => return Ok(preferences),
                    Err(message) => {
                        last_error = Some(WorkspaceError::Serialization(message));
                    }
                },
                Err(error) => {
                    last_error = Some(WorkspaceError::Serialization(format!(
                        "preferências inválidas: {error}"
                    )));
                }
            }
        }

        Err(last_error
            .unwrap_or_else(|| WorkspaceError::Serialization("preferências inválidas".to_string())))
    }

    fn save_preferences(
        &self,
        preferences: &AppPreferences,
    ) -> Result<AppPreferences, WorkspaceError> {
        let path = self.preferences_file();
        super::workspace_store::write_json_atomically(&path, preferences)?;
        Ok(preferences.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::preferences::{AppPreferences, ThemePreference};
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn persists_preferences_in_machine_local_app_data() {
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-preferences-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        assert_eq!(
            store.load_preferences().expect("preferências padrão"),
            AppPreferences::default()
        );

        let saved = store
            .save_preferences(&AppPreferences {
                theme: ThemePreference::Light,
                reduced_motion: true,
                high_contrast: true,
                timezone: "America/Sao_Paulo".to_string(),
                gamification_visible: false,
            })
            .expect("preferências devem ser salvas");
        let loaded = store
            .load_preferences()
            .expect("preferências devem reabrir");

        assert_eq!(loaded, saved);
        assert!(app_data_dir.join(PREFERENCES_FILE).is_file());

        let _ = fs::remove_dir_all(app_data_dir);
    }
}
