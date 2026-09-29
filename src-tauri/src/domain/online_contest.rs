use super::contest::ContestStatus;
use serde::Serialize;
use uuid::Uuid;

pub const ACHE_CONCURSOS_SOURCE_NAME: &str = "Ache Concursos";
pub const ACHE_CONCURSOS_SOURCE_URL: &str = "https://www.acheconcursos.com.br/concursos-abertos";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineContestInput {
    pub source_name: String,
    pub source_key: String,
    pub source_url: String,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub area: Option<String>,
    pub location: Option<String>,
    pub education: Option<String>,
    pub salary_text: Option<String>,
    pub salary_max: Option<f64>,
    pub vacancies_text: Option<String>,
    pub vacancies: Option<i64>,
    pub status: ContestStatus,
    pub status_evidence: String,
    pub registration_starts_on: Option<String>,
    pub registration_ends_on: Option<String>,
    pub fee_deadline: Option<String>,
    pub exam_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineContestSummary {
    pub id: String,
    pub source_name: String,
    pub source_key: String,
    pub source_url: String,
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
    pub area: Option<String>,
    pub location: Option<String>,
    pub education: Option<String>,
    pub salary_text: Option<String>,
    pub salary_max: Option<f64>,
    pub vacancies_text: Option<String>,
    pub vacancies: Option<i64>,
    pub status: ContestStatus,
    pub status_evidence: String,
    pub registration_starts_on: Option<String>,
    pub registration_ends_on: Option<String>,
    pub fee_deadline: Option<String>,
    pub exam_date: Option<String>,
    pub source_checked_at: String,
    pub is_favorite: bool,
    pub notice_material_id: Option<String>,
    pub has_changes: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineContestSourceState {
    pub source_name: String,
    pub source_url: String,
    pub last_attempted_at: Option<String>,
    pub last_successful_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineContestSnapshot {
    pub opportunities: Vec<OnlineContestSummary>,
    pub source: OnlineContestSourceState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineContestRefreshResult {
    pub source_name: String,
    pub source_url: String,
    pub source_checked_at: String,
    pub imported_count: i64,
    pub updated_count: i64,
    pub unchanged_count: i64,
    pub opportunities: Vec<OnlineContestSummary>,
}

#[derive(Debug, Clone)]
pub struct SetOnlineContestFavoriteInput {
    pub opportunity_id: String,
    pub is_favorite: bool,
}

#[derive(Debug, Clone)]
pub struct OnlineContestNotice {
    pub original_name: String,
    pub bytes: Vec<u8>,
}

pub fn normalize_online_contest_input(
    input: OnlineContestInput,
) -> Result<OnlineContestInput, String> {
    let source_name = normalize_required_text(input.source_name, "A fonte", 120)?;
    let source_key = normalize_required_text(input.source_key, "O identificador da fonte", 2048)?;
    let source_url = normalize_http_url(input.source_url, "A URL da fonte", 2048)?;
    let name = normalize_required_text(input.name, "O nome do concurso", 240)?;
    let status_evidence =
        normalize_required_text(input.status_evidence, "A evidência da situação", 500)?;
    if let Some(value) = input.salary_max {
        if !value.is_finite() || value < 0.0 {
            return Err("O salário máximo da oportunidade é inválido.".to_string());
        }
    }
    if let Some(value) = input.vacancies {
        if value < 0 {
            return Err("A quantidade de vagas da oportunidade é inválida.".to_string());
        }
    }
    for (value, label) in [
        (
            &input.registration_starts_on,
            "A data inicial das inscrições",
        ),
        (&input.registration_ends_on, "A data final das inscrições"),
        (&input.fee_deadline, "A data limite de pagamento"),
        (&input.exam_date, "A data da prova"),
    ] {
        if let Some(value) = value {
            validate_date(value, label)?;
        }
    }

    Ok(OnlineContestInput {
        source_name,
        source_key,
        source_url,
        name,
        organization: normalize_optional_text(input.organization, "O órgão", 160)?,
        role: normalize_optional_text(input.role, "O cargo", 240)?,
        board: normalize_optional_text(input.board, "A banca", 160)?,
        area: normalize_optional_text(input.area, "A área", 160)?,
        location: normalize_optional_text(input.location, "O local", 160)?,
        education: normalize_optional_text(input.education, "A escolaridade", 500)?,
        salary_text: normalize_optional_text(input.salary_text, "O texto salarial", 120)?,
        salary_max: input.salary_max,
        vacancies_text: normalize_optional_text(input.vacancies_text, "O texto de vagas", 120)?,
        vacancies: input.vacancies,
        status: input.status,
        status_evidence,
        registration_starts_on: input.registration_starts_on,
        registration_ends_on: input.registration_ends_on,
        fee_deadline: input.fee_deadline,
        exam_date: input.exam_date,
    })
}

pub fn normalize_online_contest_id(value: &str) -> Result<String, String> {
    Uuid::parse_str(value.trim())
        .map(|id| id.to_string())
        .map_err(|_| "O identificador da oportunidade é inválido.".to_string())
}

fn normalize_required_text(value: String, label: &str, max_chars: usize) -> Result<String, String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(format!("{label} é obrigatório."));
    }
    validate_text(normalized, label, max_chars)?;
    Ok(normalized.to_string())
}

fn normalize_optional_text(
    value: Option<String>,
    label: &str,
    max_chars: usize,
) -> Result<Option<String>, String> {
    value
        .map(|value| {
            let normalized = value.trim();
            if normalized.is_empty() {
                return Ok(None);
            }
            validate_text(normalized, label, max_chars)?;
            Ok(Some(normalized.to_string()))
        })
        .transpose()
        .map(Option::flatten)
}

fn validate_text(value: &str, label: &str, max_chars: usize) -> Result<(), String> {
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(format!("{label} é inválido ou longo demais."));
    }
    Ok(())
}

fn normalize_http_url(value: String, label: &str, max_chars: usize) -> Result<String, String> {
    let normalized = normalize_required_text(value, label, max_chars)?;
    let lower = normalized.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://"))
        || normalized.chars().any(char::is_whitespace)
    {
        return Err(format!("{label} deve usar HTTP ou HTTPS."));
    }
    Ok(normalized)
}

fn validate_date(value: &str, label: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return Err(format!("{label} deve usar o formato AAAA-MM-DD."));
    }
    let year = value[0..4]
        .parse::<u32>()
        .map_err(|_| format!("{label} é inválida."))?;
    let month = value[5..7]
        .parse::<u32>()
        .map_err(|_| format!("{label} é inválida."))?;
    let day = value[8..10]
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_source_and_invalid_dates() {
        let result = normalize_online_contest_input(OnlineContestInput {
            source_name: "Ache Concursos".to_string(),
            source_key: "https://example.com/item".to_string(),
            source_url: "https://example.com/item".to_string(),
            name: "Concurso".to_string(),
            organization: None,
            role: None,
            board: None,
            area: None,
            location: None,
            education: None,
            salary_text: None,
            salary_max: None,
            vacancies_text: None,
            vacancies: None,
            status: ContestStatus::RegistrationOpen,
            status_evidence: "Página pública".to_string(),
            registration_starts_on: None,
            registration_ends_on: Some("2027-02-29".to_string()),
            fee_deadline: None,
            exam_date: None,
        });
        assert!(result.is_err());
    }
}
