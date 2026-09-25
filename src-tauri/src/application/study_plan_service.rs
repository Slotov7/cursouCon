use crate::application::workspace_service::WorkspaceError;
use crate::domain::study_plan::{
    normalize_preparation_exam_config_input, normalize_preparation_id, normalize_preparation_input,
    normalize_study_planning_input, normalize_subject_input, normalize_subject_study_status_input,
    CreatePreparationInput, CreateSubjectInput, PreparationSummary, SavePreparationExamConfigInput,
    SaveStudyPlanningInput, SetSubjectStudyStatusInput, StudyPlan, StudyPlanningSummary,
    SubjectSummary,
};

pub trait StudyPlanStore {
    fn study_plan(&self) -> Result<StudyPlan, WorkspaceError>;
    fn create_preparation(
        &self,
        input: &CreatePreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError>;
    fn create_subject(&self, input: &CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError>;
    fn save_preparation_exam_config(
        &self,
        input: &SavePreparationExamConfigInput,
    ) -> Result<PreparationSummary, WorkspaceError>;
    fn set_subject_study_status(
        &self,
        input: &SetSubjectStudyStatusInput,
    ) -> Result<SubjectSummary, WorkspaceError>;
    fn study_planning(&self, preparation_id: &str) -> Result<StudyPlanningSummary, WorkspaceError>;
    fn save_study_planning(
        &self,
        input: &SaveStudyPlanningInput,
    ) -> Result<StudyPlanningSummary, WorkspaceError>;
    fn advance_study_cycle(
        &self,
        preparation_id: &str,
    ) -> Result<StudyPlanningSummary, WorkspaceError>;
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
        let normalized =
            normalize_preparation_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_preparation(&normalized)
    }

    pub fn create_subject(
        &self,
        input: CreateSubjectInput,
    ) -> Result<SubjectSummary, WorkspaceError> {
        let normalized = normalize_subject_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_subject(&normalized)
    }

    pub fn save_preparation_exam_config(
        &self,
        input: SavePreparationExamConfigInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let normalized =
            normalize_preparation_exam_config_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.save_preparation_exam_config(&normalized)
    }

    pub fn set_subject_study_status(
        &self,
        input: SetSubjectStudyStatusInput,
    ) -> Result<SubjectSummary, WorkspaceError> {
        let normalized =
            normalize_subject_study_status_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.set_subject_study_status(&normalized)
    }

    pub fn planning(&self, preparation_id: &str) -> Result<StudyPlanningSummary, WorkspaceError> {
        let normalized =
            normalize_preparation_id(preparation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.study_planning(&normalized)
    }

    pub fn save_planning(
        &self,
        input: SaveStudyPlanningInput,
    ) -> Result<StudyPlanningSummary, WorkspaceError> {
        let normalized =
            normalize_study_planning_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.save_study_planning(&normalized)
    }

    pub fn advance_cycle(
        &self,
        preparation_id: &str,
    ) -> Result<StudyPlanningSummary, WorkspaceError> {
        let normalized =
            normalize_preparation_id(preparation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.advance_study_cycle(&normalized)
    }
}
