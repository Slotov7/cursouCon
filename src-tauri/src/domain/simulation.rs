use super::question::QuestionOptionSummary;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SimulationSubjectSelection {
    pub subject_id: String,
    pub question_count: i64,
    pub weight: f64,
}

#[derive(Debug, Clone)]
pub struct CreateSimulationInput {
    pub preparation_id: String,
    pub title: String,
    pub mode: String,
    pub question_count: i64,
    pub time_limit_seconds: Option<i64>,
    pub negative_points: f64,
    pub blank_points: f64,
    pub annulled_points: f64,
    pub question_type: Option<String>,
    pub subject_selections: Vec<SimulationSubjectSelection>,
}

#[derive(Debug, Clone)]
pub struct AnswerSimulationInput {
    pub simulation_id: String,
    pub question_id: String,
    pub selected_key: Option<String>,
    pub elapsed_seconds: i64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SimulationMode {
    Training,
    Exam,
}

impl SimulationMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Training => "training",
            Self::Exam => "exam",
        }
    }

    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "training" => Some(Self::Training),
            "exam" => Some(Self::Exam),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SimulationStatus {
    Draft,
    InProgress,
    Paused,
    Completed,
}

impl SimulationStatus {
    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "draft" => Some(Self::Draft),
            "in_progress" => Some(Self::InProgress),
            "paused" => Some(Self::Paused),
            "completed" => Some(Self::Completed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSummary {
    pub id: String,
    pub preparation_id: String,
    pub preparation_name: String,
    pub title: String,
    pub mode: SimulationMode,
    pub question_count: i64,
    pub answered_count: i64,
    pub time_limit_seconds: Option<i64>,
    pub negative_points: f64,
    pub blank_points: f64,
    pub annulled_points: f64,
    pub status: SimulationStatus,
    pub started_at: Option<String>,
    pub ends_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationQuestionSummary {
    pub question_id: String,
    pub position: i64,
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub question_type: String,
    pub statement_markdown: String,
    pub options: Vec<QuestionOptionSummary>,
    pub selected_key: Option<String>,
    pub elapsed_seconds: i64,
    pub answer_key: Option<String>,
    pub result: Option<String>,
    pub explanation_markdown: Option<String>,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationDetail {
    pub simulation: SimulationSummary,
    pub questions: Vec<SimulationQuestionSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationDiagnosticSummary {
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub question_count: i64,
    pub correct_count: i64,
    pub incorrect_count: i64,
    pub blank_count: i64,
    pub elapsed_seconds: i64,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResult {
    pub detail: SimulationDetail,
    pub score: f64,
    pub max_score: f64,
    pub percentage: Option<f64>,
    pub correct_count: i64,
    pub incorrect_count: i64,
    pub blank_count: i64,
    pub annulled_count: i64,
    pub diagnostics: Vec<SimulationDiagnosticSummary>,
}

pub fn normalize_create_simulation_input(
    input: CreateSimulationInput,
) -> Result<CreateSimulationInput, String> {
    let mode = match input.mode.trim() {
        "training" | "exam" => input.mode.trim().to_string(),
        _ => return Err("O modo do simulado precisa ser treino ou prova.".to_string()),
    };
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > 160 || title.chars().any(char::is_control) {
        return Err(
            "O título do simulado é obrigatório e deve ter até 160 caracteres.".to_string(),
        );
    }
    if !(1..=500).contains(&input.question_count) {
        return Err("O simulado precisa ter entre 1 e 500 questões.".to_string());
    }
    if input.mode.trim() == "exam"
        && !matches!(input.time_limit_seconds, Some(value) if (60..=604800).contains(&value))
    {
        return Err("A prova precisa de um tempo entre 1 minuto e 7 dias.".to_string());
    }
    if let Some(value) = input.time_limit_seconds {
        if !(60..=604800).contains(&value) {
            return Err("O tempo precisa ficar entre 1 minuto e 7 dias.".to_string());
        }
    }
    validate_points(input.negative_points, "A penalidade")?;
    validate_points(input.blank_points, "A pontuação do branco")?;
    validate_points(input.annulled_points, "A pontuação da anulada")?;
    let question_type = input
        .question_type
        .map(|value| match value.trim() {
            "multiple_choice" | "true_false" => Ok(value.trim().to_string()),
            _ => Err("O filtro do simulado aceita apenas questões objetivas.".to_string()),
        })
        .transpose()?;

    let mut total = 0_i64;
    let mut normalized_selections = Vec::with_capacity(input.subject_selections.len());
    for selection in input.subject_selections {
        let subject_id = normalize_id(&selection.subject_id, "O assunto do simulado")?;
        if selection.question_count < 1 || selection.question_count > 500 {
            return Err("Cada distribuição precisa ter entre 1 e 500 questões.".to_string());
        }
        if !selection.weight.is_finite() || !(0.1..=10.0).contains(&selection.weight) {
            return Err("O peso de cada assunto precisa ficar entre 0,1 e 10.".to_string());
        }
        total = total
            .checked_add(selection.question_count)
            .ok_or_else(|| "A distribuição do simulado é grande demais.".to_string())?;
        normalized_selections.push(SimulationSubjectSelection {
            subject_id,
            question_count: selection.question_count,
            weight: selection.weight,
        });
    }
    if !normalized_selections.is_empty() && total != input.question_count {
        return Err(
            "A soma da distribuição precisa ser igual à quantidade de questões.".to_string(),
        );
    }
    if normalized_selections
        .iter()
        .map(|selection| selection.subject_id.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len()
        != normalized_selections.len()
    {
        return Err("Um assunto não pode aparecer duas vezes na distribuição.".to_string());
    }

    Ok(CreateSimulationInput {
        preparation_id: normalize_id(&input.preparation_id, "A preparação")?,
        title: title.to_string(),
        mode,
        question_count: input.question_count,
        time_limit_seconds: input.time_limit_seconds,
        negative_points: input.negative_points,
        blank_points: input.blank_points,
        annulled_points: input.annulled_points,
        question_type,
        subject_selections: normalized_selections,
    })
}

pub fn normalize_simulation_id(value: &str) -> Result<String, String> {
    normalize_id(value, "O simulado")
}

pub fn normalize_answer_simulation_input(
    input: AnswerSimulationInput,
) -> Result<AnswerSimulationInput, String> {
    if !(0..=86400).contains(&input.elapsed_seconds) {
        return Err("O tempo da resposta precisa ficar entre 0 e 24 horas.".to_string());
    }
    let selected_key = input
        .selected_key
        .map(|value| match value.trim() {
            "A" | "B" | "C" | "D" | "E" | "true" | "false" => Ok(value.trim().to_string()),
            _ => Err("A alternativa escolhida não é válida.".to_string()),
        })
        .transpose()?;
    Ok(AnswerSimulationInput {
        simulation_id: normalize_simulation_id(&input.simulation_id)?,
        question_id: normalize_id(&input.question_id, "A questão")?,
        selected_key,
        elapsed_seconds: input.elapsed_seconds,
    })
}

fn validate_points(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || !(0.0..=10.0).contains(&value) {
        return Err(format!("{label} precisa ficar entre 0 e 10."));
    }
    Ok(())
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    Uuid::parse_str(value.trim())
        .map(|id| id.to_string())
        .map_err(|_| format!("{label} não é válido."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_simulation_distribution_without_silent_repetition() {
        let preparation_id = Uuid::new_v4().to_string();
        let subject_id = Uuid::new_v4().to_string();
        let input = normalize_create_simulation_input(CreateSimulationInput {
            preparation_id: format!(" {preparation_id} "),
            title: "  Redes - treino  ".to_string(),
            mode: "training".to_string(),
            question_count: 10,
            time_limit_seconds: None,
            negative_points: 0.5,
            blank_points: 0.0,
            annulled_points: 1.0,
            question_type: Some("multiple_choice".to_string()),
            subject_selections: vec![SimulationSubjectSelection {
                subject_id: format!(" {subject_id} "),
                question_count: 10,
                weight: 2.0,
            }],
        })
        .expect("a configuração deve ser válida");

        assert_eq!(input.title, "Redes - treino");
        assert_eq!(input.subject_selections[0].subject_id, subject_id);
        assert!(normalize_create_simulation_input(CreateSimulationInput {
            question_count: 3,
            subject_selections: vec![SimulationSubjectSelection {
                subject_id: Uuid::new_v4().to_string(),
                question_count: 2,
                weight: 1.0,
            }],
            ..input
        })
        .is_err());
    }
}
