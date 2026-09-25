use serde::Serialize;

pub const WORKSPACE_DATA_EXPORT_SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDataExportResult {
    pub path: String,
    pub schema_version: i64,
    pub exported_records: i64,
    pub exported_notes: i64,
    pub exported_attachments: i64,
}
