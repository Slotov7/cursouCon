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
}
