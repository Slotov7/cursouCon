use crate::application::workspace_service::WorkspaceError;
use crate::domain::question::{
    normalize_answer_question_input, normalize_create_notebook_input,
    normalize_create_question_input, normalize_external_question_batch_input,
    normalize_list_questions_input, normalize_notebook_id, normalize_revise_question_input,
    normalize_set_question_notebook_input, AnswerQuestionInput, AnswerQuestionResult,
    CreateExternalQuestionBatchInput, CreateNotebookInput, CreateQuestionInput,
    ExternalQuestionBatchSummary, ListQuestionsInput, NotebookSummary,
    QuestionNotebookEntrySummary, QuestionPerformanceSummary, QuestionSummary, ReviseQuestionInput,
    ReviseQuestionResult, SetQuestionNotebookInput,
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
    fn revise_question(
        &self,
        input: &ReviseQuestionInput,
    ) -> Result<ReviseQuestionResult, WorkspaceError>;
    fn list_notebooks(&self) -> Result<Vec<NotebookSummary>, WorkspaceError>;
    fn create_notebook(
        &self,
        input: &CreateNotebookInput,
    ) -> Result<NotebookSummary, WorkspaceError>;
    fn list_notebook_entries(
        &self,
        notebook_id: &str,
    ) -> Result<Vec<QuestionNotebookEntrySummary>, WorkspaceError>;
    fn set_notebook_entry(&self, input: &SetQuestionNotebookInput) -> Result<bool, WorkspaceError>;
    fn preview_import(&self, source_path: &Path) -> Result<QuestionImportPreview, WorkspaceError>;
    fn import_questions(
        &self,
        source_path: &Path,
        expected_file_hash: &str,
    ) -> Result<QuestionImportResult, WorkspaceError>;
    fn export_questions(&self) -> Result<QuestionExportResult, WorkspaceError>;
    fn create_external_question_batch(
        &self,
        input: &CreateExternalQuestionBatchInput,
    ) -> Result<ExternalQuestionBatchSummary, WorkspaceError>;
    fn list_external_question_batches(
        &self,
    ) -> Result<Vec<ExternalQuestionBatchSummary>, WorkspaceError>;
    fn question_performance(
        &self,
        as_of_date: &str,
    ) -> Result<QuestionPerformanceSummary, WorkspaceError>;
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

    pub fn list_notebooks(&self) -> Result<Vec<NotebookSummary>, WorkspaceError> {
        self.store.list_notebooks()
    }

    pub fn create_notebook(
        &self,
        input: CreateNotebookInput,
    ) -> Result<NotebookSummary, WorkspaceError> {
        let normalized =
            normalize_create_notebook_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_notebook(&normalized)
    }

    pub fn list_notebook_entries(
        &self,
        notebook_id: String,
    ) -> Result<Vec<QuestionNotebookEntrySummary>, WorkspaceError> {
        let normalized =
            normalize_notebook_id(&notebook_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.list_notebook_entries(&normalized)
    }

    pub fn set_notebook_entry(
        &self,
        input: SetQuestionNotebookInput,
    ) -> Result<bool, WorkspaceError> {
        let normalized =
            normalize_set_question_notebook_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.set_notebook_entry(&normalized)
    }

    pub fn answer(
        &self,
        input: AnswerQuestionInput,
    ) -> Result<AnswerQuestionResult, WorkspaceError> {
        let normalized =
            normalize_answer_question_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.answer_question(&normalized)
    }

    pub fn revise(
        &self,
        input: ReviseQuestionInput,
    ) -> Result<ReviseQuestionResult, WorkspaceError> {
        let normalized =
            normalize_revise_question_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.revise_question(&normalized)
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

    pub fn create_external_batch(
        &self,
        input: CreateExternalQuestionBatchInput,
    ) -> Result<ExternalQuestionBatchSummary, WorkspaceError> {
        let normalized =
            normalize_external_question_batch_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_external_question_batch(&normalized)
    }

    pub fn list_external_batches(
        &self,
    ) -> Result<Vec<ExternalQuestionBatchSummary>, WorkspaceError> {
        self.store.list_external_question_batches()
    }

    pub fn performance(
        &self,
        as_of_date: &str,
    ) -> Result<QuestionPerformanceSummary, WorkspaceError> {
        let date = crate::domain::study_plan::normalize_date(as_of_date)
            .map_err(WorkspaceError::InvalidInput)?;
        self.store.question_performance(&date)
    }
}
