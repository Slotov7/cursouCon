use super::{map_database_error, map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::material_service::MaterialStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::material::{
    normalize_external_url, ImportMaterialInput, MaterialSubjectSummary, MaterialSummary,
    RegisterMaterialLinkInput, SetMaterialSubjectsInput, SetMaterialTagsInput,
    UpdateMaterialPageInput,
};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

type MaterialRow = (
    String,
    String,
    String,
    Option<String>,
    i64,
    Option<String>,
    String,
    i64,
    Option<String>,
    Option<String>,
);

struct PreparedBlob {
    original_name: String,
    content_hash: String,
    mime_type: Option<String>,
    byte_size: i64,
    target_path: PathBuf,
    created_new_blob: bool,
}

impl MaterialStore for LocalWorkspaceStore {
    fn list_materials(&self) -> Result<Vec<MaterialSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        load_materials(&connection)
    }

    fn import_material(
        &self,
        input: &ImportMaterialInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let prepared = prepare_blob(self, Path::new(&input.source_path))?;
        let result = register_material(self, input, &prepared);

        if result.is_err() && prepared.created_new_blob {
            let _ = fs::remove_file(&prepared.target_path);
        }

        result
    }

    fn register_material_link(
        &self,
        input: &RegisterMaterialLinkInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar cadastro do link", error))?;
        if let Some(subject_id) = input.subject_id.as_deref() {
            ensure_subject_exists(&transaction, subject_id)?;
        }

        let existing_id: Option<String> = transaction
            .query_row(
                "SELECT id FROM materials WHERE source_url = ?1",
                params![input.url.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("localizar link existente", error))?;
        let material_id = if let Some(material_id) = existing_id {
            material_id
        } else {
            let original_name = input
                .title
                .clone()
                .unwrap_or_else(|| link_display_name(&input.url));
            validate_original_name(&original_name)?;
            let content_hash = link_content_hash(&input.url);
            let material_id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO materials
                     (id, original_name, content_hash, mime_type, source_url, byte_size)
                     VALUES (?1, ?2, ?3, ?4, ?5, 0)",
                    params![
                        material_id.as_str(),
                        original_name.as_str(),
                        content_hash.as_str(),
                        "text/html",
                        input.url.as_str(),
                    ],
                )
                .map_err(|error| map_database_error("registrar link", error))?;
            material_id
        };

        if let Some(subject_id) = input.subject_id.as_deref() {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO material_subjects (material_id, subject_id)
                     VALUES (?1, ?2)",
                    params![material_id.as_str(), subject_id],
                )
                .map_err(|error| map_database_error("vincular link ao assunto", error))?;
        }

        let summary = load_material(&transaction, &material_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar cadastro do link", error))?;
        Ok(summary)
    }

    fn material_path(&self, material_id: &str) -> Result<PathBuf, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let connection = self.active_database()?;
        let (content_hash, source_url): (String, Option<String>) = connection
            .query_row(
                "SELECT content_hash, source_url FROM materials WHERE id = ?1",
                params![material_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => WorkspaceError::InvalidInput(
                    "O material escolhido não existe mais.".to_string(),
                ),
                other => map_database_error("localizar material", other),
            })?;
        if source_url.is_some() {
            return Err(WorkspaceError::InvalidInput(
                "Este material é um link externo e não possui arquivo local.".to_string(),
            ));
        }
        let material_path = workspace.path.join("blobs").join(content_hash);

        if !material_path.is_file() {
            return Err(WorkspaceError::IncompleteWorkspace(
                "a cópia do material não foi encontrada no espaço".to_string(),
            ));
        }

        Ok(material_path)
    }

    fn material_url(&self, material_id: &str) -> Result<Option<String>, WorkspaceError> {
        let connection = self.active_database()?;
        let source_url: Option<String> = connection
            .query_row(
                "SELECT source_url FROM materials WHERE id = ?1",
                params![material_id],
                |row| row.get(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => WorkspaceError::InvalidInput(
                    "O material escolhido não existe mais.".to_string(),
                ),
                other => map_database_error("localizar link do material", other),
            })?;

        source_url
            .map(|url| normalize_external_url(&url).map_err(WorkspaceError::InvalidInput))
            .transpose()
    }

    fn update_material_page(
        &self,
        input: &UpdateMaterialPageInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let connection = self.active_database()?;
        let changed = connection
            .execute(
                "UPDATE materials SET current_page = ?1 WHERE id = ?2",
                params![input.page, input.material_id.as_str()],
            )
            .map_err(|error| map_database_error("salvar página do material", error))?;

        if changed == 0 {
            return Err(WorkspaceError::InvalidInput(
                "O material escolhido não existe mais.".to_string(),
            ));
        }

        load_material(&connection, &input.material_id)
    }

    fn set_material_tags(
        &self,
        input: &SetMaterialTagsInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar atualização das etiquetas", error))?;
        let exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM materials WHERE id = ?1",
                params![input.material_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("verificar material das etiquetas", error))?;
        if exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "O material escolhido não existe mais.".to_string(),
            ));
        }

        transaction
            .execute(
                "DELETE FROM material_tags WHERE material_id = ?1",
                params![input.material_id.as_str()],
            )
            .map_err(|error| map_database_error("limpar etiquetas do material", error))?;
        for (position, tag) in input.tags.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO material_tags (material_id, position, tag)
                     VALUES (?1, ?2, ?3)",
                    params![input.material_id.as_str(), position as i64, tag.as_str()],
                )
                .map_err(|error| map_database_error("gravar etiqueta do material", error))?;
        }

        let summary = load_material(&transaction, &input.material_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar etiquetas do material", error))?;
        Ok(summary)
    }

    fn set_material_subjects(
        &self,
        input: &SetMaterialSubjectsInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar atualização dos assuntos", error))?;
        let exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM materials WHERE id = ?1",
                params![input.material_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("verificar material dos assuntos", error))?;
        if exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "O material escolhido não existe mais.".to_string(),
            ));
        }

        for subject_id in &input.subject_ids {
            ensure_subject_exists(&transaction, subject_id)?;
        }
        transaction
            .execute(
                "DELETE FROM material_subjects WHERE material_id = ?1",
                params![input.material_id.as_str()],
            )
            .map_err(|error| map_database_error("limpar assuntos do material", error))?;
        for subject_id in &input.subject_ids {
            transaction
                .execute(
                    "INSERT INTO material_subjects (material_id, subject_id)
                     VALUES (?1, ?2)",
                    params![input.material_id.as_str(), subject_id.as_str()],
                )
                .map_err(|error| map_database_error("gravar assunto do material", error))?;
        }

        let summary = load_material(&transaction, &input.material_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar assuntos do material", error))?;
        Ok(summary)
    }
}

fn prepare_blob(
    store: &LocalWorkspaceStore,
    source_path: &Path,
) -> Result<PreparedBlob, WorkspaceError> {
    if !source_path.is_absolute() {
        return Err(WorkspaceError::InvalidInput(
            "O arquivo de origem precisa usar um caminho absoluto.".to_string(),
        ));
    }

    let metadata =
        fs::metadata(source_path).map_err(|error| map_io_error("ler o material", error))?;
    if !metadata.is_file() {
        return Err(WorkspaceError::InvalidInput(
            "O caminho escolhido não é um arquivo.".to_string(),
        ));
    }
    let byte_size = i64::try_from(metadata.len()).map_err(|_| {
        WorkspaceError::InvalidInput("O material é grande demais para ser registrado.".to_string())
    })?;
    let original_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("O nome do arquivo não pode ser lido.".to_string())
        })?
        .to_string();
    validate_original_name(&original_name)?;

    let workspace = store
        .active_workspace()?
        .ok_or(WorkspaceError::NoActiveWorkspace)?;
    let blobs_directory = workspace.path.join("blobs");
    fs::create_dir_all(&blobs_directory)
        .map_err(|error| map_io_error("preparar os materiais do espaço", error))?;
    let temporary_path = blobs_directory.join(format!(".cursoucon-import-{}.tmp", Uuid::new_v4()));

    let hash_result = (|| {
        let mut source = File::open(source_path)
            .map_err(|error| map_io_error("abrir o material de origem", error))?;
        let mut temporary = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|error| map_io_error("criar cópia temporária do material", error))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];

        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|error| map_io_error("ler o material de origem", error))?;
            if read == 0 {
                break;
            }
            temporary
                .write_all(&buffer[..read])
                .map_err(|error| map_io_error("copiar o material", error))?;
            hasher.update(&buffer[..read]);
        }

        temporary
            .sync_all()
            .map_err(|error| map_io_error("confirmar a cópia do material", error))?;
        Ok::<String, WorkspaceError>(format!("{:x}", hasher.finalize()))
    })();

    let content_hash = match hash_result {
        Ok(hash) => hash,
        Err(error) => {
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }
    };
    let target_path = blobs_directory.join(&content_hash);
    let created_new_blob = if target_path.exists() {
        if !target_path.is_file() {
            let _ = fs::remove_file(&temporary_path);
            return Err(WorkspaceError::Io(
                "o destino do material não é um arquivo regular".to_string(),
            ));
        }
        fs::remove_file(&temporary_path)
            .map_err(|error| map_io_error("limpar cópia temporária do material", error))?;
        false
    } else {
        fs::rename(&temporary_path, &target_path)
            .map_err(|error| map_io_error("publicar material no espaço", error))?;
        true
    };

    Ok(PreparedBlob {
        original_name,
        content_hash,
        mime_type: mime_type_for_path(source_path),
        byte_size,
        target_path,
        created_new_blob,
    })
}

fn register_material(
    store: &LocalWorkspaceStore,
    input: &ImportMaterialInput,
    prepared: &PreparedBlob,
) -> Result<MaterialSummary, WorkspaceError> {
    let mut connection = store.active_database()?;
    let transaction = connection
        .transaction()
        .map_err(|error| map_database_error("iniciar importação do material", error))?;
    if let Some(subject_id) = input.subject_id.as_deref() {
        ensure_subject_exists(&transaction, subject_id)?;
    }

    transaction
        .execute(
            "INSERT INTO materials (id, original_name, content_hash, mime_type, byte_size)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(content_hash) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                prepared.original_name.as_str(),
                prepared.content_hash.as_str(),
                prepared.mime_type.as_deref(),
                prepared.byte_size,
            ],
        )
        .map_err(|error| map_database_error("registrar material", error))?;

    let material_id: String = transaction
        .query_row(
            "SELECT id FROM materials WHERE content_hash = ?1",
            params![prepared.content_hash.as_str()],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("localizar material importado", error))?;

    if let Some(subject_id) = input.subject_id.as_deref() {
        transaction
            .execute(
                "INSERT OR IGNORE INTO material_subjects (material_id, subject_id)
                 VALUES (?1, ?2)",
                params![material_id.as_str(), subject_id],
            )
            .map_err(|error| map_database_error("vincular material ao assunto", error))?;
    }

    let summary = load_material(&transaction, &material_id)?;
    transaction
        .commit()
        .map_err(|error| map_database_error("confirmar importação do material", error))?;
    Ok(summary)
}

fn load_materials(connection: &Connection) -> Result<Vec<MaterialSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT m.id, m.original_name, m.content_hash, m.mime_type, m.byte_size,
                    m.source_url, m.imported_at, m.current_page, s.id, s.name
             FROM materials m
             LEFT JOIN material_subjects ms ON ms.material_id = m.id
             LEFT JOIN subjects s ON s.id = ms.subject_id
             ORDER BY m.imported_at DESC, m.id, s.position, s.name COLLATE NOCASE",
        )
        .map_err(|error| map_database_error("preparar leitura dos materiais", error))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
            ))
        })
        .map_err(|error| map_database_error("consultar materiais", error))?;
    let mut materials = Vec::new();
    let mut indexes = HashMap::new();

    for row in rows {
        let parts: MaterialRow = row.map_err(|error| map_database_error("ler material", error))?;
        let (
            id,
            original_name,
            content_hash,
            mime_type,
            byte_size,
            source_url,
            imported_at,
            current_page,
            subject_id,
            subject_name,
        ) = parts;
        let index = if let Some(index) = indexes.get(&id) {
            *index
        } else {
            let index = materials.len();
            indexes.insert(id.clone(), index);
            materials.push(MaterialSummary {
                id,
                original_name,
                content_hash,
                mime_type,
                source_url,
                byte_size,
                imported_at,
                current_page,
                subjects: Vec::new(),
                tags: Vec::new(),
            });
            index
        };

        if let (Some(subject_id), Some(subject_name)) = (subject_id, subject_name) {
            materials[index].subjects.push(MaterialSubjectSummary {
                id: subject_id,
                name: subject_name,
            });
        }
    }

    let mut tag_statement = connection
        .prepare(
            "SELECT material_id, tag
             FROM material_tags
             ORDER BY material_id, position",
        )
        .map_err(|error| map_database_error("preparar leitura das etiquetas", error))?;
    let tag_rows = tag_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| map_database_error("consultar etiquetas dos materiais", error))?;
    for row in tag_rows {
        let (material_id, tag) =
            row.map_err(|error| map_database_error("ler etiqueta do material", error))?;
        let Some(index) = indexes.get(&material_id).copied() else {
            return Err(WorkspaceError::Database(
                "uma etiqueta aponta para um material inexistente".to_string(),
            ));
        };
        materials[index].tags.push(tag);
    }

    Ok(materials)
}

fn load_material(
    connection: &Connection,
    material_id: &str,
) -> Result<MaterialSummary, WorkspaceError> {
    load_materials(connection)?
        .into_iter()
        .find(|material| material.id == material_id)
        .ok_or_else(|| {
            WorkspaceError::Database("o material importado não foi localizado".to_string())
        })
}

fn ensure_subject_exists(
    transaction: &rusqlite::Transaction<'_>,
    subject_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM subjects
             WHERE id = ?1 AND archived_at IS NULL
             LIMIT 1",
            params![subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto do material", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto escolhido para o material não existe mais.".to_string(),
        ));
    }

    Ok(())
}

fn validate_original_name(name: &str) -> Result<(), WorkspaceError> {
    if name.is_empty() || name.chars().count() > 240 || name.chars().any(char::is_control) {
        return Err(WorkspaceError::InvalidInput(
            "O nome do arquivo escolhido é inválido.".to_string(),
        ));
    }
    Ok(())
}

fn mime_type_for_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime_type = match extension.as_str() {
        "pdf" => "application/pdf",
        "md" => "text/markdown",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => return None,
    };
    Some(mime_type.to_string())
}

fn link_content_hash(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"cursoucon-link\0");
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn link_display_name(url: &str) -> String {
    url.split_once("://")
        .and_then(|(_, remainder)| remainder.split(['/', '?', '#']).next())
        .filter(|host| !host.is_empty())
        .unwrap_or(url)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::study_plan::{CreatePreparationInput, CreateSubjectInput};
    use std::fs;

    #[test]
    fn imports_by_hash_and_keeps_copy_after_source_is_removed() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-material-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-material-data-{}", Uuid::new_v4()));
        let source_path =
            std::env::temp_dir().join(format!("cursoucon-source-{}.pdf", Uuid::new_v4()));
        fs::write(&source_path, b"conteudo sintetico do material")
            .expect("a origem do material deve ser gravada");
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Materiais de teste")
            .expect("o espaço de fixture deve ser criado");
        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação de materiais".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação deve ser criada");
        let first_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("o primeiro assunto deve ser criado");
        let second_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id,
                name: "Direito Administrativo".to_string(),
                parent_id: None,
            })
            .expect("o segundo assunto deve ser criado");

        let input = ImportMaterialInput {
            source_path: source_path.to_string_lossy().to_string(),
            subject_id: None,
        };
        let imported = store
            .import_material(&input)
            .expect("o material deve ser importado");
        let duplicate = store
            .import_material(&input)
            .expect("a segunda importação deve reutilizar a cópia");
        let copied_path = store
            .material_path(&imported.id)
            .expect("a cópia deve ser localizada");
        let updated = store
            .update_material_page(&UpdateMaterialPageInput {
                material_id: imported.id.clone(),
                page: 3,
            })
            .expect("a página deve ser persistida");
        let tagged = store
            .set_material_tags(&SetMaterialTagsInput {
                material_id: imported.id.clone(),
                tags: vec!["teoria".to_string(), "revisão".to_string()],
            })
            .expect("as etiquetas devem ser persistidas");
        let linked = store
            .set_material_subjects(&SetMaterialSubjectsInput {
                material_id: imported.id.clone(),
                subject_ids: vec![first_subject.id.clone(), second_subject.id.clone()],
            })
            .expect("os assuntos devem ser vinculados");
        let registered_link = store
            .register_material_link(&RegisterMaterialLinkInput {
                url: "https://example.com/edital".to_string(),
                title: Some("Edital de referência".to_string()),
                subject_id: Some(first_subject.id.clone()),
            })
            .expect("o link deve ser registrado");
        let duplicate_link = store
            .register_material_link(&RegisterMaterialLinkInput {
                url: "https://example.com/edital".to_string(),
                title: None,
                subject_id: Some(second_subject.id.clone()),
            })
            .expect("o segundo cadastro deve reutilizar o link");
        let link_url = store
            .material_url(&registered_link.id)
            .expect("o link deve ser localizado")
            .expect("o material deve preservar sua URL");
        assert_eq!(linked.subjects.len(), 2);
        assert_eq!(
            registered_link.source_url.as_deref(),
            Some("https://example.com/edital")
        );
        assert_eq!(duplicate_link.id, registered_link.id);
        assert_eq!(duplicate_link.subjects.len(), 2);
        assert_eq!(link_url, "https://example.com/edital");
        assert!(store.material_path(&registered_link.id).is_err());
        assert!(store
            .set_material_subjects(&SetMaterialSubjectsInput {
                material_id: imported.id.clone(),
                subject_ids: vec![first_subject.id.clone(), Uuid::new_v4().to_string()],
            })
            .is_err());

        fs::remove_file(&source_path).expect("a origem deve poder ser removida");
        let materials = store
            .list_materials()
            .expect("a lista de materiais deve ser lida");

        assert_eq!(imported.id, duplicate.id);
        assert_eq!(imported.content_hash.len(), 64);
        assert_eq!(updated.current_page, 3);
        assert_eq!(tagged.tags, vec!["teoria", "revisão"]);
        assert_eq!(materials.len(), 2);
        let stored_file = materials
            .iter()
            .find(|material| material.id == imported.id)
            .expect("o arquivo deve continuar listado");
        let stored_link = materials
            .iter()
            .find(|material| material.id == registered_link.id)
            .expect("o link deve continuar listado");
        assert_eq!(stored_file.current_page, 3);
        assert_eq!(stored_file.tags, vec!["teoria", "revisão"]);
        assert_eq!(stored_file.subjects.len(), 2);
        assert_eq!(
            stored_link.source_url.as_deref(),
            Some("https://example.com/edital")
        );
        assert_eq!(stored_link.byte_size, 0);
        assert!(copied_path.is_file());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_file(source_path);
    }
}
