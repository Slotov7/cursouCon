use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const BACKUP_MANIFEST_FILE: &str = "backup.json";
pub const BACKUP_DATABASE_FILE: &str = "workspace.sqlite3";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub backup_format_version: u32,
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub workspace_format_version: u32,
    pub database_sha256: String,
    pub created_at_epoch_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub path: String,
    pub workspace_name: String,
    pub created_at_epoch_seconds: i64,
    pub retention_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspectionSummary {
    pub path: String,
    pub backup_format_version: u32,
    pub workspace_id: String,
    pub workspace_name: String,
    pub workspace_format_version: u32,
    pub database_sha256: String,
    pub created_at_epoch_seconds: i64,
    pub blob_count: i64,
    pub revision_file_count: i64,
    pub export_file_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupHistoryEntry {
    pub created_at_epoch_seconds: i64,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub destination_parent_path: String,
    pub keep_last: Option<u32>,
    pub history: Vec<BackupHistoryEntry>,
}
