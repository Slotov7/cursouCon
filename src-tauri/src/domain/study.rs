use crate::domain::study_plan::normalize_date;
use serde::Serialize;
use uuid::Uuid;

const MAX_TASK_MINUTES: i64 = 1_440;
const MAX_SESSION_SECONDS: i64 = 604_800;

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
pub struct StartStudySessionInput {
    pub task_id: String,
}

#[derive(Debug, Clone)]
pub struct FinishStudySessionInput {
    pub session_id: String,
    pub effective_seconds: i64,
    pub task_status: TaskCompletion,
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
    pub effective_seconds: i64,
    pub status: StudySessionStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlan {
    pub date: String,
    pub tasks: Vec<StudyTaskSummary>,
    pub active_session: Option<StudySessionSummary>,
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

pub fn normalize_finish_session_input(
    input: FinishStudySessionInput,
) -> Result<FinishStudySessionInput, String> {
    if !(0..=MAX_SESSION_SECONDS).contains(&input.effective_seconds) {
        return Err(format!(
            "A duração efetiva deve estar entre 0 e {MAX_SESSION_SECONDS} segundos."
        ));
    }

    Ok(FinishStudySessionInput {
        session_id: normalize_id(&input.session_id, "A sessão")?,
        effective_seconds: input.effective_seconds,
        task_status: input.task_status,
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

fn normalize_required_text(value: String, label: &str, max_length: usize) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} é obrigatório."));
    }
    if trimmed.chars().count() > max_length {
        return Err(format!("{label} deve ter no máximo {max_length} caracteres."));
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
        })
        .is_ok());
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
        assert!(normalize_task_completion("unknown").is_err());
    }
}
