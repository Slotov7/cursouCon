use crate::application::workspace_service::WorkspaceError;
use crate::domain::study::{
    normalize_finish_session_input, normalize_start_session_input, normalize_study_task_input,
    CreateStudyTaskInput, DailyPlan, FinishStudySessionInput, StartStudySessionInput,
    StudySessionSummary, StudyTaskSummary,
};
use crate::domain::study_plan::normalize_date;

pub trait StudyStore {
    fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError>;
    fn create_study_task(&self, input: &CreateStudyTaskInput) -> Result<StudyTaskSummary, WorkspaceError>;
    fn start_study_session(
        &self,
        input: &StartStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError>;
    fn finish_study_session(
        &self,
        input: &FinishStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError>;
}

pub struct StudyService<S> {
    store: S,
}

impl<S: StudyStore> StudyService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError> {
        let date = normalize_date(date).map_err(WorkspaceError::InvalidInput)?;
        self.store.daily_plan(&date)
    }

    pub fn create_task(
        &self,
        input: CreateStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError> {
        let normalized = normalize_study_task_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_study_task(&normalized)
    }

    pub fn start_session(
        &self,
        input: StartStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let normalized = normalize_start_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.start_study_session(&normalized)
    }

    pub fn finish_session(
        &self,
        input: FinishStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let normalized = normalize_finish_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.finish_study_session(&normalized)
    }
}
