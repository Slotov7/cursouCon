use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::study_service::StudyStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::study::{
    calculate_review_xp, calculate_session_xp, calculate_study_streak, parse_session_status,
    parse_task_status, AcceptStudyCycleActionInput, AcceptStudyCycleActionResult,
    CompleteStudyReviewInput, CompleteStudyReviewResult, CorrectStudySessionDurationInput,
    CorrectStudySessionDurationResult, CreateManualStudyInput, CreateManualStudyResult,
    CreateStudyTaskInput, DailyPlan, FinishStudySessionInput, FinishStudySessionResult,
    HeartbeatStudySessionInput, PauseStudySessionInput, PlannedStudyDay,
    RescheduleStudyReviewInput, RescheduleStudyTaskInput, ResumeStudySessionInput,
    SaveStudySessionReflectionInput, SessionDifficulty, SkipStudyTaskInput, StartStudySessionInput,
    StudyCycleSuggestion, StudyHistoryEntry, StudyProgressSummary, StudyReviewStatus,
    StudyReviewSummary, StudySessionOrigin, StudySessionStatus, StudySessionSummary,
    StudyTaskStatus, StudyTaskSummary, TaskCompletion, REVIEW_XP_RULES_VERSION,
    SESSION_INTERRUPTION_THRESHOLD_SECONDS, XP_RULES_VERSION,
};
use rusqlite::{params, Connection, OptionalExtension};
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
    Option<String>,
    Option<String>,
);

type SessionRow = (
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    i64,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
);
type HistoryRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    String,
    String,
    i64,
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);
type StudyReviewRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
);

impl StudyStore for LocalWorkspaceStore {
    fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        recover_stale_active_session(&connection)?;
        let tasks = load_daily_tasks(&connection, date)?;
        let active_session = load_active_session(&connection)?;
        let active_task = active_session
            .as_ref()
            .map(|session| load_task(&connection, &session.task_id))
            .transpose()?;
        let reviews = load_due_reviews(&connection, date)?;
        let cycle_suggestion = load_cycle_suggestion(&connection)?;

        Ok(DailyPlan {
            date: date.to_string(),
            tasks,
            active_session,
            active_task,
            reviews,
            cycle_suggestion,
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
        let material_name = input
            .material_id
            .as_deref()
            .map(|material_id| {
                transaction
                    .query_row(
                        "SELECT original_name FROM materials WHERE id = ?1",
                        params![material_id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(|error| map_database_error("verificar material da tarefa", error))?
                    .ok_or_else(|| {
                        WorkspaceError::InvalidInput(
                            "O material escolhido não existe mais.".to_string(),
                        )
                    })
            })
            .transpose()?;

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO study_tasks
                    (id, preparation_id, subject_id, material_id, title, objective, planned_minutes, scheduled_for, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending')",
                params![
                    id.as_str(),
                    input.preparation_id.as_str(),
                    input.subject_id.as_deref(),
                    input.material_id.as_deref(),
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
            material_id: input.material_id.clone(),
            material_name,
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

    fn accept_study_cycle_action(
        &self,
        input: &AcceptStudyCycleActionInput,
    ) -> Result<AcceptStudyCycleActionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar aceite da ação do ciclo", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;

        let (cycle_position, cycle_step): (i64, i64) = transaction
            .query_row(
                "SELECT cycle_position, cycle_step
                 FROM study_planning_settings
                 WHERE preparation_id = ?1",
                params![input.preparation_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| map_database_error("ler posição atual do ciclo", error))?
            .ok_or_else(|| {
                WorkspaceError::InvalidInput(
                    "Salve o ciclo antes de aceitar uma próxima ação.".to_string(),
                )
            })?;
        let slot_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*)
                 FROM study_cycle_slots slots
                  JOIN subjects ON subjects.id = slots.subject_id
                     AND subjects.preparation_id = slots.preparation_id
                     AND subjects.archived_at IS NULL
                 WHERE slots.preparation_id = ?1",
                params![input.preparation_id],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("contar ações do ciclo", error))?;
        if slot_count == 0 {
            return Err(WorkspaceError::InvalidInput(
                "O ciclo não possui uma próxima ação disponível.".to_string(),
            ));
        }
        let normalized_position = cycle_position.rem_euclid(slot_count);
        if input.cycle_position != normalized_position || input.cycle_step != cycle_step {
            return Err(WorkspaceError::InvalidInput(
                "A próxima ação mudou; atualize o plano de hoje e tente novamente.".to_string(),
            ));
        }

        let (subject_id, subject_name, planned_minutes): (String, String, i64) = transaction
            .query_row(
                "SELECT slots.subject_id, subjects.name, slots.planned_minutes
                 FROM study_cycle_slots slots
                  JOIN subjects ON subjects.id = slots.subject_id
                     AND subjects.preparation_id = slots.preparation_id
                     AND subjects.archived_at IS NULL
                 WHERE slots.preparation_id = ?1 AND slots.position = ?2",
                params![input.preparation_id, normalized_position],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|error| map_database_error("localizar próxima ação do ciclo", error))?
            .ok_or_else(|| {
                WorkspaceError::Database(
                    "a posição atual do ciclo não possui uma ação correspondente".to_string(),
                )
            })?;

        let task_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO study_tasks
                    (id, preparation_id, subject_id, title, objective, planned_minutes, scheduled_for, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
                params![
                    task_id.as_str(),
                    input.preparation_id.as_str(),
                    subject_id.as_str(),
                    format!("Estudo focado de {subject_name}"),
                    "Bloco aceito a partir do ciclo de estudos.",
                    planned_minutes,
                    input.scheduled_for.as_str(),
                ],
            )
            .map_err(|error| map_database_error("gravar tarefa do ciclo", error))?;
        let task = load_task(&transaction, &task_id)?;
        let next_cycle_position = (normalized_position + 1).rem_euclid(slot_count);
        let advanced = transaction
            .execute(
                "UPDATE study_planning_settings
                 SET cycle_position = ?1, cycle_step = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE preparation_id = ?3
                   AND cycle_position = ?4
                   AND cycle_step = ?5",
                params![
                    next_cycle_position,
                    cycle_step + 1,
                    input.preparation_id,
                    cycle_position,
                    cycle_step
                ],
            )
            .map_err(|error| map_database_error("avançar ciclo após aceite", error))?;
        if advanced != 1 {
            return Err(WorkspaceError::InvalidInput(
                "A próxima ação mudou; atualize o plano de hoje e tente novamente.".to_string(),
            ));
        }

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar ação do ciclo", error))?;
        Ok(AcceptStudyCycleActionResult {
            task,
            next_cycle_position,
            next_cycle_step: cycle_step + 1,
        })
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
        recover_stale_active_session(&connection)?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da sessão", error))?;
        let subject_id = load_startable_task(&transaction, &input.task_id)?;

        if let Some(existing) = load_active_session_from(&transaction)? {
            if existing.status == StudySessionStatus::Interrupted {
                return Err(WorkspaceError::InvalidInput(
                    "Revise a sessão interrompida antes de iniciar outra sessão.".to_string(),
                ));
            }
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

    fn create_manual_study(
        &self,
        input: &CreateManualStudyInput,
    ) -> Result<CreateManualStudyResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar registro manual", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;
        if let Some(subject_id) = input.subject_id.as_deref() {
            ensure_subject_exists(&transaction, &input.preparation_id, subject_id)?;
        }

        let task_id = Uuid::new_v4().to_string();
        let planned_minutes = (input.effective_seconds + 59) / 60;
        transaction
            .execute(
                "INSERT INTO study_tasks
                    (id, preparation_id, subject_id, title, planned_minutes, scheduled_for, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'completed')",
                params![
                    task_id.as_str(),
                    input.preparation_id.as_str(),
                    input.subject_id.as_deref(),
                    input.title.as_str(),
                    planned_minutes,
                    input.studied_on.as_str(),
                ],
            )
            .map_err(|error| map_database_error("gravar tarefa do estudo manual", error))?;

        let session_id = Uuid::new_v4().to_string();
        let timestamp = format!("{}T12:00:00Z", input.studied_on);
        transaction
            .execute(
                "INSERT INTO study_sessions
                    (id, task_id, subject_id, started_at, ended_at, effective_seconds, status,
                     origin, notes_markdown, difficulty, next_steps)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, 'completed', 'manual', ?6, ?7, ?8)",
                params![
                    session_id.as_str(),
                    task_id.as_str(),
                    input.subject_id.as_deref(),
                    timestamp.as_str(),
                    input.effective_seconds,
                    input.summary_markdown.as_deref(),
                    input.difficulty.map(SessionDifficulty::as_str),
                    input.next_steps.as_deref(),
                ],
            )
            .map_err(|error| map_database_error("gravar sessão manual", error))?;

        let session = load_session(&transaction, &session_id)?;
        let xp_granted = grant_session_xp(&transaction, &session)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar registro manual", error))?;
        Ok(CreateManualStudyResult {
            session,
            xp_granted,
        })
    }

    fn correct_study_session_duration(
        &self,
        input: &CorrectStudySessionDurationInput,
    ) -> Result<CorrectStudySessionDurationResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar correção da duração", error))?;
        let current = load_session(&transaction, &input.session_id)?;
        if current.status != StudySessionStatus::Completed {
            return Err(WorkspaceError::InvalidInput(
                "Somente sessões concluídas podem ter a duração corrigida.".to_string(),
            ));
        }

        let previous_xp = load_session_xp(&transaction, &current.id)?;
        if current.effective_seconds == input.effective_seconds {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar duração sem alteração", error))?;
            return Ok(CorrectStudySessionDurationResult {
                session: current,
                previous_effective_seconds: input.effective_seconds,
                previous_xp,
                corrected_xp: previous_xp,
                xp_delta: 0,
            });
        }

        transaction
            .execute(
                "UPDATE study_sessions SET effective_seconds = ?1 WHERE id = ?2 AND status = 'completed'",
                params![input.effective_seconds, input.session_id.as_str()],
            )
            .map_err(|error| map_database_error("corrigir duração da sessão", error))?;
        recalculate_session_xp_for_day(&transaction, &current.started_at)?;
        let corrected_session = load_session(&transaction, &input.session_id)?;
        let corrected_xp = load_session_xp(&transaction, &current.id)?;
        transaction
            .execute(
                "INSERT INTO study_session_duration_corrections
                    (id, session_id, previous_effective_seconds, corrected_effective_seconds,
                     previous_xp, corrected_xp, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    current.id.as_str(),
                    current.effective_seconds,
                    input.effective_seconds,
                    previous_xp,
                    corrected_xp,
                    input.reason.as_str(),
                ],
            )
            .map_err(|error| map_database_error("gravar auditoria da correção", error))?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar correção da duração", error))?;

        Ok(CorrectStudySessionDurationResult {
            session: corrected_session,
            previous_effective_seconds: current.effective_seconds,
            previous_xp,
            corrected_xp,
            xp_delta: corrected_xp - previous_xp,
        })
    }

    fn pause_study_session(
        &self,
        input: &PauseStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        recover_stale_active_session(&connection)?;
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

        if current.status == StudySessionStatus::Interrupted {
            transaction
                .execute(
                    "UPDATE study_sessions
                     SET active_started_at = CURRENT_TIMESTAMP,
                         ended_at = NULL, status = 'active'
                     WHERE id = ?1 AND status = 'interrupted'",
                    params![input.session_id.as_str()],
                )
                .map_err(|error| map_database_error("retomar sessão interrompida", error))?;
            let summary = load_session(&transaction, &input.session_id)?;
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar retomada interrompida", error))?;
            return Ok(summary);
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

    fn heartbeat_study_session(
        &self,
        input: &HeartbeatStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar checkpoint da sessão", error))?;
        let current = load_session(&transaction, &input.session_id)?;
        if current.status != StudySessionStatus::Active {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar checkpoint sem alteração", error))?;
            return Ok(current);
        }

        let elapsed_seconds: i64 = transaction
            .query_row(
                "SELECT MAX(0, CAST(strftime('%s', 'now') AS INTEGER) -
                            CAST(strftime('%s', active_started_at) AS INTEGER))
                 FROM study_sessions
                 WHERE id = ?1 AND status = 'active'",
                params![input.session_id.as_str()],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("calcular checkpoint da sessão", error))?;
        if elapsed_seconds > SESSION_INTERRUPTION_THRESHOLD_SECONDS {
            transaction
                .execute(
                    "UPDATE study_sessions
                     SET status = 'interrupted', ended_at = CURRENT_TIMESTAMP,
                         active_started_at = NULL
                     WHERE id = ?1 AND status = 'active'",
                    params![input.session_id.as_str()],
                )
                .map_err(|error| map_database_error("marcar sessão interrompida", error))?;
        } else {
            transaction
                .execute(
                    "UPDATE study_sessions
                     SET effective_seconds = effective_seconds + ?1,
                         active_started_at = CURRENT_TIMESTAMP
                     WHERE id = ?2 AND status = 'active'",
                    params![elapsed_seconds, input.session_id.as_str()],
                )
                .map_err(|error| map_database_error("gravar checkpoint da sessão", error))?;
        }

        let summary = load_session(&transaction, &input.session_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar checkpoint da sessão", error))?;
        Ok(summary)
    }

    fn save_study_session_reflection(
        &self,
        input: &SaveStudySessionReflectionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar gravação do registro da sessão", error))?;
        let current = load_session(&transaction, &input.session_id)?;
        if !matches!(
            current.status,
            StudySessionStatus::Active | StudySessionStatus::Paused
        ) {
            return Err(WorkspaceError::InvalidInput(
                "O registro só pode ser alterado enquanto a sessão está aberta.".to_string(),
            ));
        }

        transaction
            .execute(
                "UPDATE study_sessions
                 SET notes_markdown = ?1, difficulty = ?2, next_steps = ?3
                 WHERE id = ?4 AND status IN ('active', 'paused')",
                params![
                    input.summary_markdown,
                    input.difficulty.map(SessionDifficulty::as_str),
                    input.next_steps,
                    input.session_id,
                ],
            )
            .map_err(|error| map_database_error("gravar registro da sessão", error))?;
        let updated = load_session(&transaction, &input.session_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar registro da sessão", error))?;
        Ok(updated)
    }

    fn finish_study_session(
        &self,
        input: &FinishStudySessionInput,
    ) -> Result<FinishStudySessionResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar encerramento da sessão", error))?;
        let was_active =
            load_session(&transaction, &input.session_id)?.status == StudySessionStatus::Active;
        recover_stale_active_session(&transaction)?;
        let current = load_session(&transaction, &input.session_id)?;

        if was_active && current.status == StudySessionStatus::Interrupted {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar recuperação da sessão", error))?;
            return Err(WorkspaceError::InvalidInput(
                "A sessão foi interrompida antes do encerramento. Revise o tempo confirmado antes de concluir.".to_string(),
            ));
        }

        if current.status == StudySessionStatus::Completed {
            let review = load_review_by_session(&transaction, &input.session_id)?;
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar sessão já encerrada", error))?;
            return Ok(FinishStudySessionResult {
                session: current,
                xp_granted: 0,
                review,
            });
        }

        if input.review_on.is_some() && current.subject_id.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "Esta sessão não está vinculada a um assunto para agendar revisão.".to_string(),
            ));
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
                     effective_seconds = ?1, status = 'completed',
                     notes_markdown = ?2, difficulty = ?3, next_steps = ?4
                  WHERE id = ?5 AND status IN ('active', 'paused', 'interrupted')",
                params![
                    input.effective_seconds,
                    input.summary_markdown,
                    input.difficulty.map(SessionDifficulty::as_str),
                    input.next_steps,
                    input.session_id.as_str(),
                ],
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
        let review = match input.review_on.as_deref() {
            Some(due_date) => Some(create_review_for_session(&transaction, &summary, due_date)?),
            None => None,
        };

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar encerramento da sessão", error))?;
        Ok(FinishStudySessionResult {
            session: summary,
            xp_granted,
            review,
        })
    }

    fn reschedule_study_review(
        &self,
        input: &RescheduleStudyReviewInput,
    ) -> Result<StudyReviewSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar reagendamento da revisão", error))?;
        let current = load_study_review(&transaction, &input.review_id)?;
        if current.status == StudyReviewStatus::Completed {
            return Err(WorkspaceError::InvalidInput(
                "Uma revisão concluída não pode ser reagendada.".to_string(),
            ));
        }

        transaction
            .execute(
                "UPDATE study_reviews
                 SET due_date = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2 AND status = 'pending'",
                params![input.due_date, input.review_id],
            )
            .map_err(|error| map_database_error("reagendar revisão", error))?;
        let updated = load_study_review(&transaction, &input.review_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar reagendamento da revisão", error))?;
        Ok(updated)
    }

    fn complete_study_review(
        &self,
        input: &CompleteStudyReviewInput,
    ) -> Result<CompleteStudyReviewResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar conclusão da revisão", error))?;
        let current = load_study_review(&transaction, &input.review_id)?;
        if current.status == StudyReviewStatus::Completed {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar revisão concluída", error))?;
            return Ok(CompleteStudyReviewResult {
                review: current,
                xp_granted: 0,
            });
        }

        let changed = transaction
            .execute(
                "UPDATE study_reviews
                 SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND status = 'pending'",
                params![input.review_id],
            )
            .map_err(|error| map_database_error("concluir revisão", error))?;
        if changed == 0 {
            let current = load_study_review(&transaction, &input.review_id)?;
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar revisão já concluída", error))?;
            if current.status == StudyReviewStatus::Completed {
                return Ok(CompleteStudyReviewResult {
                    review: current,
                    xp_granted: 0,
                });
            }
            return Err(WorkspaceError::Database(
                "a revisão não pôde ser concluída".to_string(),
            ));
        }
        let completed = load_study_review(&transaction, &input.review_id)?;
        let xp_granted = grant_review_xp(&transaction, &completed)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar conclusão da revisão", error))?;
        Ok(CompleteStudyReviewResult {
            review: completed,
            xp_granted,
        })
    }

    fn study_progress(&self, as_of_date: &str) -> Result<StudyProgressSummary, WorkspaceError> {
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
        let planned_days = load_planned_study_days(&connection, as_of_date)?;
        let streak = calculate_study_streak(&planned_days, as_of_date);

        Ok(StudyProgressSummary {
            total_xp,
            completed_sessions,
            effective_seconds,
            streak,
            recent_sessions,
        })
    }
}

fn grant_session_xp(
    transaction: &rusqlite::Transaction<'_>,
    session: &StudySessionSummary,
) -> Result<i64, WorkspaceError> {
    recalculate_session_xp_for_day(transaction, &session.started_at)?;
    load_session_xp(transaction, &session.id)
}

fn recalculate_session_xp_for_day(
    transaction: &rusqlite::Transaction<'_>,
    started_at: &str,
) -> Result<(), WorkspaceError> {
    let mut statement = transaction
        .prepare(
            "SELECT id, effective_seconds
             FROM study_sessions
             WHERE status = 'completed' AND date(started_at) = date(?1)
             ORDER BY started_at, id",
        )
        .map_err(|error| map_database_error("preparar recálculo de XP", error))?;
    let rows = statement
        .query_map(params![started_at], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|error| map_database_error("consultar sessões para recálculo de XP", error))?;
    let sessions = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| map_database_error("ler sessões para recálculo de XP", error))?;
    drop(statement);

    let mut granted_today = 0;
    for (session_id, effective_seconds) in sessions {
        let points = calculate_session_xp(effective_seconds, granted_today);
        transaction
            .execute(
                "INSERT INTO xp_events (id, source_type, source_id, points, rules_version)
                 VALUES (?1, 'study_session', ?2, ?3, ?4)
                 ON CONFLICT(source_type, source_id) DO UPDATE SET
                     points = excluded.points,
                     rules_version = excluded.rules_version",
                params![
                    Uuid::new_v4().to_string(),
                    session_id.as_str(),
                    points,
                    XP_RULES_VERSION,
                ],
            )
            .map_err(|error| map_database_error("atualizar XP da sessão", error))?;
        granted_today += points;
    }

    Ok(())
}

fn load_session_xp(
    transaction: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<i64, WorkspaceError> {
    transaction
        .query_row(
            "SELECT COALESCE(SUM(points), 0)
             FROM xp_events
             WHERE source_type = 'study_session' AND source_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("consultar XP da sessão", error))
}

fn recover_stale_active_session(connection: &Connection) -> Result<(), WorkspaceError> {
    connection
        .execute(
            "UPDATE study_sessions
             SET status = 'interrupted', ended_at = CURRENT_TIMESTAMP,
                 active_started_at = NULL
             WHERE status = 'active'
               AND (
                   active_started_at IS NULL OR
                   (CAST(strftime('%s', 'now') AS INTEGER) -
                    CAST(strftime('%s', active_started_at) AS INTEGER)) > ?1
               )",
            params![SESSION_INTERRUPTION_THRESHOLD_SECONDS],
        )
        .map_err(|error| map_database_error("recuperar sessão após interrupção", error))?;
    Ok(())
}

fn grant_review_xp(
    transaction: &rusqlite::Transaction<'_>,
    review: &StudyReviewSummary,
) -> Result<i64, WorkspaceError> {
    let granted_today: i64 = transaction
        .query_row(
            "SELECT COALESCE(SUM(points), 0)
             FROM xp_events
             WHERE source_type = 'study_review'
               AND date(created_at) = date('now')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("calcular XP das revisões do dia", error))?;
    let xp_granted = calculate_review_xp(granted_today);

    transaction
        .execute(
            "INSERT INTO xp_events (id, source_type, source_id, points, rules_version)
             VALUES (?1, 'study_review', ?2, ?3, ?4)",
            params![
                Uuid::new_v4().to_string(),
                review.id.as_str(),
                xp_granted,
                REVIEW_XP_RULES_VERSION,
            ],
        )
        .map_err(|error| map_database_error("gravar XP da revisão", error))?;

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
                     sessions.origin, COALESCE(events.points, 0),
                     (SELECT COUNT(*) FROM study_session_duration_corrections corrections
                      WHERE corrections.session_id = sessions.id),
                     (SELECT MAX(corrected_at) FROM study_session_duration_corrections corrections
                      WHERE corrections.session_id = sessions.id),
                     sessions.notes_markdown, sessions.difficulty, sessions.next_steps
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
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
                row.get(12)?,
                row.get(13)?,
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
        origin,
        xp_granted,
        duration_correction_count,
        last_duration_correction_at,
        summary_markdown,
        difficulty,
        next_steps,
    ) = parts;
    let ended_at = ended_at.ok_or_else(|| {
        WorkspaceError::Database("uma sessão concluída não possui data de encerramento".to_string())
    })?;
    let task_status = parse_task_status(&task_status).map_err(WorkspaceError::Database)?;
    let origin = StudySessionOrigin::from_storage(&origin).ok_or_else(|| {
        WorkspaceError::Database("uma sessão possui uma origem inválida".to_string())
    })?;
    let difficulty = difficulty
        .map(|value| {
            SessionDifficulty::from_storage(&value).ok_or_else(|| {
                WorkspaceError::Database("uma sessão possui uma dificuldade inválida".to_string())
            })
        })
        .transpose()?;

    Ok(StudyHistoryEntry {
        session_id,
        task_id,
        task_title,
        subject_name,
        ended_at,
        effective_seconds,
        task_status,
        origin,
        xp_granted,
        duration_correction_count,
        last_duration_correction_at,
        summary_markdown,
        difficulty,
        next_steps,
    })
}

fn load_planned_study_days(
    connection: &rusqlite::Connection,
    as_of_date: &str,
) -> Result<Vec<PlannedStudyDay>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT scheduled_for,
                    MAX(CASE WHEN status IN ('completed', 'partial') THEN 1 ELSE 0 END)
             FROM study_tasks
             WHERE scheduled_for IS NOT NULL
               AND scheduled_for <= ?1
               AND status <> 'skipped'
             GROUP BY scheduled_for
             ORDER BY scheduled_for",
        )
        .map_err(|error| map_database_error("preparar leitura dos dias planejados", error))?;
    let rows = statement
        .query_map(params![as_of_date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|error| map_database_error("consultar dias planejados", error))?;

    rows.map(|row| {
        let (date, completed) =
            row.map_err(|error| map_database_error("ler dia planejado", error))?;
        Ok(PlannedStudyDay {
            date,
            completed: completed == 1,
        })
    })
    .collect()
}

fn load_task(
    transaction: &rusqlite::Connection,
    task_id: &str,
) -> Result<StudyTaskSummary, WorkspaceError> {
    let parts: TaskRow = transaction
        .query_row(
            "SELECT t.id, t.preparation_id, t.subject_id, s.name, t.title,
                    t.objective, t.planned_minutes, t.scheduled_for, t.status,
                    t.material_id, m.original_name
             FROM study_tasks t
             LEFT JOIN subjects s ON s.id = t.subject_id
             LEFT JOIN materials m ON m.id = t.material_id
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
                    row.get(9)?,
                    row.get(10)?,
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

fn load_cycle_suggestion(
    connection: &rusqlite::Connection,
) -> Result<Option<StudyCycleSuggestion>, WorkspaceError> {
    connection
        .query_row(
            "SELECT planning.preparation_id, planning.cycle_position, planning.cycle_step,
                    slots.subject_id, subjects.name, slots.planned_minutes
             FROM study_planning_settings planning
             JOIN preparations ON preparations.id = planning.preparation_id
                AND preparations.archived_at IS NULL
             JOIN study_cycle_slots slots
                ON slots.preparation_id = planning.preparation_id
               AND slots.position = planning.cycle_position
              JOIN subjects ON subjects.id = slots.subject_id
                 AND subjects.preparation_id = slots.preparation_id
                 AND subjects.archived_at IS NULL
             ORDER BY preparations.is_primary DESC, preparations.name COLLATE NOCASE
             LIMIT 1",
            [],
            |row| {
                Ok(StudyCycleSuggestion {
                    preparation_id: row.get(0)?,
                    cycle_position: row.get(1)?,
                    cycle_step: row.get(2)?,
                    subject_id: row.get(3)?,
                    subject_name: row.get(4)?,
                    planned_minutes: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|error| map_database_error("consultar próxima ação do ciclo", error))
}

fn load_daily_tasks(
    connection: &rusqlite::Connection,
    date: &str,
) -> Result<Vec<StudyTaskSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT t.id, t.preparation_id, t.subject_id, s.name, t.title,
                    t.objective, t.planned_minutes, t.scheduled_for, t.status,
                    t.material_id, m.original_name
             FROM study_tasks t
             LEFT JOIN subjects s ON s.id = t.subject_id
             LEFT JOIN materials m ON m.id = t.material_id
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
                row.get(9)?,
                row.get(10)?,
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
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds,
                    status, origin, notes_markdown, difficulty, next_steps
             FROM study_sessions
              WHERE status IN ('active', 'paused', 'interrupted')
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
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds,
                    status, origin, notes_markdown, difficulty, next_steps
             FROM study_sessions
              WHERE status IN ('active', 'paused', 'interrupted')
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
            "SELECT id, task_id, subject_id, started_at, active_started_at, effective_seconds,
                    status, origin, notes_markdown, difficulty, next_steps
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

fn create_review_for_session(
    transaction: &rusqlite::Transaction<'_>,
    session: &StudySessionSummary,
    due_date: &str,
) -> Result<StudyReviewSummary, WorkspaceError> {
    let subject_id = session.subject_id.as_deref().ok_or_else(|| {
        WorkspaceError::InvalidInput(
            "Esta sessão não está vinculada a um assunto para agendar revisão.".to_string(),
        )
    })?;
    transaction
        .execute(
            "INSERT INTO study_reviews (id, subject_id, source_session_id, due_date)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(source_session_id) DO NOTHING",
            params![Uuid::new_v4().to_string(), subject_id, session.id, due_date,],
        )
        .map_err(|error| map_database_error("agendar revisão da sessão", error))?;
    load_review_by_session(transaction, &session.id)?.ok_or_else(|| {
        WorkspaceError::Database("a revisão da sessão não pôde ser localizada".to_string())
    })
}

fn load_review_by_session(
    connection: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<StudyReviewSummary>, WorkspaceError> {
    let row = connection
        .query_row(
            "SELECT r.id, r.subject_id, s.name, r.source_session_id, r.due_date,
                    r.status, r.created_at, r.updated_at, r.completed_at
             FROM study_reviews r
             JOIN subjects s ON s.id = r.subject_id
             WHERE r.source_session_id = ?1",
            params![session_id],
            study_review_row,
        )
        .optional()
        .map_err(|error| map_database_error("localizar revisão da sessão", error))?;
    row.map(study_review_summary_from_row).transpose()
}

fn load_study_review(
    connection: &rusqlite::Connection,
    review_id: &str,
) -> Result<StudyReviewSummary, WorkspaceError> {
    let row = connection
        .query_row(
            "SELECT r.id, r.subject_id, s.name, r.source_session_id, r.due_date,
                    r.status, r.created_at, r.updated_at, r.completed_at
             FROM study_reviews r
             JOIN subjects s ON s.id = r.subject_id
             WHERE r.id = ?1",
            params![review_id],
            study_review_row,
        )
        .optional()
        .map_err(|error| map_database_error("localizar revisão", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("A revisão escolhida não existe mais.".to_string())
        })?;
    study_review_summary_from_row(row)
}

fn load_due_reviews(
    connection: &rusqlite::Connection,
    date: &str,
) -> Result<Vec<StudyReviewSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT r.id, r.subject_id, s.name, r.source_session_id, r.due_date,
                    r.status, r.created_at, r.updated_at, r.completed_at
             FROM study_reviews r
             JOIN subjects s ON s.id = r.subject_id
             WHERE r.status = 'pending' AND r.due_date <= ?1
             ORDER BY r.due_date, s.name COLLATE NOCASE, r.id",
        )
        .map_err(|error| map_database_error("preparar leitura das revisões vencidas", error))?;
    let rows = statement
        .query_map(params![date], study_review_row)
        .map_err(|error| map_database_error("consultar revisões vencidas", error))?;

    rows.map(|row| {
        let row = row.map_err(|error| map_database_error("ler revisão vencida", error))?;
        study_review_summary_from_row(row)
    })
    .collect()
}

fn study_review_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StudyReviewRow> {
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
}

fn study_review_summary_from_row(
    row: StudyReviewRow,
) -> Result<StudyReviewSummary, WorkspaceError> {
    let (
        id,
        subject_id,
        subject_name,
        source_session_id,
        due_date,
        status,
        created_at,
        updated_at,
        completed_at,
    ) = row;
    let status = match status.as_str() {
        "pending" => StudyReviewStatus::Pending,
        "completed" => StudyReviewStatus::Completed,
        _ => {
            return Err(WorkspaceError::Database(
                "a revisão possui um status inválido".to_string(),
            ));
        }
    };

    Ok(StudyReviewSummary {
        id,
        subject_id,
        subject_name,
        source_session_id,
        due_date,
        status,
        created_at,
        updated_at,
        completed_at,
    })
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
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
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
        material_id,
        material_name,
    ) = parts;
    let status = parse_task_status(&status).map_err(WorkspaceError::Database)?;

    Ok(StudyTaskSummary {
        id,
        preparation_id,
        subject_id,
        subject_name,
        material_id,
        material_name,
        title,
        objective,
        planned_minutes,
        scheduled_for,
        status,
    })
}

fn session_summary_from_parts(parts: SessionRow) -> Result<StudySessionSummary, WorkspaceError> {
    let (
        id,
        task_id,
        subject_id,
        started_at,
        active_started_at,
        effective_seconds,
        status,
        origin,
        summary_markdown,
        difficulty,
        next_steps,
    ) = parts;
    let status = parse_session_status(&status).map_err(WorkspaceError::Database)?;
    let origin = StudySessionOrigin::from_storage(&origin).ok_or_else(|| {
        WorkspaceError::Database("uma sessão possui uma origem inválida".to_string())
    })?;
    let difficulty = difficulty
        .map(|value| {
            SessionDifficulty::from_storage(&value).ok_or_else(|| {
                WorkspaceError::Database("uma sessão possui uma dificuldade inválida".to_string())
            })
        })
        .transpose()?;

    Ok(StudySessionSummary {
        id,
        task_id,
        subject_id,
        started_at,
        active_started_at,
        effective_seconds,
        status,
        origin,
        summary_markdown,
        difficulty,
        next_steps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::material_service::MaterialStore;
    use crate::application::note_service::NoteStore;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::material::{ImportMaterialInput, UpdateMaterialPageInput};
    use crate::domain::note::SaveNoteInput;
    use crate::domain::study_plan::{
        default_study_availability, CreatePreparationInput, CreateSubjectInput,
        SaveStudyPlanningInput, StudyCycleSlotInput, SubjectPriorityInput,
        DEFAULT_REVIEW_RESERVE_PERCENT,
    };
    use std::fs;

    #[test]
    fn keeps_task_material_notes_and_reading_page_after_reopening() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-task-material-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-task-material-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Material da tarefa")
            .expect("o espaço da fixture deve ser criado");
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
                preparation_id: preparation.id.clone(),
                name: "Direito".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let source = app_data_dir.join("material.pdf");
        fs::write(&source, b"%PDF-1.4\nfixture").expect("o PDF sintético deve existir");
        let material = store
            .import_material(&ImportMaterialInput {
                source_path: source.to_string_lossy().to_string(),
                subject_id: Some(subject.id.clone()),
            })
            .expect("o PDF deve ser copiado para o espaço");
        fs::remove_file(source).expect("o original externo pode ser removido");
        let bad_task = store.create_study_task(&CreateStudyTaskInput {
            preparation_id: preparation.id.clone(),
            subject_id: Some(subject.id.clone()),
            material_id: Some(Uuid::new_v4().to_string()),
            title: "Material inválido".to_string(),
            objective: None,
            planned_minutes: 30,
            scheduled_for: "2032-08-01".to_string(),
        });
        assert!(bad_task.is_err());
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: Some(subject.id.clone()),
                material_id: Some(material.id.clone()),
                title: "Ler material".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-08-01".to_string(),
            })
            .expect("a tarefa deve guardar o material importado");
        store
            .save_note(&SaveNoteInput {
                id: None,
                title: "Resumo".to_string(),
                content_markdown: "# Ponto importante".to_string(),
                material_id: Some(material.id.clone()),
                subject_id: Some(subject.id),
            })
            .expect("a nota deve ser ligada ao contexto");
        store
            .update_material_page(&UpdateMaterialPageInput {
                material_id: material.id.clone(),
                page: 3,
            })
            .expect("a página atual deve ser salva");
        store
            .start_study_session(&StartStudySessionInput {
                task_id: task.id.clone(),
            })
            .expect("a sessão deve iniciar");
        store
            .open_workspace(&workspace_path)
            .expect("o mesmo espaço deve reabrir");
        let plan = store
            .daily_plan("2032-08-02")
            .expect("a sessão do dia anterior deve ser recuperada");
        let active_task = plan
            .active_task
            .expect("a tarefa da sessão deve permanecer acessível");
        let reopened_material = store
            .list_materials()
            .expect("o material deve continuar disponível")
            .into_iter()
            .find(|item| item.id == material.id)
            .expect("o material deve existir");
        let notes = store.list_notes().expect("as notas devem reabrir");
        assert_eq!(active_task.id, task.id);
        assert_eq!(
            active_task.material_id.as_deref(),
            Some(material.id.as_str())
        );
        assert_eq!(active_task.material_name.as_deref(), Some("material.pdf"));
        assert_eq!(reopened_material.current_page, 3);
        assert_eq!(notes[0].material_id.as_deref(), Some(material.id.as_str()));
        assert!(store
            .material_path(&material.id)
            .expect("a cópia deve existir")
            .is_file());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

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
                board: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("a preparação deve ser criada");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: None,
                material_id: None,
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
                review_on: None,
                summary_markdown: None,
                difficulty: None,
                next_steps: None,
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
                review_on: None,
                summary_markdown: None,
                difficulty: None,
                next_steps: None,
            })
            .expect("repetir o encerramento deve ser idempotente");
        let progress = store
            .study_progress("2032-01-15")
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
    fn caps_session_xp_per_day_across_sessions() {
        use crate::domain::study::SESSION_XP_DAILY_CAP;

        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-xp-cap-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-xp-cap-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Teto de XP")
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

        let mut granted_points = Vec::new();
        let mut last_session_id = String::new();
        for index in 1..=3 {
            let task = store
                .create_study_task(&CreateStudyTaskInput {
                    preparation_id: preparation.id.clone(),
                    subject_id: None,
                    material_id: None,
                    title: format!("Bloco de estudo {index}"),
                    objective: None,
                    planned_minutes: 60,
                    scheduled_for: "2032-02-01".to_string(),
                })
                .expect("a tarefa deve ser criada");
            let session = store
                .start_study_session(&StartStudySessionInput { task_id: task.id })
                .expect("a sessão deve iniciar");
            last_session_id = session.id.clone();
            let finished = store
                .finish_study_session(&FinishStudySessionInput {
                    session_id: session.id,
                    effective_seconds: 3_600,
                    task_status: TaskCompletion::Completed,
                    review_on: None,
                    summary_markdown: None,
                    difficulty: None,
                    next_steps: None,
                })
                .expect("a sessão deve ser concluída");
            granted_points.push(finished.xp_granted);
        }

        assert!(
            granted_points.iter().all(|points| *points <= 60),
            "nenhuma sessão de 60 minutos pode exceder 60 XP: {granted_points:?}"
        );

        // O teto é do dia, não da sessão: uma nova conclusão pode redistribuir
        // pontos entre sessões do mesmo dia, mas o total persistido não passa do teto.
        let connection = store
            .active_database()
            .expect("o banco ativo deve poder ser consultado");
        let (event_count, persisted_points): (i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(points), 0)
                 FROM xp_events WHERE source_type = 'study_session'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("o XP das sessões deve ser consultado");
        assert_eq!(event_count, 3);
        assert_eq!(
            persisted_points, SESSION_XP_DAILY_CAP,
            "três sessões de uma hora devem parar no teto diário de {SESSION_XP_DAILY_CAP} XP"
        );

        let repeated_finish = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: last_session_id,
                effective_seconds: 3_600,
                task_status: TaskCompletion::Completed,
                review_on: None,
                summary_markdown: None,
                difficulty: None,
                next_steps: None,
            })
            .expect("repetir o encerramento deve ser idempotente");
        assert_eq!(repeated_finish.xp_granted, 0);

        let progress = store
            .study_progress("2032-02-01")
            .expect("o progresso deve ser lido");
        assert_eq!(progress.total_xp, SESSION_XP_DAILY_CAP);
        assert_eq!(progress.completed_sessions, 3);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn records_manual_study_and_audits_duration_correction_without_duplicate_xp() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-manual-study-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-manual-study-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Estudo manual")
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

        let manual = store
            .create_manual_study(&CreateManualStudyInput {
                preparation_id: preparation.id,
                subject_id: None,
                title: "Leitura fora do app".to_string(),
                studied_on: "2032-07-01".to_string(),
                effective_seconds: 3_600,
                summary_markdown: Some("Resumo manual".to_string()),
                difficulty: Some(SessionDifficulty::Normal),
                next_steps: None,
            })
            .expect("o estudo manual deve ser registrado");
        let corrected = store
            .correct_study_session_duration(&CorrectStudySessionDurationInput {
                session_id: manual.session.id.clone(),
                effective_seconds: 1_800,
                reason: "o cronômetro externo ficou aberto".to_string(),
            })
            .expect("a duração deve ser corrigida");
        let repeated = store
            .correct_study_session_duration(&CorrectStudySessionDurationInput {
                session_id: manual.session.id.clone(),
                effective_seconds: 1_800,
                reason: "mesmo valor já conferido".to_string(),
            })
            .expect("repetir a correção deve ser idempotente");
        let progress = store
            .study_progress("2032-07-01")
            .expect("o progresso deve incluir o estudo manual");
        let connection = store
            .active_database()
            .expect("o banco ativo deve poder ser consultado");
        let correction_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM study_session_duration_corrections WHERE session_id = ?1",
                params![manual.session.id.as_str()],
                |row| row.get(0),
            )
            .expect("a auditoria deve ser persistida");

        assert_eq!(manual.session.origin, StudySessionOrigin::Manual);
        assert_eq!(manual.xp_granted, 60);
        assert_eq!(corrected.previous_effective_seconds, 3_600);
        assert_eq!(corrected.corrected_xp, 30);
        assert_eq!(corrected.xp_delta, -30);
        assert_eq!(repeated.xp_delta, 0);
        assert_eq!(progress.total_xp, 30);
        assert_eq!(progress.effective_seconds, 1_800);
        assert_eq!(
            progress.recent_sessions[0].origin,
            StudySessionOrigin::Manual
        );
        assert_eq!(progress.recent_sessions[0].duration_correction_count, 1);
        assert_eq!(correction_count, 1);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn interrupts_stale_session_without_adding_uncertain_wall_time() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-interrupted-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-interrupted-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Sessão interrompida")
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
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: None,
                material_id: None,
                title: "Sessão recuperável".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-08-01".to_string(),
            })
            .expect("a tarefa deve ser criada");
        let session = store
            .start_study_session(&StartStudySessionInput { task_id: task.id })
            .expect("a sessão deve iniciar");
        let connection = store
            .active_database()
            .expect("o banco ativo deve ser aberto");
        connection
            .execute(
                "UPDATE study_sessions
                 SET active_started_at = '2000-01-01 00:00:00'
                 WHERE id = ?1",
                params![session.id.as_str()],
            )
            .expect("o relógio antigo deve ser aplicado à fixture");
        drop(connection);

        let plan = store
            .daily_plan("2032-08-01")
            .expect("o plano deve recuperar a sessão");
        let interrupted = plan
            .active_session
            .expect("a sessão interrompida deve continuar visível");
        assert_eq!(interrupted.status, StudySessionStatus::Interrupted);
        assert_eq!(interrupted.effective_seconds, 0);

        let repeated_heartbeat = store
            .heartbeat_study_session(&HeartbeatStudySessionInput {
                session_id: session.id.clone(),
            })
            .expect("o heartbeat repetido deve ser idempotente");
        assert_eq!(repeated_heartbeat.status, StudySessionStatus::Interrupted);

        let resumed = store
            .resume_study_session(&ResumeStudySessionInput {
                session_id: session.id,
            })
            .expect("a sessão deve poder ser retomada após a revisão");
        assert_eq!(resumed.status, StudySessionStatus::Active);
        assert_eq!(resumed.effective_seconds, 0);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_session_reflection_and_keeps_it_on_finish() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-reflection-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-reflection-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Registro de sessão")
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
                preparation_id: preparation.id.clone(),
                name: "Redes".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: Some(subject.id),
                material_id: None,
                title: "Estudar roteamento".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-06-01".to_string(),
            })
            .expect("a tarefa deve ser criada");
        let session = store
            .start_study_session(&StartStudySessionInput { task_id: task.id })
            .expect("a sessão deve iniciar");
        let reflection = SaveStudySessionReflectionInput {
            session_id: session.id.clone(),
            summary_markdown: Some("# Resumo\n\n- Revisei rotas estáticas".to_string()),
            difficulty: Some(SessionDifficulty::Hard),
            next_steps: Some("Rever OSPF\nFazer questões".to_string()),
        };

        let saved = store
            .save_study_session_reflection(&reflection)
            .expect("o registro deve ser salvo enquanto a sessão está aberta");
        let finished = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_200,
                task_status: TaskCompletion::Partial,
                review_on: None,
                summary_markdown: reflection.summary_markdown.clone(),
                difficulty: reflection.difficulty,
                next_steps: reflection.next_steps.clone(),
            })
            .expect("o registro deve permanecer junto da sessão concluída");
        let repeated_finish = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_200,
                task_status: TaskCompletion::Partial,
                review_on: None,
                summary_markdown: Some("Tentativa de substituição".to_string()),
                difficulty: Some(SessionDifficulty::Easy),
                next_steps: None,
            })
            .expect("repetir o encerramento deve preservar o primeiro registro");
        let progress = store
            .study_progress("2032-06-01")
            .expect("o histórico deve carregar os dados do registro da sessão");

        assert_eq!(
            saved.summary_markdown.as_deref(),
            Some("# Resumo\n\n- Revisei rotas estáticas")
        );
        assert_eq!(finished.session.difficulty, Some(SessionDifficulty::Hard));
        assert_eq!(
            finished.session.next_steps.as_deref(),
            Some("Rever OSPF\nFazer questões")
        );
        assert_eq!(
            repeated_finish.session.summary_markdown,
            finished.session.summary_markdown
        );
        assert_eq!(
            repeated_finish.session.difficulty,
            finished.session.difficulty
        );
        assert_eq!(
            progress.recent_sessions[0].summary_markdown.as_deref(),
            Some("# Resumo\n\n- Revisei rotas estáticas")
        );
        assert_eq!(
            progress.recent_sessions[0].difficulty,
            Some(SessionDifficulty::Hard)
        );
        assert_eq!(
            progress.recent_sessions[0].next_steps.as_deref(),
            Some("Rever OSPF\nFazer questões")
        );

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn schedules_one_review_per_session_and_keeps_it_when_rescheduled_or_completed() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-review-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-review-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Revisões de teste")
            .expect("o espaço temporário deve ser criado");
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
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id,
                subject_id: Some(subject.id.clone()),
                material_id: None,
                title: "Estudar controle de constitucionalidade".to_string(),
                objective: None,
                planned_minutes: 30,
                scheduled_for: "2032-04-01".to_string(),
            })
            .expect("a tarefa deve ser criada");
        let session = store
            .start_study_session(&StartStudySessionInput { task_id: task.id })
            .expect("a sessão deve iniciar");

        let finished = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_200,
                task_status: TaskCompletion::Completed,
                review_on: Some("2032-04-08".to_string()),
                summary_markdown: None,
                difficulty: None,
                next_steps: None,
            })
            .expect("a sessão e a revisão devem ser salvas juntas");
        let review = finished.review.expect("a revisão deve ser retornada");
        let before_due = store
            .daily_plan("2032-04-07")
            .expect("o plano antes do vencimento deve ser lido");
        let due = store
            .daily_plan("2032-04-08")
            .expect("a revisão vencida deve aparecer no plano");
        let repeated_finish = store
            .finish_study_session(&FinishStudySessionInput {
                session_id: session.id.clone(),
                effective_seconds: 1_200,
                task_status: TaskCompletion::Completed,
                review_on: Some("2032-04-09".to_string()),
                summary_markdown: None,
                difficulty: None,
                next_steps: None,
            })
            .expect("repetir o encerramento não deve criar outra revisão");
        let rescheduled = store
            .reschedule_study_review(&RescheduleStudyReviewInput {
                review_id: review.id.clone(),
                due_date: "2032-04-10".to_string(),
            })
            .expect("a revisão deve ser reagendada na mesma ocorrência");
        let completed = store
            .complete_study_review(&CompleteStudyReviewInput {
                review_id: review.id.clone(),
            })
            .expect("a revisão deve ser concluída");
        let repeated_completion = store
            .complete_study_review(&CompleteStudyReviewInput {
                review_id: review.id.clone(),
            })
            .expect("repetir a conclusão deve ser idempotente");
        let after_completion = store
            .daily_plan("2032-04-10")
            .expect("a revisão concluída não deve permanecer pendente");

        assert_eq!(review.subject_id, subject.id);
        assert_eq!(review.due_date, "2032-04-08");
        assert!(before_due.reviews.is_empty());
        assert_eq!(due.reviews.len(), 1);
        assert_eq!(
            repeated_finish.review.as_ref().map(|item| item.id.as_str()),
            Some(review.id.as_str())
        );
        assert_eq!(repeated_finish.xp_granted, 0);
        assert_eq!(rescheduled.id, review.id);
        assert_eq!(rescheduled.due_date, "2032-04-10");
        assert_eq!(completed.review.status, StudyReviewStatus::Completed);
        assert!(completed.review.completed_at.is_some());
        assert_eq!(completed.review.id, repeated_completion.review.id);
        assert_eq!(completed.xp_granted, 5);
        assert_eq!(repeated_completion.xp_granted, 0);
        assert!(after_completion.reviews.is_empty());
        let connection = store
            .active_database()
            .expect("o banco ativo deve poder ser consultado");
        let (review_event_count, review_points): (i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(points), 0)
                 FROM xp_events WHERE source_type = 'study_review'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("o XP da revisão deve ser persistido uma vez");
        assert_eq!(review_event_count, 1);
        assert_eq!(review_points, 5);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn progress_streak_uses_planned_days_and_waits_until_today_ends() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-streak-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-streak-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Sequência de teste")
            .expect("o espaço temporário deve ser criado");
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

        let make_task = |date: &str, title: &str| {
            store
                .create_study_task(&CreateStudyTaskInput {
                    preparation_id: preparation.id.clone(),
                    subject_id: None,
                    material_id: None,
                    title: title.to_string(),
                    objective: None,
                    planned_minutes: 20,
                    scheduled_for: date.to_string(),
                })
                .expect("a tarefa planejada deve ser criada")
        };
        let first_study_day = make_task("2032-05-01", "Estudo inicial");
        let missed_study_day = make_task("2032-05-03", "Dia planejado perdido");
        let later_study_day = make_task("2032-05-05", "Retomada");
        let latest_study_day = make_task("2032-05-07", "Estudo após descanso");
        let today_pending = make_task("2032-05-10", "Tarefa de hoje");

        for task_id in [
            first_study_day.id.as_str(),
            later_study_day.id.as_str(),
            latest_study_day.id.as_str(),
        ] {
            let session = store
                .start_study_session(&StartStudySessionInput {
                    task_id: task_id.to_string(),
                })
                .expect("a sessão de estudo deve iniciar");
            store
                .finish_study_session(&FinishStudySessionInput {
                    session_id: session.id,
                    effective_seconds: 1_200,
                    task_status: TaskCompletion::Completed,
                    review_on: None,
                    summary_markdown: None,
                    difficulty: None,
                    next_steps: None,
                })
                .expect("a sessão de estudo deve concluir");
        }

        let progress_today = store
            .study_progress("2032-05-10")
            .expect("a sequência de hoje deve ser calculada");
        let progress_next_day = store
            .study_progress("2032-05-11")
            .expect("o dia planejado perdido deve encerrar a sequência atual");

        assert_eq!(progress_today.streak.current_planned_days, 2);
        assert_eq!(progress_today.streak.longest_planned_days, 2);
        assert_eq!(
            progress_today.streak.last_study_day.as_deref(),
            Some("2032-05-07")
        );
        assert_eq!(progress_next_day.streak.current_planned_days, 0);
        assert_eq!(progress_next_day.streak.longest_planned_days, 2);
        assert_eq!(missed_study_day.status, StudyTaskStatus::Pending);
        assert_eq!(today_pending.status, StudyTaskStatus::Pending);

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
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a preparação deve ser criada");
        let task = store
            .create_study_task(&CreateStudyTaskInput {
                preparation_id: preparation.id.clone(),
                subject_id: None,
                material_id: None,
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
                material_id: None,
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

    #[test]
    fn accepts_cycle_action_once_and_rejects_a_stale_repeat() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-cycle-action-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-cycle-action-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Ação do ciclo")
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
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        store
            .save_study_planning(&SaveStudyPlanningInput {
                preparation_id: preparation.id.clone(),
                availability: default_study_availability(),
                subject_priorities: vec![SubjectPriorityInput {
                    subject_id: subject.id.clone(),
                    priority: 1,
                }],
                review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
                cycle_slots: Some(vec![StudyCycleSlotInput {
                    subject_id: subject.id.clone(),
                    planned_minutes: 30,
                }]),
            })
            .expect("o ciclo deve ser salvo");

        let before = store
            .daily_plan("2032-06-01")
            .expect("o plano antes do aceite deve ser lido");
        let suggestion = before
            .cycle_suggestion
            .expect("o ciclo deve oferecer uma próxima ação");
        let accepted = store
            .accept_study_cycle_action(&AcceptStudyCycleActionInput {
                preparation_id: suggestion.preparation_id.clone(),
                cycle_position: suggestion.cycle_position,
                cycle_step: suggestion.cycle_step,
                scheduled_for: "2032-06-01".to_string(),
            })
            .expect("a ação deve virar uma tarefa");
        let repeated = store.accept_study_cycle_action(&AcceptStudyCycleActionInput {
            preparation_id: suggestion.preparation_id,
            cycle_position: suggestion.cycle_position,
            cycle_step: suggestion.cycle_step,
            scheduled_for: "2032-06-01".to_string(),
        });
        let after = store
            .daily_plan("2032-06-01")
            .expect("o plano após o aceite deve ser lido");

        assert_eq!(
            accepted.task.subject_id.as_deref(),
            Some(subject.id.as_str())
        );
        assert_eq!(accepted.next_cycle_position, 0);
        assert_eq!(accepted.next_cycle_step, 1);
        assert!(repeated.is_err());
        assert_eq!(after.tasks.len(), 1);
        assert_eq!(
            after
                .cycle_suggestion
                .as_ref()
                .map(|item| item.cycle_position),
            Some(0)
        );
        assert_eq!(
            after.cycle_suggestion.as_ref().map(|item| item.cycle_step),
            Some(1)
        );

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
