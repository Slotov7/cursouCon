use crate::application::study_service::StudyService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::study::{
    normalize_task_completion, AcceptStudyCycleActionInput, AcceptStudyCycleActionResult,
    CompleteStudyReviewInput, CompleteStudyReviewResult, CorrectStudySessionDurationInput,
    CorrectStudySessionDurationResult, CreateManualStudyInput, CreateManualStudyResult,
    CreateStudyTaskInput, DailyPlan, FinishStudySessionInput, FinishStudySessionResult,
    HeartbeatStudySessionInput, PauseStudySessionInput, RescheduleStudyReviewInput,
    RescheduleStudyTaskInput, ResumeStudySessionInput, SaveStudySessionReflectionInput,
    SessionDifficulty, SkipStudyTaskInput, StartStudySessionInput, StudyProgressSummary,
    StudyReviewSummary, StudySessionSummary, StudyTaskSummary,
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
pub struct AcceptStudyCycleActionRequest {
    pub preparation_id: String,
    pub cycle_position: i64,
    pub cycle_step: i64,
    pub scheduled_for: String,
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
pub struct CreateManualStudyRequest {
    pub preparation_id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub studied_on: String,
    pub effective_seconds: i64,
    pub summary_markdown: Option<String>,
    pub difficulty: Option<SessionDifficulty>,
    pub next_steps: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectStudySessionDurationRequest {
    pub session_id: String,
    pub effective_seconds: i64,
    pub reason: String,
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
pub struct HeartbeatStudySessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishStudySessionRequest {
    pub session_id: String,
    pub effective_seconds: i64,
    pub task_status: String,
    pub review_on: Option<String>,
    pub summary_markdown: Option<String>,
    pub difficulty: Option<SessionDifficulty>,
    pub next_steps: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStudySessionReflectionRequest {
    pub session_id: String,
    pub summary_markdown: Option<String>,
    pub difficulty: Option<SessionDifficulty>,
    pub next_steps: Option<String>,
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
pub fn accept_study_cycle_action(
    app: AppHandle,
    request: AcceptStudyCycleActionRequest,
) -> Result<AcceptStudyCycleActionResult, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .accept_cycle_action(AcceptStudyCycleActionInput {
            preparation_id: request.preparation_id,
            cycle_position: request.cycle_position,
            cycle_step: request.cycle_step,
            scheduled_for: request.scheduled_for,
        })
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
pub fn create_manual_study(
    app: AppHandle,
    request: CreateManualStudyRequest,
) -> Result<CreateManualStudyResult, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .create_manual_study(CreateManualStudyInput {
            preparation_id: request.preparation_id,
            subject_id: request.subject_id,
            title: request.title,
            studied_on: request.studied_on,
            effective_seconds: request.effective_seconds,
            summary_markdown: request.summary_markdown,
            difficulty: request.difficulty,
            next_steps: request.next_steps,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn correct_study_session_duration(
    app: AppHandle,
    request: CorrectStudySessionDurationRequest,
) -> Result<CorrectStudySessionDurationResult, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .correct_session_duration(CorrectStudySessionDurationInput {
            session_id: request.session_id,
            effective_seconds: request.effective_seconds,
            reason: request.reason,
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
pub fn heartbeat_study_session(
    app: AppHandle,
    request: HeartbeatStudySessionRequest,
) -> Result<StudySessionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .heartbeat_session(HeartbeatStudySessionInput {
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
            summary_markdown: request.summary_markdown,
            difficulty: request.difficulty,
            next_steps: request.next_steps,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn save_study_session_reflection(
    app: AppHandle,
    request: SaveStudySessionReflectionRequest,
) -> Result<StudySessionSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyService::new(store)
        .save_session_reflection(SaveStudySessionReflectionInput {
            session_id: request.session_id,
            summary_markdown: request.summary_markdown,
            difficulty: request.difficulty,
            next_steps: request.next_steps,
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
) -> Result<CompleteStudyReviewResult, CommandError> {
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
