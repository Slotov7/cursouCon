use super::{map_database_error, map_io_error, workspace_store::LocalWorkspaceStore};
use crate::application::question_service::QuestionStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::question::{
    AnswerQuestionInput, AnswerQuestionResult, CreateExternalQuestionBatchInput,
    CreateNotebookInput, CreateQuestionInput, ExternalQuestionBatchSummary, ListQuestionsInput,
    NotebookSummary, QuestionAttemptSummary, QuestionContestRelationSummary,
    QuestionNotebookEntrySummary, QuestionOptionSummary, QuestionPerformanceSummary,
    QuestionRevisionSummary, QuestionSummary, ReviseQuestionInput, ReviseQuestionResult,
    SetQuestionContestRelationInput, SetQuestionNotebookInput,
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
                "WITH candidates AS (
                     SELECT q.id, q.updated_at,
                            (SELECT COUNT(*) FROM question_attempts a WHERE a.question_id = q.id) AS attempt_count,
                            (SELECT a.result FROM question_attempts a WHERE a.question_id = q.id
                             ORDER BY a.answered_at, a.rowid LIMIT 1) AS first_result,
                            (SELECT a.result FROM question_attempts a WHERE a.question_id = q.id
                             ORDER BY a.answered_at DESC, a.rowid DESC LIMIT 1) AS last_result
                     FROM questions q
                     WHERE (?1 IS NULL OR EXISTS (
                         SELECT 1 FROM question_subjects qs WHERE qs.question_id = q.id AND qs.subject_id = ?1
                     ))
                       AND (?2 IS NULL OR q.question_type = ?2)
                       AND (?3 IS NULL OR q.status = ?3)
                       AND (?4 IS NULL OR q.board = ?4 COLLATE NOCASE)
                       AND (?5 IS NULL OR q.exam_year = ?5)
                       AND (?6 IS NULL OR EXISTS (
                         SELECT 1 FROM notebook_questions nq WHERE nq.question_id = q.id AND nq.notebook_id = ?6
                     ))
                       AND (?7 IS NULL OR INSTR(LOWER(q.statement_markdown), LOWER(?7)) > 0
                         OR INSTR(LOWER(COALESCE(q.board, '')), LOWER(?7)) > 0
                         OR INSTR(LOWER(COALESCE(q.organization, '')), LOWER(?7)) > 0
                         OR INSTR(LOWER(COALESCE(q.role, '')), LOWER(?7)) > 0
                         OR EXISTS (
                             SELECT 1 FROM question_subjects qs
                             JOIN subjects s ON s.id = qs.subject_id
                             WHERE qs.question_id = q.id AND INSTR(LOWER(s.name), LOWER(?7)) > 0
                         ))
                 )
                 SELECT id FROM candidates
                 WHERE (?8 IS NULL
                     OR (?8 = 'unanswered' AND attempt_count = 0)
                     OR (?8 = 'answered' AND attempt_count > 0)
                     OR (?8 = 'repeated' AND attempt_count > 1)
                     OR (?8 = 'first_correct' AND first_result = 'correct')
                     OR (?8 = 'first_incorrect' AND first_result = 'incorrect')
                     OR (?8 = 'last_correct' AND last_result = 'correct')
                     OR (?8 = 'last_incorrect' AND last_result = 'incorrect'))
                 ORDER BY updated_at DESC, id
                 LIMIT ?9 OFFSET ?10",
            )
            .map_err(|error| map_database_error("preparar lista de questões", error))?;
        let ids = statement
            .query_map(
                params![
                    input.subject_id.as_deref(),
                    input.question_type.as_deref(),
                    input.status.as_deref(),
                    input.board.as_deref(),
                    input.exam_year,
                    input.notebook_id.as_deref(),
                    input.search_text.as_deref(),
                    input.attempt_status.as_deref(),
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

    fn create_external_question_batch(
        &self,
        input: &CreateExternalQuestionBatchInput,
    ) -> Result<ExternalQuestionBatchSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar registro do lote externo", error))?;
        let preparation_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
                params![input.preparation_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar preparação do lote", error))?;
        if preparation_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A preparação escolhida não existe mais.".to_string(),
            ));
        }
        if let Some(subject_id) = input.subject_id.as_deref() {
            let subject_exists: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM subjects
                     WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
                    params![subject_id, input.preparation_id.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("validar assunto do lote", error))?;
            if subject_exists.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "O assunto escolhido não pertence à preparação.".to_string(),
                ));
            }
        }

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO external_question_batches
                    (id, preparation_id, subject_id, source_name, studied_on, answered_count, correct_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id.as_str(), input.preparation_id.as_str(), input.subject_id.as_deref(),
                    input.source_name.as_deref(), input.studied_on.as_str(),
                    input.answered_count, input.correct_count],
            )
            .map_err(|error| map_database_error("gravar lote externo", error))?;
        let saved = load_external_batch(&transaction, &id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar lote externo", error))?;
        Ok(saved)
    }

    fn list_external_question_batches(
        &self,
    ) -> Result<Vec<ExternalQuestionBatchSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT b.id, b.preparation_id, p.name, b.subject_id, s.name,
                        b.source_name, b.studied_on, b.answered_count, b.correct_count, b.created_at
                 FROM external_question_batches b
                 JOIN preparations p ON p.id = b.preparation_id
                 LEFT JOIN subjects s ON s.id = b.subject_id
                 ORDER BY b.studied_on DESC, b.created_at DESC, b.id DESC
                 LIMIT 20",
            )
            .map_err(|error| map_database_error("preparar lista de lotes externos", error))?;
        let rows = statement
            .query_map([], read_external_batch_row)
            .map_err(|error| map_database_error("consultar lotes externos", error))?;
        rows.map(|row| row.map_err(|error| map_database_error("ler lote externo", error)))
            .collect()
    }

    fn question_performance(
        &self,
        as_of_date: &str,
    ) -> Result<QuestionPerformanceSummary, WorkspaceError> {
        let connection = self.active_database()?;
        let (first_attempt_graded, first_attempt_correct, repeat_graded, repeat_correct): (i64, i64, i64, i64) = connection
            .query_row(
                "WITH ranked AS (
                     SELECT a.result,
                            ROW_NUMBER() OVER (PARTITION BY a.question_id ORDER BY a.answered_at, a.rowid) AS ordinal
                     FROM question_attempts a
                     JOIN questions q ON q.id = a.question_id
                     WHERE q.status <> 'annulled' AND date(a.answered_at) <= ?1
                 )
                 SELECT COALESCE(SUM(CASE WHEN ordinal = 1 AND result IN ('correct', 'incorrect') THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN ordinal = 1 AND result = 'correct' THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN ordinal > 1 AND result IN ('correct', 'incorrect') THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN ordinal > 1 AND result = 'correct' THEN 1 ELSE 0 END), 0)
                 FROM ranked",
                params![as_of_date],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| map_database_error("calcular desempenho das tentativas", error))?;
        let (external_batches, external_answered, external_correct): (i64, i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(answered_count), 0), COALESCE(SUM(correct_count), 0)
                 FROM external_question_batches WHERE studied_on <= ?1",
                params![as_of_date],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| map_database_error("calcular desempenho externo", error))?;
        Ok(QuestionPerformanceSummary {
            as_of_date: as_of_date.to_string(),
            first_attempt_graded,
            first_attempt_correct,
            repeat_graded,
            repeat_correct,
            external_batches,
            external_answered,
            external_correct,
        })
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

    fn revise_question(
        &self,
        input: &ReviseQuestionInput,
    ) -> Result<ReviseQuestionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar revisão da questão", error))?;
        let question_data: Option<(Option<String>, String)> = transaction
            .query_row(
                "SELECT answer_key, status FROM questions WHERE id = ?1",
                params![input.question_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| map_database_error("localizar questão para revisão", error))?;
        let Some((previous_answer_key, previous_status)) = question_data else {
            return Err(WorkspaceError::InvalidInput(
                "A questão escolhida não existe mais.".to_string(),
            ));
        };

        if let Some(answer_key) = input.answer_key.as_deref() {
            let option_exists: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM question_options
                     WHERE question_id = ?1 AND option_key = ?2",
                    params![input.question_id.as_str(), answer_key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("validar novo gabarito", error))?;
            if option_exists.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "O novo gabarito precisa apontar para uma alternativa existente.".to_string(),
                ));
            }
        }

        let answer_key_changed = previous_answer_key != input.answer_key;
        if answer_key_changed && input.status != "answer_changed" {
            return Err(WorkspaceError::InvalidInput(
                "Uma alteração de gabarito precisa usar a situação 'gabarito alterado'."
                    .to_string(),
            ));
        }
        if input.status == "answer_changed" && !answer_key_changed {
            return Err(WorkspaceError::InvalidInput(
                "Informe um gabarito diferente para marcar a questão como alterada.".to_string(),
            ));
        }
        if previous_status == input.status && !answer_key_changed {
            return Err(WorkspaceError::InvalidInput(
                "A questão já está com essa situação e esse gabarito.".to_string(),
            ));
        }

        let revision_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO question_revisions
                    (id, question_id, previous_answer_key, current_answer_key,
                     previous_status, current_status, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    revision_id.as_str(),
                    input.question_id.as_str(),
                    previous_answer_key.as_deref(),
                    input.answer_key.as_deref(),
                    previous_status.as_str(),
                    input.status.as_str(),
                    input.reason.as_str(),
                ],
            )
            .map_err(|error| map_database_error("gravar revisão da questão", error))?;
        transaction
            .execute(
                "UPDATE questions
                 SET answer_key = ?1, status = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?3",
                params![
                    input.answer_key.as_deref(),
                    input.status.as_str(),
                    input.question_id.as_str(),
                ],
            )
            .map_err(|error| map_database_error("atualizar questão revisada", error))?;

        let revision = transaction
            .query_row(
                "SELECT id, question_id, previous_answer_key, current_answer_key,
                        previous_status, current_status, reason, changed_at
                 FROM question_revisions WHERE id = ?1",
                params![revision_id.as_str()],
                |row| {
                    Ok(QuestionRevisionSummary {
                        id: row.get(0)?,
                        question_id: row.get(1)?,
                        previous_answer_key: row.get(2)?,
                        current_answer_key: row.get(3)?,
                        previous_status: row.get(4)?,
                        current_status: row.get(5)?,
                        reason: row.get(6)?,
                        changed_at: row.get(7)?,
                    })
                },
            )
            .map_err(|error| map_database_error("ler revisão da questão", error))?;
        let question = load_question(&transaction, &input.question_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar revisão da questão", error))?;

        Ok(ReviseQuestionResult {
            question,
            revision: Some(revision),
        })
    }

    fn set_question_contest_relation(
        &self,
        input: &SetQuestionContestRelationInput,
    ) -> Result<QuestionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar vínculo da questão", error))?;
        let question_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM questions WHERE id = ?1",
                params![input.question_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar questão do concurso", error))?;
        if question_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A questão escolhida não existe mais.".to_string(),
            ));
        }
        let contest_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM manual_contests WHERE id = ?1",
                params![input.contest_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar concurso da questão", error))?;
        if contest_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "O concurso escolhido não existe mais.".to_string(),
            ));
        }

        if input.included {
            transaction
                .execute(
                    "INSERT INTO question_contest_relations
                        (question_id, contest_id, relation_type)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(question_id, contest_id) DO UPDATE SET
                        relation_type = excluded.relation_type,
                        updated_at = CURRENT_TIMESTAMP",
                    params![
                        input.question_id.as_str(),
                        input.contest_id.as_str(),
                        input.relation_type.as_str(),
                    ],
                )
                .map_err(|error| map_database_error("gravar vínculo da questão", error))?;
        } else {
            transaction
                .execute(
                    "DELETE FROM question_contest_relations
                     WHERE question_id = ?1 AND contest_id = ?2",
                    params![input.question_id.as_str(), input.contest_id.as_str()],
                )
                .map_err(|error| map_database_error("remover vínculo da questão", error))?;
        }

        let question = load_question(&transaction, &input.question_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar vínculo da questão", error))?;
        Ok(question)
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

fn read_external_batch_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ExternalQuestionBatchSummary> {
    Ok(ExternalQuestionBatchSummary {
        id: row.get(0)?,
        preparation_id: row.get(1)?,
        preparation_name: row.get(2)?,
        subject_id: row.get(3)?,
        subject_name: row.get(4)?,
        source_name: row.get(5)?,
        studied_on: row.get(6)?,
        answered_count: row.get(7)?,
        correct_count: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn load_external_batch(
    connection: &Connection,
    id: &str,
) -> Result<ExternalQuestionBatchSummary, WorkspaceError> {
    connection
        .query_row(
            "SELECT b.id, b.preparation_id, p.name, b.subject_id, s.name,
                    b.source_name, b.studied_on, b.answered_count, b.correct_count, b.created_at
             FROM external_question_batches b
             JOIN preparations p ON p.id = b.preparation_id
             LEFT JOIN subjects s ON s.id = b.subject_id
             WHERE b.id = ?1",
            params![id],
            read_external_batch_row,
        )
        .map_err(|error| map_database_error("ler lote externo salvo", error))
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
                       ORDER BY qa.answered_at ASC, qa.rowid ASC LIMIT 1),
                    (SELECT qa.result FROM question_attempts qa
                     WHERE qa.question_id = q.id
                      ORDER BY qa.answered_at DESC, qa.rowid DESC LIMIT 1),
                    (SELECT CASE
                          WHEN q.answer_key IS NULL THEN 'pending'
                          WHEN qa.selected_key IS NULL THEN 'blank'
                          WHEN qa.selected_key = q.answer_key THEN 'correct'
                          ELSE 'incorrect'
                        END
                      FROM question_attempts qa
                      WHERE qa.question_id = q.id
                       ORDER BY qa.answered_at ASC, qa.rowid ASC LIMIT 1),
                    (SELECT CASE
                          WHEN q.answer_key IS NULL THEN 'pending'
                          WHEN qa.selected_key IS NULL THEN 'blank'
                          WHEN qa.selected_key = q.answer_key THEN 'correct'
                          ELSE 'incorrect'
                        END
                      FROM question_attempts qa
                      WHERE qa.question_id = q.id
                       ORDER BY qa.answered_at DESC, qa.rowid DESC LIMIT 1),
                    (SELECT COUNT(*) FROM question_revisions qr WHERE qr.question_id = q.id)
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
                    first_attempt_current_result: row.get(16)?,
                    last_attempt_current_result: row.get(17)?,
                    revision_count: row.get(18)?,
                    contest_relations: Vec::new(),
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
    let contest_relations = load_question_contest_relations(connection, question_id)?;

    Ok(QuestionSummary {
        options,
        contest_relations,
        ..question
    })
}

fn load_question_contest_relations(
    connection: &Connection,
    question_id: &str,
) -> Result<Vec<QuestionContestRelationSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT r.contest_id, c.name, r.relation_type
             FROM question_contest_relations r
             JOIN manual_contests c ON c.id = r.contest_id
             WHERE r.question_id = ?1
             ORDER BY c.name COLLATE NOCASE, r.contest_id",
        )
        .map_err(|error| map_database_error("preparar relações da questão", error))?;
    let rows = statement
        .query_map(params![question_id], |row| {
            Ok(QuestionContestRelationSummary {
                contest_id: row.get(0)?,
                contest_name: row.get(1)?,
                relation_type: row.get(2)?,
            })
        })
        .map_err(|error| map_database_error("consultar relações da questão", error))?;
    rows.map(|row| row.map_err(|error| map_database_error("ler relação da questão", error)))
        .collect()
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
    use crate::application::contest_service::ContestStore;
    use crate::application::question_service::QuestionStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::contest::{ContestStatus, SaveManualContestInput};
    use crate::domain::question::{NotebookFilter, QuestionOptionInput, ERROR_NOTEBOOK_ID};
    use crate::domain::question_transfer::{
        QuestionAttachmentReference, QuestionExportDocument, QuestionTransferItem,
        QuestionTransferOption, QUESTION_TRANSFER_KIND, QUESTION_TRANSFER_SCHEMA_VERSION,
    };
    use crate::domain::study_plan::{CreatePreparationInput, CreateSubjectInput};
    use sha2::{Digest, Sha256};
    use std::fs;

    #[test]
    fn filters_question_bank_before_pagination_including_history_and_secondary_subject() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-filters-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-filters-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Filtros")
            .expect("o espaço deve ser criado");
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
        let first_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Redes".to_string(),
                parent_id: None,
            })
            .expect("o primeiro assunto deve ser criado");
        let second_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id,
                name: "Segurança".to_string(),
                parent_id: None,
            })
            .expect("o segundo assunto deve ser criado");
        let connection = store.active_database().expect("o banco deve abrir");
        let mut first_question_id = String::new();
        for index in 0..60 {
            let id = Uuid::new_v4().to_string();
            if index == 0 {
                first_question_id = id.clone();
            }
            connection
                .execute(
                    "INSERT INTO questions(id, question_type, statement_markdown, board, exam_year)
                 VALUES (?1, 'multiple_choice', ?2, 'FGV', 2024)",
                    params![id, format!("Rede-abc {index}")],
                )
                .expect("a questão deve ser criada");
            connection
                .execute(
                    "INSERT INTO question_subjects(question_id, subject_id) VALUES (?1, ?2)",
                    params![id, first_subject.id],
                )
                .expect("o assunto deve ser ligado");
            if index == 0 {
                connection
                    .execute(
                        "INSERT INTO question_subjects(question_id, subject_id) VALUES (?1, ?2)",
                        params![id, second_subject.id],
                    )
                    .expect("o assunto secundário deve ser ligado");
            }
        }
        for (selected_key, result, answered_at) in [
            ("A", "correct", "2032-01-01 12:00:00"),
            ("B", "incorrect", "2032-01-02 12:00:00"),
        ] {
            connection.execute(
                "INSERT INTO question_attempts(id,question_id,selected_key,confidence,elapsed_seconds,result,answered_at)
                 VALUES(?1,?2,?3,'certain',10,?4,?5)",
                params![Uuid::new_v4().to_string(), first_question_id, selected_key, result, answered_at],
            ).expect("a tentativa deve ser criada");
        }
        connection.execute(
            "INSERT INTO notebook_questions(notebook_id,question_id) VALUES('notebook-errors',?1)",
            params![first_question_id],
        ).expect("a questão deve ser marcada no caderno");
        let annulled_id = Uuid::new_v4().to_string();
        connection
            .execute(
                "INSERT INTO questions(id,question_type,statement_markdown,status,board,exam_year)
             VALUES(?1,'true_false','Anulada','annulled','Cebraspe',2022)",
                params![annulled_id],
            )
            .expect("a questão anulada deve ser criada");
        drop(connection);

        let base = ListQuestionsInput {
            subject_id: None,
            question_type: Some("multiple_choice".to_string()),
            status: Some("active".to_string()),
            board: Some("fgv".to_string()),
            exam_year: Some(2024),
            attempt_status: None,
            notebook_id: None,
            search_text: None,
            limit: 50,
            offset: 0,
        };
        let first_page = store
            .list_questions(&base)
            .expect("a primeira página deve abrir");
        let second_page = store
            .list_questions(&ListQuestionsInput {
                offset: 50,
                ..base.clone()
            })
            .expect("a segunda página deve abrir");
        assert_eq!(first_page.len(), 50);
        assert_eq!(second_page.len(), 10);
        let all_ids = first_page
            .iter()
            .chain(second_page.iter())
            .map(|q| q.id.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(all_ids.len(), 60);

        let matched = store
            .list_questions(&ListQuestionsInput {
                subject_id: Some(second_subject.id),
                attempt_status: Some("last_incorrect".to_string()),
                notebook_id: Some("notebook-errors".to_string()),
                search_text: Some("rede-abc 0".to_string()),
                ..base.clone()
            })
            .expect("filtros combinados devem localizar a questão pelo segundo assunto");
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].id, first_question_id);
        assert_eq!(matched[0].first_attempt_result.as_deref(), Some("correct"));

        let annulled = store
            .list_questions(&ListQuestionsInput {
                question_type: None,
                status: Some("annulled".to_string()),
                board: None,
                exam_year: None,
                ..base
            })
            .expect("o filtro explícito deve permitir consultar anuladas");
        assert_eq!(annulled.len(), 1);
        assert_eq!(annulled[0].id, annulled_id);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn separates_external_batches_from_first_attempts_and_repeats() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-external-batch-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-external-batch-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Questões externas")
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
        let other = store
            .create_preparation(&CreatePreparationInput {
                name: "Outra".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("outra preparação deve ser criada");
        let subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Redes".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let invalid = store.create_external_question_batch(&CreateExternalQuestionBatchInput {
            preparation_id: other.id,
            subject_id: Some(subject.id.clone()),
            source_name: None,
            studied_on: "2032-01-11".to_string(),
            answered_count: 10,
            correct_count: 7,
        });
        assert!(invalid.is_err());

        let question_id = Uuid::new_v4().to_string();
        let annulled_id = Uuid::new_v4().to_string();
        let connection = store
            .active_database()
            .expect("o banco da fixture deve abrir");
        for (id, status) in [(&question_id, "active"), (&annulled_id, "annulled")] {
            connection
                .execute(
                    "INSERT INTO questions (id, question_type, statement_markdown, answer_key, status)
                     VALUES (?1, 'multiple_choice', 'Questão de teste', 'A', ?2)",
                    params![id, status],
                )
                .expect("a questão sintética deve ser criada");
        }
        for (question_id, selected, result, answered_at) in [
            (&question_id, "A", "correct", "2032-01-09 12:00:00"),
            (&question_id, "B", "incorrect", "2032-01-10 12:00:00"),
            (&annulled_id, "A", "correct", "2032-01-10 12:00:00"),
        ] {
            connection
                .execute(
                    "INSERT INTO question_attempts
                        (id, question_id, selected_key, confidence, elapsed_seconds, answer_key_at_attempt, result, answered_at)
                     VALUES (?1, ?2, ?3, 'certain', 10, 'A', ?4, ?5)",
                    params![Uuid::new_v4().to_string(), question_id, selected, answered_at, result],
                )
                .expect("a tentativa sintética deve ser criada");
        }
        drop(connection);
        let batch = store
            .create_external_question_batch(&CreateExternalQuestionBatchInput {
                preparation_id: preparation.id,
                subject_id: Some(subject.id),
                source_name: Some("Caderno impresso".to_string()),
                studied_on: "2032-01-11".to_string(),
                answered_count: 20,
                correct_count: 12,
            })
            .expect("o lote externo deve ser registrado");
        assert_eq!(batch.subject_name.as_deref(), Some("Redes"));
        store
            .open_workspace(&workspace_path)
            .expect("o espaço deve reabrir");
        let performance = store
            .question_performance("2032-01-11")
            .expect("as métricas devem ser calculadas");
        let earlier = store
            .question_performance("2032-01-10")
            .expect("o período anterior deve ser calculado");
        let batches = store
            .list_external_question_batches()
            .expect("o lote deve continuar disponível");
        let connection = store.active_database().expect("o banco deve reabrir");
        let xp_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM xp_events", [], |row| row.get(0))
            .expect("o XP deve ser consultado");
        assert_eq!(performance.first_attempt_graded, 1);
        assert_eq!(performance.first_attempt_correct, 1);
        assert_eq!(performance.repeat_graded, 1);
        assert_eq!(performance.repeat_correct, 0);
        assert_eq!(performance.external_batches, 1);
        assert_eq!(performance.external_answered, 20);
        assert_eq!(performance.external_correct, 12);
        assert_eq!(earlier.external_batches, 0);
        assert_eq!(batches.len(), 1);
        assert_eq!(xp_count, 0);

        drop(connection);
        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_explicit_question_contest_relations_idempotently() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-question-contest-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!(
            "cursoucon-question-contest-data-{}",
            Uuid::new_v4()
        ));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Relações de questões")
            .expect("o espaço temporário deve ser criado");
        let contest = store
            .save_manual_contest(&SaveManualContestInput {
                id: None,
                name: "TRF - Analista 2032".to_string(),
                organization: Some("TRF".to_string()),
                role: Some("Analista".to_string()),
                board: Some("FGV".to_string()),
                source_url: None,
                status: ContestStatus::Completed,
                registration_starts_on: None,
                registration_ends_on: None,
                fee_deadline: None,
                exam_date: Some("2032-05-10".to_string()),
                notes: None,
            })
            .expect("o concurso manual deve ser criado");
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
                board: Some("FGV".to_string()),
                organization: Some("TRF".to_string()),
                role: Some("Analista".to_string()),
                exam_year: Some(2032),
                subject_id: None,
            })
            .expect("a questão deve ser criada");

        let linked = store
            .set_question_contest_relation(&SetQuestionContestRelationInput {
                question_id: question.id.clone(),
                contest_id: contest.id.clone(),
                relation_type: "official_exam".to_string(),
                included: true,
            })
            .expect("a relação oficial deve ser salva");
        assert_eq!(linked.contest_relations.len(), 1);
        assert_eq!(linked.contest_relations[0].contest_name, contest.name);
        assert_eq!(linked.contest_relations[0].relation_type, "official_exam");

        let updated = store
            .set_question_contest_relation(&SetQuestionContestRelationInput {
                question_id: question.id.clone(),
                contest_id: contest.id.clone(),
                relation_type: "previous_exam".to_string(),
                included: true,
            })
            .expect("a classificação da relação deve ser atualizada");
        assert_eq!(updated.contest_relations.len(), 1);
        assert_eq!(updated.contest_relations[0].relation_type, "previous_exam");

        let reloaded = store
            .list_questions(&ListQuestionsInput {
                subject_id: None,
                question_type: None,
                status: Some("active".to_string()),
                board: None,
                exam_year: None,
                attempt_status: None,
                notebook_id: None,
                search_text: None,
                limit: 50,
                offset: 0,
            })
            .expect("a lista deve carregar relações persistidas");
        assert_eq!(
            reloaded[0].contest_relations[0].relation_type,
            "previous_exam"
        );

        let removed = store
            .set_question_contest_relation(&SetQuestionContestRelationInput {
                question_id: question.id.clone(),
                contest_id: contest.id,
                relation_type: "thematic_compatibility".to_string(),
                included: false,
            })
            .expect("a relação deve ser removida");
        assert!(removed.contest_relations.is_empty());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

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
    fn revises_answer_key_without_rewriting_historical_attempts() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-question-revision-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!(
            "cursoucon-question-revision-data-{}",
            Uuid::new_v4()
        ));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Revisão de questões")
            .expect("o espaço temporário deve ser criado");
        let question = store
            .create_question(&CreateQuestionInput {
                question_type: "multiple_choice".to_string(),
                statement_markdown: "Qual protocolo é orientado a conexão?".to_string(),
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
                subject_id: None,
            })
            .expect("a questão deve ser criada");
        let first = store
            .answer_question(&AnswerQuestionInput {
                question_id: question.id.clone(),
                selected_key: Some("B".to_string()),
                confidence: "certain".to_string(),
                elapsed_seconds: 10,
            })
            .expect("a primeira tentativa deve ser salva");
        let last = store
            .answer_question(&AnswerQuestionInput {
                question_id: question.id.clone(),
                selected_key: Some("A".to_string()),
                confidence: "certain".to_string(),
                elapsed_seconds: 10,
            })
            .expect("a repetição deve ser salva");

        let revised = store
            .revise_question(&ReviseQuestionInput {
                question_id: question.id.clone(),
                status: "answer_changed".to_string(),
                answer_key: Some("B".to_string()),
                reason: "Errata publicada pela banca.".to_string(),
            })
            .expect("a correção deve ser registrada");

        assert_eq!(first.attempt.answer_key_at_attempt.as_deref(), Some("A"));
        assert_eq!(first.attempt.result, "incorrect");
        assert_eq!(last.attempt.answer_key_at_attempt.as_deref(), Some("A"));
        assert_eq!(last.attempt.result, "correct");
        assert_eq!(revised.question.answer_key.as_deref(), Some("B"));
        assert_eq!(revised.question.status, "answer_changed");
        assert_eq!(
            revised.question.first_attempt_result.as_deref(),
            Some("incorrect")
        );
        assert_eq!(
            revised.question.last_attempt_result.as_deref(),
            Some("correct")
        );
        assert_eq!(
            revised.question.first_attempt_current_result.as_deref(),
            Some("correct")
        );
        assert_eq!(
            revised.question.last_attempt_current_result.as_deref(),
            Some("incorrect")
        );
        assert_eq!(revised.question.revision_count, 1);
        assert_eq!(
            revised.revision.as_ref().map(|item| item.reason.as_str()),
            Some("Errata publicada pela banca.")
        );

        let invalid_status = store.revise_question(&ReviseQuestionInput {
            question_id: question.id,
            status: "active".to_string(),
            answer_key: Some("A".to_string()),
            reason: "Tentativa de alteração sem situação explícita.".to_string(),
        });
        assert!(invalid_status.is_err());

        let annulled = store
            .revise_question(&ReviseQuestionInput {
                question_id: revised.question.id.clone(),
                status: "annulled".to_string(),
                answer_key: Some("B".to_string()),
                reason: "A questão foi anulada no resultado definitivo.".to_string(),
            })
            .expect("a situação anulada deve ser registrada");
        assert_eq!(annulled.question.status, "annulled");
        assert!(store
            .answer_question(&AnswerQuestionInput {
                question_id: annulled.question.id,
                selected_key: Some("A".to_string()),
                confidence: "certain".to_string(),
                elapsed_seconds: 10,
            })
            .is_err());

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
