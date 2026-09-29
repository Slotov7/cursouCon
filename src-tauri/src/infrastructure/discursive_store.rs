use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::discursive_service::DiscursiveStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::discursive::{
    AnswerDiscursiveQuestionInput, AnswerDiscursiveQuestionResult, CreateDiscursiveQuestionInput,
    DiscursiveAttemptSummary, DiscursiveQuestionSummary,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

impl DiscursiveStore for LocalWorkspaceStore {
    fn list_discursive_questions(&self) -> Result<Vec<DiscursiveQuestionSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(
                "SELECT id FROM questions
                 WHERE is_discursive = 1
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 500",
            )
            .map_err(|error| map_database_error("preparar lista de discursivas", error))?;
        let ids = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| map_database_error("consultar discursivas", error))?
            .map(|row| row.map_err(|error| map_database_error("ler id da discursiva", error)))
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        ids.into_iter()
            .map(|id| load_discursive_question(&connection, &id))
            .collect()
    }

    fn create_discursive_question(
        &self,
        input: &CreateDiscursiveQuestionInput,
    ) -> Result<DiscursiveQuestionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da discursiva", error))?;
        if let Some(subject_id) = input.subject_id.as_deref() {
            ensure_subject_exists(&transaction, subject_id)?;
        }

        let question_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO questions
                    (id, question_type, statement_markdown, source_name, board, organization,
                     role, exam_year, is_discursive)
                 VALUES (?1, 'multiple_choice', ?2, ?3, ?4, ?5, ?6, ?7, 1)",
                params![
                    question_id.as_str(),
                    input.statement_markdown.as_str(),
                    input.source_name.as_deref(),
                    input.board.as_deref(),
                    input.organization.as_deref(),
                    input.role.as_deref(),
                    input.exam_year,
                ],
            )
            .map_err(|error| map_database_error("gravar discursiva", error))?;
        transaction
            .execute(
                "INSERT INTO discursive_question_details
                    (question_id, reference_markdown, rubric_markdown)
                 VALUES (?1, ?2, ?3)",
                params![
                    question_id.as_str(),
                    input.reference_markdown.as_deref(),
                    input.rubric_markdown.as_deref(),
                ],
            )
            .map_err(|error| map_database_error("gravar referência da discursiva", error))?;
        if let Some(subject_id) = input.subject_id.as_deref() {
            transaction
                .execute(
                    "INSERT INTO question_subjects (question_id, subject_id)
                     VALUES (?1, ?2)",
                    params![question_id.as_str(), subject_id],
                )
                .map_err(|error| map_database_error("vincular discursiva ao assunto", error))?;
        }

        let question = load_discursive_question(&transaction, &question_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar criação da discursiva", error))?;
        Ok(question)
    }

    fn answer_discursive_question(
        &self,
        input: &AnswerDiscursiveQuestionInput,
    ) -> Result<AnswerDiscursiveQuestionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar resposta discursiva", error))?;
        let exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM questions WHERE id = ?1 AND is_discursive = 1",
                params![input.question_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("validar discursiva", error))?;
        if exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A discursiva escolhida não existe mais.".to_string(),
            ));
        }

        let attempt_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO question_attempts
                    (id, question_id, selected_key, confidence, elapsed_seconds,
                     answer_key_at_attempt, result)
                 VALUES (?1, ?2, NULL, 'certain', ?3, NULL, 'pending')",
                params![
                    attempt_id.as_str(),
                    input.question_id.as_str(),
                    input.elapsed_seconds,
                ],
            )
            .map_err(|error| map_database_error("gravar tentativa discursiva", error))?;
        transaction
            .execute(
                "INSERT INTO discursive_attempts (attempt_id, response_markdown, self_assessment)
                 VALUES (?1, ?2, ?3)",
                params![
                    attempt_id.as_str(),
                    input.response_markdown.as_str(),
                    input.self_assessment.as_str(),
                ],
            )
            .map_err(|error| map_database_error("gravar resposta discursiva", error))?;
        transaction
            .execute(
                "UPDATE questions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![input.question_id.as_str()],
            )
            .map_err(|error| map_database_error("atualizar discursiva respondida", error))?;

        let question = load_discursive_question(&transaction, &input.question_id)?;
        let attempt = question.latest_attempt.clone().ok_or_else(|| {
            WorkspaceError::Database(
                "a tentativa discursiva não foi localizada após o salvamento".to_string(),
            )
        })?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar resposta discursiva", error))?;
        Ok(AnswerDiscursiveQuestionResult { question, attempt })
    }
}

fn load_discursive_question(
    connection: &Connection,
    question_id: &str,
) -> Result<DiscursiveQuestionSummary, WorkspaceError> {
    let question = connection
        .query_row(
            "SELECT q.id, q.statement_markdown, d.reference_markdown, d.rubric_markdown,
                    q.source_name, q.board, q.organization, q.role, q.exam_year,
                    qsub.subject_id, s.name,
                    (SELECT COUNT(*) FROM question_attempts qa
                     JOIN discursive_attempts da ON da.attempt_id = qa.id
                     WHERE qa.question_id = q.id)
             FROM questions q
             LEFT JOIN discursive_question_details d ON d.question_id = q.id
             LEFT JOIN question_subjects qsub ON qsub.question_id = q.id
             LEFT JOIN subjects s ON s.id = qsub.subject_id
             WHERE q.id = ?1 AND q.is_discursive = 1
             LIMIT 1",
            params![question_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, i64>(11)?,
                ))
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler discursiva", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("A discursiva escolhida não existe mais.".to_string())
        })?;
    let latest_attempt = load_latest_attempt(connection, question_id)?;
    Ok(DiscursiveQuestionSummary {
        id: question.0,
        statement_markdown: question.1,
        reference_markdown: question.2,
        rubric_markdown: question.3,
        source_name: question.4,
        board: question.5,
        organization: question.6,
        role: question.7,
        exam_year: question.8,
        subject_id: question.9,
        subject_name: question.10,
        attempts_count: question.11,
        latest_attempt,
    })
}

fn load_latest_attempt(
    connection: &Connection,
    question_id: &str,
) -> Result<Option<DiscursiveAttemptSummary>, WorkspaceError> {
    connection
        .query_row(
            "SELECT qa.id, da.response_markdown, da.self_assessment,
                    qa.elapsed_seconds, qa.answered_at
             FROM question_attempts qa
             JOIN discursive_attempts da ON da.attempt_id = qa.id
             WHERE qa.question_id = ?1
             ORDER BY qa.answered_at DESC, qa.rowid DESC
             LIMIT 1",
            params![question_id],
            |row| {
                Ok(DiscursiveAttemptSummary {
                    id: row.get(0)?,
                    response_markdown: row.get(1)?,
                    self_assessment: row.get(2)?,
                    elapsed_seconds: row.get(3)?,
                    answered_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler última resposta discursiva", error))
}

fn ensure_subject_exists(
    transaction: &Transaction<'_>,
    subject_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM subjects WHERE id = ?1 AND archived_at IS NULL",
            params![subject_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto da discursiva", error))?;
    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto escolhido para a discursiva não existe mais.".to_string(),
        ));
    }
    Ok(())
}
