use crate::application::workspace_service::WorkspaceError;
use crate::domain::discursive::{
    normalize_answer_discursive_input, normalize_create_discursive_input,
    AnswerDiscursiveQuestionInput, AnswerDiscursiveQuestionResult, CreateDiscursiveQuestionInput,
    DiscursiveQuestionSummary,
};

pub trait DiscursiveStore {
    fn list_discursive_questions(&self) -> Result<Vec<DiscursiveQuestionSummary>, WorkspaceError>;
    fn create_discursive_question(
        &self,
        input: &CreateDiscursiveQuestionInput,
    ) -> Result<DiscursiveQuestionSummary, WorkspaceError>;
    fn answer_discursive_question(
        &self,
        input: &AnswerDiscursiveQuestionInput,
    ) -> Result<AnswerDiscursiveQuestionResult, WorkspaceError>;
}

pub struct DiscursiveService<S> {
    store: S,
}

impl<S: DiscursiveStore> DiscursiveService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<Vec<DiscursiveQuestionSummary>, WorkspaceError> {
        self.store.list_discursive_questions()
    }

    pub fn create(
        &self,
        input: CreateDiscursiveQuestionInput,
    ) -> Result<DiscursiveQuestionSummary, WorkspaceError> {
        let normalized =
            normalize_create_discursive_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_discursive_question(&normalized)
    }

    pub fn answer(
        &self,
        input: AnswerDiscursiveQuestionInput,
    ) -> Result<AnswerDiscursiveQuestionResult, WorkspaceError> {
        let normalized =
            normalize_answer_discursive_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.answer_discursive_question(&normalized)
    }
}
