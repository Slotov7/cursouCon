use crate::application::workspace_service::WorkspaceError;
use crate::domain::study_plan::{
    normalize_preparation_input, normalize_subject_input, CreatePreparationInput,
    CreateSubjectInput, PreparationSummary, StudyPlan, SubjectSummary,
};

pub trait StudyPlanStore {
    fn study_plan(&self) -> Result<StudyPlan, WorkspaceError>;
    fn create_preparation(
        &self,
        input: &CreatePreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError>;
    fn create_subject(&self, input: &CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError>;
}

pub struct StudyPlanService<S> {
    store: S,
}

impl<S: StudyPlanStore> StudyPlanService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn load(&self) -> Result<StudyPlan, WorkspaceError> {
        self.store.study_plan()
    }

    pub fn create_preparation(
        &self,
        input: CreatePreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let normalized = normalize_preparation_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_preparation(&normalized)
    }

    pub fn create_subject(&self, input: CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError> {
        let normalized = normalize_subject_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_subject(&normalized)
    }
}
