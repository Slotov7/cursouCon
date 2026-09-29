use crate::domain::study_plan::normalize_date;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const ERROR_NOTEBOOK_ID: &str = "notebook-errors";

#[derive(Debug, Clone)]
pub struct QuestionOptionInput {
    pub key: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct CreateQuestionInput {
    pub question_type: String,
    pub statement_markdown: String,
    pub options: Vec<QuestionOptionInput>,
    pub answer_key: Option<String>,
    pub explanation_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ListQuestionsInput {
    pub subject_id: Option<String>,
    pub question_type: Option<String>,
    pub status: Option<String>,
    pub board: Option<String>,
    pub exam_year: Option<i64>,
    pub attempt_status: Option<String>,
    pub notebook_id: Option<String>,
    pub search_text: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone)]
pub struct AnswerQuestionInput {
    pub question_id: String,
    pub selected_key: Option<String>,
    pub confidence: String,
    pub elapsed_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct ReviseQuestionInput {
    pub question_id: String,
    pub status: String,
    pub answer_key: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct SetQuestionContestRelationInput {
    pub question_id: String,
    pub contest_id: String,
    pub relation_type: String,
    pub included: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRevisionSummary {
    pub id: String,
    pub question_id: String,
    pub previous_answer_key: Option<String>,
    pub current_answer_key: Option<String>,
    pub previous_status: String,
    pub current_status: String,
    pub reason: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviseQuestionResult {
    pub question: QuestionSummary,
    pub revision: Option<QuestionRevisionSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionContestRelationSummary {
    pub contest_id: String,
    pub contest_name: String,
    pub relation_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAttachmentSourceSummary {
    pub id: String,
    pub relative_path: String,
    pub source_path: String,
}

#[derive(Debug, Clone)]
pub struct CreateExternalQuestionBatchInput {
    pub preparation_id: String,
    pub subject_id: Option<String>,
    pub source_name: Option<String>,
    pub studied_on: String,
    pub answered_count: i64,
    pub correct_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalQuestionBatchSummary {
    pub id: String,
    pub preparation_id: String,
    pub preparation_name: String,
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub source_name: Option<String>,
    pub studied_on: String,
    pub answered_count: i64,
    pub correct_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionPerformanceSummary {
    pub as_of_date: String,
    pub first_attempt_graded: i64,
    pub first_attempt_correct: i64,
    pub repeat_graded: i64,
    pub repeat_correct: i64,
    pub external_batches: i64,
    pub external_answered: i64,
    pub external_correct: i64,
}

pub fn normalize_external_question_batch_input(
    input: CreateExternalQuestionBatchInput,
) -> Result<CreateExternalQuestionBatchInput, String> {
    if input.answered_count < 1
        || input.correct_count < 0
        || input.correct_count > input.answered_count
    {
        return Err(
            "Informe respondidas acima de zero e acertos entre zero e o total respondido."
                .to_string(),
        );
    }
    Ok(CreateExternalQuestionBatchInput {
        preparation_id: normalize_id(&input.preparation_id, "A preparação")?,
        subject_id: input
            .subject_id
            .map(|id| normalize_id(&id, "O assunto"))
            .transpose()?,
        source_name: normalize_optional_text(input.source_name, "A origem do lote", 160)?,
        studied_on: normalize_date(&input.studied_on).map_err(|_| {
            "A data do lote deve ser uma data válida no formato AAAA-MM-DD.".to_string()
        })?,
        answered_count: input.answered_count,
        correct_count: input.correct_count,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionSummary {
    pub key: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSummary {
    pub id: String,
    pub question_type: String,
    pub statement_markdown: String,
    pub options: Vec<QuestionOptionSummary>,
    pub answer_key: Option<String>,
    pub explanation_markdown: Option<String>,
    pub source_name: Option<String>,
    pub board: Option<String>,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_year: Option<i64>,
    pub subject_id: Option<String>,
    pub subject_name: Option<String>,
    pub status: String,
    pub attempts_count: i64,
    pub first_attempt_result: Option<String>,
    pub last_attempt_result: Option<String>,
    pub first_attempt_current_result: Option<String>,
    pub last_attempt_current_result: Option<String>,
    pub revision_count: i64,
    pub contest_relations: Vec<QuestionContestRelationSummary>,
}

pub fn normalize_revise_question_input(
    input: ReviseQuestionInput,
) -> Result<ReviseQuestionInput, String> {
    Ok(ReviseQuestionInput {
        question_id: normalize_id(&input.question_id, "A questão")?,
        status: normalize_status(&input.status)?,
        answer_key: input
            .answer_key
            .map(|key| normalize_selected_key(&key))
            .transpose()?,
        reason: normalize_markdown(input.reason, "O motivo da revisão", 500)?,
    })
}

pub fn normalize_set_question_contest_relation_input(
    input: SetQuestionContestRelationInput,
) -> Result<SetQuestionContestRelationInput, String> {
    let relation_type = match input.relation_type.trim() {
        "official_exam" | "previous_exam" | "thematic_compatibility" => {
            input.relation_type.trim().to_string()
        }
        _ => return Err("O tipo de relação da questão não é válido.".to_string()),
    };
    Ok(SetQuestionContestRelationInput {
        question_id: normalize_id(&input.question_id, "A questão")?,
        contest_id: normalize_id(&input.contest_id, "O concurso")?,
        relation_type,
        included: input.included,
    })
}

pub fn normalize_question_id(value: &str) -> Result<String, String> {
    normalize_id(value, "A questão")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAttemptSummary {
    pub id: String,
    pub question_id: String,
    pub selected_key: Option<String>,
    pub confidence: String,
    pub elapsed_seconds: i64,
    pub answer_key_at_attempt: Option<String>,
    pub result: String,
    pub answered_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerQuestionResult {
    pub attempt: QuestionAttemptSummary,
    pub question: QuestionSummary,
    pub xp_granted: i64,
}

#[derive(Debug, Clone)]
pub struct CreateNotebookInput {
    pub name: String,
    pub kind: String,
    pub filter: Option<NotebookFilter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookFilter {
    pub subject_id: Option<String>,
    pub question_type: Option<String>,
    pub attempt_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub question_count: i64,
    pub filter: Option<NotebookFilter>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionNotebookEntrySummary {
    pub question_id: String,
    pub notebook_id: String,
    pub reason: Option<String>,
    pub observation: Option<String>,
    pub added_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct SetQuestionNotebookInput {
    pub notebook_id: String,
    pub question_id: String,
    pub included: bool,
    pub reason: Option<String>,
    pub observation: Option<String>,
}

pub fn normalize_create_question_input(
    input: CreateQuestionInput,
) -> Result<CreateQuestionInput, String> {
    let question_type = normalize_question_type(&input.question_type)?;
    let statement_markdown = normalize_markdown(input.statement_markdown, "O enunciado", 50_000)?;
    let options = normalize_options(&question_type, input.options)?;
    let answer_key = input
        .answer_key
        .map(|value| normalize_answer_key(&value, &question_type))
        .transpose()?;

    if let Some(answer_key) = answer_key.as_deref() {
        if !options.iter().any(|option| option.key == answer_key) {
            return Err("O gabarito precisa apontar para uma alternativa existente.".to_string());
        }
    }

    Ok(CreateQuestionInput {
        question_type,
        statement_markdown,
        options,
        answer_key,
        explanation_markdown: input
            .explanation_markdown
            .map(|value| normalize_markdown(value, "A explicação", 50_000))
            .transpose()?,
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

pub fn normalize_list_questions_input(
    input: ListQuestionsInput,
) -> Result<ListQuestionsInput, String> {
    let limit = if input.limit == 0 {
        50
    } else if !(1..=100).contains(&input.limit) {
        return Err("A quantidade de questões deve ficar entre 1 e 100.".to_string());
    } else {
        input.limit
    };
    if input.offset < 0 {
        return Err("O deslocamento da lista não pode ser negativo.".to_string());
    }

    Ok(ListQuestionsInput {
        subject_id: input
            .subject_id
            .map(|value| normalize_id(&value, "O assunto"))
            .transpose()?,
        question_type: input
            .question_type
            .map(|value| normalize_question_type(&value))
            .transpose()?,
        status: input
            .status
            .map(|value| normalize_status(&value))
            .transpose()?,
        board: normalize_optional_text(input.board, "A banca", 120)?,
        exam_year: normalize_exam_year(input.exam_year)?,
        attempt_status: input
            .attempt_status
            .map(|value| match value.trim() {
                "unanswered" | "answered" | "first_correct" | "first_incorrect"
                | "last_correct" | "last_incorrect" | "repeated" => Ok(value.trim().to_string()),
                _ => Err("O histórico escolhido não é válido.".to_string()),
            })
            .transpose()?,
        notebook_id: input
            .notebook_id
            .map(|value| normalize_notebook_id(&value))
            .transpose()?,
        search_text: normalize_optional_text(input.search_text, "A busca", 160)?,
        limit,
        offset: input.offset,
    })
}

pub fn normalize_answer_question_input(
    input: AnswerQuestionInput,
) -> Result<AnswerQuestionInput, String> {
    if input.elapsed_seconds < 0 || input.elapsed_seconds > 86_400 {
        return Err("O tempo da tentativa precisa estar entre 0 e 24 horas.".to_string());
    }

    let confidence = match input.confidence.trim() {
        "certain" | "doubt" | "guess" => input.confidence.trim().to_string(),
        _ => return Err("A confiança precisa ser certeza, dúvida ou chute.".to_string()),
    };

    Ok(AnswerQuestionInput {
        question_id: normalize_id(&input.question_id, "A questão")?,
        selected_key: input
            .selected_key
            .map(|value| normalize_selected_key(&value))
            .transpose()?,
        confidence,
        elapsed_seconds: input.elapsed_seconds,
    })
}

pub fn normalize_set_question_notebook_input(
    input: SetQuestionNotebookInput,
) -> Result<SetQuestionNotebookInput, String> {
    let reason = input
        .reason
        .map(|value| normalize_notebook_reason(&value))
        .transpose()?;
    let observation = input
        .observation
        .map(normalize_notebook_observation)
        .transpose()?
        .flatten();

    Ok(SetQuestionNotebookInput {
        notebook_id: normalize_notebook_id(&input.notebook_id)?,
        question_id: normalize_id(&input.question_id, "A questão")?,
        included: input.included,
        reason,
        observation,
    })
}

pub fn normalize_create_notebook_input(
    input: CreateNotebookInput,
) -> Result<CreateNotebookInput, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("O nome do caderno é obrigatório.".to_string());
    }
    if name.chars().count() > 120 || name.chars().any(char::is_control) {
        return Err("O nome do caderno é inválido ou longo demais.".to_string());
    }
    let kind = match input.kind.trim() {
        "manual" | "dynamic" => input.kind.trim().to_string(),
        _ => return Err("O tipo do caderno não é válido.".to_string()),
    };
    let filter = if kind == "manual" {
        if input.filter.is_some() {
            return Err("Cadernos manuais não aceitam filtros salvos.".to_string());
        }
        None
    } else {
        match input.filter {
            Some(filter) => Some(normalize_notebook_filter(filter)?),
            None => return Err("Um caderno dinâmico precisa de um filtro.".to_string()),
        }
    };
    Ok(CreateNotebookInput {
        name: name.to_string(),
        kind,
        filter,
    })
}

fn normalize_notebook_filter(filter: NotebookFilter) -> Result<NotebookFilter, String> {
    let attempt_status = match filter.attempt_status.trim() {
        "incorrect" | "unanswered" | "correct" => filter.attempt_status.trim().to_string(),
        _ => return Err("O estado do filtro dinâmico não é válido.".to_string()),
    };
    Ok(NotebookFilter {
        subject_id: filter
            .subject_id
            .map(|value| normalize_id(&value, "O assunto do filtro"))
            .transpose()?,
        question_type: filter
            .question_type
            .map(|value| normalize_question_type(&value))
            .transpose()?,
        attempt_status,
    })
}

fn normalize_question_type(value: &str) -> Result<String, String> {
    match value.trim() {
        "multiple_choice" | "true_false" => Ok(value.trim().to_string()),
        _ => Err("O tipo da questão precisa ser múltipla escolha ou certo/errado.".to_string()),
    }
}

fn normalize_options(
    question_type: &str,
    options: Vec<QuestionOptionInput>,
) -> Result<Vec<QuestionOptionInput>, String> {
    let mut normalized = Vec::new();
    for option in options {
        let key = normalize_option_key(&option.key, question_type)?;
        if normalized
            .iter()
            .any(|item: &QuestionOptionInput| item.key == key)
        {
            return Err("As alternativas não podem repetir a mesma letra.".to_string());
        }
        normalized.push(QuestionOptionInput {
            key,
            text: normalize_markdown(option.text, "O texto da alternativa", 10_000)?,
        });
    }

    if question_type == "multiple_choice" {
        if !(2..=5).contains(&normalized.len()) {
            return Err(
                "Uma questão de múltipla escolha precisa de 2 a 5 alternativas.".to_string(),
            );
        }
    } else {
        let has_true = normalized.iter().any(|option| option.key == "true");
        let has_false = normalized.iter().any(|option| option.key == "false");
        if normalized.len() != 2 || !has_true || !has_false {
            return Err("Uma questão certo/errado precisa das opções Certo e Errado.".to_string());
        }
    }

    Ok(normalized)
}

fn normalize_option_key(value: &str, question_type: &str) -> Result<String, String> {
    let key = value.trim();
    if question_type == "true_false" {
        return match key {
            "true" | "false" => Ok(key.to_string()),
            _ => Err("As opções certo/errado devem usar true ou false.".to_string()),
        };
    }

    match key {
        "A" | "B" | "C" | "D" | "E" => Ok(key.to_string()),
        _ => Err("As alternativas devem usar as letras A até E.".to_string()),
    }
}

fn normalize_answer_key(value: &str, question_type: &str) -> Result<String, String> {
    normalize_option_key(value.trim(), question_type)
}

fn normalize_selected_key(value: &str) -> Result<String, String> {
    let key = value.trim();
    match key {
        "A" | "B" | "C" | "D" | "E" | "true" | "false" => Ok(key.to_string()),
        _ => Err("A resposta escolhida não é válida.".to_string()),
    }
}

fn normalize_notebook_reason(value: &str) -> Result<String, String> {
    match value.trim() {
        "content" | "interpretation" | "distraction" | "forgetfulness" => {
            Ok(value.trim().to_string())
        }
        _ => Err("O motivo do caderno de erros não é válido.".to_string()),
    }
}

pub fn normalize_notebook_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed == ERROR_NOTEBOOK_ID {
        return Ok(trimmed.to_string());
    }
    Uuid::parse_str(trimmed)
        .map(|parsed| parsed.to_string())
        .map_err(|_| "O caderno escolhido não é válido.".to_string())
}

fn normalize_notebook_observation(value: String) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > 5_000
        || trimmed
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err("A observação do caderno é inválida ou longa demais.".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn normalize_status(value: &str) -> Result<String, String> {
    match value.trim() {
        "active" | "annulled" | "outdated" | "answer_changed" => Ok(value.trim().to_string()),
        _ => Err("A situação da questão não é válida.".to_string()),
    }
}

fn normalize_markdown(value: String, label: &str, max_length: usize) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} é obrigatório."));
    }
    if trimmed.chars().count() > max_length {
        return Err(format!(
            "{label} deve ter no máximo {max_length} caracteres."
        ));
    }
    if trimmed
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(format!("{label} contém caracteres inválidos."));
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_text(
    value: Option<String>,
    label: &str,
    max_length: usize,
) -> Result<Option<String>, String> {
    value
        .map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if trimmed.chars().count() > max_length || trimmed.chars().any(char::is_control) {
                return Err(format!(
                    "{label} contém caracteres inválidos ou é longo demais."
                ));
            }
            Ok(Some(trimmed.to_string()))
        })
        .transpose()
        .map(|value| value.flatten())
}

fn normalize_exam_year(value: Option<i64>) -> Result<Option<i64>, String> {
    match value {
        None => Ok(None),
        Some(year) if (1900..=2200).contains(&year) => Ok(Some(year)),
        Some(_) => Err("O ano da questão deve estar entre 1900 e 2200.".to_string()),
    }
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    Uuid::parse_str(value.trim())
        .map(|parsed| parsed.to_string())
        .map_err(|_| format!("{label} não é válido."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_combined_question_filters_and_page_size() {
        let input = ListQuestionsInput {
            subject_id: None,
            question_type: Some("multiple_choice".to_string()),
            status: Some("active".to_string()),
            board: Some("  FGV  ".to_string()),
            exam_year: Some(2024),
            attempt_status: Some("last_incorrect".to_string()),
            notebook_id: Some(ERROR_NOTEBOOK_ID.to_string()),
            search_text: Some("  redes  ".to_string()),
            limit: 50,
            offset: 50,
        };
        let valid =
            normalize_list_questions_input(input.clone()).expect("filtros devem ser válidos");
        assert_eq!(valid.board.as_deref(), Some("FGV"));
        assert_eq!(valid.search_text.as_deref(), Some("redes"));
        assert_eq!(valid.offset, 50);
        assert!(normalize_list_questions_input(ListQuestionsInput {
            attempt_status: Some("unknown".to_string()),
            ..input.clone()
        })
        .is_err());
        assert!(normalize_list_questions_input(ListQuestionsInput {
            exam_year: Some(1800),
            ..input.clone()
        })
        .is_err());
        assert!(normalize_list_questions_input(ListQuestionsInput {
            limit: 101,
            ..input
        })
        .is_err());
    }

    #[test]
    fn validates_external_batch_counts_and_calendar_date() {
        let valid = CreateExternalQuestionBatchInput {
            preparation_id: Uuid::new_v4().to_string(),
            subject_id: None,
            source_name: Some("  Caderno impresso  ".to_string()),
            studied_on: "2032-02-29".to_string(),
            answered_count: 20,
            correct_count: 0,
        };
        let normalized = normalize_external_question_batch_input(valid.clone())
            .expect("lote sem acertos é válido");
        assert_eq!(normalized.source_name.as_deref(), Some("Caderno impresso"));

        let mut invalid_count = valid.clone();
        invalid_count.correct_count = 21;
        let mut invalid_date = valid;
        invalid_date.studied_on = "2031-02-29".to_string();
        assert!(normalize_external_question_batch_input(invalid_count).is_err());
        assert!(normalize_external_question_batch_input(invalid_date).is_err());
    }

    #[test]
    fn normalizes_question_revision_and_requires_valid_reason() {
        let normalized = normalize_revise_question_input(ReviseQuestionInput {
            question_id: format!("  {}  ", Uuid::new_v4()),
            status: " answer_changed ".to_string(),
            answer_key: Some(" B ".to_string()),
            reason: "  Errata publicada pela banca.  ".to_string(),
        })
        .expect("a revisão deve aceitar valores normalizáveis");
        assert_eq!(normalized.status, "answer_changed");
        assert_eq!(normalized.answer_key.as_deref(), Some("B"));
        assert_eq!(normalized.reason, "Errata publicada pela banca.");
        assert!(normalize_revise_question_input(ReviseQuestionInput {
            question_id: Uuid::new_v4().to_string(),
            status: "unknown".to_string(),
            answer_key: None,
            reason: "Motivo".to_string(),
        })
        .is_err());
        assert!(normalize_revise_question_input(ReviseQuestionInput {
            question_id: Uuid::new_v4().to_string(),
            status: "active".to_string(),
            answer_key: None,
            reason: "   ".to_string(),
        })
        .is_err());
    }

    #[test]
    fn normalizes_explicit_question_contest_relation_types() {
        let normalized =
            normalize_set_question_contest_relation_input(SetQuestionContestRelationInput {
                question_id: format!("  {}  ", Uuid::new_v4()),
                contest_id: format!(" {} ", Uuid::new_v4()),
                relation_type: " previous_exam ".to_string(),
                included: true,
            })
            .expect("a relação explícita deve aceitar os tipos previstos");

        assert_eq!(normalized.relation_type, "previous_exam");
        assert!(
            normalize_set_question_contest_relation_input(SetQuestionContestRelationInput {
                question_id: Uuid::new_v4().to_string(),
                contest_id: Uuid::new_v4().to_string(),
                relation_type: "inferred_by_board".to_string(),
                included: true,
            },)
            .is_err()
        );
    }

    #[test]
    fn normalizes_multiple_choice_with_pending_answer() {
        let question = normalize_create_question_input(CreateQuestionInput {
            question_type: "multiple_choice".to_string(),
            statement_markdown: "  Qual protocolo?  ".to_string(),
            options: vec![
                QuestionOptionInput {
                    key: "A".to_string(),
                    text: "TCP".to_string(),
                },
                QuestionOptionInput {
                    key: "B".to_string(),
                    text: "UDP".to_string(),
                },
            ],
            answer_key: None,
            explanation_markdown: None,
            source_name: None,
            board: None,
            organization: None,
            role: None,
            exam_year: None,
            subject_id: Some(Uuid::new_v4().to_string()),
        })
        .expect("a questão deve ser válida");

        assert_eq!(question.statement_markdown, "Qual protocolo?");
        assert_eq!(question.options.len(), 2);
    }

    #[test]
    fn rejects_invalid_confidence_and_options() {
        assert!(normalize_answer_question_input(AnswerQuestionInput {
            question_id: Uuid::new_v4().to_string(),
            selected_key: None,
            confidence: "maybe".to_string(),
            elapsed_seconds: 10,
        })
        .is_err());
        assert!(normalize_create_question_input(CreateQuestionInput {
            question_type: "true_false".to_string(),
            statement_markdown: "Questão".to_string(),
            options: vec![QuestionOptionInput {
                key: "true".to_string(),
                text: "Certo".to_string(),
            }],
            answer_key: None,
            explanation_markdown: None,
            source_name: None,
            board: None,
            organization: None,
            role: None,
            exam_year: None,
            subject_id: None,
        })
        .is_err());
    }
}
