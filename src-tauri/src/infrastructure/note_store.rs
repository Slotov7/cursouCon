use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::note_service::NoteStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::note::{NoteSummary, SaveNoteInput};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

type NoteRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    String,
);

impl NoteStore for LocalWorkspaceStore {
    fn list_notes(&self) -> Result<Vec<NoteSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        load_notes(&connection)
    }

    fn save_note(&self, input: &SaveNoteInput) -> Result<NoteSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar gravação da nota", error))?;
        if let Some(material_id) = input.material_id.as_deref() {
            ensure_material_exists(&transaction, material_id)?;
        }
        if let Some(subject_id) = input.subject_id.as_deref() {
            ensure_subject_exists(&transaction, subject_id)?;
        }

        let note_id = if let Some(note_id) = input.id.as_deref() {
            let changed = transaction
                .execute(
                    "UPDATE notes
                     SET title = ?1, content_markdown = ?2, material_id = ?3,
                         subject_id = ?4, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?5",
                    params![
                        input.title.as_str(),
                        input.content_markdown.as_str(),
                        input.material_id.as_deref(),
                        input.subject_id.as_deref(),
                        note_id,
                    ],
                )
                .map_err(|error| map_database_error("atualizar nota", error))?;
            if changed == 0 {
                return Err(WorkspaceError::InvalidInput(
                    "A nota escolhida não existe mais.".to_string(),
                ));
            }
            note_id.to_string()
        } else {
            let note_id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO notes
                        (id, title, content_markdown, material_id, subject_id)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        note_id.as_str(),
                        input.title.as_str(),
                        input.content_markdown.as_str(),
                        input.material_id.as_deref(),
                        input.subject_id.as_deref(),
                    ],
                )
                .map_err(|error| map_database_error("gravar nota", error))?;
            note_id
        };

        let summary = load_note(&transaction, &note_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar gravação da nota", error))?;
        Ok(summary)
    }
}

fn load_notes(connection: &Connection) -> Result<Vec<NoteSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT n.id, n.title, n.content_markdown, n.material_id, n.subject_id,
                    m.original_name, s.name, n.created_at, n.updated_at
             FROM notes n
             LEFT JOIN materials m ON m.id = n.material_id
             LEFT JOIN subjects s ON s.id = n.subject_id
             ORDER BY n.updated_at DESC, n.id",
        )
        .map_err(|error| map_database_error("preparar leitura das notas", error))?;
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
            ))
        })
        .map_err(|error| map_database_error("consultar notas", error))?;

    rows.map(|row| {
        let parts: NoteRow = row.map_err(|error| map_database_error("ler nota", error))?;
        Ok(note_summary_from_parts(parts))
    })
    .collect()
}

fn load_note(connection: &Connection, note_id: &str) -> Result<NoteSummary, WorkspaceError> {
    let parts: NoteRow = connection
        .query_row(
            "SELECT n.id, n.title, n.content_markdown, n.material_id, n.subject_id,
                    m.original_name, s.name, n.created_at, n.updated_at
             FROM notes n
             LEFT JOIN materials m ON m.id = n.material_id
             LEFT JOIN subjects s ON s.id = n.subject_id
             WHERE n.id = ?1",
            params![note_id],
            |row| {
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
                ))
            },
        )
        .map_err(|error| map_database_error("localizar nota", error))?;

    Ok(note_summary_from_parts(parts))
}

fn note_summary_from_parts(parts: NoteRow) -> NoteSummary {
    let (
        id,
        title,
        content_markdown,
        material_id,
        subject_id,
        material_name,
        subject_name,
        created_at,
        updated_at,
    ) = parts;

    NoteSummary {
        id,
        title,
        content_markdown,
        material_id,
        subject_id,
        material_name,
        subject_name,
        created_at,
        updated_at,
    }
}

fn ensure_material_exists(
    transaction: &rusqlite::Transaction<'_>,
    material_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM materials WHERE id = ?1",
            params![material_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar material da nota", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O material escolhido para a nota não existe mais.".to_string(),
        ));
    }
    Ok(())
}

fn ensure_subject_exists(
    transaction: &rusqlite::Transaction<'_>,
    subject_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM subjects WHERE id = ?1 AND archived_at IS NULL",
            params![subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto da nota", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto escolhido para a nota não existe mais.".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::study_plan::{CreatePreparationInput, CreateSubjectInput};
    use std::fs;

    #[test]
    fn saves_and_updates_markdown_note_with_subject_link() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-note-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-note-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Notas de teste")
            .expect("o espaço de fixture deve ser criado");
        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação deve ser criada");
        let subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id,
                name: "Redes".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");

        let created = store
            .save_note(&SaveNoteInput {
                id: None,
                title: "TCP".to_string(),
                content_markdown: "# Handshake".to_string(),
                material_id: None,
                subject_id: Some(subject.id),
            })
            .expect("a nota deve ser criada");
        let updated = store
            .save_note(&SaveNoteInput {
                id: Some(created.id.clone()),
                title: "TCP revisado".to_string(),
                content_markdown: "# Handshake\n\n- SYN".to_string(),
                material_id: None,
                subject_id: created.subject_id.clone(),
            })
            .expect("a nota deve ser atualizada");
        let notes = store.list_notes().expect("as notas devem ser lidas");

        assert_eq!(notes.len(), 1);
        assert_eq!(updated.title, "TCP revisado");
        assert_eq!(notes[0].content_markdown, "# Handshake\n\n- SYN");
        assert_eq!(notes[0].subject_name.as_deref(), Some("Redes"));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
