use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct CreateDiscursiveQuestionInput {
    pub statement_markdown: String,
    pub reference_markdown: Option<String>,
    pub rubric_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AnswerDiscursiveQuestionInput {
    pub question_id: String,
    pub response_markdown: String,
    pub self_assessment: String,
    pub elapsed_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscursiveAttemptSummary {
    pub id: String,
    pub response_markdown: String,
    pub self_assessment: String,
    pub elapsed_seconds: i64,
    pub answered_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscursiveQuestionSummary {
    pub id: String,
    pub statement_markdown: String,
    pub reference_markdown: Option<String>,
    pub rubric_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub attempts_count: i64,
    pub latest_attempt: Option<DiscursiveAttemptSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerDiscursiveQuestionResult {
    pub question: DiscursiveQuestionSummary,
    pub attempt: DiscursiveAttemptSummary,
}

pub fn normalize_create_discursive_input(
    input: CreateDiscursiveQuestionInput,
) -> Result<CreateDiscursiveQuestionInput, String> {
    Ok(CreateDiscursiveQuestionInput {
        statement_markdown: normalize_required_markdown(input.statement_markdown, "O enunciado")?,
        reference_markdown: normalize_optional_markdown(input.reference_markdown, "A referência")?,
        rubric_markdown: normalize_optional_markdown(input.rubric_markdown, "A rubrica")?,
        source_name: normalize_optional_text(input.source_name, "A origem", 240)?,
        board: normalize_optional_text(input.board, "A banca", 160)?,
        organization: normalize_optional_text(input.organization, "O órgão", 160)?,
        role: normalize_optional_text(input.role, "O cargo", 160)?,
        exam_year: normalize_exam_year(input.exam_year)?,
        subject_id: input
            .subject_id
            .map(|value| normalize_id(&value, "O assunto"))
            .transpose()?,
    })
}

pub fn normalize_answer_discursive_input(
    input: AnswerDiscursiveQuestionInput,
) -> Result<AnswerDiscursiveQuestionInput, String> {
    let self_assessment = match input.self_assessment.trim() {
        "weak" | "partial" | "strong" => input.self_assessment.trim().to_string(),
        _ => return Err("A autoavaliação precisa ser fraca, parcial ou forte.".to_string()),
    };
    if !(0..=86_400).contains(&input.elapsed_seconds) {
        return Err("O tempo da resposta precisa ficar entre 0 e 24 horas.".to_string());
    }

    Ok(AnswerDiscursiveQuestionInput {
        question_id: normalize_id(&input.question_id, "A questão")?,
        response_markdown: normalize_required_markdown(input.response_markdown, "A resposta")?,
        self_assessment,
        elapsed_seconds: input.elapsed_seconds,
    })
}

fn normalize_required_markdown(value: String, label: &str) -> Result<String, String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(format!("{label} é obrigatório."));
    }
    if normalized.chars().count() > 50_000 || normalized.chars().any(char::is_control) {
        return Err(format!("{label} é inválido ou longo demais."));
    }
    Ok(normalized.to_string())
}

fn normalize_optional_markdown(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, String> {
    value
        .map(|content| normalize_required_markdown(content, label))
        .transpose()
}

fn normalize_optional_text(
    value: Option<String>,
    label: &str,
    max_chars: usize,
) -> Result<Option<String>, String> {
    value
        .map(|content| {
            let normalized = content.trim();
            if normalized.is_empty() {
                return Ok(None);
            }
            if normalized.chars().count() > max_chars || normalized.chars().any(char::is_control) {
                return Err(format!("{label} é inválido ou longo demais."));
            }
            Ok(Some(normalized.to_string()))
        })
        .transpose()
        .map(|value| value.flatten())
}

fn normalize_exam_year(value: Option<i64>) -> Result<Option<i64>, String> {
    if let Some(year) = value {
        if !(1900..=2200).contains(&year) {
            return Err("O ano precisa ficar entre 1900 e 2200.".to_string());
        }
    }
    Ok(value)
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
    fn normalizes_discursive_response_and_self_assessment() {
        let question_id = Uuid::new_v4().to_string();
        let result = normalize_answer_discursive_input(AnswerDiscursiveQuestionInput {
            question_id: format!(" {question_id} "),
            response_markdown: "  Uma resposta fundamentada.  ".to_string(),
            self_assessment: " strong ".to_string(),
            elapsed_seconds: 90,
        })
        .expect("a resposta deveria ser válida");

        assert_eq!(result.question_id, question_id);
        assert_eq!(result.response_markdown, "Uma resposta fundamentada.");
        assert_eq!(result.self_assessment, "strong");
    }
}
