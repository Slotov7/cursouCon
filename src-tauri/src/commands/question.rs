use crate::application::question_service::QuestionService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::question::{
    AnswerQuestionInput, AnswerQuestionResult, CreateNotebookInput, CreateQuestionInput,
    ListQuestionsInput, NotebookFilter, NotebookSummary, QuestionNotebookEntrySummary,
    QuestionOptionInput, QuestionSummary, SetQuestionNotebookInput,
};
use crate::domain::question_transfer::{
    QuestionExportResult, QuestionImportPreview, QuestionImportResult,
};
use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionRequest {
    pub key: String,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuestionRequest {
    pub question_type: String,
    pub statement_markdown: String,
    pub options: Vec<QuestionOptionRequest>,
    pub answer_key: Option<String>,
    pub explanation_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuestionsRequest {
    pub subject_id: Option<String>,
    pub question_type: Option<String>,
    pub status: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerQuestionRequest {
    pub question_id: String,
    pub selected_key: Option<String>,
    pub confidence: String,
    pub elapsed_seconds: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotebookRequest {
    pub name: String,
    pub kind: String,
    pub filter: Option<NotebookFilter>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListNotebookEntriesRequest {
    pub notebook_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetQuestionNotebookRequest {
    pub notebook_id: String,
    pub question_id: String,
    pub included: bool,
    pub reason: Option<String>,
    pub observation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionImportFileRequest {
    pub source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportQuestionsRequest {
    pub source_path: String,
    pub expected_file_hash: String,
}

#[tauri::command]
pub fn get_questions(
    app: AppHandle,
    request: ListQuestionsRequest,
) -> Result<Vec<QuestionSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .list(ListQuestionsInput {
            subject_id: request.subject_id,
            question_type: request.question_type,
            status: request.status,
            limit: request.limit,
            offset: request.offset,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_question(
    app: AppHandle,
    request: CreateQuestionRequest,
) -> Result<QuestionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .create(CreateQuestionInput {
            question_type: request.question_type,
            statement_markdown: request.statement_markdown,
            options: request
                .options
                .into_iter()
                .map(|option| QuestionOptionInput {
                    key: option.key,
                    text: option.text,
                })
                .collect(),
            answer_key: request.answer_key,
            explanation_markdown: request.explanation_markdown,
            source_name: request.source_name,
            board: request.board,
            organization: request.organization,
            role: request.role,
            exam_year: request.exam_year,
            subject_id: request.subject_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn answer_question(
    app: AppHandle,
    request: AnswerQuestionRequest,
) -> Result<AnswerQuestionResult, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .answer(AnswerQuestionInput {
            question_id: request.question_id,
            selected_key: request.selected_key,
            confidence: request.confidence,
            elapsed_seconds: request.elapsed_seconds,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_notebooks(app: AppHandle) -> Result<Vec<NotebookSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .list_notebooks()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_notebook(
    app: AppHandle,
    request: CreateNotebookRequest,
) -> Result<NotebookSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .create_notebook(CreateNotebookInput {
            name: request.name,
            kind: request.kind,
            filter: request.filter,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_notebook_entries(
    app: AppHandle,
    request: ListNotebookEntriesRequest,
) -> Result<Vec<QuestionNotebookEntrySummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .list_notebook_entries(request.notebook_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn set_notebook_entry(
    app: AppHandle,
    request: SetQuestionNotebookRequest,
) -> Result<bool, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .set_notebook_entry(SetQuestionNotebookInput {
            notebook_id: request.notebook_id,
            question_id: request.question_id,
            included: request.included,
            reason: request.reason,
            observation: request.observation,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn preview_question_import(
    app: AppHandle,
    request: QuestionImportFileRequest,
) -> Result<QuestionImportPreview, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .preview_import(Path::new(&request.source_path))
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn import_questions(
    app: AppHandle,
    request: ImportQuestionsRequest,
) -> Result<QuestionImportResult, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .import_questions(Path::new(&request.source_path), &request.expected_file_hash)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn export_questions(app: AppHandle) -> Result<QuestionExportResult, CommandError> {
    let store = local_workspace_store(&app)?;
    QuestionService::new(store)
        .export_questions()
        .map_err(CommandError::from)
}
