use crate::domain::study_plan::normalize_date;
use serde::Serialize;
use uuid::Uuid;

const MAX_TASK_MINUTES: i64 = 1_440;
const MAX_SESSION_SECONDS: i64 = 604_800;
pub const SESSION_XP_DAILY_CAP: i64 = 120;
pub const QUESTION_XP_PER_DAY: i64 = 2;
pub const QUESTION_XP_DAILY_CAP: i64 = 60;
pub const XP_RULES_VERSION: i64 = 1;
pub const QUESTION_XP_RULES_VERSION: i64 = 1;

#[derive(Debug, Clone)]
pub struct CreateStudyTaskInput {
    pub preparation_id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub objective: Option<String>,
    pub planned_minutes: i64,
    pub scheduled_for: String,
}

#[derive(Debug, Clone)]
pub struct RescheduleStudyTaskInput {
    pub task_id: String,
    pub scheduled_for: String,
}

#[derive(Debug, Clone)]
pub struct SkipStudyTaskInput {
    pub task_id: String,
}

#[derive(Debug, Clone)]
pub struct StartStudySessionInput {
    pub task_id: String,
}

#[derive(Debug, Clone)]
pub struct PauseStudySessionInput {
    pub session_id: String,
    pub effective_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct ResumeStudySessionInput {
    pub session_id: String,
}

#[derive(Debug, Clone)]
pub struct FinishStudySessionInput {
    pub session_id: String,
    pub effective_seconds: i64,
    pub task_status: TaskCompletion,
    pub review_on: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StudyTaskStatus {
    Pending,
    Partial,
    Completed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StudySessionStatus {
    Active,
    Paused,
    Completed,
    Interrupted,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StudyReviewStatus {
    Pending,
    Completed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskCompletion {
    Completed,
    Partial,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyTaskSummary {
    pub id: String,
    pub preparation_id: String,
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub title: String,
    pub objective: Option<String>,
    pub planned_minutes: i64,
    pub scheduled_for: String,
    pub status: StudyTaskStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudySessionSummary {
    pub id: String,
    pub task_id: String,
    pub subject_id: Option<String>,
    pub started_at: String,
    pub active_started_at: Option<String>,
    pub effective_seconds: i64,
    pub status: StudySessionStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlan {
    pub date: String,
    pub tasks: Vec<StudyTaskSummary>,
    pub active_session: Option<StudySessionSummary>,
    pub reviews: Vec<StudyReviewSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishStudySessionResult {
    pub session: StudySessionSummary,
    pub xp_granted: i64,
    pub review: Option<StudyReviewSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyReviewSummary {
    pub id: String,
    pub subject_id: String,
    pub subject_name: String,
    pub source_session_id: String,
    pub due_date: String,
    pub status: StudyReviewStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RescheduleStudyReviewInput {
    pub review_id: String,
    pub due_date: String,
}

#[derive(Debug, Clone)]
pub struct CompleteStudyReviewInput {
    pub review_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyHistoryEntry {
    pub session_id: String,
    pub task_id: String,
    pub task_title: String,
    pub subject_name: Option<String>,
    pub ended_at: String,
    pub effective_seconds: i64,
    pub task_status: StudyTaskStatus,
    pub xp_granted: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyProgressSummary {
    pub total_xp: i64,
    pub completed_sessions: i64,
    pub effective_seconds: i64,
    pub streak: StudyStreakSummary,
    pub recent_sessions: Vec<StudyHistoryEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyStreakSummary {
    pub current_planned_days: i64,
    pub longest_planned_days: i64,
    pub last_study_day: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PlannedStudyDay {
    pub date: String,
    pub completed: bool,
}

pub fn calculate_study_streak(days: &[PlannedStudyDay], as_of_date: &str) -> StudyStreakSummary {
    let mut ordered_days = days
        .iter()
        .filter(|day| day.date.as_str() <= as_of_date)
        .collect::<Vec<_>>();
    ordered_days.sort_by(|left, right| left.date.cmp(&right.date));

    let mut longest_planned_days = 0;
    let mut run_length = 0;
    let mut last_study_day = None;
    for day in &ordered_days {
        if day.completed {
            run_length += 1;
            longest_planned_days = longest_planned_days.max(run_length);
            last_study_day = Some(day.date.clone());
        } else {
            run_length = 0;
        }
    }

    let mut current_planned_days = 0;
    for day in ordered_days.iter().rev() {
        if day.date == as_of_date && !day.completed {
            continue;
        }
        if !day.completed {
            break;
        }
        current_planned_days += 1;
    }

    StudyStreakSummary {
        current_planned_days,
        longest_planned_days,
        last_study_day,
    }
}

pub fn calculate_session_xp(effective_seconds: i64, granted_today: i64) -> i64 {
    let available_today = (SESSION_XP_DAILY_CAP - granted_today).max(0);
    (effective_seconds / 60)
        .clamp(0, SESSION_XP_DAILY_CAP)
        .min(available_today)
}

pub fn calculate_question_xp(granted_today: i64) -> i64 {
    (QUESTION_XP_DAILY_CAP - granted_today).clamp(0, QUESTION_XP_PER_DAY)
}

pub fn normalize_study_task_input(
    input: CreateStudyTaskInput,
) -> Result<CreateStudyTaskInput, String> {
    let preparation_id = normalize_id(&input.preparation_id, "A preparação")?;
    let subject_id = input
        .subject_id
        .map(|subject_id| normalize_id(&subject_id, "O assunto"))
        .transpose()?;
    let title = normalize_required_text(input.title, "O título da tarefa", 160)?;
    let objective = normalize_optional_text(input.objective, "O objetivo", 500)?;
    let scheduled_for = normalize_date(&input.scheduled_for)?;

    if !(1..=MAX_TASK_MINUTES).contains(&input.planned_minutes) {
        return Err(format!(
            "A duração planejada deve estar entre 1 e {MAX_TASK_MINUTES} minutos."
        ));
    }

    Ok(CreateStudyTaskInput {
        preparation_id,
        subject_id,
        title,
        objective,
        planned_minutes: input.planned_minutes,
        scheduled_for,
    })
}

pub fn normalize_start_session_input(
    input: StartStudySessionInput,
) -> Result<StartStudySessionInput, String> {
    Ok(StartStudySessionInput {
        task_id: normalize_id(&input.task_id, "A tarefa")?,
    })
}

pub fn normalize_reschedule_task_input(
    input: RescheduleStudyTaskInput,
) -> Result<RescheduleStudyTaskInput, String> {
    Ok(RescheduleStudyTaskInput {
        task_id: normalize_id(&input.task_id, "A tarefa")?,
        scheduled_for: normalize_date(&input.scheduled_for)?,
    })
}

pub fn normalize_skip_task_input(input: SkipStudyTaskInput) -> Result<SkipStudyTaskInput, String> {
    Ok(SkipStudyTaskInput {
        task_id: normalize_id(&input.task_id, "A tarefa")?,
    })
}

pub fn normalize_pause_session_input(
    input: PauseStudySessionInput,
) -> Result<PauseStudySessionInput, String> {
    if !(0..=MAX_SESSION_SECONDS).contains(&input.effective_seconds) {
        return Err(format!(
            "A duração efetiva deve estar entre 0 e {MAX_SESSION_SECONDS} segundos."
        ));
    }

    Ok(PauseStudySessionInput {
        session_id: normalize_id(&input.session_id, "A sessão")?,
        effective_seconds: input.effective_seconds,
    })
}

pub fn normalize_resume_session_input(
    input: ResumeStudySessionInput,
) -> Result<ResumeStudySessionInput, String> {
    Ok(ResumeStudySessionInput {
        session_id: normalize_id(&input.session_id, "A sessão")?,
    })
}

pub fn normalize_finish_session_input(
    input: FinishStudySessionInput,
) -> Result<FinishStudySessionInput, String> {
    if !(0..=MAX_SESSION_SECONDS).contains(&input.effective_seconds) {
        return Err(format!(
            "A duração efetiva deve estar entre 0 e {MAX_SESSION_SECONDS} segundos."
        ));
    }

    let review_on = input
        .review_on
        .map(|date| {
            normalize_date(&date).map_err(|_| {
                "A data da revisão deve ser uma data válida no formato AAAA-MM-DD.".to_string()
            })
        })
        .transpose()?;
    if input.task_status == TaskCompletion::Partial && review_on.is_some() {
        return Err("Uma revisão só pode ser agendada ao concluir a tarefa.".to_string());
    }

    Ok(FinishStudySessionInput {
        session_id: normalize_id(&input.session_id, "A sessão")?,
        effective_seconds: input.effective_seconds,
        task_status: input.task_status,
        review_on,
    })
}

pub fn normalize_reschedule_study_review_input(
    input: RescheduleStudyReviewInput,
) -> Result<RescheduleStudyReviewInput, String> {
    Ok(RescheduleStudyReviewInput {
        review_id: normalize_id(&input.review_id, "A revisão")?,
        due_date: normalize_date(&input.due_date).map_err(|_| {
            "A data da revisão deve ser uma data válida no formato AAAA-MM-DD.".to_string()
        })?,
    })
}

pub fn normalize_complete_study_review_input(
    input: CompleteStudyReviewInput,
) -> Result<CompleteStudyReviewInput, String> {
    Ok(CompleteStudyReviewInput {
        review_id: normalize_id(&input.review_id, "A revisão")?,
    })
}

pub fn normalize_task_completion(value: &str) -> Result<TaskCompletion, String> {
    match value {
        "completed" => Ok(TaskCompletion::Completed),
        "partial" => Ok(TaskCompletion::Partial),
        _ => Err("O resultado da tarefa é inválido.".to_string()),
    }
}

pub fn parse_task_status(value: &str) -> Result<StudyTaskStatus, String> {
    match value {
        "pending" => Ok(StudyTaskStatus::Pending),
        "partial" => Ok(StudyTaskStatus::Partial),
        "completed" => Ok(StudyTaskStatus::Completed),
        "skipped" => Ok(StudyTaskStatus::Skipped),
        _ => Err("O status da tarefa salvo no banco é inválido.".to_string()),
    }
}

pub fn parse_session_status(value: &str) -> Result<StudySessionStatus, String> {
    match value {
        "active" => Ok(StudySessionStatus::Active),
        "paused" => Ok(StudySessionStatus::Paused),
        "completed" => Ok(StudySessionStatus::Completed),
        "interrupted" => Ok(StudySessionStatus::Interrupted),
        _ => Err("O status da sessão salvo no banco é inválido.".to_string()),
    }
}

fn normalize_required_text(
    value: String,
    label: &str,
    max_length: usize,
) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} é obrigatório."));
    }
    if trimmed.chars().count() > max_length {
        return Err(format!(
            "{label} deve ter no máximo {max_length} caracteres."
        ));
    }
    if trimmed.chars().any(char::is_control) {
        return Err(format!("{label} contém caracteres inválidos."));
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_text(
    value: Option<String>,
    label: &str,
    max_length: usize,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    normalize_required_text(trimmed.to_string(), label, max_length).map(Some)
}

#[cfg(test)]
mod question_xp_tests {
    use super::{calculate_question_xp, QUESTION_XP_DAILY_CAP};

    #[test]
    fn grants_two_xp_until_the_daily_cap() {
        assert_eq!(calculate_question_xp(0), 2);
        assert_eq!(calculate_question_xp(59), 1);
        assert_eq!(calculate_question_xp(QUESTION_XP_DAILY_CAP), 0);
        assert_eq!(calculate_question_xp(80), 0);
    }
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let parsed = Uuid::parse_str(value.trim()).map_err(|_| format!("{label} não é válido."))?;
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_task_and_session_bounds() {
        let task = normalize_study_task_input(CreateStudyTaskInput {
            preparation_id: Uuid::new_v4().to_string(),
            subject_id: None,
            title: "  Revisar HTTP  ".to_string(),
            objective: Some("  Cabeçalhos  ".to_string()),
            planned_minutes: 45,
            scheduled_for: "2032-02-29".to_string(),
        })
        .expect("a tarefa deve ser válida");

        assert_eq!(task.title, "Revisar HTTP");
        assert_eq!(task.objective.as_deref(), Some("Cabeçalhos"));
        assert!(normalize_finish_session_input(FinishStudySessionInput {
            session_id: Uuid::new_v4().to_string(),
            effective_seconds: 45 * 60,
            task_status: TaskCompletion::Completed,
            review_on: Some("2032-03-01".to_string()),
        })
        .is_ok());
        assert!(normalize_finish_session_input(FinishStudySessionInput {
            session_id: Uuid::new_v4().to_string(),
            effective_seconds: 45 * 60,
            task_status: TaskCompletion::Partial,
            review_on: Some("2032-03-01".to_string()),
        })
        .is_err());
    }

    #[test]
    fn rejects_invalid_task_date_and_completion() {
        let task = CreateStudyTaskInput {
            preparation_id: Uuid::new_v4().to_string(),
            subject_id: None,
            title: "Estudar".to_string(),
            objective: None,
            planned_minutes: 30,
            scheduled_for: "2031-02-29".to_string(),
        };

        assert!(normalize_study_task_input(task).is_err());
        assert!(normalize_pause_session_input(PauseStudySessionInput {
            session_id: "not-an-id".to_string(),
            effective_seconds: 30,
        })
        .is_err());
        assert!(normalize_task_completion("unknown").is_err());
    }

    #[test]
    fn calculates_session_xp_with_daily_cap() {
        assert_eq!(calculate_session_xp(59, 0), 0);
        assert_eq!(calculate_session_xp(3_600, 0), 60);
        assert_eq!(calculate_session_xp(9_000, 0), SESSION_XP_DAILY_CAP);
        assert_eq!(calculate_session_xp(3_600, 100), 20);
        assert_eq!(calculate_session_xp(3_600, SESSION_XP_DAILY_CAP), 0);
    }

    #[test]
    fn calculates_streak_across_rest_days_and_breaks_after_a_missed_planned_day() {
        let planned_days = [
            PlannedStudyDay {
                date: "2032-01-05".to_string(),
                completed: true,
            },
            PlannedStudyDay {
                date: "2032-01-07".to_string(),
                completed: true,
            },
            PlannedStudyDay {
                date: "2032-01-10".to_string(),
                completed: false,
            },
        ];

        let streak_today = calculate_study_streak(&planned_days, "2032-01-10");
        let streak_next_day = calculate_study_streak(&planned_days, "2032-01-11");

        assert_eq!(streak_today.current_planned_days, 2);
        assert_eq!(streak_today.longest_planned_days, 2);
        assert_eq!(streak_today.last_study_day.as_deref(), Some("2032-01-07"));
        assert_eq!(streak_next_day.current_planned_days, 0);
        assert_eq!(streak_next_day.longest_planned_days, 2);
    }
}
