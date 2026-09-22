use crate::application::workspace_service::WorkspaceError;
use crate::domain::question::{
    normalize_answer_question_input, normalize_create_question_input,
    normalize_list_questions_input, AnswerQuestionInput, AnswerQuestionResult, CreateQuestionInput,
    ListQuestionsInput, QuestionSummary,
};
use crate::domain::question_transfer::{
    QuestionExportResult, QuestionImportPreview, QuestionImportResult,
};
use std::path::Path;

pub trait QuestionStore {
    fn list_questions(
        &self,
        input: &ListQuestionsInput,
    ) -> Result<Vec<QuestionSummary>, WorkspaceError>;
    fn create_question(
        &self,
        input: &CreateQuestionInput,
    ) -> Result<QuestionSummary, WorkspaceError>;
    fn answer_question(
        &self,
        input: &AnswerQuestionInput,
    ) -> Result<AnswerQuestionResult, WorkspaceError>;
    fn preview_import(&self, source_path: &Path) -> Result<QuestionImportPreview, WorkspaceError>;
    fn import_questions(
        &self,
        source_path: &Path,
        expected_file_hash: &str,
    ) -> Result<QuestionImportResult, WorkspaceError>;
    fn export_questions(&self) -> Result<QuestionExportResult, WorkspaceError>;
}

pub struct QuestionService<S> {
    store: S,
}

impl<S: QuestionStore> QuestionService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self, input: ListQuestionsInput) -> Result<Vec<QuestionSummary>, WorkspaceError> {
        let normalized =
            normalize_list_questions_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.list_questions(&normalized)
    }

    pub fn create(&self, input: CreateQuestionInput) -> Result<QuestionSummary, WorkspaceError> {
        let normalized =
            normalize_create_question_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_question(&normalized)
    }

    pub fn answer(
        &self,
        input: AnswerQuestionInput,
    ) -> Result<AnswerQuestionResult, WorkspaceError> {
        let normalized =
            normalize_answer_question_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.answer_question(&normalized)
    }

    pub fn preview_import(
        &self,
        source_path: &Path,
    ) -> Result<QuestionImportPreview, WorkspaceError> {
        self.store.preview_import(source_path)
    }

    pub fn import_questions(
        &self,
        source_path: &Path,
        expected_file_hash: &str,
    ) -> Result<QuestionImportResult, WorkspaceError> {
        self.store.import_questions(source_path, expected_file_hash)
    }

    pub fn export_questions(&self) -> Result<QuestionExportResult, WorkspaceError> {
        self.store.export_questions()
    }
}
