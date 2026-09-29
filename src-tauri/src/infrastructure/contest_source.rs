use crate::application::workspace_service::WorkspaceError;
use crate::domain::contest::ContestStatus;
use crate::domain::online_contest::{
    OnlineContestInput, OnlineContestNotice, ACHE_CONCURSOS_SOURCE_NAME, ACHE_CONCURSOS_SOURCE_URL,
};
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE};
use reqwest::{Client, Response};
use std::collections::HashMap;
use std::time::Duration;

const MAX_SOURCE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_NOTICE_BYTES: u64 = 25 * 1024 * 1024;
const SOURCE_USER_AGENT: &str = "CursouCon/0.1 (local contest discovery)";

pub async fn fetch_ache_concursos() -> Result<Vec<OnlineContestInput>, WorkspaceError> {
    let client = source_client()?;
    let response = client
        .get(ACHE_CONCURSOS_SOURCE_URL)
        .header(ACCEPT, "text/html,application/xhtml+xml")
        .header(ACCEPT_LANGUAGE, "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|error| {
            WorkspaceError::Network(format!("consultar {ACHE_CONCURSOS_SOURCE_NAME}: {error}"))
        })?
        .error_for_status()
        .map_err(|error| WorkspaceError::Network(format!("a fonte respondeu com erro: {error}")))?;
    if normalize_source_href(response.url().as_str()).is_none() {
        return Err(WorkspaceError::Network(
            "a fonte redirecionou para um endereço não aprovado".to_string(),
        ));
    }

    let bytes = read_response_bytes(response, MAX_SOURCE_BYTES, "ler resposta da fonte").await?;
    let html = String::from_utf8(bytes).map_err(|error| {
        WorkspaceError::Network(format!("a resposta da fonte não está em UTF-8: {error}"))
    })?;
    parse_ache_concursos_html(&html)
}

pub async fn fetch_ache_notice(source_url: &str) -> Result<OnlineContestNotice, WorkspaceError> {
    let article_url = normalize_source_href(source_url).ok_or_else(|| {
        WorkspaceError::InvalidInput(
            "A origem do concurso não pertence à fonte aprovada.".to_string(),
        )
    })?;
    let client = source_client()?;
    let response = client
        .get(&article_url)
        .header(ACCEPT, "text/html,application/xhtml+xml")
        .header(ACCEPT_LANGUAGE, "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|error| WorkspaceError::Network(format!("consultar o artigo do edital: {error}")))?
        .error_for_status()
        .map_err(|error| {
            WorkspaceError::Network(format!("o artigo do edital respondeu com erro: {error}"))
        })?;
    if normalize_source_href(response.url().as_str()).is_none() {
        return Err(WorkspaceError::Network(
            "o artigo do edital redirecionou para um endereço não aprovado".to_string(),
        ));
    }
    let article = read_response_bytes(response, MAX_SOURCE_BYTES, "ler artigo do edital").await?;
    let article = String::from_utf8(article).map_err(|error| {
        WorkspaceError::Network(format!("o artigo do edital não está em UTF-8: {error}"))
    })?;
    let notice_url = extract_notice_pdf_href(&article).ok_or_else(|| {
        WorkspaceError::Network(
            "a fonte não disponibilizou um PDF de edital reconhecível para esta oportunidade"
                .to_string(),
        )
    })?;
    let response = client
        .get(&notice_url)
        .header(ACCEPT, "application/pdf")
        .send()
        .await
        .map_err(|error| WorkspaceError::Network(format!("baixar o edital: {error}")))?
        .error_for_status()
        .map_err(|error| {
            WorkspaceError::Network(format!("o edital respondeu com erro: {error}"))
        })?;
    let final_notice_url = response.url().to_string();
    if normalize_source_href(&final_notice_url).is_none() {
        return Err(WorkspaceError::Network(
            "o edital redirecionou para um endereço não aprovado".to_string(),
        ));
    }
    let bytes = read_response_bytes(response, MAX_NOTICE_BYTES, "ler edital").await?;
    if !bytes.starts_with(b"%PDF") {
        return Err(WorkspaceError::Network(
            "a fonte não retornou um arquivo PDF de edital".to_string(),
        ));
    }

    Ok(OnlineContestNotice {
        original_name: notice_file_name(&final_notice_url),
        bytes,
    })
}

fn source_client() -> Result<Client, WorkspaceError> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent(SOURCE_USER_AGENT)
        .build()
        .map_err(|error| WorkspaceError::Network(format!("preparar consulta da fonte: {error}")))
}

async fn read_response_bytes(
    response: Response,
    maximum_bytes: u64,
    operation: &str,
) -> Result<Vec<u8>, WorkspaceError> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum_bytes)
    {
        return Err(WorkspaceError::Network(
            "a resposta da fonte excede o limite permitido".to_string(),
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| WorkspaceError::Network(format!("{operation}: {error}")))?;
    if bytes.len() as u64 > maximum_bytes {
        return Err(WorkspaceError::Network(
            "a resposta da fonte excede o limite permitido".to_string(),
        ));
    }
    Ok(bytes.to_vec())
}

pub fn parse_ache_concursos_html(html: &str) -> Result<Vec<OnlineContestInput>, WorkspaceError> {
    let mut opportunities = HashMap::new();
    let mut cursor = 0;
    while let Some(relative_start) = html[cursor..].find("<tr") {
        let row_start = cursor + relative_start;
        let Some(relative_end) = html[row_start..].find("</tr>") else {
            break;
        };
        let row_end = row_start + relative_end + "</tr>".len();
        let row = &html[row_start..row_end];
        cursor = row_end;
        if !row.contains("tbl-data") {
            continue;
        }

        let Some(name) = extract_class_text(row, "titulo") else {
            continue;
        };
        let Some(href) = extract_href(row) else {
            continue;
        };
        let Some(source_url) = normalize_source_href(&href) else {
            continue;
        };
        let education = extract_class_text(row, "vagas")
            .map(|value| {
                value
                    .strip_prefix("Nível:")
                    .unwrap_or(&value)
                    .trim()
                    .to_string()
            })
            .filter(|value| !value.is_empty());
        let vacancies_text = extract_class_text(row, "numero_vagas");
        let vacancies = vacancies_text.as_deref().and_then(parse_integer);
        let salary_text = extract_class_text(row, "sal_max").filter(|value| value != "-");
        let salary_max = salary_text.as_deref().and_then(parse_brazilian_money);
        let registration_ends_on = extract_class_text(row, "inscricao_fim")
            .as_deref()
            .and_then(parse_source_date);
        let location = section_location(html, row_start);

        opportunities
            .entry(source_url.clone())
            .or_insert(OnlineContestInput {
                source_name: ACHE_CONCURSOS_SOURCE_NAME.to_string(),
                source_key: source_url.clone(),
                source_url,
                name,
                organization: None,
                role: None,
                board: None,
                area: None,
                location,
                education,
                salary_text,
                salary_max,
                vacancies_text,
                vacancies,
                status: ContestStatus::RegistrationOpen,
                status_evidence:
                    "Listagem pública de concursos abertos; confirme o edital oficial.".to_string(),
                registration_starts_on: None,
                registration_ends_on,
                fee_deadline: None,
                exam_date: None,
            });
    }

    if opportunities.is_empty() {
        return Err(WorkspaceError::Network(
            "a estrutura da fonte não produziu oportunidades reconhecíveis".to_string(),
        ));
    }
    let mut values = opportunities.into_values().collect::<Vec<_>>();
    values.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(values)
}

fn extract_class_text(fragment: &str, class_name: &str) -> Option<String> {
    let mut cursor = 0;
    while let Some(relative_class_start) = fragment[cursor..].find("class=\"") {
        let class_start = cursor + relative_class_start + "class=\"".len();
        let class_end = fragment[class_start..].find('"')? + class_start;
        let classes = fragment[class_start..class_end].split_whitespace();
        let opening_end = fragment[class_end..].find('>')? + class_end;
        cursor = class_end + 1;
        if !classes.clone().any(|value| value == class_name) {
            continue;
        }
        let content_start = opening_end + 1;
        let content_end = fragment[content_start..].find("</span>")? + content_start;
        return clean_html_text(&fragment[content_start..content_end]);
    }
    None
}

fn extract_href(fragment: &str) -> Option<String> {
    let anchor_start = fragment.find("<a")?;
    let anchor = &fragment[anchor_start..];
    let href_start = anchor.find("href=\"")? + "href=\"".len();
    let href_end = anchor[href_start..].find('"')? + href_start;
    Some(anchor[href_start..href_end].to_string())
}

fn extract_notice_pdf_href(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find("<iframe") {
        let start = cursor + relative_start;
        let Some(relative_end) = html[start..].find('>') else {
            break;
        };
        let end = start + relative_end;
        let fragment = &html[start..end];
        if let Some(source) = extract_attribute(fragment, "src") {
            if let Some(url) = normalize_source_href(&source) {
                let path = url
                    .split(['?', '#'])
                    .next()
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if path.ends_with(".pdf") {
                    return Some(url);
                }
            }
        }
        cursor = end + 1;
    }
    None
}

fn extract_attribute(fragment: &str, attribute: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let marker = format!("{attribute}={quote}");
        let Some(relative_start) = fragment.find(&marker) else {
            continue;
        };
        let start = relative_start + marker.len();
        let end = fragment[start..].find(quote)? + start;
        return Some(fragment[start..end].to_string());
    }
    None
}

fn notice_file_name(url: &str) -> String {
    let candidate = url
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .split(['?', '#'])
        .next()
        .unwrap_or_default();
    if !candidate.is_empty()
        && candidate.chars().count() <= 240
        && candidate.to_ascii_lowercase().ends_with(".pdf")
        && !candidate.chars().any(char::is_control)
    {
        candidate.to_string()
    } else {
        "edital.pdf".to_string()
    }
}

fn normalize_source_href(value: &str) -> Option<String> {
    let absolute = if value.starts_with('/') {
        format!("https://www.acheconcursos.com.br{value}")
    } else {
        value.to_string()
    };
    let lower = absolute.to_ascii_lowercase();
    if !absolute.chars().any(char::is_whitespace)
        && lower.starts_with("https://www.acheconcursos.com.br/")
    {
        Some(absolute)
    } else {
        None
    }
}

fn section_location(html: &str, row_start: usize) -> Option<String> {
    let heading_start = html[..row_start].rfind("<h4")?;
    let heading_end = html[heading_start..].find("</h4>")? + heading_start;
    let heading = clean_html_text(&html[heading_start..heading_end])?;
    let lower = heading.to_ascii_lowercase();
    if lower.contains(" no brasil") {
        return Some("Brasil".to_string());
    }
    let marker = " em ";
    let position = lower.find(marker)?;
    let value = heading[position + marker.len()..]
        .split(" - ")
        .next()
        .unwrap_or_default()
        .trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn clean_html_text(value: &str) -> Option<String> {
    let mut text = String::with_capacity(value.len());
    let mut inside_tag = false;
    for character in value.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => text.push(character),
            _ => {}
        }
    }
    let text = decode_html_entities(&text);
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn parse_source_date(value: &str) -> Option<String> {
    let mut parts = value.split('/');
    let day = parts.next()?.parse::<u32>().ok()?;
    let month = parts.next()?.parse::<u32>().ok()?;
    let year = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || day == 0 || month == 0 || month > 12 || year == 0 {
        return None;
    }
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn parse_integer(value: &str) -> Option<i64> {
    let normalized = value.replace('.', "").trim().to_string();
    normalized.parse::<i64>().ok()
}

fn parse_brazilian_money(value: &str) -> Option<f64> {
    if value.to_ascii_lowercase().contains("mil") {
        return None;
    }
    let normalized = value.replace("R$", "").replace('.', "").replace(',', ".");
    let filtered = normalized
        .chars()
        .filter(|character| character.is_ascii_digit() || *character == '.')
        .collect::<String>();
    filtered.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_rows_without_inventing_missing_fields() {
        let html = r#"
            <h4 class="section-title"><a>Concursos abertos em São Paulo</a></h4>
            <table><tr><th>Concurso</th></tr>
            <tr><td class="tbl-data"><a href="/concursos-sao-paulo/item-1"><span class="titulo">Concurso &amp; Teste</span></a><span class="vagas">Nível: Médio e Superior</span></td><td class="tbl-data"><span class="inscricao_fim">30/09/2026</span></td><td class="tbl-data"><span class="numero_vagas">12</span></td><td class="tbl-data"><span class="sal_max">R$ 7.104,30</span></td></tr></table>
        "#;

        let rows = parse_ache_concursos_html(html).expect("a fixture deve ser lida");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "Concurso & Teste");
        assert_eq!(rows[0].location.as_deref(), Some("São Paulo"));
        assert_eq!(rows[0].registration_ends_on.as_deref(), Some("2026-09-30"));
        assert_eq!(rows[0].vacancies, Some(12));
        assert_eq!(rows[0].salary_max, Some(7104.30));
        assert!(rows[0].organization.is_none());
    }

    #[test]
    fn preserves_source_text_when_numeric_values_are_unavailable() {
        let html = r#"
            <h4>Concursos Abertos no Brasil - Federais</h4>
            <table><tr><th>Concurso</th></tr>
            <tr><td class="tbl-data"><a href="https://www.acheconcursos.com.br/concursos-brasil/item-2"><span class="titulo">Concurso sem faixa salarial</span></a><span class="vagas">Nível: Superior</span></td><td class="tbl-data"><span class="inscricao_fim">01/10/2026</span></td><td class="tbl-data"><span class="numero_vagas reserva">Cadastro Reserva</span></td><td class="tbl-data"><span class="sal_max">R$ 7,4 mil</span></td></tr></table>
        "#;

        let rows = parse_ache_concursos_html(html).expect("a fixture deve ser lida");
        assert_eq!(rows[0].vacancies, None);
        assert_eq!(rows[0].vacancies_text.as_deref(), Some("Cadastro Reserva"));
        assert_eq!(rows[0].salary_max, None);
        assert_eq!(rows[0].salary_text.as_deref(), Some("R$ 7,4 mil"));
    }

    #[test]
    fn extracts_only_approved_pdf_iframe() {
        let html = r#"
            <iframe src="https://ads.example.invalid/banner.html"></iframe>
            <iframe src="https://www.acheconcursos.com.br/imagens/anexo/123/edital.pdf" title="edital"></iframe>
        "#;

        assert_eq!(
            extract_notice_pdf_href(html).as_deref(),
            Some("https://www.acheconcursos.com.br/imagens/anexo/123/edital.pdf")
        );
        assert_eq!(
            notice_file_name("https://example.invalid/file.pdf?download=1"),
            "file.pdf"
        );
    }
}
