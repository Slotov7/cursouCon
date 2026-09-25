use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    Light,
    Dark,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub theme: ThemePreference,
    pub reduced_motion: bool,
    pub high_contrast: bool,
    pub timezone: String,
    pub gamification_visible: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: ThemePreference::Dark,
            reduced_motion: false,
            high_contrast: false,
            timezone: "system".to_string(),
            gamification_visible: true,
        }
    }
}

pub fn normalize_app_preferences(
    mut preferences: AppPreferences,
) -> Result<AppPreferences, String> {
    let timezone = preferences.timezone.trim();
    if !matches!(
        timezone,
        "system" | "America/Sao_Paulo" | "UTC" | "America/New_York" | "Europe/Lisbon"
    ) {
        return Err("O fuso horário informado é inválido.".to_string());
    }
    preferences.timezone = timezone.to_string();
    Ok(preferences)
}
