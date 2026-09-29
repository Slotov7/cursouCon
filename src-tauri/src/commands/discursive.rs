use crate::application::discursive_service::DiscursiveService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::discursive::{
    AnswerDiscursiveQuestionInput, AnswerDiscursiveQuestionResult, CreateDiscursiveQuestionInput,
    DiscursiveQuestionSummary,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDiscursiveQuestionRequest {
    pub statement_markdown: String,
    pub reference_markdown: Option<String>,
    pub rubric_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerDiscursiveQuestionRequest {
    pub question_id: String,
    pub response_markdown: String,
    pub self_assessment: String,
    pub elapsed_seconds: i64,
}

#[tauri::command]
pub fn get_discursive_questions(
    app: AppHandle,
) -> Result<Vec<DiscursiveQuestionSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    DiscursiveService::new(store)
        .list()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_discursive_question(
    app: AppHandle,
    request: CreateDiscursiveQuestionRequest,
) -> Result<DiscursiveQuestionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    DiscursiveService::new(store)
        .create(CreateDiscursiveQuestionInput {
            statement_markdown: request.statement_markdown,
            reference_markdown: request.reference_markdown,
            rubric_markdown: request.rubric_markdown,
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
pub fn answer_discursive_question(
    app: AppHandle,
    request: AnswerDiscursiveQuestionRequest,
) -> Result<AnswerDiscursiveQuestionResult, CommandError> {
    let store = local_workspace_store(&app)?;
    DiscursiveService::new(store)
        .answer(AnswerDiscursiveQuestionInput {
            question_id: request.question_id,
            response_markdown: request.response_markdown,
            self_assessment: request.self_assessment,
            elapsed_seconds: request.elapsed_seconds,
        })
        .map_err(CommandError::from)
}
