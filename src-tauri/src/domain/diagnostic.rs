use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCounts {
    pub preparations: i64,
    pub subjects: i64,
    pub materials: i64,
    pub notes: i64,
    pub questions: i64,
    pub question_attempts: i64,
    pub study_sessions: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSnapshot {
    pub app_version: String,
    pub platform: String,
    pub architecture: String,
    pub workspace_format_version: u32,
    pub schema_version: i64,
    pub counts: DiagnosticCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticExportResult {
    pub path: String,
    pub snapshot: DiagnosticSnapshot,
}
