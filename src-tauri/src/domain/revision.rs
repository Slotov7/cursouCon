use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const REVISION_FORMAT_VERSION: u32 = 1;
pub const REVISION_MANIFEST_FILE: &str = "revision.json";
pub const REVISION_DATABASE_FILE: &str = "workspace.sqlite3";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionBlobReference {
    pub sha256: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionManifest {
    pub revision_format_version: u32,
    pub revision_id: Uuid,
    pub workspace_id: Uuid,
    pub workspace_format_version: u32,
    #[serde(default)]
    pub parent_revision_id: Option<Uuid>,
    pub database_sha256: String,
    pub created_at_epoch_seconds: i64,
    pub blob_references: Vec<RevisionBlobReference>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSummary {
    pub revision_id: Uuid,
    pub path: String,
    pub created_at_epoch_seconds: i64,
    pub blob_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDestinationSettings {
    pub enabled: bool,
    pub destination_path: Option<String>,
}
