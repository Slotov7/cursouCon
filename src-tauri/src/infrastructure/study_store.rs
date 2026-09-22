use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::study_service::StudyStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::study::{
    calculate_session_xp, parse_session_status, parse_task_status, CreateStudyTaskInput, DailyPlan,
    FinishStudySessionInput, FinishStudySessionResult, PauseStudySessionInput,
    RescheduleStudyTaskInput, ResumeStudySessionInput, SkipStudyTaskInput, StartStudySessionInput,
    StudyHistoryEntry, StudyProgressSummary, StudySessionStatus, StudySessionSummary,
    StudyTaskStatus, StudyTaskSummary, TaskCompletion, XP_RULES_VERSION,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

type TaskRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    i64,
    String,
    String,
);

type SessionRow = (
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    i64,
    String,
);
type HistoryRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    String,
    i64,
);

impl StudyStore for LocalWorkspaceStore {
    fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        let tasks = load_daily_tasks(&connection, date)?;
        let active_session = load_active_session(&connection)?;

        Ok(DailyPlan {
            date: date.to_string(),
            tasks,
            active_session,
        })
    }

    fn create_study_task(
        &self,
        input: &CreateStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da tarefa", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;
        let subject_name = match input.subject_id.as_deref() {
            Some(subject_id) => Some(ensure_subject_exists(
                &transaction,
                &input.preparation_id,
                subject_id,
            )?),
            None => None,
        };

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO study_tasks
                    (id, preparation_id, subject_id, title, objective, planned_minutes, scheduled_for, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
                params![
                    id.as_str(),
                    input.preparation_id.as_str(),
                    input.subject_id.as_deref(),
                    &input.title,
                    input.objective.as_deref(),
                    input.planned_minutes,
                    &input.scheduled_for,
                ],
            )
            .map_err(|error| map_database_error("gravar tarefa", error))?;
        let summary = StudyTaskSummary {
            id,
            preparation_id: input.preparation_id.clone(),
            subject_id: input.subject_id.clone(),
            subject_name,
            title: input.title.clone(),
            objective: input.objective.clone(),
            planned_minutes: input.planned_minutes,
            scheduled_for: input.scheduled_for.clone(),
            status: StudyTaskStatus::Pending,
        };

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar tarefa", error))?;
        Ok(summary)
    }

    fn reschedule_study_task(
        &self,
        input: &RescheduleStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar reagendamento da tarefa", error))?;
        let current = load_task(&transaction, &input.task_id)?;

        if matches!(
            current.status,
            StudyTaskStatus::Completed | StudyTaskStatus::Skipped
        ) {
            return Err(WorkspaceError::InvalidInput(
                "Esta tarefa não pode mais ser reagendada.".to_string(),
            ));
        }
        ensure_task_has_no_open_session(&transaction, &input.task_id)?;

        transaction
            .execute(
                "UPDATE study_tasks SET scheduled_for = ?1 WHERE id = ?2",
                params![input.scheduled_for.as_str(), input.task_id.as_str()],
            )
            .map_err(|error| map_database_error("reagendar tarefa", error))?;
        let summary = load_task(&transaction, &input.task_id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar reagendamento da tarefa", error))?;
        Ok(summary)
    }

    fn skip_study_task(
        &self,
        input: &SkipStudyTaskInput,
    ) -> Result<StudyTaskSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar pulo da tarefa", error))?;
        let current = load_task(&transaction, &input.task_id)?;

        if current.status == StudyTaskStatus::Skipped {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar tarefa já pulada", error))?;
            return Ok(current);
        }
        if current.status == StudyTaskStatus::Completed {
            return Err(WorkspaceError::InvalidInput(
                "Uma tarefa concluída não pode ser pulada.".to_string(),
            ));
        }
        ensure_task_has_no_open_session(&transaction, &input.task_id)?;

        transaction
            .execute(
                "UPDATE study_tasks SET status = 'skipped' WHERE id = ?1",
                params![input.task_id.as_str()],
            )
            .map_err(|error| map_database_error("pular tarefa", error))?;
        let summary = load_task(&transaction, &input.task_id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar pulo da tarefa", error))?;
        Ok(summary)
    }

    fn start_study_session(
        &self,
        input: &StartStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da sessão", error))?;
        let subject_id = load_startable_task(&transaction, &input.task_id)?;

        if let Some(existing) = load_active_session_from(&transaction)? {
            if existing.task_id == input.task_id {
                transaction
                    .commit()
                    .map_err(|error| map_database_error("confirmar sessão existente", error))?;
                return Ok(existing);
            }
            return Err(WorkspaceError::ActiveSessionExists);
        }

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO study_sessions
                    (id, task_id, subject_id, started_at, active_started_at, effective_seconds, status)
                 VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 'active')",
                params![id.as_str(), input.task_id.as_str(), subject_id.as_deref()],
            )
            .map_err(|error| map_database_error("gravar sessão", error))?;
        let summary = load_session(&transaction, &id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar sessão", error))?;
        Ok(summary)
    }

    fn pause_study_session(
        &self,
        input: &PauseStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar pausa da sessão", error))?;
        let current = load_session(&transaction, &input.session_id)?;

        if current.status == StudySessionStatus::Paused {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar sessão pausada", error))?;
            return Ok(current);
        }

        if current.status != StudySessionStatus::Active {
            return Err(WorkspaceError::InvalidInput(
                "Esta sessão não pode mais ser pausada.".to_string(),
            ));
        }
        ensure_effective_seconds_not_decreased(input.effective_seconds, current.effective_seconds)?;

        transaction
            .execute(
                "UPDATE study_sessions
                 SET effective_seconds = ?1, active_started_at = NULL, status = 'paused'
                 WHERE id = ?2 AND status = 'active'",
                params![input.effective_seconds, input.session_id.as_str()],
            )
            .map_err(|error| map_database_error("pausar sessão", error))?;
        let summary = load_session(&transaction, &input.session_id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar pausa da sessão", error))?;
        Ok(summary)
    }

    fn resume_study_session(
        &self,
        input: &ResumeStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar retomada da sessão", error))?;
        let current = load_session(&transaction, &input.session_id)?;

        if current.status == StudySessionStatus::Active {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar sessão ativa", error))?;
            return Ok(current);
        }

        if current.status != StudySessionStatus::Paused {
            return Err(WorkspaceError::InvalidInput(
                "Esta sessão não pode mais ser retomada.".to_string(),
            ));
        }

        transaction
            .execute(
                "UPDATE study_sessions
                 SET active_started_at = CURRENT_TIMESTAMP, status = 'active'
                 WHERE id = ?1 AND status = 'paused'",
                params![input.session_id.as_str()],
            )
            .map_err(|error| map_database_error("retomar sessão", error))?;
        let summary = load_session(&transaction, &input.session_id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar retomada da sessão", error))?;
        Ok(summary)
    }

    fn finish_study_session(
        &self,
        input: &FinishStudySessionInput,
    ) -> Result<FinishStudySessionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar encerramento da sessão", error))?;
        let current = load_session(&transaction, &input.session_id)?;

        if matches!(
            current.status,
            StudySessionStatus::Completed | StudySessionStatus::Interrupted
        ) {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar sessão já encerrada", error))?;
            return Ok(FinishStudySessionResult {
                session: current,
                xp_granted: 0,
            });
        }

        let task_status = match input.task_status {
            TaskCompletion::Completed => "completed",
            TaskCompletion::Partial => "partial",
        };
        ensure_effective_seconds_not_decreased(input.effective_seconds, current.effective_seconds)?;
        transaction
            .execute(
                "UPDATE study_sessions
                 SET ended_at = CURRENT_TIMESTAMP, active_started_at = NULL,
                     effective_seconds = ?1, status = 'completed'
                 WHERE id = ?2 AND status IN ('active', 'paused')",
                params![input.effective_seconds, input.session_id.as_str()],
            )
            .map_err(|error| map_database_error("encerrar sessão", error))?;
        transaction
            .execute(
                "UPDATE study_tasks SET status = ?1
                 WHERE id = ?2 AND status <> 'skipped'",
                params![task_status, current.task_id.as_str()],
            )
            .map_err(|error| map_database_error("atualizar tarefa encerrada", error))?;
        let summary = load_session(&transaction, &input.session_id)?;
        let xp_granted = grant_session_xp(&transaction, &summary)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar encerramento da sessão", error))?;
        Ok(FinishStudySessionResult {
            session: summary,
            xp_granted,
        })
    }

    fn study_progress(&self) -> Result<StudyProgressSummary, WorkspaceError> {
        let connection = self.active_database()?;
        let total_xp: i64 = connection
            .query_row(
                "SELECT COALESCE(SUM(points), 0) FROM xp_events",
                [],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("consultar XP acumulado", error))?;
        let (completed_sessions, effective_seconds): (i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(effective_seconds), 0)
                 FROM study_sessions
                 WHERE status = 'completed'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| map_database_error("consultar esforço acumulado", error))?;
        let recent_sessions = load_recent_history(&connection, 8)?;

        Ok(StudyProgressSummary {
            total_xp,
            completed_sessions,
            effective_seconds,
            recent_sessions,
        })
    }
}

fn grant_session_xp(
    transaction: &rusqlite::Transaction<'_>,
    session: &StudySessionSummary,
) -> Result<i64, WorkspaceError> {
    let granted_today: i64 = transaction
        .query_row(
            "SELECT COALESCE(SUM(events.points), 0)
             FROM xp_events events
             JOIN study_sessions sessions ON sessions.id = events.source_id
             WHERE events.source_type = 'study_session'
               AND date(sessions.started_at) = date(?1)",
            params![session.started_at.as_str()],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("calcular XP do dia", error))?;
    let xp_granted = calculate_session_xp(session.effective_seconds, granted_today);

    transaction
        .execute(
            "INSERT INTO xp_events (id, source_type, source_id, points, rules_version)
             VALUES (?1, 'study_session', ?2, ?3, ?4)",
            params![
                Uuid::new_v4().to_string(),
                session.id.as_str(),
                xp_granted,
                XP_RULES_VERSION,
            ],
        )
        .map_err(|error| map_database_error("gravar XP da sessão", error))?;

    Ok(xp_granted)
}

fn ensure_effective_seconds_not_decreased(
    requested_seconds: i64,
    persisted_seconds: i64,
) -> Result<(), WorkspaceError> {
    if requested_seconds < persisted_seconds {
        return Err(WorkspaceError::InvalidInput(
            "A duração efetiva não pode diminuir ao atualizar a sessão.".to_string(),
        ));
    }
    Ok(())
}

fn load_recent_history(
    connection: &rusqlite::Connection,
    limit: i64,
) -> Result<Vec<StudyHistoryEntry>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT sessions.id, sessions.task_id, tasks.title, subjects.name,
                    sessions.ended_at, sessions.effective_seconds, tasks.status,
                    COALESCE(events.points, 0)
             FROM study_sessions sessions
             JOIN study_tasks tasks ON tasks.id = sessions.task_id
             LEFT JOIN subjects ON subjects.id = sessions.subject_id
             LEFT JOIN xp_events events
                ON events.source_type = 'study_session'
               AND events.source_id = sessions.id
             WHERE sessions.status = 'completed'
             ORDER BY sessions.ended_at DESC
             LIMIT ?1",
        )
        .map_err(|error| map_database_error("preparar histórico de estudo", error))?;
    let rows = statement
        .query_map(params![limit], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            ))
        })
        .map_err(|error| map_database_error("consultar histórico de estudo", error))?;

    rows.map(|row| {
        let parts = row.map_err(|error| map_database_error("ler histórico de estudo", error))?;
        history_entry_from_parts(parts)
    })
    .collect()
}

fn history_entry_from_parts(parts: HistoryRow) -> Result<StudyHistoryEntry, WorkspaceError> {
    let (
        session_id,
        task_id,
        task_title,
        subject_name,
        ended_at,
        effective_seconds,
        task_status,
        xp_granted,
    ) = parts;
    let ended_at = ended_at.ok_or_else(|| {
        WorkspaceError::Database("uma sessão concluída não possui data de encerramento".to_string())
    })?;
    let task_status = parse_task_status(&task_status).map_err(WorkspaceError::Database)?;

    Ok(StudyHistoryEntry {
        session_id,
        task_id,
        task_title,
        subject_name,
        ended_at,
        effective_seconds,
        task_status,
        xp_granted,
    })
}

fn load_task(
    transaction: &rusqlite::Transaction<'_>,
    task_id: &str,
) -> Result<StudyTaskSummary, WorkspaceError> {
    let parts: TaskRow = transaction
        .query_row(
            "SELECT t.id, t.preparation_id, t.subject_id, s.name, t.title,
                    t.objective, t.planned_minutes, t.scheduled_for, t.status
             FROM study_tasks t
             LEFT JOIN subjects s ON s.id = t.subject_id
             WHERE t.id = ?1",
            params![task_id],
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
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                WorkspaceError::InvalidInput("A tarefa escolhida não existe mais.".to_string())
            }
            other => map_database_error("localizar tarefa", other),
        })?;

    task_summary_from_parts(parts)
}

fn ensure_task_has_no_open_session(
    transaction: &rusqlite::Transaction<'_>,
    task_id: &str,
) -> Result<(), WorkspaceError> {
    let has_open_session: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM study_sessions
             WHERE task_id = ?1 AND status IN ('active', 'paused')
             LIMIT 1",
            params![task_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar sessão aberta da tarefa", error))?;

    if has_open_session.is_some() {
        return Err(WorkspaceError::InvalidInput(
            "Encerre ou pause a sessão antes de alterar esta tarefa.".to_string(),
        ));
    }

    Ok(())
}

fn load_daily_tasks(
    connection: &rusqlite::Connection,
    date: &str,
) -> Result<Vec<StudyTaskSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT t.id, t.preparation_id, t.subject_id, s.name, t.title,
                    t.objective, t.planned_minutes, t.scheduled_for, t.status
             FROM study_tasks t
             LEFT JOIN subjects s ON s.id = t.subject_id
             WHERE t.scheduled_for = ?1 AND t.status <> 'skipped'
             ORDER BY CASE t.status WHEN 'completed' THEN 1 WHEN 'partial' THEN 2 ELSE 0 END,
                      t.id",
        )
        .map_err(|error| map_database_error("preparar leitura das tarefas", error))?;
    let rows = statement
        .query_map(params![date], |row| {
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
        .map_err(|error| map_database_error("consultar tarefas do dia", error))?;

    rows.map(|row| {
        let parts = row.map_err(|error| map_database_error("ler tarefa do dia", error))?;
        task_summary_from_parts(parts)
    })
    .collect()
}

fn load_active_session(
    connection: &rusqlite::Connection,
) -> Result<Option<StudySessionSummary>, WorkspaceError> {
    let parts: Option<SessionRow> = connection
        .query_row(
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds, status
             FROM study_sessions
             WHERE status IN ('active', 'paused')
             ORDER BY started_at
             LIMIT 1",
            [],
            session_row,
        )
        .optional()
        .map_err(|error| map_database_error("consultar sessão ativa", error))?;

    parts.map(session_summary_from_parts).transpose()
}

fn load_active_session_from(
    transaction: &rusqlite::Transaction<'_>,
) -> Result<Option<StudySessionSummary>, WorkspaceError> {
    let parts: Option<SessionRow> = transaction
        .query_row(
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds, status
             FROM study_sessions
             WHERE status IN ('active', 'paused')
             LIMIT 1",
            [],
            session_row,
        )
        .optional()
        .map_err(|error| map_database_error("verificar sessão ativa", error))?;

    parts.map(session_summary_from_parts).transpose()
}

fn load_session(
    transaction: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<StudySessionSummary, WorkspaceError> {
    let parts: SessionRow = transaction
        .query_row(
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds, status
             FROM study_sessions WHERE id = ?1",
            params![session_id],
            session_row,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                WorkspaceError::InvalidInput("A sessão escolhida não existe mais.".to_string())
            }
            other => map_database_error("localizar sessão", other),
        })?;

    session_summary_from_parts(parts)
}

fn session_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
    ))
}

fn load_startable_task(
    transaction: &rusqlite::Transaction<'_>,
    task_id: &str,
) -> Result<Option<String>, WorkspaceError> {
    let task: Option<(Option<String>, String)> = transaction
        .query_row(
            "SELECT subject_id, status FROM study_tasks WHERE id = ?1",
            params![task_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| map_database_error("verificar tarefa da sessão", error))?;
    let Some((subject_id, status)) = task else {
        return Err(WorkspaceError::InvalidInput(
            "A tarefa escolhida não existe mais.".to_string(),
        ));
    };
    let status = parse_task_status(&status).map_err(WorkspaceError::Database)?;
    if matches!(
        status,
        StudyTaskStatus::Completed | StudyTaskStatus::Skipped
    ) {
        return Err(WorkspaceError::InvalidInput(
            "Esta tarefa já não pode iniciar uma nova sessão.".to_string(),
        ));
    }

    Ok(subject_id)
}

fn ensure_preparation_exists(
    transaction: &rusqlite::Transaction<'_>,
    preparation_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar preparação da tarefa", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "A preparação escolhida não existe mais.".to_string(),
        ));
    }

    Ok(())
}

fn ensure_subject_exists(
    transaction: &rusqlite::Transaction<'_>,
    preparation_id: &str,
    subject_id: &str,
) -> Result<String, WorkspaceError> {
    let subject_name: Option<String> = transaction
        .query_row(
            "SELECT name FROM subjects
             WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
            params![subject_id, preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto da tarefa", error))?;

    subject_name.ok_or_else(|| {
        WorkspaceError::InvalidInput("O assunto escolhido não pertence à preparação.".to_string())
    })
}

fn task_summary_from_parts(parts: TaskRow) -> Result<StudyTaskSummary, WorkspaceError> {
    let (
        id,
        preparation_id,
        subject_id,
        subject_name,
        title,
        objective,
        planned_minutes,
        scheduled_for,
        status,
    ) = parts;
    let status = parse_task_status(&status).map_err(WorkspaceError::Database)?;

    Ok(StudyTaskSummary {
        id,
        preparation_id,
        subject_id,
        subject_name,
        title,
        objective,
        planned_minutes,
        scheduled_for,
        status,
    })
}

fn session_summary_from_parts(parts: SessionRow) -> Result<StudySessionSummary, WorkspaceError> {
    let (id, task_id, subject_id, started_at, active_started_at, effective_seconds, status) = parts;
    let status = parse_session_status(&status).map_err(WorkspaceError::Database)?;

    Ok(StudySessionSummary {
        id,
        task_id,
        subject_id,
        started_at,
        active_started_at,
        effective_seconds,
        status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::study_plan::CreatePreparationInput;
    use std::fs;

    #[test]
    fn starts_the_same_session_idempotently_and_finishes_the_task() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-study-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Estudo de teste")
            .expect("o espaço de fixture deve ser criado");
        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação".to_string(),
                organization: None,
                role: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("a preparação deve ser criada");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: None,
                title: "Revisar HTTP".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-01-15".to_string(),
            })
            .expect("a tarefa deve ser criada");

        let session = store
            .start_study_session(&StartStudySessionInput {
                task_id: task.id.clone(),
            })
            .expect("a sessão deve iniciar");
        let repeated = store
            .start_study_session(&StartStudySessionInput {
                task_id: task.id.clone(),
            })
            .expect("repetir o início deve ser idempotente");
        assert_eq!(session.id, repeated.id);

        let paused = store
            .pause_study_session(&PauseStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_200,
            })
            .expect("a sessão deve pausar");
        let repeated_pause = store
            .pause_study_session(&PauseStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 900,
            })
            .expect("repetir a pausa deve ser idempotente");
        let paused_plan = store
            .daily_plan("2032-01-15")
            .expect("o plano deve manter a sessão pausada");
        let resumed = store
            .resume_study_session(&ResumeStudySessionInput {
                session_id: session.id.clone(),
            })
            .expect("a sessão deve retomar");

        assert_eq!(paused.status, StudySessionStatus::Paused);
        assert_eq!(paused.effective_seconds, 1_200);
        assert!(paused.active_started_at.is_none());
        assert_eq!(repeated_pause.effective_seconds, 1_200);
        assert_eq!(
            paused_plan
                .active_session
                .as_ref()
                .map(|value| value.status),
            Some(StudySessionStatus::Paused)
        );
        assert_eq!(resumed.status, StudySessionStatus::Active);
        assert_eq!(resumed.effective_seconds, 1_200);
        assert!(resumed.active_started_at.is_some());

        let finished = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_500,
                task_status: TaskCompletion::Completed,
            })
            .expect("a sessão deve encerrar");
        let daily_plan = store
            .daily_plan("2032-01-15")
            .expect("o plano diário deve ser lido");
        let repeated_finish = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_500,
                task_status: TaskCompletion::Completed,
            })
            .expect("repetir o encerramento deve ser idempotente");
        let progress = store
            .study_progress()
            .expect("o resumo de evolução deve ser lido");

        assert_eq!(finished.session.status, StudySessionStatus::Completed);
        assert_eq!(finished.xp_granted, 25);
        assert_eq!(repeated_finish.xp_granted, 0);
        assert!(daily_plan.active_session.is_none());
        assert_eq!(daily_plan.tasks[0].status, StudyTaskStatus::Completed);
        assert_eq!(progress.total_xp, 25);
        assert_eq!(progress.completed_sessions, 1);
        assert_eq!(progress.recent_sessions.len(), 1);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn reschedules_and_skips_tasks_without_removing_their_records() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-task-actions-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-task-actions-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Ações de tarefa")
            .expect("o espaço de fixture deve ser criado");
        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Preparação".to_string(),
                organization: None,
                role: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação deve ser criada");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id.clone(),
                subject_id: None,
                title: "Reagendar revisão".to_string(),
                objective: None,
                planned_minutes: 20,
                scheduled_for: "2032-03-01".to_string(),
            })
            .expect("a tarefa deve ser criada");
        let task_to_skip = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: None,
                title: "Pular tarefa".to_string(),
                objective: None,
                planned_minutes: 15,
                scheduled_for: "2032-03-01".to_string(),
            })
            .expect("a segunda tarefa deve ser criada");

        let rescheduled = store
            .reschedule_study_task(&RescheduleStudyTaskInput {
                task_id: task.id,
                scheduled_for: "2032-03-02".to_string(),
            })
            .expect("a tarefa deve ser reagendada");
        let skipped = store
            .skip_study_task(&SkipStudyTaskInput {
                task_id: task_to_skip.id.clone(),
            })
            .expect("a tarefa deve ser pulada");
        let repeated_skip = store
            .skip_study_task(&SkipStudyTaskInput {
                task_id: task_to_skip.id,
            })
            .expect("repetir o pulo deve ser idempotente");
        let old_plan = store
            .daily_plan("2032-03-01")
            .expect("o plano antigo deve ser lido");
        let new_plan = store
            .daily_plan("2032-03-02")
            .expect("o novo plano deve ser lido");

        assert_eq!(rescheduled.scheduled_for, "2032-03-02");
        assert_eq!(rescheduled.status, StudyTaskStatus::Pending);
        assert_eq!(skipped.status, StudyTaskStatus::Skipped);
        assert_eq!(repeated_skip.status, StudyTaskStatus::Skipped);
        assert!(old_plan.tasks.is_empty());
        assert_eq!(new_plan.tasks.len(), 1);
        assert_eq!(new_plan.tasks[0].title, "Reagendar revisão");

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
