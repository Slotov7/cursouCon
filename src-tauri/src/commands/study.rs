use crate::application::study_service::StudyService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::study::{
    normalize_task_completion, CompleteStudyReviewInput, CreateStudyTaskInput, DailyPlan,
    FinishStudySessionInput, FinishStudySessionResult, PauseStudySessionInput,
    RescheduleStudyReviewInput, RescheduleStudyTaskInput, ResumeStudySessionInput,
    SkipStudyTaskInput, StartStudySessionInput, StudyProgressSummary, StudyReviewSummary,
    StudySessionSummary, StudyTaskSummary,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlanRequest {
    pub date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStudyTaskRequest {
    pub preparation_id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub objective: Option<String>,
    pub planned_minutes: i64,
    pub scheduled_for: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RescheduleStudyTaskRequest {
    pub task_id: String,
    pub scheduled_for: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkipStudyTaskRequest {
    pub task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStudySessionRequest {
    pub task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PauseStudySessionRequest {
    pub session_id: String,
    pub effective_seconds: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeStudySessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishStudySessionRequest {
    pub session_id: String,
    pub effective_seconds: i64,
    pub task_status: String,
    pub review_on: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RescheduleStudyReviewRequest {
    pub review_id: String,
    pub due_date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteStudyReviewRequest {
    pub review_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyProgressRequest {
    pub as_of_date: String,
}

#[tauri::command]
pub fn get_daily_plan(
    app: AppHandle,
    request: DailyPlanRequest,
) -> Result<DailyPlan, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .daily_plan(&request.date)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_study_task(
    app: AppHandle,
    request: CreateStudyTaskRequest,
) -> Result<StudyTaskSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    let input = CreateStudyTaskInput {
        preparation_id: request.preparation_id,
        subject_id: request.subject_id,
        title: request.title,
        objective: request.objective,
        planned_minutes: request.planned_minutes,
        scheduled_for: request.scheduled_for,
    };

    StudyService::new(store)
        .create_task(input)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn reschedule_study_task(
    app: AppHandle,
    request: RescheduleStudyTaskRequest,
) -> Result<StudyTaskSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .reschedule_task(RescheduleStudyTaskInput {
            task_id: request.task_id,
            scheduled_for: request.scheduled_for,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn skip_study_task(
    app: AppHandle,
    request: SkipStudyTaskRequest,
) -> Result<StudyTaskSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .skip_task(SkipStudyTaskInput {
            task_id: request.task_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn start_study_session(
    app: AppHandle,
    request: StartStudySessionRequest,
) -> Result<StudySessionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .start_session(StartStudySessionInput {
            task_id: request.task_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn pause_study_session(
    app: AppHandle,
    request: PauseStudySessionRequest,
) -> Result<StudySessionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .pause_session(PauseStudySessionInput {
            session_id: request.session_id,
            effective_seconds: request.effective_seconds,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn resume_study_session(
    app: AppHandle,
    request: ResumeStudySessionRequest,
) -> Result<StudySessionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .resume_session(ResumeStudySessionInput {
            session_id: request.session_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn finish_study_session(
    app: AppHandle,
    request: FinishStudySessionRequest,
) -> Result<FinishStudySessionResult, CommandError> {
    let store = local_workspace_store(&app)?;
    let task_status = normalize_task_completion(&request.task_status)
        .map_err(|error| CommandError::new("invalid_input", error))?;

    StudyService::new(store)
        .finish_session(FinishStudySessionInput {
            session_id: request.session_id,
            effective_seconds: request.effective_seconds,
            task_status,
            review_on: request.review_on,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn reschedule_study_review(
    app: AppHandle,
    request: RescheduleStudyReviewRequest,
) -> Result<StudyReviewSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .reschedule_review(RescheduleStudyReviewInput {
            review_id: request.review_id,
            due_date: request.due_date,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn complete_study_review(
    app: AppHandle,
    request: CompleteStudyReviewRequest,
) -> Result<StudyReviewSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .complete_review(CompleteStudyReviewInput {
            review_id: request.review_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_study_progress(
    app: AppHandle,
    request: StudyProgressRequest,
) -> Result<StudyProgressSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .study_progress(&request.as_of_date)
        .map_err(CommandError::from)
}
