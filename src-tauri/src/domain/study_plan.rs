use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct CreatePreparationInput {
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_date: Option<String>,
    pub make_primary: bool,
}

#[derive(Debug, Clone)]
pub struct CreateSubjectInput {
    pub preparation_id: String,
    pub name: String,
    pub parent_id: Option<String>,
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
    pub exam_date: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectSummary {
    pub id: String,
    pub preparation_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
    pub study_status: SubjectStudyStatus,
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
            exam_date: Some("2032-02-29".to_string()),
            make_primary: true,
        };

        let normalized = normalize_preparation_input(input).expect("a preparação deve ser válida");

        assert_eq!(normalized.name, "Analista de TI");
        assert_eq!(normalized.exam_date.as_deref(), Some("2032-02-29"));
    }

    #[test]
    fn rejects_invalid_date_and_subject_id() {
        let preparation = CreatePreparationInput {
            name: "Preparação".to_string(),
            organization: None,
            role: None,
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
    fn calculates_coverage_from_all_registered_subjects_and_explicit_study_states() {
        let preparations = vec![PreparationSummary {
            id: "preparation-1".to_string(),
            name: "Preparação".to_string(),
            organization: None,
            role: None,
            exam_date: None,
            is_primary: true,
        }];
        let subjects = vec![
            SubjectSummary {
                id: "subject-1".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: None,
                name: "Direito Administrativo".to_string(),
                position: 0,
                study_status: SubjectStudyStatus::NotStarted,
            },
            SubjectSummary {
                id: "subject-2".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: Some("subject-1".to_string()),
                name: "Atos administrativos".to_string(),
                position: 0,
                study_status: SubjectStudyStatus::InProgress,
            },
            SubjectSummary {
                id: "subject-3".to_string(),
                preparation_id: "preparation-1".to_string(),
                parent_id: Some("subject-1".to_string()),
                name: "Poderes administrativos".to_string(),
                position: 1,
                study_status: SubjectStudyStatus::TheoryCompleted,
            },
        ];

        let coverage = calculate_subject_coverage(&preparations, &subjects);

        assert_eq!(coverage.len(), 1);
        assert_eq!(coverage[0].total_subjects, 3);
        assert_eq!(coverage[0].started_subjects, 2);
        assert_eq!(coverage[0].completed_subjects, 1);
    }
}
