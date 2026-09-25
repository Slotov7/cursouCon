use crate::application::workspace_service::WorkspaceError;
use crate::domain::preferences::{normalize_app_preferences, AppPreferences};

pub trait PreferencesStore {
    fn load_preferences(&self) -> Result<AppPreferences, WorkspaceError>;
    fn save_preferences(
        &self,
        preferences: &AppPreferences,
    ) -> Result<AppPreferences, WorkspaceError>;
}

pub struct PreferencesService<S> {
    store: S,
}

impl<S: PreferencesStore> PreferencesService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn load(&self) -> Result<AppPreferences, WorkspaceError> {
        self.store.load_preferences()
    }

    pub fn save(&self, preferences: AppPreferences) -> Result<AppPreferences, WorkspaceError> {
        let normalized =
            normalize_app_preferences(preferences).map_err(WorkspaceError::InvalidInput)?;
        self.store.save_preferences(&normalized)
    }
}
