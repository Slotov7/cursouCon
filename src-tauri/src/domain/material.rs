use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ImportMaterialInput {
    pub source_path: String,
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
    pub byte_size: i64,
    pub imported_at: String,
    pub current_page: i64,
    pub subjects: Vec<MaterialSubjectSummary>,
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

fn normalize_id(value: &str, label: &str) -> Result<String, String> {
    let parsed = Uuid::parse_str(value.trim()).map_err(|_| format!("{label} não é válido."))?;
    Ok(parsed.to_string())
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
    fn rejects_material_page_before_first_page() {
        assert!(
            normalize_update_material_page_input(UpdateMaterialPageInput {
                material_id: Uuid::new_v4().to_string(),
                page: 0,
            })
            .is_err()
        );
    }
}
