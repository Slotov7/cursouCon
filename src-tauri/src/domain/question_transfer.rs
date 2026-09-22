use super::question::{
    normalize_create_question_input, CreateQuestionInput, QuestionOptionInput, QuestionSummary,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::Path;

pub const QUESTION_TRANSFER_SCHEMA_VERSION: u32 = 1;
pub const QUESTION_TRANSFER_KIND: &str = "cursoucon.questions";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionTransferOption {
    pub key: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionTransferItem {
    #[serde(default)]
    pub external_id: Option<String>,
    pub question_type: String,
    pub statement_markdown: String,
    pub options: Vec<QuestionTransferOption>,
    #[serde(default)]
    pub answer_key: Option<String>,
    #[serde(default)]
    pub explanation_markdown: Option<String>,
    #[serde(default)]
    pub source_name: Option<String>,
    #[serde(default)]
    pub board: Option<String>,
    #[serde(default)]
    pub organization: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub exam_year: Option<i64>,
    #[serde(default)]
    pub subject_id: Option<String>,
    #[serde(default)]
    pub attachment_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAttachmentReference {
    pub id: String,
    pub sha256: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionExportDocument {
    pub schema_version: u32,
    pub kind: &'static str,
    pub collection_id: String,
    pub source: String,
    pub attachments: Vec<QuestionAttachmentReference>,
    pub questions: Vec<QuestionTransferItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQuestionDocument {
    schema_version: u32,
    kind: String,
    collection_id: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    attachments: Vec<QuestionAttachmentReference>,
    questions: Vec<Value>,
}

#[derive(Debug)]
pub struct ParsedQuestionDocument {
    pub schema_version: u32,
    pub attachments: Vec<QuestionAttachmentReference>,
    pub questions: Vec<Result<QuestionTransferItem, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionImportIssue {
    pub index: i64,
    pub kind: String,
    pub external_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionImportPreview {
    pub schema_version: u32,
    pub total: i64,
    pub valid: i64,
    pub invalid: i64,
    pub duplicates: i64,
    pub file_hash: String,
    pub issues: Vec<QuestionImportIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionImportResult {
    pub imported: i64,
    pub skipped_invalid: i64,
    pub skipped_duplicates: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionExportResult {
    pub path: String,
    pub exported: i64,
    pub schema_version: u32,
}

pub fn parse_question_document(bytes: &[u8]) -> Result<ParsedQuestionDocument, String> {
    let raw: RawQuestionDocument = serde_json::from_slice(bytes)
        .map_err(|error| format!("O arquivo JSON de questões é inválido: {error}"))?;
    if raw.schema_version != QUESTION_TRANSFER_SCHEMA_VERSION {
        return Err(format!(
            "A versão JSON {} não é compatível; esperada {}.",
            raw.schema_version, QUESTION_TRANSFER_SCHEMA_VERSION
        ));
    }
    if raw.kind != QUESTION_TRANSFER_KIND {
        return Err("O arquivo JSON não é um conjunto de questões do CursouCon.".to_string());
    }
    let collection_id = raw.collection_id.trim();
    if collection_id.is_empty() {
        return Err("O conjunto JSON precisa de um identificador.".to_string());
    }
    if collection_id.chars().count() > 240 || collection_id.chars().any(char::is_control) {
        return Err("O identificador do conjunto JSON é inválido ou longo demais.".to_string());
    }
    if raw.source.chars().count() > 240 || raw.source.chars().any(char::is_control) {
        return Err("A origem do conjunto JSON é inválida ou longa demais.".to_string());
    }
    if raw.questions.len() > 10_000 {
        return Err("O arquivo JSON excede o limite de 10.000 questões.".to_string());
    }
    if !raw.attachments.is_empty() {
        let mut attachment_ids = HashSet::new();
        for attachment in &raw.attachments {
            validate_attachment_reference(attachment)?;
            if !attachment_ids.insert(attachment.id.as_str()) {
                return Err("O pacote JSON contém identificadores de anexos repetidos.".to_string());
            }
        }
    }

    let questions = raw
        .questions
        .into_iter()
        .map(|value| {
            serde_json::from_value(value)
                .map_err(|error| format!("A estrutura da questão é inválida: {error}"))
        })
        .collect();

    Ok(ParsedQuestionDocument {
        schema_version: raw.schema_version,
        attachments: raw.attachments,
        questions,
    })
}

pub fn transfer_item_to_input(item: &QuestionTransferItem) -> Result<CreateQuestionInput, String> {
    normalize_create_question_input(CreateQuestionInput {
        question_type: item.question_type.clone(),
        statement_markdown: item.statement_markdown.clone(),
        options: item
            .options
            .iter()
            .map(|option| QuestionOptionInput {
                key: option.key.clone(),
                text: option.text.clone(),
            })
            .collect(),
        answer_key: item.answer_key.clone(),
        explanation_markdown: item.explanation_markdown.clone(),
        source_name: item.source_name.clone(),
        board: item.board.clone(),
        organization: item.organization.clone(),
        role: item.role.clone(),
        exam_year: item.exam_year,
        subject_id: item.subject_id.clone(),
    })
}

pub fn validate_attachment_reference(
    reference: &QuestionAttachmentReference,
) -> Result<(), String> {
    let attachment_id = reference.id.trim();
    if attachment_id.is_empty()
        || attachment_id.chars().count() > 240
        || attachment_id.chars().any(char::is_control)
    {
        return Err("O identificador do anexo é inválido ou longo demais.".to_string());
    }
    if reference.sha256.len() != 64
        || !reference
            .sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("O SHA-256 do anexo é inválido.".to_string());
    }
    let relative_path = reference.relative_path.trim();
    let path = Path::new(relative_path);
    if relative_path.is_empty()
        || relative_path.contains('\\')
        || relative_path.contains(':')
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(
            "O caminho do anexo precisa ser relativo e não pode escapar do pacote.".to_string(),
        );
    }
    Ok(())
}

pub fn normalize_external_id(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("O identificador externo não pode ser vazio.".to_string());
    }
    if trimmed.chars().count() > 240 || trimmed.chars().any(char::is_control) {
        return Err("O identificador externo é inválido ou longo demais.".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

pub fn question_content_hash(input: &CreateQuestionInput) -> Result<String, String> {
    #[derive(Serialize)]
    struct HashOption<'a> {
        key: &'a str,
        text: &'a str,
    }

    #[derive(Serialize)]
    struct HashPayload<'a> {
        question_type: &'a str,
        statement_markdown: &'a str,
        options: Vec<HashOption<'a>>,
        answer_key: Option<&'a str>,
        explanation_markdown: Option<&'a str>,
        source_name: Option<&'a str>,
        board: Option<&'a str>,
        organization: Option<&'a str>,
        role: Option<&'a str>,
        exam_year: Option<i64>,
        subject_id: Option<&'a str>,
    }

    let payload = HashPayload {
        question_type: &input.question_type,
        statement_markdown: &input.statement_markdown,
        options: input
            .options
            .iter()
            .map(|option| HashOption {
                key: &option.key,
                text: &option.text,
            })
            .collect(),
        answer_key: input.answer_key.as_deref(),
        explanation_markdown: input.explanation_markdown.as_deref(),
        source_name: input.source_name.as_deref(),
        board: input.board.as_deref(),
        organization: input.organization.as_deref(),
        role: input.role.as_deref(),
        exam_year: input.exam_year,
        subject_id: input.subject_id.as_deref(),
    };
    let serialized = serde_json::to_vec(&payload)
        .map_err(|error| format!("não foi possível normalizar a questão: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(serialized)))
}

pub fn export_item_from_summary(summary: &QuestionSummary) -> QuestionTransferItem {
    QuestionTransferItem {
        external_id: Some(summary.id.clone()),
        question_type: summary.question_type.clone(),
        statement_markdown: summary.statement_markdown.clone(),
        options: summary
            .options
            .iter()
            .map(|option| QuestionTransferOption {
                key: option.key.clone(),
                text: option.text.clone(),
            })
            .collect(),
        answer_key: summary.answer_key.clone(),
        explanation_markdown: summary.explanation_markdown.clone(),
        source_name: summary.source_name.clone(),
        board: summary.board.clone(),
        organization: summary.organization.clone(),
        role: summary.role.clone(),
        exam_year: summary.exam_year,
        subject_id: summary.subject_id.clone(),
        attachment_ids: Vec::new(),
    }
}

pub fn new_export_document(
    questions: Vec<QuestionTransferItem>,
    attachments: Vec<QuestionAttachmentReference>,
) -> QuestionExportDocument {
    QuestionExportDocument {
        schema_version: QUESTION_TRANSFER_SCHEMA_VERSION,
        kind: QUESTION_TRANSFER_KIND,
        collection_id: uuid::Uuid::new_v4().to_string(),
        source: "CursouCon".to_string(),
        attachments,
        questions,
    }
}

pub fn duplicate_external_id(
    seen_external_ids: &mut HashSet<String>,
    external_id: Option<String>,
) -> Result<(), String> {
    let Some(external_id) = normalize_external_id(external_id)? else {
        return Ok(());
    };
    if !seen_external_ids.insert(external_id) {
        return Err("O identificador externo aparece mais de uma vez no lote.".to_string());
    }
    Ok(())
}
