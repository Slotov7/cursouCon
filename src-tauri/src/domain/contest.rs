use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContestStatus {
    Expected,
    Authorized,
    NoticePublished,
    RegistrationOpen,
    RegistrationClosed,
    Completed,
}

impl ContestStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Expected => "expected",
            Self::Authorized => "authorized",
            Self::NoticePublished => "notice_published",
            Self::RegistrationOpen => "registration_open",
            Self::RegistrationClosed => "registration_closed",
            Self::Completed => "completed",
        }
    }

    pub fn from_storage(value: &str) -> Option<Self> {
        match value {
            "expected" => Some(Self::Expected),
            "authorized" => Some(Self::Authorized),
            "notice_published" => Some(Self::NoticePublished),
            "registration_open" => Some(Self::RegistrationOpen),
            "registration_closed" => Some(Self::RegistrationClosed),
            "completed" => Some(Self::Completed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SaveManualContestInput {
    pub id: Option<String>,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub source_url: Option<String>,
    pub status: ContestStatus,
    pub registration_starts_on: Option<String>,
    pub registration_ends_on: Option<String>,
    pub fee_deadline: Option<String>,
    pub exam_date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualContestSummary {
    pub id: String,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub source_url: Option<String>,
    pub status: ContestStatus,
    pub registration_starts_on: Option<String>,
    pub registration_ends_on: Option<String>,
    pub fee_deadline: Option<String>,
    pub exam_date: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub fn normalize_manual_contest_input(
    input: SaveManualContestInput,
) -> Result<SaveManualContestInput, String> {
    Ok(SaveManualContestInput {
        id: input.id.map(|id| normalize_id(&id)).transpose()?,
        name: normalize_required_text(input.name, "O nome do concurso", 160)?,
        organization: normalize_optional_text(input.organization, "O órgão", 120)?,
        role: normalize_optional_text(input.role, "O cargo", 120)?,
        board: normalize_optional_text(input.board, "A banca", 120)?,
        source_url: normalize_source_url(input.source_url)?,
        status: input.status,
        registration_starts_on: normalize_optional_date(
            input.registration_starts_on,
            "A data de início das inscrições",
        )?,
        registration_ends_on: normalize_optional_date(
            input.registration_ends_on,
            "A data de encerramento das inscrições",
        )?,
        fee_deadline: normalize_optional_date(input.fee_deadline, "A data limite de pagamento")?,
        exam_date: normalize_optional_date(input.exam_date, "A data da prova")?,
        notes: normalize_optional_text(input.notes, "As observações", 10_000)?,
    })
}

pub fn normalize_contest_id(value: &str) -> Result<String, String> {
    normalize_id(value)
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
    validate_text_length(trimmed, label, max_length)?;
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
            validate_text_length(trimmed, label, max_length)?;
            Ok(Some(trimmed.to_string()))
        })
        .transpose()
        .map(Option::flatten)
}

fn validate_text_length(value: &str, label: &str, max_length: usize) -> Result<(), String> {
    if value.chars().count() > max_length {
        return Err(format!(
            "{label} deve ter no máximo {max_length} caracteres."
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!("{label} contém caracteres inválidos."));
    }
    Ok(())
}

fn normalize_source_url(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = normalize_optional_text(value, "O endereço da fonte", 2048)? else {
        return Ok(None);
    };
    let lowercased = value.to_ascii_lowercase();
    let host_and_path = lowercased
        .strip_prefix("https://")
        .or_else(|| lowercased.strip_prefix("http://"));
    let has_host = host_and_path
        .and_then(|remainder| remainder.split(['/', '?', '#']).next())
        .is_some_and(|host| !host.is_empty());

    if !has_host || value.chars().any(char::is_whitespace) {
        return Err("A fonte deve ser um endereço HTTP ou HTTPS válido.".to_string());
    }
    Ok(Some(value))
}

fn normalize_optional_date(value: Option<String>, label: &str) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let bytes = trimmed.as_bytes();
    let valid_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if !valid_shape {
        return Err(format!("{label} deve usar o formato AAAA-MM-DD."));
    }

    let year = trimmed[0..4]
        .parse::<u32>()
        .map_err(|_| format!("{label} é inválida."))?;
    let month = trimmed[5..7]
        .parse::<u32>()
        .map_err(|_| format!("{label} é inválida."))?;
    let day = trimmed[8..10]
        .parse::<u32>()
        .map_err(|_| format!("{label} é inválida."))?;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => 0,
    };
    if year == 0 || day == 0 || day > days_in_month {
        return Err(format!("{label} é inválida."));
    }

    Ok(Some(trimmed.to_string()))
}

fn normalize_id(value: &str) -> Result<String, String> {
    Uuid::parse_str(value.trim())
        .map(|id| id.to_string())
        .map_err(|_| "O identificador do concurso é inválido.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> SaveManualContestInput {
        SaveManualContestInput {
            id: None,
            name: "  Analista de TI  ".to_string(),
            organization: Some("  Órgão  ".to_string()),
            role: None,
            board: None,
            source_url: Some("https://example.org/edital".to_string()),
            status: ContestStatus::Expected,
            registration_starts_on: None,
            registration_ends_on: Some("2028-02-29".to_string()),
            fee_deadline: None,
            exam_date: None,
            notes: Some("  Conferir publicação oficial  ".to_string()),
        }
    }

    #[test]
    fn normalizes_optional_fields_and_leap_day() {
        let normalized = normalize_manual_contest_input(valid_input())
            .expect("o cadastro manual deve ser válido");

        assert_eq!(normalized.name, "Analista de TI");
        assert_eq!(normalized.organization.as_deref(), Some("Órgão"));
        assert_eq!(
            normalized.registration_ends_on.as_deref(),
            Some("2028-02-29")
        );
    }

    #[test]
    fn rejects_invalid_source_url_and_calendar_date() {
        let mut invalid_url = valid_input();
        invalid_url.source_url = Some("javascript:alert(1)".to_string());
        let mut invalid_date = valid_input();
        invalid_date.registration_ends_on = Some("2027-02-29".to_string());

        assert!(normalize_manual_contest_input(invalid_url).is_err());
        assert!(normalize_manual_contest_input(invalid_date).is_err());
    }
}
