use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

pub const CURRENT_FORMAT_VERSION: u32 = 1;
pub const WORKSPACE_MANIFEST_FILE: &str = "workspace.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceManifest {
    pub workspace_id: Uuid,
    pub name: String,
    pub format_version: u32,
}

impl WorkspaceManifest {
    pub fn new(name: String) -> Self {
        Self {
            workspace_id: Uuid::new_v4(),
            name,
            format_version: CURRENT_FORMAT_VERSION,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub workspace_id: Uuid,
    pub name: String,
    pub format_version: u32,
    pub path: String,
    pub storage_status: WorkspaceStorageStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceStorageStatus {
    Local,
}

pub fn validate_workspace_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("O nome do espaço é obrigatório.".to_string());
    }

    if trimmed.chars().count() > 80 {
        return Err("O nome do espaço deve ter no máximo 80 caracteres.".to_string());
    }

    if trimmed
        .chars()
        .any(|character| character.is_control() || character == '/' || character == '\\')
    {
        return Err("O nome do espaço contém caracteres inválidos.".to_string());
    }

    Ok(trimmed.to_string())
}

pub fn validate_workspace_path(path: &Path) -> Result<(), String> {
    if path.components().next().is_none() {
        return Err("A pasta do espaço é obrigatória.".to_string());
    }

    if !path.is_absolute() {
        return Err("A pasta do espaço precisa ser um caminho absoluto.".to_string());
    }

    Ok(())
}
