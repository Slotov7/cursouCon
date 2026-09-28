use super::{map_database_error, map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::question_service::QuestionStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::question::{
    AnswerQuestionInput, AnswerQuestionResult, CreateNotebookInput, CreateQuestionInput,
    ListQuestionsInput, NotebookSummary, QuestionAttemptSummary, QuestionNotebookEntrySummary,
    QuestionOptionSummary, QuestionSummary, SetQuestionNotebookInput,
};
use crate::domain::question_transfer::{
    duplicate_external_id, export_item_from_summary, new_export_document, parse_question_document,
    question_content_hash, transfer_item_to_input, validate_attachment_reference,
    QuestionAttachmentReference, QuestionExportResult, QuestionImportIssue, QuestionImportPreview,
    QuestionImportResult, QuestionTransferItem,
};
use crate::domain::study::{calculate_question_xp, QUESTION_XP_RULES_VERSION};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_IMPORT_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ATTACHMENT_FILE_BYTES: u64 = 20 * 1024 * 1024;

struct PreparedAttachment {
    reference: QuestionAttachmentReference,
    bytes: Vec<u8>,
}

struct ImportCandidate {
    input: CreateQuestionInput,
    attachments: Vec<PreparedAttachment>,
}

impl QuestionStore for LocalWorkspaceStore {
    fn list_questions(
        &self,
        input: &ListQuestionsInput,
    ) -> Result<Vec<QuestionSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT q.id
                 FROM questions q
                 LEFT JOIN question_subjects qsub ON qsub.question_id = q.id
                 WHERE (?1 IS NULL OR qsub.subject_id = ?1)
                   AND (?2 IS NULL OR q.question_type = ?2)
                   AND (?3 IS NULL OR q.status = ?3)
                 GROUP BY q.id
                 ORDER BY q.updated_at DESC, q.id
                 LIMIT ?4 OFFSET ?5",
            )
            .map_err(|error| map_database_error("preparar lista de questões", error))?;
        let ids = statement
            .query_map(
                params![
                    input.subject_id.as_deref(),
                    input.question_type.as_deref(),
                    input.status.as_deref(),
                    input.limit,
                    input.offset,
                ],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| map_database_error("consultar questões", error))?
            .map(|row| {
                row.map_err(|error| map_database_error("ler identificador da questão", error))
            })
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        ids.into_iter()
            .map(|id| load_question(&connection, &id))
            .collect()
    }

    fn create_question(
        &self,
        input: &CreateQuestionInput,
    ) -> Result<QuestionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da questão", error))?;
        let question_id = insert_question(&transaction, input)?;

        let summary = load_question(&transaction, &question_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar criação da questão", error))?;
        Ok(summary)
    }

    fn list_notebooks(&self) -> Result<Vec<NotebookSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT n.id, n.name, n.kind, COUNT(nq.question_id), n.filter_json,
                        n.created_at, n.updated_at
                 FROM notebooks n
                 LEFT JOIN notebook_questions nq ON nq.notebook_id = n.id
                 GROUP BY n.id, n.name, n.kind, n.filter_json, n.created_at, n.updated_at
                 ORDER BY CASE n.kind WHEN 'error' THEN 0 ELSE 1 END, n.name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar lista de cadernos", error))?;
        let notebooks = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|error| map_database_error("consultar cadernos", error))?
            .map(|row| {
                let (id, name, kind, question_count, filter_json, created_at, updated_at) =
                    row.map_err(|error| map_database_error("ler caderno", error))?;
                Ok(NotebookSummary {
                    id,
                    name,
                    kind,
                    question_count,
                    filter: parse_notebook_filter(filter_json)?,
                    created_at,
                    updated_at,
                })
            })
            .collect();
        notebooks
    }

    fn create_notebook(
        &self,
        input: &CreateNotebookInput,
    ) -> Result<NotebookSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação do caderno", error))?;
        let notebook_id = Uuid::new_v4().to_string();
        let filter_json = input
            .filter
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| {
                WorkspaceError::Serialization(format!("serializar filtro: {error}"))
            })?;
        transaction
            .execute(
                "INSERT INTO notebooks (id, name, kind, filter_json)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    notebook_id.as_str(),
                    input.name.as_str(),
                    input.kind.as_str(),
                    filter_json.as_deref(),
                ],
            )
            .map_err(|error| map_database_error("gravar caderno", error))?;
        let notebook = load_notebook(&transaction, &notebook_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar criação do caderno", error))?;
        Ok(notebook)
    }

    fn answer_question(
        &self,
        input: &AnswerQuestionInput,
    ) -> Result<AnswerQuestionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar tentativa da questão", error))?;
        let question_data: Option<(Option<String>, String)> = transaction
            .query_row(
                "SELECT answer_key, status FROM questions WHERE id = ?1",
                params![input.question_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| map_database_error("localizar questão para tentativa", error))?;
        let Some((answer_key, status)) = question_data else {
            return Err(WorkspaceError::InvalidInput(
                "A questão escolhida não existe mais.".to_string(),
            ));
        };
        if status != "active" {
            return Err(WorkspaceError::InvalidInput(
                "A questão não está disponível para novas tentativas.".to_string(),
            ));
        }

        if let Some(selected_key) = input.selected_key.as_deref() {
            let option_exists: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM question_options
                     WHERE question_id = ?1 AND option_key = ?2",
                    params![input.question_id.as_str(), selected_key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("validar resposta da questão", error))?;
            if option_exists.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "A resposta escolhida não pertence à questão.".to_string(),
                ));
            }
        }

        let result = match answer_key.as_deref() {
            Some(correct_key) => match input.selected_key.as_deref() {
                Some(selected_key) if selected_key == correct_key => "correct",
                Some(_) => "incorrect",
                None => "blank",
            },
            None => "pending",
        };
        let xp_granted = grant_question_xp(&transaction, &input.question_id)?;
        let attempt_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO question_attempts
                    (id, question_id, selected_key, confidence, elapsed_seconds,
                     answer_key_at_attempt, result)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    attempt_id.as_str(),
                    input.question_id.as_str(),
                    input.selected_key.as_deref(),
                    input.confidence.as_str(),
                    input.elapsed_seconds,
                    answer_key.as_deref(),
                    result,
                ],
            )
            .map_err(|error| map_database_error("gravar tentativa da questão", error))?;

        let attempt = load_attempt(&transaction, &attempt_id)?;
        let question = load_question(&transaction, &input.question_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar tentativa da questão", error))?;

        Ok(AnswerQuestionResult {
            attempt,
            question,
            xp_granted,
        })
    }

    fn list_notebook_entries(
        &self,
        notebook_id: &str,
    ) -> Result<Vec<QuestionNotebookEntrySummary>, WorkspaceError> {
        let connection = self.active_database()?;
        load_notebook(&connection, notebook_id)?;
        let mut statement = connection
            .prepare(
                "SELECT question_id, notebook_id, reason, observation, added_at, updated_at
                 FROM notebook_questions
                 WHERE notebook_id = ?1
                 ORDER BY updated_at DESC, question_id",
            )
            .map_err(|error| map_database_error("preparar entradas do caderno", error))?;
        let entries = statement
            .query_map(params![notebook_id], |row| {
                Ok(QuestionNotebookEntrySummary {
                    question_id: row.get(0)?,
                    notebook_id: row.get(1)?,
                    reason: row.get(2)?,
                    observation: row.get(3)?,
                    added_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|error| map_database_error("consultar entradas do caderno", error))?
            .map(|row| row.map_err(|error| map_database_error("ler entrada do caderno", error)))
            .collect();
        entries
    }

    fn set_notebook_entry(&self, input: &SetQuestionNotebookInput) -> Result<bool, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar alteração do caderno", error))?;
        let question_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM questions WHERE id = ?1 AND status = 'active'",
                params![input.question_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar questão do caderno", error))?;
        if question_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A questão escolhida não existe ou não está ativa.".to_string(),
            ));
        }

        let notebook_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM notebooks WHERE id = ?1",
                params![input.notebook_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar caderno", error))?;
        if notebook_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "O caderno escolhido não existe neste espaço.".to_string(),
            ));
        }

        if input.included {
            transaction
                .execute(
                    "INSERT INTO notebook_questions
                        (notebook_id, question_id, reason, observation)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT (notebook_id, question_id) DO UPDATE SET
                        reason = excluded.reason,
                        observation = excluded.observation,
                        updated_at = CURRENT_TIMESTAMP",
                    params![
                        input.notebook_id.as_str(),
                        input.question_id.as_str(),
                        input.reason.as_deref(),
                        input.observation.as_deref(),
                    ],
                )
                .map_err(|error| map_database_error("adicionar questão ao caderno", error))?;
        } else {
            transaction
                .execute(
                    "DELETE FROM notebook_questions
                     WHERE notebook_id = ?1 AND question_id = ?2",
                    params![input.notebook_id.as_str(), input.question_id.as_str()],
                )
                .map_err(|error| map_database_error("remover questão do caderno", error))?;
        }

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar alteração do caderno", error))?;
        Ok(input.included)
    }

    fn preview_import(&self, source_path: &Path) -> Result<QuestionImportPreview, WorkspaceError> {
        let (bytes, file_hash) = read_import_file(source_path)?;
        let document = parse_question_document(&bytes).map_err(WorkspaceError::InvalidInput)?;
        let connection = self.active_database()?;
        let existing_hashes = load_question_hashes(&connection)?;
        let mut seen_hashes = HashSet::new();
        let mut seen_external_ids = HashSet::new();
        let mut issues = Vec::new();
        let mut valid = 0_i64;
        let mut duplicates = 0_i64;

        for (position, item_result) in document.questions.iter().enumerate() {
            let index = i64::try_from(position + 1).map_err(|_| {
                WorkspaceError::InvalidInput("O lote de questões é grande demais.".to_string())
            })?;
            let item = match item_result {
                Ok(item) => item,
                Err(message) => {
                    issues.push(QuestionImportIssue {
                        index,
                        kind: "invalid".to_string(),
                        external_id: None,
                        message: message.clone(),
                    });
                    continue;
                }
            };
            let external_id = item.external_id.clone();
            if let Err(message) = duplicate_external_id(&mut seen_external_ids, external_id.clone())
            {
                issues.push(QuestionImportIssue {
                    index,
                    kind: "invalid".to_string(),
                    external_id,
                    message,
                });
                continue;
            }
            let input = match transfer_item_to_input(item) {
                Ok(input) => input,
                Err(message) => {
                    issues.push(QuestionImportIssue {
                        index,
                        kind: "invalid".to_string(),
                        external_id,
                        message,
                    });
                    continue;
                }
            };
            if let Err(message) = prepare_item_attachments(&document.attachments, item, source_path)
            {
                issues.push(QuestionImportIssue {
                    index,
                    kind: "invalid".to_string(),
                    external_id,
                    message,
                });
                continue;
            }
            if let Some(subject_id) = input.subject_id.as_deref() {
                if !subject_exists(&connection, subject_id)? {
                    issues.push(QuestionImportIssue {
                        index,
                        kind: "invalid".to_string(),
                        external_id,
                        message: "O assunto referenciado não existe neste espaço.".to_string(),
                    });
                    continue;
                }
            }
            let content_hash =
                question_content_hash(&input).map_err(WorkspaceError::Serialization)?;
            if existing_hashes.contains(&content_hash) || !seen_hashes.insert(content_hash) {
                duplicates += 1;
                issues.push(QuestionImportIssue {
                    index,
                    kind: "duplicate".to_string(),
                    external_id,
                    message: "A questão já existe ou aparece repetida neste lote.".to_string(),
                });
                continue;
            }
            valid += 1;
        }

        let total = i64::try_from(document.questions.len()).map_err(|_| {
            WorkspaceError::InvalidInput("O lote de questões é grande demais.".to_string())
        })?;
        let invalid = total - valid - duplicates;
        Ok(QuestionImportPreview {
            schema_version: document.schema_version,
            total,
            valid,
            invalid,
            duplicates,
            file_hash,
            issues,
        })
    }

    fn import_questions(
        &self,
        source_path: &Path,
        expected_file_hash: &str,
    ) -> Result<QuestionImportResult, WorkspaceError> {
        let (bytes, file_hash) = read_import_file(source_path)?;
        if file_hash != expected_file_hash {
            return Err(WorkspaceError::InvalidInput(
                "O arquivo mudou depois da prévia; faça a prévia novamente.".to_string(),
            ));
        }
        let document = parse_question_document(&bytes).map_err(WorkspaceError::InvalidInput)?;
        let mut connection = self.active_database()?;
        let existing_hashes = load_question_hashes(&connection)?;
        let mut seen_hashes = HashSet::new();
        let mut seen_external_ids = HashSet::new();
        let mut candidates = Vec::new();
        let mut skipped_invalid = 0_i64;
        let mut skipped_duplicates = 0_i64;

        for item_result in &document.questions {
            let item = match item_result {
                Ok(item) => item,
                Err(_) => {
                    skipped_invalid += 1;
                    continue;
                }
            };
            if duplicate_external_id(&mut seen_external_ids, item.external_id.clone()).is_err() {
                skipped_invalid += 1;
                continue;
            }
            let input = match transfer_item_to_input(item) {
                Ok(input) => input,
                Err(_) => {
                    skipped_invalid += 1;
                    continue;
                }
            };
            let attachments =
                match prepare_item_attachments(&document.attachments, item, source_path) {
                    Ok(attachments) => attachments,
                    Err(_) => {
                        skipped_invalid += 1;
                        continue;
                    }
                };
            if let Some(subject_id) = input.subject_id.as_deref() {
                if !subject_exists(&connection, subject_id)? {
                    skipped_invalid += 1;
                    continue;
                }
            }
            let content_hash =
                question_content_hash(&input).map_err(WorkspaceError::Serialization)?;
            if existing_hashes.contains(&content_hash) || !seen_hashes.insert(content_hash) {
                skipped_duplicates += 1;
                continue;
            }
            candidates.push(ImportCandidate { input, attachments });
        }

        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        publish_import_attachments(&workspace.path, &candidates)?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar importação de questões", error))?;
        for candidate in &candidates {
            let question_id = insert_question(&transaction, &candidate.input)?;
            insert_question_attachments(&transaction, &question_id, &candidate.attachments)?;
        }
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar importação de questões", error))?;

        Ok(QuestionImportResult {
            imported: i64::try_from(candidates.len()).map_err(|_| {
                WorkspaceError::InvalidInput("O lote de questões é grande demais.".to_string())
            })?,
            skipped_invalid,
            skipped_duplicates,
        })
    }

    fn export_questions(&self) -> Result<QuestionExportResult, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare("SELECT id FROM questions WHERE status = 'active' ORDER BY id")
            .map_err(|error| map_database_error("preparar exportação de questões", error))?;
        let ids = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| map_database_error("consultar questões para exportação", error))?
            .map(|row| {
                row.map_err(|error| map_database_error("ler questão para exportação", error))
            })
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let export_id = Uuid::new_v4();
        let exports_directory = workspace.path.join("exports");
        fs::create_dir_all(&exports_directory)
            .map_err(|error| map_io_error("preparar pasta de exportações", error))?;
        let temporary_directory = exports_directory.join(format!(".questions-{export_id}.tmp"));
        let final_directory = exports_directory.join(format!("questions-{export_id}"));
        let result = (|| {
            fs::create_dir_all(temporary_directory.join("attachments"))
                .map_err(|error| map_io_error("preparar anexos da exportação", error))?;
            let mut attachment_map: HashMap<String, QuestionAttachmentReference> = HashMap::new();
            let mut questions = Vec::new();
            for id in &ids {
                let summary = load_question(&connection, id)?;
                let mut item = export_item_from_summary(&summary);
                for reference in load_question_attachments(&connection, id)? {
                    validate_attachment_reference(&reference)
                        .map_err(WorkspaceError::InvalidInput)?;
                    copy_blob_to_export(&workspace.path, &temporary_directory, &reference.sha256)?;
                    let export_reference = QuestionAttachmentReference {
                        id: reference.id.clone(),
                        sha256: reference.sha256.clone(),
                        relative_path: format!("attachments/{}", reference.sha256),
                    };
                    item.attachment_ids.push(export_reference.id.clone());
                    if let Some(existing) = attachment_map.get(&export_reference.id) {
                        if existing.sha256 != export_reference.sha256 {
                            return Err(WorkspaceError::Database(
                                "o mesmo identificador de anexo aponta para hashes diferentes"
                                    .to_string(),
                            ));
                        }
                    } else {
                        attachment_map.insert(export_reference.id.clone(), export_reference);
                    }
                }
                questions.push(item);
            }
            let mut attachments = attachment_map.into_values().collect::<Vec<_>>();
            attachments.sort_by(|left, right| left.id.cmp(&right.id));
            let document = new_export_document(questions, attachments);
            let serialized = serde_json::to_vec_pretty(&document).map_err(|error| {
                WorkspaceError::Serialization(format!("serializar exportação: {error}"))
            })?;
            let json_path = temporary_directory.join("questions.json");
            write_export_file(&json_path, &serialized)?;
            fs::rename(&temporary_directory, &final_directory)
                .map_err(|error| map_io_error("publicar pacote de exportação", error))?;
            Ok::<PathBuf, WorkspaceError>(final_directory.join("questions.json"))
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&temporary_directory);
        }
        let path = result?;
        let exported = i64::try_from(ids.len()).map_err(|_| {
            WorkspaceError::InvalidInput("Há questões demais para exportar.".to_string())
        })?;
        let path = path.to_str().ok_or_else(|| {
            WorkspaceError::Io("o caminho da exportação não é válido".to_string())
        })?;

        Ok(QuestionExportResult {
            path: path.to_string(),
            exported,
            schema_version: crate::domain::question_transfer::QUESTION_TRANSFER_SCHEMA_VERSION,
        })
    }
}

fn insert_question(
    transaction: &Transaction<'_>,
    input: &CreateQuestionInput,
) -> Result<String, WorkspaceError> {
    if let Some(subject_id) = input.subject_id.as_deref() {
        ensure_subject_exists(transaction, subject_id)?;
    }
    let content_hash = question_content_hash(input).map_err(WorkspaceError::Serialization)?;
    let question_id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO questions
                (id, question_type, statement_markdown, answer_key, explanation_markdown,
                 source_name, board, organization, role, exam_year, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                question_id.as_str(),
                input.question_type.as_str(),
                input.statement_markdown.as_str(),
                input.answer_key.as_deref(),
                input.explanation_markdown.as_deref(),
                input.source_name.as_deref(),
                input.board.as_deref(),
                input.organization.as_deref(),
                input.role.as_deref(),
                input.exam_year,
                content_hash.as_str(),
            ],
        )
        .map_err(|error| map_database_error("gravar questão", error))?;

    for (position, option) in input.options.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO question_options (question_id, option_key, option_text, position)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    question_id.as_str(),
                    option.key.as_str(),
                    option.text.as_str(),
                    i64::try_from(position).map_err(|_| {
                        WorkspaceError::InvalidInput(
                            "A questão tem alternativas demais.".to_string(),
                        )
                    })?,
                ],
            )
            .map_err(|error| map_database_error("gravar alternativa", error))?;
    }

    if let Some(subject_id) = input.subject_id.as_deref() {
        transaction
            .execute(
                "INSERT INTO question_subjects (question_id, subject_id)
                 VALUES (?1, ?2)",
                params![question_id.as_str(), subject_id],
            )
            .map_err(|error| map_database_error("vincular questão ao assunto", error))?;
    }

    Ok(question_id)
}

fn grant_question_xp(
    transaction: &Transaction<'_>,
    question_id: &str,
) -> Result<i64, WorkspaceError> {
    // O banco grava CURRENT_TIMESTAMP em UTC; a categoria usa esse mesmo dia UTC.
    let attempted_today: bool = transaction
        .query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM question_attempts
                 WHERE question_id = ?1 AND date(answered_at) = date('now')
             )",
            params![question_id],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("verificar primeira tentativa do dia", error))?;
    if attempted_today {
        return Ok(0);
    }

    let granted_today: i64 = transaction
        .query_row(
            "SELECT COALESCE(SUM(points), 0)
             FROM xp_events
             WHERE source_type = 'question_first_attempt'
               AND date(created_at) = date('now')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("calcular XP de questões do dia", error))?;
    let xp_granted = calculate_question_xp(granted_today);
    let today: String = transaction
        .query_row("SELECT date('now')", [], |row| row.get(0))
        .map_err(|error| map_database_error("calcular data do XP da questão", error))?;
    transaction
        .execute(
            "INSERT INTO xp_events (id, source_type, source_id, points, rules_version)
             VALUES (?1, 'question_first_attempt', ?2, ?3, ?4)",
            params![
                Uuid::new_v4().to_string(),
                format!("{question_id}:{today}"),
                xp_granted,
                QUESTION_XP_RULES_VERSION,
            ],
        )
        .map_err(|error| map_database_error("gravar XP da primeira tentativa", error))?;

    Ok(xp_granted)
}

fn read_import_file(source_path: &Path) -> Result<(Vec<u8>, String), WorkspaceError> {
    let metadata = fs::metadata(source_path)
        .map_err(|error| map_io_error("ler metadados do arquivo JSON", error))?;
    if !metadata.is_file() {
        return Err(WorkspaceError::InvalidInput(
            "O caminho escolhido não é um arquivo JSON.".to_string(),
        ));
    }
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err(WorkspaceError::InvalidInput(
            "O arquivo JSON excede o limite de 10 MB.".to_string(),
        ));
    }
    let bytes = fs::read(source_path)
        .map_err(|error| map_io_error("ler arquivo JSON de questões", error))?;
    let file_hash = format!("{:x}", Sha256::digest(&bytes));
    Ok((bytes, file_hash))
}

fn prepare_item_attachments(
    references: &[QuestionAttachmentReference],
    item: &QuestionTransferItem,
    source_path: &Path,
) -> Result<Vec<PreparedAttachment>, String> {
    let mut references_by_id = HashMap::new();
    for reference in references {
        references_by_id.insert(reference.id.as_str(), reference);
    }
    let mut seen_ids = HashSet::new();
    let mut prepared = Vec::new();
    for attachment_id in &item.attachment_ids {
        if !seen_ids.insert(attachment_id.as_str()) {
            return Err("A questão referencia o mesmo anexo mais de uma vez.".to_string());
        }
        let reference = references_by_id
            .get(attachment_id.as_str())
            .ok_or_else(|| "A questão referencia um anexo que não existe no pacote.".to_string())?;
        let attachment_path = resolve_attachment_path(source_path, &reference.relative_path)?;
        let metadata = fs::metadata(&attachment_path)
            .map_err(|_| "Um anexo referenciado não foi encontrado no pacote.".to_string())?;
        if !metadata.is_file() {
            return Err("Um anexo referenciado não é um arquivo regular.".to_string());
        }
        if metadata.len() > MAX_ATTACHMENT_FILE_BYTES {
            return Err("Um anexo excede o limite de 20 MB.".to_string());
        }
        let bytes = fs::read(&attachment_path)
            .map_err(|_| "Não foi possível ler um anexo referenciado.".to_string())?;
        let actual_hash = format!("{:x}", Sha256::digest(&bytes));
        if !actual_hash.eq_ignore_ascii_case(&reference.sha256) {
            return Err("O SHA-256 de um anexo não corresponde ao arquivo.".to_string());
        }
        let mut normalized_reference = (*reference).clone();
        normalized_reference.sha256 = actual_hash;
        prepared.push(PreparedAttachment {
            reference: normalized_reference,
            bytes,
        });
    }
    Ok(prepared)
}

fn resolve_attachment_path(source_path: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let base_directory = source_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let canonical_base = fs::canonicalize(base_directory)
        .map_err(|_| "Não foi possível acessar a pasta do pacote.".to_string())?;
    let candidate = base_directory.join(relative_path);
    let canonical_candidate = fs::canonicalize(candidate)
        .map_err(|_| "Um anexo referenciado não foi encontrado no pacote.".to_string())?;
    if !canonical_candidate.starts_with(&canonical_base) {
        return Err("O anexo escapa da pasta do pacote.".to_string());
    }
    Ok(canonical_candidate)
}

fn publish_import_attachments(
    workspace_path: &Path,
    candidates: &[ImportCandidate],
) -> Result<(), WorkspaceError> {
    let blobs_directory = workspace_path.join("blobs");
    fs::create_dir_all(&blobs_directory)
        .map_err(|error| map_io_error("preparar anexos importados", error))?;
    for candidate in candidates {
        for attachment in &candidate.attachments {
            let target = blobs_directory.join(&attachment.reference.sha256);
            if target.exists() {
                let existing = fs::read(&target)
                    .map_err(|error| map_io_error("validar anexo existente", error))?;
                let existing_hash = format!("{:x}", Sha256::digest(&existing));
                if existing_hash != attachment.reference.sha256 {
                    return Err(WorkspaceError::Io(
                        "o blob existente não corresponde ao SHA-256 do anexo".to_string(),
                    ));
                }
                continue;
            }
            write_export_file(&target, &attachment.bytes)?;
        }
    }
    Ok(())
}

fn insert_question_attachments(
    transaction: &Transaction<'_>,
    question_id: &str,
    attachments: &[PreparedAttachment],
) -> Result<(), WorkspaceError> {
    for attachment in attachments {
        transaction
            .execute(
                "INSERT INTO question_attachments
                    (question_id, attachment_id, sha256, relative_path)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    question_id,
                    attachment.reference.id.as_str(),
                    attachment.reference.sha256.as_str(),
                    attachment.reference.relative_path.as_str(),
                ],
            )
            .map_err(|error| map_database_error("vincular anexo à questão", error))?;
    }
    Ok(())
}

fn load_question_attachments(
    connection: &Connection,
    question_id: &str,
) -> Result<Vec<QuestionAttachmentReference>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT attachment_id, sha256, relative_path
             FROM question_attachments
             WHERE question_id = ?1
             ORDER BY attachment_id",
        )
        .map_err(|error| map_database_error("preparar anexos da questão", error))?;
    let attachments = statement
        .query_map(params![question_id], |row| {
            Ok(QuestionAttachmentReference {
                id: row.get(0)?,
                sha256: row.get(1)?,
                relative_path: row.get(2)?,
            })
        })
        .map_err(|error| map_database_error("consultar anexos da questão", error))?
        .map(|row| row.map_err(|error| map_database_error("ler anexo da questão", error)))
        .collect();
    attachments
}

fn copy_blob_to_export(
    workspace_path: &Path,
    temporary_directory: &Path,
    sha256: &str,
) -> Result<(), WorkspaceError> {
    let source = workspace_path.join("blobs").join(sha256);
    let bytes =
        fs::read(&source).map_err(|error| map_io_error("ler anexo para exportação", error))?;
    let actual_hash = format!("{:x}", Sha256::digest(&bytes));
    if actual_hash != sha256 {
        return Err(WorkspaceError::Io(
            "o anexo local não corresponde ao SHA-256 registrado".to_string(),
        ));
    }
    let target = temporary_directory.join("attachments").join(sha256);
    if !target.exists() {
        write_export_file(&target, &bytes)?;
    }
    Ok(())
}

fn load_question_hashes(connection: &Connection) -> Result<HashSet<String>, WorkspaceError> {
    let mut statement = connection
        .prepare("SELECT id, content_hash FROM questions")
        .map_err(|error| map_database_error("preparar hashes de questões", error))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|error| map_database_error("consultar hashes de questões", error))?;
    let mut hashes = HashSet::new();
    for row in rows {
        let (id, persisted_hash) =
            row.map_err(|error| map_database_error("ler hash de questão", error))?;
        if let Some(hash) = persisted_hash {
            hashes.insert(hash);
            continue;
        }

        let summary = load_question(connection, &id)?;
        let input = question_input_from_summary(&summary);
        let hash = question_content_hash(&input).map_err(WorkspaceError::Serialization)?;
        hashes.insert(hash);
    }
    Ok(hashes)
}

fn question_input_from_summary(summary: &QuestionSummary) -> CreateQuestionInput {
    CreateQuestionInput {
        question_type: summary.question_type.clone(),
        statement_markdown: summary.statement_markdown.clone(),
        options: summary
            .options
            .iter()
            .map(|option| crate::domain::question::QuestionOptionInput {
                key: option.key.clone(),
                text: option.text.clone(),
            })
            .collect(),
        answer_key: summary.answer_key.clone(),
        explanation_markdown: summary.explanation_markdown.clone(),
        source_name: summary.source_name.clone(),
        board: summary.board.clone(),
        organization: summary.organization.clone(),
        role: summary.role.clone(),
        exam_year: summary.exam_year,
        subject_id: summary.subject_id.clone(),
    }
}

fn write_export_file(path: &Path, bytes: &[u8]) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta da exportação".to_string())
    })?;
    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome da exportação".to_string())
    })?;
    let temporary_path = parent.join(format!(
        ".{}.tmp-{}",
        file_name.to_string_lossy(),
        Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = File::create(&temporary_path)
            .map_err(|error| map_io_error("criar exportação temporária", error))?;
        file.write_all(bytes)
            .map_err(|error| map_io_error("gravar exportação", error))?;
        file.sync_all()
            .map_err(|error| map_io_error("confirmar exportação", error))?;
        fs::rename(&temporary_path, path)
            .map_err(|error| map_io_error("publicar exportação", error))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn load_notebook(
    connection: &Connection,
    notebook_id: &str,
) -> Result<NotebookSummary, WorkspaceError> {
    connection
        .query_row(
            "SELECT n.id, n.name, n.kind,
                    (SELECT COUNT(*) FROM notebook_questions nq WHERE nq.notebook_id = n.id),
                    n.filter_json, n.created_at, n.updated_at
             FROM notebooks n
             WHERE n.id = ?1",
            params![notebook_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler caderno", error))?
        .ok_or_else(|| WorkspaceError::InvalidInput("O caderno escolhido não existe.".to_string()))
        .and_then(
            |(id, name, kind, question_count, filter_json, created_at, updated_at)| {
                Ok(NotebookSummary {
                    id,
                    name,
                    kind,
                    question_count,
                    filter: parse_notebook_filter(filter_json)?,
                    created_at,
                    updated_at,
                })
            },
        )
}

fn parse_notebook_filter(
    filter_json: Option<String>,
) -> Result<Option<crate::domain::question::NotebookFilter>, WorkspaceError> {
    filter_json
        .map(|value| {
            serde_json::from_str(&value).map_err(|error| {
                WorkspaceError::Database(format!("filtro de caderno inválido: {error}"))
            })
        })
        .transpose()
}

fn load_question(
    connection: &Connection,
    question_id: &str,
) -> Result<QuestionSummary, WorkspaceError> {
    let question = connection
        .query_row(
            "SELECT q.id, q.question_type, q.statement_markdown, q.answer_key,
                    q.explanation_markdown, q.source_name, q.board, q.organization, q.role,
                    q.exam_year, qsub.subject_id, s.name, q.status,
                    (SELECT COUNT(*) FROM question_attempts qa WHERE qa.question_id = q.id),
                    (SELECT qa.result FROM question_attempts qa
                     WHERE qa.question_id = q.id
                     ORDER BY qa.answered_at ASC, qa.id ASC LIMIT 1),
                    (SELECT qa.result FROM question_attempts qa
                     WHERE qa.question_id = q.id
                     ORDER BY qa.answered_at DESC, qa.id DESC LIMIT 1)
             FROM questions q
             LEFT JOIN question_subjects qsub ON qsub.question_id = q.id
             LEFT JOIN subjects s ON s.id = qsub.subject_id
             WHERE q.id = ?1
             LIMIT 1",
            params![question_id],
            |row| {
                Ok(QuestionSummary {
                    id: row.get(0)?,
                    question_type: row.get(1)?,
                    statement_markdown: row.get(2)?,
                    options: Vec::new(),
                    answer_key: row.get(3)?,
                    explanation_markdown: row.get(4)?,
                    source_name: row.get(5)?,
                    board: row.get(6)?,
                    organization: row.get(7)?,
                    role: row.get(8)?,
                    exam_year: row.get(9)?,
                    subject_id: row.get(10)?,
                    subject_name: row.get(11)?,
                    status: row.get(12)?,
                    attempts_count: row.get(13)?,
                    first_attempt_result: row.get(14)?,
                    last_attempt_result: row.get(15)?,
                })
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler questão", error))?
        .ok_or_else(|| WorkspaceError::Database("a questão não foi localizada".to_string()))?;

    let mut statement = connection
        .prepare(
            "SELECT option_key, option_text
             FROM question_options
             WHERE question_id = ?1
             ORDER BY position, option_key",
        )
        .map_err(|error| map_database_error("preparar alternativas da questão", error))?;
    let options = statement
        .query_map(params![question_id], |row| {
            Ok(QuestionOptionSummary {
                key: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|error| map_database_error("consultar alternativas da questão", error))?
        .map(|row| row.map_err(|error| map_database_error("ler alternativa da questão", error)))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(QuestionSummary {
        options,
        ..question
    })
}

fn load_attempt(
    connection: &Connection,
    attempt_id: &str,
) -> Result<QuestionAttemptSummary, WorkspaceError> {
    connection
        .query_row(
            "SELECT id, question_id, selected_key, confidence, elapsed_seconds,
                    answer_key_at_attempt, result, answered_at
             FROM question_attempts
             WHERE id = ?1",
            params![attempt_id],
            |row| {
                Ok(QuestionAttemptSummary {
                    id: row.get(0)?,
                    question_id: row.get(1)?,
                    selected_key: row.get(2)?,
                    confidence: row.get(3)?,
                    elapsed_seconds: row.get(4)?,
                    answer_key_at_attempt: row.get(5)?,
                    result: row.get(6)?,
                    answered_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| map_database_error("ler tentativa da questão", error))
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
        .map_err(|error| map_database_error("verificar assunto da questão", error))?;
    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto escolhido para a questão não existe mais.".to_string(),
        ));
    }
    Ok(())
}

fn subject_exists(connection: &Connection, subject_id: &str) -> Result<bool, WorkspaceError> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM subjects WHERE id = ?1 AND archived_at IS NULL",
            params![subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto da questão", error))?;
    Ok(exists.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::question_service::QuestionStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::question::{NotebookFilter, QuestionOptionInput, ERROR_NOTEBOOK_ID};
    use crate::domain::question_transfer::{
        QuestionAttachmentReference, QuestionExportDocument, QuestionTransferItem,
        QuestionTransferOption, QUESTION_TRANSFER_KIND, QUESTION_TRANSFER_SCHEMA_VERSION,
    };
    use crate::domain::study_plan::{CreatePreparationInput, CreateSubjectInput};
    use sha2::{Digest, Sha256};
    use std::fs;

    #[test]
    fn creates_question_and_keeps_each_attempt() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-question-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-question-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Questões de teste")
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
        let question = store
            .create_question(&CreateQuestionInput {
                question_type: "multiple_choice".to_string(),
                statement_markdown: "Qual protocolo?".to_string(),
                options: vec![
                    QuestionOptionInput {
                        key: "A".to_string(),
                        text: "TCP".to_string(),
                    },
                    QuestionOptionInput {
                        key: "B".to_string(),
                        text: "UDP".to_string(),
                    },
                ],
                answer_key: Some("A".to_string()),
                explanation_markdown: None,
                source_name: None,
                board: None,
                organization: None,
                role: None,
                exam_year: None,
                subject_id: Some(subject.id),
            })
            .expect("a questão deve ser criada");
        let first = store
            .answer_question(&AnswerQuestionInput {
                question_id: question.id.clone(),
                selected_key: Some("B".to_string()),
                confidence: "doubt".to_string(),
                elapsed_seconds: 12,
            })
            .expect("a primeira tentativa deve ser salva");
        let second = store
            .answer_question(&AnswerQuestionInput {
                question_id: question.id.clone(),
                selected_key: Some("A".to_string()),
                confidence: "certain".to_string(),
                elapsed_seconds: 8,
            })
            .expect("a repetição deve ser salva");

        assert_eq!(first.attempt.result, "incorrect");
        assert_eq!(second.attempt.result, "correct");
        assert_eq!(first.xp_granted, 2);
        assert_eq!(second.xp_granted, 0);
        assert_eq!(second.question.attempts_count, 2);

        assert!(store
            .list_notebook_entries(ERROR_NOTEBOOK_ID)
            .expect("o caderno deve iniciar vazio")
            .is_empty());
        assert!(store
            .set_notebook_entry(&SetQuestionNotebookInput {
                notebook_id: ERROR_NOTEBOOK_ID.to_string(),
                question_id: question.id.clone(),
                included: true,
                reason: Some("content".to_string()),
                observation: Some("Revisar o conceito antes da próxima sessão.".to_string()),
            })
            .expect("a questão deve entrar no caderno"));
        let notebook_entries = store
            .list_notebook_entries(ERROR_NOTEBOOK_ID)
            .expect("o caderno deve listar a questão");
        assert_eq!(notebook_entries.len(), 1);
        assert_eq!(notebook_entries[0].reason.as_deref(), Some("content"));
        assert_eq!(
            notebook_entries[0].observation.as_deref(),
            Some("Revisar o conceito antes da próxima sessão.")
        );
        assert!(!store
            .set_notebook_entry(&SetQuestionNotebookInput {
                notebook_id: ERROR_NOTEBOOK_ID.to_string(),
                question_id: question.id.clone(),
                included: false,
                reason: None,
                observation: None,
            })
            .expect("a questão deve sair do caderno"));
        assert!(store
            .list_notebook_entries(ERROR_NOTEBOOK_ID)
            .expect("o caderno deve continuar disponível")
            .is_empty());

        let manual_notebook = store
            .create_notebook(&CreateNotebookInput {
                name: "Revisar Redes".to_string(),
                kind: "manual".to_string(),
                filter: None,
            })
            .expect("o caderno manual deve ser criado");
        assert_eq!(manual_notebook.kind, "manual");
        assert!(store
            .set_notebook_entry(&SetQuestionNotebookInput {
                notebook_id: manual_notebook.id.clone(),
                question_id: question.id.clone(),
                included: true,
                reason: None,
                observation: None,
            })
            .expect("a questão deve entrar no caderno manual"));
        assert_eq!(
            store
                .list_notebook_entries(&manual_notebook.id)
                .expect("o caderno manual deve listar a questão")
                .len(),
            1
        );

        let dynamic_notebook = store
            .create_notebook(&CreateNotebookInput {
                name: "Erros de Redes".to_string(),
                kind: "dynamic".to_string(),
                filter: Some(NotebookFilter {
                    subject_id: question.subject_id.clone(),
                    question_type: Some("multiple_choice".to_string()),
                    attempt_status: "incorrect".to_string(),
                }),
            })
            .expect("o caderno dinâmico deve ser criado");
        assert_eq!(dynamic_notebook.kind, "dynamic");
        assert_eq!(
            dynamic_notebook
                .filter
                .expect("o filtro dinâmico deve ser persistido")
                .attempt_status,
            "incorrect"
        );

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn previews_imports_duplicates_and_exports_versioned_questions() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-question-transfer-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!(
            "cursoucon-question-transfer-data-{}",
            Uuid::new_v4()
        ));
        let json_path = std::env::temp_dir().join(format!(
            "cursoucon-question-transfer-file-{}.json",
            Uuid::new_v4()
        ));
        let attachment_path = json_path.with_file_name("fixture-question-image.txt");
        let attachment_bytes = b"imagem sintetica do fixture";
        let attachment_hash = format!("{:x}", Sha256::digest(attachment_bytes));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Importação de questões")
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
                name: "Direito".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let document = QuestionExportDocument {
            schema_version: QUESTION_TRANSFER_SCHEMA_VERSION,
            kind: QUESTION_TRANSFER_KIND,
            collection_id: Uuid::new_v4().to_string(),
            source: "fixture".to_string(),
            attachments: vec![QuestionAttachmentReference {
                id: "image-1".to_string(),
                sha256: attachment_hash.clone(),
                relative_path: "fixture-question-image.txt".to_string(),
            }],
            questions: vec![QuestionTransferItem {
                external_id: Some("fixture-1".to_string()),
                question_type: "multiple_choice".to_string(),
                statement_markdown: "Qual protocolo é orientado a conexão?".to_string(),
                options: vec![
                    QuestionTransferOption {
                        key: "A".to_string(),
                        text: "TCP".to_string(),
                    },
                    QuestionTransferOption {
                        key: "B".to_string(),
                        text: "UDP".to_string(),
                    },
                ],
                answer_key: Some("A".to_string()),
                explanation_markdown: None,
                source_name: Some("fixture".to_string()),
                board: None,
                organization: None,
                role: None,
                exam_year: Some(2026),
                subject_id: Some(subject.id),
                attachment_ids: vec!["image-1".to_string()],
            }],
        };
        fs::write(&attachment_path, attachment_bytes).expect("o anexo deve ser gravado");
        fs::write(
            &json_path,
            serde_json::to_vec(&document).expect("o fixture deve ser serializável"),
        )
        .expect("o JSON deve ser gravado");

        let preview = store
            .preview_import(&json_path)
            .expect("a prévia deve validar o lote");
        assert_eq!(preview.total, 1);
        assert_eq!(preview.valid, 1);
        assert_eq!(preview.invalid, 0);
        assert_eq!(preview.duplicates, 0);

        let imported = store
            .import_questions(&json_path, &preview.file_hash)
            .expect("o lote deve ser importado");
        assert_eq!(imported.imported, 1);
        assert_eq!(imported.skipped_duplicates, 0);
        assert!(workspace_path
            .join("blobs")
            .join(&attachment_hash)
            .is_file());

        let duplicate_preview = store
            .preview_import(&json_path)
            .expect("a prévia repetida deve funcionar");
        assert_eq!(duplicate_preview.valid, 0);
        assert_eq!(duplicate_preview.duplicates, 1);

        let export = store
            .export_questions()
            .expect("a exportação deve ser gravada");
        assert_eq!(export.schema_version, QUESTION_TRANSFER_SCHEMA_VERSION);
        assert_eq!(export.exported, 1);
        assert!(std::path::Path::new(&export.path).is_file());
        assert!(std::path::Path::new(&export.path)
            .parent()
            .expect("a exportação deve estar em uma pasta")
            .join("attachments")
            .join(&attachment_hash)
            .is_file());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_file(json_path);
        let _ = fs::remove_file(attachment_path);
        let _ = fs::remove_dir_all(
            std::path::Path::new(&export.path)
                .parent()
                .expect("a exportação deve estar em uma pasta"),
        );
    }
}
