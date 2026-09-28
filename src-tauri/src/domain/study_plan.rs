use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

pub const STUDY_CYCLE_BLOCK_MINUTES: i64 = 30;
pub const DEFAULT_REVIEW_RESERVE_PERCENT: i64 = 20;
pub const MAX_CYCLE_SLOTS: usize = 500;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceDocumentStatus {
    Reference,
    Current,
}

impl ReferenceDocumentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Reference => "reference",
            Self::Current => "current",
        }
    }

    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "reference" => Some(Self::Reference),
            "current" => Some(Self::Current),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreatePreparationInput {
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub exam_date: Option<String>,
    pub make_primary: bool,
}

#[derive(Debug, Clone)]
pub struct SetPrimaryPreparationInput {
    pub preparation_id: String,
}

#[derive(Debug, Clone)]
pub struct SavePreparationExamConfigInput {
    pub preparation_id: String,
    pub reference_material_id: Option<String>,
    pub reference_document_status: ReferenceDocumentStatus,
    pub exam_rules_markdown: Option<String>,
    pub subject_exam_weights: Vec<SubjectExamWeightInput>,
}

#[derive(Debug, Clone)]
pub struct SubjectExamWeightInput {
    pub subject_id: String,
    pub exam_weight: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct CreateSubjectInput {
    pub preparation_id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateSubjectInput {
    pub subject_id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubjectMoveDirection {
    Up,
    Down,
}

#[derive(Debug, Clone)]
pub struct MoveSubjectInput {
    pub subject_id: String,
    pub direction: SubjectMoveDirection,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubjectStudyStatus {
    NotStarted,
    InProgress,
    TheoryCompleted,
}

impl SubjectStudyStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotStarted => "not_started",
            Self::InProgress => "in_progress",
            Self::TheoryCompleted => "theory_completed",
        }
    }

    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "not_started" => Some(Self::NotStarted),
            "in_progress" => Some(Self::InProgress),
            "theory_completed" => Some(Self::TheoryCompleted),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SetSubjectStudyStatusInput {
    pub subject_id: String,
    pub status: SubjectStudyStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparationSummary {
    pub id: String,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub exam_date: Option<String>,
    pub is_primary: bool,
    pub reference_material_id: Option<String>,
    pub reference_document_status: ReferenceDocumentStatus,
    pub exam_rules_markdown: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectSummary {
    pub id: String,
    pub preparation_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
    pub priority: i64,
    pub study_status: SubjectStudyStatus,
    pub exam_weight: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyDayAvailability {
    pub weekday: u8,
    pub available_minutes: i64,
    pub is_rest: bool,
}

#[derive(Debug, Clone)]
pub struct SubjectPriorityInput {
    pub subject_id: String,
    pub priority: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectPrioritySummary {
    pub subject_id: String,
    pub priority: i64,
}

#[derive(Debug, Clone)]
pub struct StudyCycleSlotInput {
    pub subject_id: String,
    pub planned_minutes: i64,
}

#[derive(Debug, Clone)]
pub struct StudyCycleSubject {
    pub subject_id: String,
    pub priority: i64,
}

#[derive(Debug, Clone)]
pub struct SaveStudyPlanningInput {
    pub preparation_id: String,
    pub availability: Vec<StudyDayAvailability>,
    pub subject_priorities: Vec<SubjectPriorityInput>,
    pub review_reserve_percent: i64,
    pub cycle_slots: Option<Vec<StudyCycleSlotInput>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyCycleSlotSummary {
    pub position: i64,
    pub subject_id: String,
    pub subject_name: String,
    pub priority: i64,
    pub planned_minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyPlanningSummary {
    pub preparation_id: String,
    pub availability: Vec<StudyDayAvailability>,
    pub subject_priorities: Vec<SubjectPrioritySummary>,
    pub weekly_available_minutes: i64,
    pub weekly_study_minutes: i64,
    pub review_reserve_percent: i64,
    pub cycle_position: i64,
    pub cycle_step: i64,
    pub cycle_slots: Vec<StudyCycleSlotSummary>,
    pub warning: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectCoverageSummary {
    pub preparation_id: String,
    pub total_subjects: i64,
    pub started_subjects: i64,
    pub completed_subjects: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyPlan {
    pub preparations: Vec<PreparationSummary>,
    pub subjects: Vec<SubjectSummary>,
    pub subject_coverage: Vec<SubjectCoverageSummary>,
}

pub fn normalize_subject_study_status_input(
    input: SetSubjectStudyStatusInput,
) -> Result<SetSubjectStudyStatusInput, String> {
    Ok(SetSubjectStudyStatusInput {
        subject_id: normalize_id(&input.subject_id, "O assunto")?,
        status: input.status,
    })
}

pub fn normalize_preparation_id(value: &str) -> Result<String, String> {
    normalize_id(value, "A preparação")
}

pub fn normalize_subject_id(value: &str) -> Result<String, String> {
    normalize_id(value, "O assunto")
}

pub fn normalize_preparation_exam_config_input(
    input: SavePreparationExamConfigInput,
) -> Result<SavePreparationExamConfigInput, String> {
    if input.reference_document_status == ReferenceDocumentStatus::Current
        && input.reference_material_id.is_none()
    {
        return Err("Selecione um edital antes de marcá-lo como vigente.".to_string());
    }
    let mut subject_ids = HashSet::new();
    let subject_exam_weights = input
        .subject_exam_weights
        .into_iter()
        .map(|subject| {
            let subject_id = normalize_id(&subject.subject_id, "O assunto")?;
            if !subject_ids.insert(subject_id.clone()) {
                return Err("O peso de um assunto foi informado mais de uma vez.".to_string());
            }
            if let Some(exam_weight) = subject.exam_weight {
                if !exam_weight.is_finite() || exam_weight <= 0.0 {
                    return Err("O peso da prova deve ser um número maior que zero.".to_string());
                }
            }
            Ok(SubjectExamWeightInput {
                subject_id,
                exam_weight: subject.exam_weight,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let exam_rules_markdown = input
        .exam_rules_markdown
        .map(|value| normalize_markdown(value, "As regras da prova", 20_000))
        .transpose()?
        .filter(|value| !value.is_empty());

    Ok(SavePreparationExamConfigInput {
        preparation_id: normalize_preparation_id(&input.preparation_id)?,
        reference_material_id: input
            .reference_material_id
            .map(|value| normalize_id(&value, "O material de referência"))
            .transpose()?,
        reference_document_status: input.reference_document_status,
        exam_rules_markdown,
        subject_exam_weights,
    })
}

pub fn normalize_study_planning_input(
    input: SaveStudyPlanningInput,
) -> Result<SaveStudyPlanningInput, String> {
    let mut availability = input.availability;
    if availability.len() != 7 {
        return Err("A disponibilidade deve informar os sete dias da semana.".to_string());
    }

    let mut weekdays = HashSet::new();
    for day in &availability {
        if day.weekday > 6 || !weekdays.insert(day.weekday) {
            return Err("A disponibilidade possui dias repetidos ou inválidos.".to_string());
        }
        if !(0..=1_440).contains(&day.available_minutes) {
            return Err("Cada dia deve ter entre 0 e 1.440 minutos disponíveis.".to_string());
        }
        if day.is_rest && day.available_minutes != 0 {
            return Err("Um dia de descanso não pode ter minutos disponíveis.".to_string());
        }
    }
    availability.sort_by_key(|day| day.weekday);

    let mut subject_ids = HashSet::new();
    let subject_priorities = input
        .subject_priorities
        .into_iter()
        .map(|subject| {
            if !(1..=5).contains(&subject.priority) {
                return Err("A prioridade deve estar entre 1 e 5.".to_string());
            }
            let subject_id = normalize_id(&subject.subject_id, "O assunto")?;
            if !subject_ids.insert(subject_id.clone()) {
                return Err("A prioridade de um assunto foi informada mais de uma vez.".to_string());
            }
            Ok(SubjectPriorityInput {
                subject_id,
                priority: subject.priority,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    if !(0..=80).contains(&input.review_reserve_percent) {
        return Err("A reserva para revisões deve estar entre 0% e 80%.".to_string());
    }
    let cycle_slots = input
        .cycle_slots
        .map(|slots| {
            if slots.is_empty() {
                return Err("O ciclo editado precisa ter ao menos um bloco.".to_string());
            }
            if slots.len() > MAX_CYCLE_SLOTS {
                return Err(format!(
                    "O ciclo pode ter no máximo {MAX_CYCLE_SLOTS} blocos."
                ));
            }
            slots
                .into_iter()
                .map(|slot| {
                    if !(5..=1_440).contains(&slot.planned_minutes) {
                        return Err("Cada bloco deve ter entre 5 e 1.440 minutos.".to_string());
                    }
                    Ok(StudyCycleSlotInput {
                        subject_id: normalize_id(&slot.subject_id, "O assunto do ciclo")?,
                        planned_minutes: slot.planned_minutes,
                    })
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .transpose()?;

    Ok(SaveStudyPlanningInput {
        preparation_id: normalize_preparation_id(&input.preparation_id)?,
        availability,
        subject_priorities,
        review_reserve_percent: input.review_reserve_percent,
        cycle_slots,
    })
}

pub fn default_study_availability() -> Vec<StudyDayAvailability> {
    (0_u8..=6)
        .map(|weekday| StudyDayAvailability {
            weekday,
            available_minutes: if (1..=5).contains(&weekday) { 60 } else { 0 },
            is_rest: weekday == 0 || weekday == 6,
        })
        .collect()
}

pub fn generate_cycle_slots(
    subjects: &[StudyCycleSubject],
    weekly_study_minutes: i64,
) -> Result<Vec<StudyCycleSlotInput>, String> {
    if weekly_study_minutes < 0 {
        return Err("O tempo semanal para estudo não pode ser negativo.".to_string());
    }
    if subjects
        .iter()
        .any(|subject| !(1..=5).contains(&subject.priority))
    {
        return Err("A prioridade de um assunto do ciclo é inválida.".to_string());
    }

    let block_count =
        (weekly_study_minutes / STUDY_CYCLE_BLOCK_MINUTES).min(MAX_CYCLE_SLOTS as i64);
    if block_count == 0 || subjects.is_empty() {
        return Ok(Vec::new());
    }

    let mut allocations = vec![0_i64; subjects.len()];
    let initial_blocks = block_count.min(subjects.len() as i64) as usize;
    for allocation in allocations.iter_mut().take(initial_blocks) {
        *allocation = 1;
    }

    let mut remaining_blocks = block_count - initial_blocks as i64;
    while remaining_blocks > 0 {
        let selected_index = (1..subjects.len()).fold(0, |selected, candidate| {
            let selected_weight = 6 - subjects[selected].priority;
            let candidate_weight = 6 - subjects[candidate].priority;
            let candidate_is_better =
                allocations[candidate] * selected_weight < allocations[selected] * candidate_weight;
            if candidate_is_better {
                candidate
            } else {
                selected
            }
        });
        allocations[selected_index] += 1;
        remaining_blocks -= 1;
    }

    let mut slots = Vec::with_capacity(block_count as usize);
    loop {
        let mut inserted = false;
        for (index, subject) in subjects.iter().enumerate() {
            if allocations[index] == 0 {
                continue;
            }
            slots.push(StudyCycleSlotInput {
                subject_id: subject.subject_id.clone(),
                planned_minutes: STUDY_CYCLE_BLOCK_MINUTES,
            });
            allocations[index] -= 1;
            inserted = true;
        }
        if !inserted {
            break;
        }
    }

    Ok(slots)
}

pub fn validate_cycle_slots_capacity(
    slots: &[StudyCycleSlotInput],
    weekly_study_minutes: i64,
) -> Result<i64, String> {
    if slots.is_empty() {
        return Err("O ciclo editado precisa ter ao menos um bloco.".to_string());
    }
    if slots.len() > MAX_CYCLE_SLOTS {
        return Err(format!(
            "O ciclo pode ter no máximo {MAX_CYCLE_SLOTS} blocos."
        ));
    }
    if weekly_study_minutes < 0 {
        return Err("O tempo semanal para estudo não pode ser negativo.".to_string());
    }

    let planned_minutes = slots.iter().try_fold(0_i64, |total, slot| {
        if !(5..=1_440).contains(&slot.planned_minutes) {
            return Err("Cada bloco deve ter entre 5 e 1.440 minutos.".to_string());
        }
        total
            .checked_add(slot.planned_minutes)
            .ok_or_else(|| "O tempo total do ciclo é grande demais.".to_string())
    })?;

    if planned_minutes > weekly_study_minutes {
        return Err(format!(
            "O ciclo editado usa {planned_minutes} minutos, acima dos {weekly_study_minutes} minutos disponíveis para estudo."
        ));
    }

    Ok(planned_minutes)
}

pub fn study_cycle_warning(
    subject_count: i64,
    cycle_subject_count: i64,
    weekly_minutes: i64,
    slot_count: i64,
) -> Option<String> {
    if subject_count == 0 {
        return Some("Cadastre ao menos uma disciplina para montar o ciclo.".to_string());
    }
    if weekly_minutes == 0 {
        return Some("Informe minutos disponíveis em pelo menos um dia.".to_string());
    }
    if slot_count == 0 {
        return Some(format!(
            "A disponibilidade precisa alcançar um bloco de {STUDY_CYCLE_BLOCK_MINUTES} minutos."
        ));
    }
    if cycle_subject_count < subject_count {
        return Some(
            "Há disciplinas novas ou alteradas; salve o ciclo para recalculá-lo.".to_string(),
        );
    }
    if slot_count < subject_count {
        return Some(
            "A disponibilidade atual não comporta um bloco para todas as disciplinas; priorize as mais importantes."
                .to_string(),
        );
    }
    None
}

pub fn calculate_subject_coverage(
    preparations: &[PreparationSummary],
    subjects: &[SubjectSummary],
) -> Vec<SubjectCoverageSummary> {
    preparations
        .iter()
        .map(|preparation| {
            let mut coverage = SubjectCoverageSummary {
                preparation_id: preparation.id.clone(),
                total_subjects: 0,
                started_subjects: 0,
                completed_subjects: 0,
            };
            for subject in subjects
                .iter()
                .filter(|subject| subject.preparation_id == preparation.id)
            {
                coverage.total_subjects += 1;
                if subject.study_status != SubjectStudyStatus::NotStarted {
                    coverage.started_subjects += 1;
                }
                if subject.study_status == SubjectStudyStatus::TheoryCompleted {
                    coverage.completed_subjects += 1;
                }
            }
            coverage
        })
        .collect()
}

pub fn normalize_preparation_input(
    input: CreatePreparationInput,
) -> Result<CreatePreparationInput, String> {
    Ok(CreatePreparationInput {
        name: normalize_required_text(input.name, "O nome da preparação", 120)?,
        organization: normalize_optional_text(input.organization, "O órgão", 120)?,
        role: normalize_optional_text(input.role, "O cargo", 120)?,
        board: normalize_optional_text(input.board, "A banca", 120)?,
        exam_date: normalize_optional_date(input.exam_date)?,
        make_primary: input.make_primary,
    })
}

pub fn normalize_subject_input(input: CreateSubjectInput) -> Result<CreateSubjectInput, String> {
    Ok(CreateSubjectInput {
        preparation_id: normalize_id(&input.preparation_id, "A preparação")?,
        name: normalize_required_text(input.name, "O nome do assunto", 160)?,
        parent_id: input
            .parent_id
            .map(|parent_id| normalize_id(&parent_id, "O assunto pai"))
            .transpose()?,
    })
}

pub fn normalize_update_subject_input(
    input: UpdateSubjectInput,
) -> Result<UpdateSubjectInput, String> {
    let subject_id = normalize_id(&input.subject_id, "O assunto")?;
    let parent_id = input
        .parent_id
        .map(|id| normalize_id(&id, "O assunto pai"))
        .transpose()?;
    if parent_id.as_deref() == Some(subject_id.as_str()) {
        return Err("Um assunto não pode ser pai de si mesmo.".to_string());
    }
    Ok(UpdateSubjectInput {
        subject_id,
        name: normalize_required_text(input.name, "O nome do assunto", 160)?,
        parent_id,
    })
}

pub fn normalize_move_subject_input(input: MoveSubjectInput) -> Result<MoveSubjectInput, String> {
    Ok(MoveSubjectInput {
        subject_id: normalize_id(&input.subject_id, "O assunto")?,
        direction: input.direction,
    })
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
    value
        .map(|value| normalize_required_text(value, label, max_length))
        .transpose()
}

fn normalize_markdown(value: String, label: &str, max_length: usize) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > max_length {
        return Err(format!(
            "{label} deve ter no máximo {max_length} caracteres."
        ));
    }
    if trimmed.chars().any(|character| {
        character.is_control() && character != '\n' && character != '\r' && character != '\t'
    }) {
        return Err(format!("{label} contém caracteres inválidos."));
    }
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_date(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return Ok(None);
    }

    normalize_date(trimmed).map(Some)
}

pub fn normalize_date(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let bytes = trimmed.as_bytes();
    let valid_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());

    if !valid_shape {
        return Err("A data da prova deve usar o formato AAAA-MM-DD.".to_string());
    }

    let year = trimmed[0..4]
        .parse::<u32>()
        .map_err(|_| "A data da prova é inválida.".to_string())?;
    let month = trimmed[5..7]
        .parse::<u32>()
        .map_err(|_| "A data da prova é inválida.".to_string())?;
    let day = trimmed[8..10]
        .parse::<u32>()
        .map_err(|_| "A data da prova é inválida.".to_string())?;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => 0,
    };

    if year == 0 || day == 0 || day > days_in_month {
        return Err("A data da prova é inválida.".to_string());
    }

    Ok(trimmed.to_string())
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let parsed = Uuid::parse_str(value.trim()).map_err(|_| format!("{label} não é válido."))?;
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_preparation_and_date() {
        let input = CreatePreparationInput {
            name: "  Analista de TI  ".to_string(),
            organization: Some("  Órgão  ".to_string()),
            role: Some("  Analista  ".to_string()),
            board: Some("  Cebraspe  ".to_string()),
            exam_date: Some("2032-02-29".to_string()),
            make_primary: true,
        };

        let normalized = normalize_preparation_input(input).expect("a preparação deve ser válida");

        assert_eq!(normalized.name, "Analista de TI");
        assert_eq!(normalized.board.as_deref(), Some("Cebraspe"));
        assert_eq!(normalized.exam_date.as_deref(), Some("2032-02-29"));
    }

    #[test]
    fn rejects_invalid_date_and_subject_id() {
        let preparation = CreatePreparationInput {
            name: "Preparação".to_string(),
            organization: None,
            role: None,
            board: None,
            exam_date: Some("2031-02-29".to_string()),
            make_primary: false,
        };
        let subject = CreateSubjectInput {
            preparation_id: "not-an-id".to_string(),
            name: "Direito".to_string(),
            parent_id: None,
        };

        assert!(normalize_preparation_input(preparation).is_err());
        assert!(normalize_subject_input(subject).is_err());
    }

    #[test]
    fn requires_a_document_before_marking_the_notice_as_current() {
        let input = SavePreparationExamConfigInput {
            preparation_id: Uuid::new_v4().to_string(),
            reference_material_id: None,
            reference_document_status: ReferenceDocumentStatus::Current,
            exam_rules_markdown: None,
            subject_exam_weights: Vec::new(),
        };
        assert!(normalize_preparation_exam_config_input(input).is_err());
    }

    #[test]
    fn normalizes_weekly_planning_and_rejects_conflicting_rest_day() {
        let input = SaveStudyPlanningInput {
            preparation_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            availability: (0_u8..=6)
                .rev()
                .map(|weekday| StudyDayAvailability {
                    weekday,
                    available_minutes: if weekday == 0 { 0 } else { 60 },
                    is_rest: weekday == 0,
                })
                .collect(),
            subject_priorities: vec![SubjectPriorityInput {
                subject_id: "550e8400-e29b-41d4-a716-446655440001".to_string(),
                priority: 1,
            }],
            review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
            cycle_slots: None,
        };

        let normalized =
            normalize_study_planning_input(input).expect("o planejamento deve ser válido");
        assert_eq!(normalized.availability[0].weekday, 0);
        assert_eq!(normalized.availability[6].weekday, 6);

        let invalid = SaveStudyPlanningInput {
            preparation_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            availability: default_study_availability()
                .into_iter()
                .map(|day| StudyDayAvailability {
                    available_minutes: if day.weekday == 0 {
                        30
                    } else {
                        day.available_minutes
                    },
                    ..day
                })
                .collect(),
            subject_priorities: Vec::new(),
            review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
            cycle_slots: None,
        };
        assert!(normalize_study_planning_input(invalid).is_err());
    }

    #[test]
    fn generates_deterministic_cycle_blocks_by_priority() {
        let slots = generate_cycle_slots(
            &[
                StudyCycleSubject {
                    subject_id: "high".to_string(),
                    priority: 1,
                },
                StudyCycleSubject {
                    subject_id: "low".to_string(),
                    priority: 5,
                },
            ],
            240,
        )
        .expect("a distribuição deve ser válida");

        assert_eq!(slots.len(), 8);
        assert_eq!(slots[0].subject_id, "high");
        assert_eq!(
            slots
                .iter()
                .filter(|slot| slot.subject_id == "high")
                .count(),
            6
        );
        assert_eq!(
            slots.iter().filter(|slot| slot.subject_id == "low").count(),
            2
        );
        assert!(slots.iter().all(|slot| slot.planned_minutes == 30));
    }

    #[test]
    fn validates_manual_cycle_capacity_and_block_limits() {
        let slots = vec![
            StudyCycleSlotInput {
                subject_id: "subject-1".to_string(),
                planned_minutes: 45,
            },
            StudyCycleSlotInput {
                subject_id: "subject-2".to_string(),
                planned_minutes: 30,
            },
        ];

        assert_eq!(validate_cycle_slots_capacity(&slots, 90), Ok(75));
        assert!(validate_cycle_slots_capacity(&slots, 60).is_err());
        assert!(validate_cycle_slots_capacity(&[], 90).is_err());
    }

    #[test]
    fn explains_cycle_capacity_warnings_in_priority_order() {
        assert_eq!(
            study_cycle_warning(0, 0, 0, 0).as_deref(),
            Some("Cadastre ao menos uma disciplina para montar o ciclo.")
        );
        assert_eq!(
            study_cycle_warning(2, 0, 120, 4).as_deref(),
            Some("Há disciplinas novas ou alteradas; salve o ciclo para recalculá-lo.")
        );
        assert_eq!(
            study_cycle_warning(3, 3, 60, 2).as_deref(),
            Some("A disponibilidade atual não comporta um bloco para todas as disciplinas; priorize as mais importantes.")
        );
        assert_eq!(study_cycle_warning(2, 2, 120, 2), None);
    }

    #[test]
    fn calculates_coverage_from_all_registered_subjects_and_explicit_study_states() {
        let preparations = vec![PreparationSummary {
            id: "preparation-1".to_string(),
            name: "Preparação".to_string(),
            organization: None,
            role: None,
            board: None,
            exam_date: None,
            is_primary: true,
            reference_material_id: None,
            reference_document_status: ReferenceDocumentStatus::Reference,
            exam_rules_markdown: None,
        }];
        let subjects = vec![
            SubjectSummary {
                id: "subject-1".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: None,
                name: "Direito Administrativo".to_string(),
                position: 0,
                priority: 3,
                study_status: SubjectStudyStatus::NotStarted,
                exam_weight: None,
            },
            SubjectSummary {
                id: "subject-2".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: Some("subject-1".to_string()),
                name: "Atos administrativos".to_string(),
                position: 0,
                priority: 3,
                study_status: SubjectStudyStatus::InProgress,
                exam_weight: Some(1.0),
            },
            SubjectSummary {
                id: "subject-3".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: Some("subject-1".to_string()),
                name: "Poderes administrativos".to_string(),
                position: 1,
                priority: 3,
                study_status: SubjectStudyStatus::TheoryCompleted,
                exam_weight: Some(2.0),
            },
        ];

        let coverage = calculate_subject_coverage(&preparations, &subjects);

        assert_eq!(coverage.len(), 1);
        assert_eq!(coverage[0].total_subjects, 3);
        assert_eq!(coverage[0].started_subjects, 2);
        assert_eq!(coverage[0].completed_subjects, 1);
    }
}
