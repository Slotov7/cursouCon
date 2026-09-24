use crate::application::workspace_service::WorkspaceError;
use crate::domain::study::{
    normalize_accept_study_cycle_action_input, normalize_complete_study_review_input,
    normalize_finish_session_input, normalize_pause_session_input,
    normalize_reschedule_study_review_input, normalize_reschedule_task_input,
    normalize_resume_session_input, normalize_skip_task_input, normalize_start_session_input,
    normalize_study_task_input, AcceptStudyCycleActionInput, AcceptStudyCycleActionResult,
    CompleteStudyReviewInput, CompleteStudyReviewResult, CreateStudyTaskInput, DailyPlan,
    FinishStudySessionInput, FinishStudySessionResult, PauseStudySessionInput,
    RescheduleStudyReviewInput, RescheduleStudyTaskInput, ResumeStudySessionInput,
    SkipStudyTaskInput, StartStudySessionInput, StudyProgressSummary, StudyReviewSummary,
    StudySessionSummary, StudyTaskSummary,
};
use crate::domain::study_plan::normalize_date;

pub trait StudyStore {
    fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError>;
    fn create_study_task(
        &self,
        input: &CreateStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError>;
    fn accept_study_cycle_action(
        &self,
        input: &AcceptStudyCycleActionInput,
    ) -> Result<AcceptStudyCycleActionResult, WorkspaceError>;
    fn reschedule_study_task(
        &self,
        input: &RescheduleStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError>;
    fn skip_study_task(
        &self,
        input: &SkipStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError>;
    fn start_study_session(
        &self,
        input: &StartStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError>;
    fn pause_study_session(
        &self,
        input: &PauseStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError>;
    fn resume_study_session(
        &self,
        input: &ResumeStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError>;
    fn finish_study_session(
        &self,
        input: &FinishStudySessionInput,
    ) -> Result<FinishStudySessionResult, WorkspaceError>;
    fn reschedule_study_review(
        &self,
        input: &RescheduleStudyReviewInput,
    ) -> Result<StudyReviewSummary, WorkspaceError>;
    fn complete_study_review(
        &self,
        input: &CompleteStudyReviewInput,
    ) -> Result<CompleteStudyReviewResult, WorkspaceError>;
    fn study_progress(&self, as_of_date: &str) -> Result<StudyProgressSummary, WorkspaceError>;
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
        let normalized =
            normalize_start_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.start_study_session(&normalized)
    }

    pub fn accept_cycle_action(
        &self,
        input: AcceptStudyCycleActionInput,
    ) -> Result<AcceptStudyCycleActionResult, WorkspaceError> {
        let normalized = normalize_accept_study_cycle_action_input(input)
            .map_err(WorkspaceError::InvalidInput)?;
        self.store.accept_study_cycle_action(&normalized)
    }

    pub fn reschedule_task(
        &self,
        input: RescheduleStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError> {
        let normalized =
            normalize_reschedule_task_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.reschedule_study_task(&normalized)
    }

    pub fn skip_task(&self, input: SkipStudyTaskInput) -> Result<StudyTaskSummary, WorkspaceError> {
        let normalized = normalize_skip_task_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.skip_study_task(&normalized)
    }

    pub fn finish_session(
        &self,
        input: FinishStudySessionInput,
    ) -> Result<FinishStudySessionResult, WorkspaceError> {
        let normalized =
            normalize_finish_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.finish_study_session(&normalized)
    }

    pub fn reschedule_review(
        &self,
        input: RescheduleStudyReviewInput,
    ) -> Result<StudyReviewSummary, WorkspaceError> {
        let normalized =
            normalize_reschedule_study_review_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.reschedule_study_review(&normalized)
    }

    pub fn complete_review(
        &self,
        input: CompleteStudyReviewInput,
    ) -> Result<CompleteStudyReviewResult, WorkspaceError> {
        let normalized =
            normalize_complete_study_review_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.complete_study_review(&normalized)
    }

    pub fn pause_session(
        &self,
        input: PauseStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let normalized =
            normalize_pause_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.pause_study_session(&normalized)
    }

    pub fn resume_session(
        &self,
        input: ResumeStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let normalized =
            normalize_resume_session_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.resume_study_session(&normalized)
    }

    pub fn study_progress(&self, as_of_date: &str) -> Result<StudyProgressSummary, WorkspaceError> {
        let as_of_date = normalize_date(as_of_date).map_err(WorkspaceError::InvalidInput)?;
        self.store.study_progress(&as_of_date)
    }
}
