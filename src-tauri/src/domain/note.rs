use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SaveNoteInput {
    pub id: Option<String>,
    pub title: String,
    pub content_markdown: String,
    pub material_id: Option<String>,
    pub subject_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub content_markdown: String,
    pub material_id: Option<String>,
    pub subject_id: Option<String>,
    pub material_name: Option<String>,
    pub subject_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn normalize_save_note_input(input: SaveNoteInput) -> Result<SaveNoteInput, String> {
    let title = normalize_required_text(input.title, "O título da nota", 160)?;
    let content_markdown = normalize_note_content(input.content_markdown)?;
    let material_id = input
        .material_id
        .map(|value| normalize_id(&value, "O material"))
        .transpose()?;
    let subject_id = input
        .subject_id
        .map(|value| normalize_id(&value, "O assunto"))
        .transpose()?;

    if material_id.is_none() && subject_id.is_none() {
        return Err("Vincule a nota a um material ou assunto.".to_string());
    }

    Ok(SaveNoteInput {
        id: input
            .id
            .map(|value| normalize_id(&value, "A nota"))
            .transpose()?,
        title,
        content_markdown,
        material_id,
        subject_id,
    })
}

fn normalize_note_content(value: String) -> Result<String, String> {
    if value.chars().count() > 100_000 {
        return Err("O conteúdo da nota deve ter no máximo 100.000 caracteres.".to_string());
    }
    if value.chars().any(char::is_control)
        && value
            .chars()
            .any(|character| character != '\n' && character != '\r' && character != '\t')
    {
        return Err("O conteúdo da nota contém caracteres inválidos.".to_string());
    }
    Ok(value)
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

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let parsed = Uuid::parse_str(value.trim()).map_err(|_| format!("{label} não é válido."))?;
    Ok(parsed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_note_link_and_preserves_markdown() {
        let subject_id = Uuid::new_v4().to_string();
        let note = normalize_save_note_input(SaveNoteInput {
            id: None,
            title: "  HTTP  ".to_string(),
            content_markdown: "# Cabeçalhos\n\n- Cache".to_string(),
            material_id: None,
            subject_id: Some(subject_id.clone()),
        })
        .expect("a nota deve ser válida");

        assert_eq!(note.title, "HTTP");
        assert_eq!(note.content_markdown, "# Cabeçalhos\n\n- Cache");
        assert_eq!(note.subject_id.as_deref(), Some(subject_id.as_str()));
        assert!(normalize_save_note_input(SaveNoteInput {
            id: None,
            title: "Sem vínculo".to_string(),
            content_markdown: "texto".to_string(),
            material_id: None,
            subject_id: None,
        })
        .is_err());
    }
}
