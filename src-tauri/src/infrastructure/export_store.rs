use super::{map_database_error, map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::export_service::ExportStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::export::{WorkspaceDataExportResult, WORKSPACE_DATA_EXPORT_SCHEMA_VERSION};
use rusqlite::{types::ValueRef, Transaction};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const EXPORT_TABLES: &[&str] = &[
    "workspace_metadata",
    "preparations",
    "subjects",
    "study_tasks",
    "study_sessions",
    "xp_events",
    "materials",
    "material_subjects",
    "material_tags",
    "notes",
    "questions",
    "question_options",
    "question_subjects",
    "question_attempts",
    "question_revisions",
    "external_question_batches",
    "question_attachments",
    "notebooks",
    "notebook_questions",
    "manual_contests",
    "question_contest_relations",
    "study_reviews",
    "study_planning_settings",
    "study_availability",
    "study_cycle_slots",
    "study_session_duration_corrections",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataExportDocument {
    kind: &'static str,
    schema_version: i64,
    export_id: String,
    exported_at: String,
    workspace: ExportWorkspace,
    tables: Vec<ExportTable>,
    note_files: Vec<ExportNoteFile>,
    attachments: Vec<ExportAttachment>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportWorkspace {
    workspace_id: String,
    name: String,
    format_version: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportTable {
    name: String,
    rows: Vec<BTreeMap<String, Value>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportNoteFile {
    id: String,
    relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportAttachment {
    sha256: String,
    relative_path: String,
    byte_size: u64,
}

#[derive(Debug)]
struct NoteExport {
    id: String,
    title: String,
    content_markdown: String,
    material_id: Option<String>,
    subject_id: Option<String>,
    created_at: String,
    updated_at: String,
}

impl ExportStore for LocalWorkspaceStore {
    fn export_workspace_data(&self) -> Result<WorkspaceDataExportResult, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar leitura da exportação", error))?;
        let exported_at: String = transaction
            .query_row("SELECT CURRENT_TIMESTAMP", [], |row| row.get(0))
            .map_err(|error| map_database_error("preparar data da exportação", error))?;
        let tables = load_export_tables(&transaction)?;
        let notes = load_notes_for_export(&transaction)?;
        let attachment_hashes = load_attachment_hashes(&transaction)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar leitura da exportação", error))?;
        let exported_records = tables.iter().try_fold(0_i64, |total, table| {
            let count = i64::try_from(table.rows.len()).map_err(|_| {
                WorkspaceError::InvalidInput("A exportação contém registros demais.".to_string())
            })?;
            total.checked_add(count).ok_or_else(|| {
                WorkspaceError::InvalidInput("A exportação contém registros demais.".to_string())
            })
        })?;

        let export_id = Uuid::new_v4();
        let exports_directory = workspace.path.join("exports");
        fs::create_dir_all(&exports_directory)
            .map_err(|error| map_io_error("preparar pasta de exportações", error))?;
        let temporary_directory = exports_directory.join(format!(".data-{export_id}.tmp"));
        let final_directory = exports_directory.join(format!("data-{export_id}"));
        let result = (|| {
            fs::create_dir_all(temporary_directory.join("attachments"))
                .map_err(|error| map_io_error("preparar anexos da exportação", error))?;
            fs::create_dir_all(temporary_directory.join("notes"))
                .map_err(|error| map_io_error("preparar notas da exportação", error))?;

            let mut attachments = Vec::with_capacity(attachment_hashes.len());
            for hash in &attachment_hashes {
                attachments.push(copy_attachment(
                    &workspace.path,
                    &temporary_directory,
                    hash,
                )?);
            }

            let mut note_files = Vec::with_capacity(notes.len());
            for (index, note) in notes.iter().enumerate() {
                let relative_path = format!("notes/{index:04}.md");
                let note_path = temporary_directory.join(&relative_path);
                write_export_file(&note_path, render_note_markdown(note)?.as_bytes())?;
                note_files.push(ExportNoteFile {
                    id: note.id.clone(),
                    relative_path,
                });
            }

            let document = DataExportDocument {
                kind: "cursoucon.data",
                schema_version: WORKSPACE_DATA_EXPORT_SCHEMA_VERSION,
                export_id: export_id.to_string(),
                exported_at,
                workspace: ExportWorkspace {
                    workspace_id: workspace.manifest.workspace_id.to_string(),
                    name: workspace.manifest.name,
                    format_version: workspace.manifest.format_version,
                },
                tables,
                note_files,
                attachments,
            };
            let serialized = serde_json::to_vec_pretty(&document).map_err(|error| {
                WorkspaceError::Serialization(format!("serializar exportação: {error}"))
            })?;
            write_export_file(&temporary_directory.join("data.json"), &serialized)?;
            write_export_file(
                &temporary_directory.join("README.md"),
                export_readme().as_bytes(),
            )?;
            fs::rename(&temporary_directory, &final_directory)
                .map_err(|error| map_io_error("publicar exportação de dados", error))?;
            Ok::<PathBuf, WorkspaceError>(final_directory)
        })();

        if result.is_err() {
            let _ = fs::remove_dir_all(&temporary_directory);
        }
        let final_directory = result?;
        let path = final_directory.to_str().ok_or_else(|| {
            WorkspaceError::Io("o caminho da exportação não é válido".to_string())
        })?;

        Ok(WorkspaceDataExportResult {
            path: path.to_string(),
            schema_version: WORKSPACE_DATA_EXPORT_SCHEMA_VERSION,
            exported_records,
            exported_notes: i64::try_from(notes.len()).map_err(|_| {
                WorkspaceError::InvalidInput("Há notas demais para exportar.".to_string())
            })?,
            exported_attachments: i64::try_from(attachment_hashes.len()).map_err(|_| {
                WorkspaceError::InvalidInput("Há anexos demais para exportar.".to_string())
            })?,
        })
    }
}

fn load_export_tables(transaction: &Transaction<'_>) -> Result<Vec<ExportTable>, WorkspaceError> {
    EXPORT_TABLES
        .iter()
        .map(|table_name| load_export_table(transaction, table_name))
        .collect()
}

fn load_export_table(
    transaction: &Transaction<'_>,
    table_name: &str,
) -> Result<ExportTable, WorkspaceError> {
    let mut statement = transaction
        .prepare(&format!("SELECT * FROM {table_name}"))
        .map_err(|error| map_database_error("preparar tabela da exportação", error))?;
    let column_names = statement
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut rows = statement
        .query([])
        .map_err(|error| map_database_error("consultar tabela da exportação", error))?;
    let mut exported_rows = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|error| map_database_error("ler tabela da exportação", error))?
    {
        let mut values = BTreeMap::new();
        for (index, column_name) in column_names.iter().enumerate() {
            let value = row
                .get_ref(index)
                .map_err(|error| map_database_error("ler valor da exportação", error))?;
            values.insert(column_name.clone(), sqlite_value_to_json(value));
        }
        if table_name == "question_attachments" {
            if let Some(Value::String(hash)) = values.get("sha256") {
                let hash = normalize_hash(hash)?;
                values.insert(
                    "relative_path".to_string(),
                    Value::String(format!("attachments/{hash}")),
                );
            }
        }
        exported_rows.push(values);
    }

    Ok(ExportTable {
        name: table_name.to_string(),
        rows: exported_rows,
    })
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::Number(value.into()),
        ValueRef::Real(value) => serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => Value::String(format!("hex:{}", encode_hex(value))),
    }
}

fn load_notes_for_export(transaction: &Transaction<'_>) -> Result<Vec<NoteExport>, WorkspaceError> {
    let mut statement = transaction
        .prepare(
            "SELECT id, title, content_markdown, material_id, subject_id, created_at, updated_at
             FROM notes
             ORDER BY id",
        )
        .map_err(|error| map_database_error("preparar notas da exportação", error))?;
    let rows = statement
        .query_map([], |row| {
            Ok(NoteExport {
                id: row.get(0)?,
                title: row.get(1)?,
                content_markdown: row.get(2)?,
                material_id: row.get(3)?,
                subject_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| map_database_error("consultar notas da exportação", error))?;

    rows.map(|row| row.map_err(|error| map_database_error("ler nota da exportação", error)))
        .collect()
}

fn load_attachment_hashes(transaction: &Transaction<'_>) -> Result<Vec<String>, WorkspaceError> {
    let mut statement = transaction
        .prepare(
            "SELECT content_hash FROM materials WHERE source_url IS NULL
             UNION
             SELECT sha256 FROM question_attachments
             ORDER BY 1",
        )
        .map_err(|error| map_database_error("preparar anexos da exportação", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| map_database_error("consultar anexos da exportação", error))?;
    rows.map(|row| row.map_err(|error| map_database_error("ler anexo da exportação", error)))
        .collect()
}

fn copy_attachment(
    workspace_path: &Path,
    temporary_directory: &Path,
    hash: &str,
) -> Result<ExportAttachment, WorkspaceError> {
    let normalized_hash = normalize_hash(hash)?;
    let source = workspace_path.join("blobs").join(&normalized_hash);
    let metadata = fs::symlink_metadata(&source)
        .map_err(|error| map_io_error("localizar anexo da exportação", error))?;
    if !metadata.file_type().is_file() {
        return Err(WorkspaceError::IncompleteWorkspace(
            "um anexo referenciado não é um arquivo regular".to_string(),
        ));
    }

    let bytes =
        fs::read(&source).map_err(|error| map_io_error("ler anexo da exportação", error))?;
    let actual_hash = hash_bytes(&bytes);
    if actual_hash != normalized_hash {
        return Err(WorkspaceError::IncompleteWorkspace(
            "o hash de um anexo não corresponde ao nome do blob".to_string(),
        ));
    }

    let relative_path = format!("attachments/{normalized_hash}");
    write_export_file(&temporary_directory.join(&relative_path), &bytes)?;
    Ok(ExportAttachment {
        sha256: normalized_hash,
        relative_path,
        byte_size: u64::try_from(bytes.len()).map_err(|_| {
            WorkspaceError::InvalidInput("um anexo é grande demais para exportar".to_string())
        })?,
    })
}

fn normalize_hash(value: &str) -> Result<String, WorkspaceError> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(WorkspaceError::InvalidWorkspace(
            "um anexo possui hash inválido".to_string(),
        ));
    }
    Ok(value.to_ascii_lowercase())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    encode_hex(&hasher.finalize())
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn render_note_markdown(note: &NoteExport) -> Result<String, WorkspaceError> {
    let mut metadata = Map::new();
    metadata.insert("id".to_string(), Value::String(note.id.clone()));
    metadata.insert("title".to_string(), Value::String(note.title.clone()));
    metadata.insert(
        "materialId".to_string(),
        note.material_id.clone().map_or(Value::Null, Value::String),
    );
    metadata.insert(
        "subjectId".to_string(),
        note.subject_id.clone().map_or(Value::Null, Value::String),
    );
    metadata.insert(
        "createdAt".to_string(),
        Value::String(note.created_at.clone()),
    );
    metadata.insert(
        "updatedAt".to_string(),
        Value::String(note.updated_at.clone()),
    );
    let metadata = serde_json::to_string_pretty(&metadata).map_err(|error| {
        WorkspaceError::Serialization(format!("serializar metadados da nota: {error}"))
    })?;

    Ok(format!(
        "<!-- CursouCon note metadata\n{metadata}\n-->\n\n# {}\n\n{}\n",
        note.title, note.content_markdown
    ))
}

fn write_export_file(path: &Path, bytes: &[u8]) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta da exportação".to_string())
    })?;
    fs::create_dir_all(parent)
        .map_err(|error| map_io_error("preparar arquivo exportado", error))?;
    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome do arquivo exportado".to_string())
    })?;
    let temporary_path = parent.join(format!(
        ".{}.tmp-{}",
        file_name.to_string_lossy(),
        Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = File::create(&temporary_path)
            .map_err(|error| map_io_error("criar arquivo exportado", error))?;
        file.write_all(bytes)
            .map_err(|error| map_io_error("gravar arquivo exportado", error))?;
        file.sync_all()
            .map_err(|error| map_io_error("confirmar arquivo exportado", error))?;
        fs::rename(&temporary_path, path)
            .map_err(|error| map_io_error("publicar arquivo exportado", error))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn export_readme() -> &'static str {
    concat!(
        "# Exportação de dados CursouCon\n\n",
        "Este pacote é uma cópia legível dos dados do espaço no formato 1.\n\n",
        "- `data.json` contém o manifesto, os registros locais e referências relativas.\n",
        "- `notes/` contém uma nota Markdown por arquivo, com metadados em comentário HTML.\n",
        "- `attachments/` contém somente blobs referenciados e verificados por SHA-256.\n\n",
        "O banco SQLite ativo e caminhos locais da máquina não fazem parte deste pacote.\n",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::export_service::ExportStore;
    use crate::application::note_service::NoteStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::note::SaveNoteInput;
    use std::fs;

    #[test]
    fn exports_data_notes_and_verified_material_blob() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-data-export-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-data-export-app-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Exportação de teste")
            .expect("o espaço de fixture deve ser criado");

        let bytes = b"material de fixture";
        let hash = hash_bytes(bytes);
        let material_id = Uuid::new_v4().to_string();
        fs::write(workspace_path.join("blobs").join(&hash), bytes)
            .expect("o blob de fixture deve ser gravado");
        let connection = store
            .active_database()
            .expect("o banco ativo deve ser aberto");
        connection
            .execute(
                "INSERT INTO materials (id, original_name, content_hash, mime_type, byte_size)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    material_id.as_str(),
                    "apostila.txt",
                    hash.as_str(),
                    "text/plain",
                    bytes.len() as i64,
                ],
            )
            .expect("o material de fixture deve ser registrado");
        drop(connection);
        store
            .save_note(&SaveNoteInput {
                id: None,
                title: "Nota exportada".to_string(),
                content_markdown: "# Conteúdo\n\n- Item".to_string(),
                material_id: Some(material_id),
                subject_id: None,
            })
            .expect("a nota de fixture deve ser salva");

        let result = store
            .export_workspace_data()
            .expect("a exportação deve ser publicada");
        let package = Path::new(&result.path);
        let data = fs::read_to_string(package.join("data.json"))
            .expect("o JSON da exportação deve existir");
        let document: Value = serde_json::from_str(&data).expect("o JSON deve ser válido");
        assert_eq!(document["kind"], "cursoucon.data");
        assert_eq!(
            document["schemaVersion"],
            WORKSPACE_DATA_EXPORT_SCHEMA_VERSION
        );
        assert_eq!(result.exported_notes, 1);
        assert_eq!(result.exported_attachments, 1);
        assert_eq!(
            fs::read(package.join("attachments").join(&hash)).expect("o anexo deve existir"),
            bytes
        );
        let note_path = package.join("notes").join("0000.md");
        let note = fs::read_to_string(note_path).expect("a nota Markdown deve existir");
        assert!(note.contains("Nota exportada"));
        assert!(note.contains("Conteúdo"));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
