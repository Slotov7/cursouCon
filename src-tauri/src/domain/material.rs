use serde::Serialize;
use std::collections::HashSet;
use uuid::Uuid;

const MAX_MATERIAL_TAGS: usize = 20;
const MAX_MATERIAL_TAG_CHARACTERS: usize = 40;

#[derive(Debug, Clone)]
pub struct ImportMaterialInput {
    pub source_path: String,
    pub subject_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RegisterMaterialLinkInput {
    pub url: String,
    pub title: Option<String>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OpenMaterialInput {
    pub material_id: String,
}

#[derive(Debug, Clone)]
pub struct UpdateMaterialPageInput {
    pub material_id: String,
    pub page: i64,
}

#[derive(Debug, Clone)]
pub struct SetMaterialTagsInput {
    pub material_id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct SetMaterialSubjectsInput {
    pub material_id: String,
    pub subject_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSubjectSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSummary {
    pub id: String,
    pub original_name: String,
    pub content_hash: String,
    pub mime_type: Option<String>,
    pub source_url: Option<String>,
    pub byte_size: i64,
    pub imported_at: String,
    pub current_page: i64,
    pub subjects: Vec<MaterialSubjectSummary>,
    pub tags: Vec<String>,
}

pub fn normalize_import_material_input(
    input: ImportMaterialInput,
) -> Result<ImportMaterialInput, String> {
    let source_path = input.source_path.trim();
    if source_path.is_empty() {
        return Err("Escolha um arquivo para importar.".to_string());
    }
    if source_path.chars().any(char::is_control) {
        return Err("O caminho do arquivo contém caracteres inválidos.".to_string());
    }

    Ok(ImportMaterialInput {
        source_path: source_path.to_string(),
        subject_id: input
            .subject_id
            .map(|subject_id| normalize_id(&subject_id, "O assunto"))
            .transpose()?,
    })
}

pub fn normalize_register_material_link_input(
    input: RegisterMaterialLinkInput,
) -> Result<RegisterMaterialLinkInput, String> {
    let url = normalize_external_url(&input.url)?;
    let title = input
        .title
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty());
    if let Some(title) = &title {
        validate_material_title(title)?;
    }

    Ok(RegisterMaterialLinkInput {
        url,
        title,
        subject_id: input
            .subject_id
            .map(|subject_id| normalize_id(&subject_id, "O assunto"))
            .transpose()?,
    })
}

pub fn normalize_external_url(value: &str) -> Result<String, String> {
    let url = value.trim();
    if url.is_empty()
        || url.chars().count() > 2048
        || url
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return Err("Informe um link HTTP ou HTTPS válido.".to_string());
    }

    let Some((scheme, remainder)) = url.split_once("://") else {
        return Err("O link precisa começar com http:// ou https://.".to_string());
    };
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return Err("Apenas links HTTP e HTTPS podem ser registrados.".to_string());
    }

    let authority = remainder.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') || authority.contains('\\') {
        return Err("O link precisa apontar para um endereço web válido.".to_string());
    }

    Ok(format!("{}://{remainder}", scheme.to_ascii_lowercase()))
}

pub fn normalize_open_material_input(
    input: OpenMaterialInput,
) -> Result<OpenMaterialInput, String> {
    Ok(OpenMaterialInput {
        material_id: normalize_id(&input.material_id, "O material")?,
    })
}

pub fn normalize_update_material_page_input(
    input: UpdateMaterialPageInput,
) -> Result<UpdateMaterialPageInput, String> {
    if input.page < 1 {
        return Err("A página do material precisa ser maior que zero.".to_string());
    }

    Ok(UpdateMaterialPageInput {
        material_id: normalize_id(&input.material_id, "O material")?,
        page: input.page,
    })
}

pub fn normalize_set_material_tags_input(
    input: SetMaterialTagsInput,
) -> Result<SetMaterialTagsInput, String> {
    if input.tags.len() > MAX_MATERIAL_TAGS {
        return Err(format!(
            "Um material pode ter no máximo {MAX_MATERIAL_TAGS} etiquetas."
        ));
    }

    let mut seen = HashSet::new();
    let mut tags = Vec::with_capacity(input.tags.len());
    for tag in input.tags {
        let normalized = tag.trim();
        if normalized.is_empty() {
            continue;
        }
        if normalized.chars().count() > MAX_MATERIAL_TAG_CHARACTERS {
            return Err(format!(
                "Cada etiqueta pode ter no máximo {MAX_MATERIAL_TAG_CHARACTERS} caracteres."
            ));
        }
        if normalized
            .chars()
            .any(|character| character.is_control() || character == ',')
        {
            return Err(
                "As etiquetas não podem conter vírgulas ou caracteres de controle.".to_string(),
            );
        }
        if seen.insert(normalized.to_lowercase()) {
            tags.push(normalized.to_string());
        }
    }

    Ok(SetMaterialTagsInput {
        material_id: normalize_id(&input.material_id, "O material")?,
        tags,
    })
}

pub fn normalize_set_material_subjects_input(
    input: SetMaterialSubjectsInput,
) -> Result<SetMaterialSubjectsInput, String> {
    let mut seen = HashSet::new();
    let mut subject_ids = Vec::with_capacity(input.subject_ids.len());
    for subject_id in input.subject_ids {
        let normalized = normalize_id(&subject_id, "O assunto")?;
        if seen.insert(normalized.clone()) {
            subject_ids.push(normalized);
        }
    }

    Ok(SetMaterialSubjectsInput {
        material_id: normalize_id(&input.material_id, "O material")?,
        subject_ids,
    })
}

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let parsed = Uuid::parse_str(value.trim()).map_err(|_| format!("{label} não é válido."))?;
    Ok(parsed.to_string())
}

fn validate_material_title(title: &str) -> Result<(), String> {
    if title.chars().count() > 240 || title.chars().any(char::is_control) {
        return Err("O título do material é inválido.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_material_input_without_accepting_invalid_ids() {
        let normalized = normalize_import_material_input(ImportMaterialInput {
            source_path: "  C:/estudos/redes.pdf  ".to_string(),
            subject_id: None,
        })
        .expect("o caminho deve ser normalizado");

        assert_eq!(normalized.source_path, "C:/estudos/redes.pdf");
        assert!(normalize_open_material_input(OpenMaterialInput {
            material_id: "not-an-id".to_string(),
        })
        .is_err());
    }

    #[test]
    fn normalizes_http_links_and_rejects_other_schemes() {
        let normalized = normalize_register_material_link_input(RegisterMaterialLinkInput {
            url: " HTTPS://example.com/edital ".to_string(),
            title: Some("  Edital de referência ".to_string()),
            subject_id: None,
        })
        .expect("o link deve ser normalizado");

        assert_eq!(normalized.url, "https://example.com/edital");
        assert_eq!(normalized.title.as_deref(), Some("Edital de referência"));
        assert!(
            normalize_register_material_link_input(RegisterMaterialLinkInput {
                url: "file:///etc/passwd".to_string(),
                title: None,
                subject_id: None,
            })
            .is_err()
        );
    }

    #[test]
    fn rejects_material_page_before_first_page() {
        assert!(
            normalize_update_material_page_input(UpdateMaterialPageInput {
                material_id: Uuid::new_v4().to_string(),
                page: 0,
            })
            .is_err()
        );
    }

    #[test]
    fn normalizes_tags_and_deduplicates_without_case_sensitivity() {
        let normalized = normalize_set_material_tags_input(SetMaterialTagsInput {
            material_id: Uuid::new_v4().to_string(),
            tags: vec![
                " Redes ".to_string(),
                "redes".to_string(),
                "TCP/IP".to_string(),
            ],
        })
        .expect("as etiquetas devem ser normalizadas");

        assert_eq!(normalized.tags, vec!["Redes", "TCP/IP"]);
        assert!(normalize_set_material_tags_input(SetMaterialTagsInput {
            material_id: Uuid::new_v4().to_string(),
            tags: vec!["tag,inválida".to_string()],
        })
        .is_err());
    }

    #[test]
    fn normalizes_material_subject_links_and_removes_duplicates() {
        let material_id = Uuid::new_v4().to_string();
        let first_subject_id = Uuid::new_v4().to_string();
        let second_subject_id = Uuid::new_v4().to_string();
        let normalized = normalize_set_material_subjects_input(SetMaterialSubjectsInput {
            material_id: format!(" {material_id} "),
            subject_ids: vec![
                format!(" {first_subject_id} "),
                first_subject_id.clone(),
                second_subject_id.clone(),
            ],
        })
        .expect("os vínculos devem ser normalizados");

        assert_eq!(normalized.material_id, material_id);
        assert_eq!(
            normalized.subject_ids,
            vec![first_subject_id, second_subject_id]
        );
    }
}
