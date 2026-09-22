use crate::application::workspace_service::{WorkspaceError, WorkspaceRecord, WorkspaceStore};
use crate::domain::workspace::{
    validate_workspace_name, CURRENT_FORMAT_VERSION, WORKSPACE_MANIFEST_FILE, WorkspaceManifest,
};
use rusqlite::{params, Connection, OptionalExtension};
use crate::infrastructure::map_database_error;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const CURRENT_SCHEMA_VERSION: i64 = 3;
const ACTIVE_WORKSPACE_FILE: &str = "active-workspace.json";

#[derive(Debug, Clone)]
pub struct LocalWorkspaceStore {
    app_data_dir: PathBuf,
}

impl LocalWorkspaceStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self { app_data_dir }
    }

    fn active_workspace_file(&self) -> PathBuf {
        self.app_data_dir.join(ACTIVE_WORKSPACE_FILE)
    }

    fn active_database_file(&self, workspace_id: Uuid) -> PathBuf {
        self.app_data_dir
            .join("workspaces")
            .join(workspace_id.to_string())
            .join("workspace.sqlite3")
    }

    fn prepare_active_database(&self, manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
        let database_file = self.active_database_file(manifest.workspace_id);
        let database_directory = database_file.parent().ok_or_else(|| {
            WorkspaceError::Database("Não foi possível determinar a pasta do banco local.".to_string())
        })?;

        fs::create_dir_all(database_directory).map_err(|error| map_io_error("criar o banco local", error))?;
        let mut connection = Connection::open(&database_file)
            .map_err(|error| WorkspaceError::Database(format!("abrir o banco local: {error}")))?;

        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| WorkspaceError::Database(format!("ativar integridade: {error}")))?;
        apply_migrations(&mut connection)?;
        ensure_workspace_metadata(&connection, manifest)?;

        Ok(())
    }

    pub(crate) fn active_database(&self) -> Result<Connection, WorkspaceError> {
        let record = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let database_file = self.active_database_file(record.manifest.workspace_id);
        let connection = Connection::open(database_file)
            .map_err(|error| WorkspaceError::Database(format!("abrir o banco local: {error}")))?;

        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| WorkspaceError::Database(format!("ativar integridade: {error}")))?;

        Ok(connection)
    }

    fn inspect_workspace(&self, path: &Path) -> Result<WorkspaceRecord, WorkspaceError> {
        let canonical_path = canonical_workspace_path(path, false)?;
        let manifest_path = canonical_path.join(WORKSPACE_MANIFEST_FILE);

        if !manifest_path.is_file() {
            return Err(WorkspaceError::IncompleteWorkspace(
                "o arquivo workspace.json não foi encontrado".to_string(),
            ));
        }

        let manifest_contents = fs::read_to_string(&manifest_path)
            .map_err(|error| map_io_error("ler o manifesto do espaço", error))?;
        let manifest: WorkspaceManifest = serde_json::from_str(&manifest_contents)
            .map_err(|error| WorkspaceError::Serialization(format!("manifesto inválido: {error}")))?;

        validate_manifest(&manifest)?;
        for directory_name in ["revisions", "blobs", "exports"] {
            let directory = canonical_path.join(directory_name);
            if !directory.is_dir() {
                return Err(WorkspaceError::IncompleteWorkspace(format!(
                    "a pasta {directory_name} não foi encontrada"
                )));
            }
        }

        Ok(WorkspaceRecord {
            manifest,
            path: canonical_path,
        })
    }

    fn write_active_workspace(&self, record: &WorkspaceRecord) -> Result<(), WorkspaceError> {
        fs::create_dir_all(&self.app_data_dir)
            .map_err(|error| map_io_error("preparar o armazenamento local", error))?;

        let pointer = ActiveWorkspacePointer {
            workspace_id: record.manifest.workspace_id,
            workspace_path: record
                .path
                .to_str()
                .ok_or_else(|| WorkspaceError::ActiveWorkspace("o caminho ativo não é válido".to_string()))?
                .to_string(),
        };

        write_json_atomically(&self.active_workspace_file(), &pointer)
    }

    fn ensure_writable(&self, workspace_path: &Path) -> Result<(), WorkspaceError> {
        let check_file = workspace_path.join(format!(".cursoucon-write-check-{}", Uuid::new_v4()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&check_file)
            .map_err(|error| map_io_error("validar a permissão de escrita", error))?;
        file.write_all(b"cursoucon")
            .map_err(|error| map_io_error("validar a permissão de escrita", error))?;
        drop(file);
        fs::remove_file(check_file).map_err(|error| map_io_error("limpar a validação de escrita", error))?;
        Ok(())
    }
}

impl WorkspaceStore for LocalWorkspaceStore {
    fn create_workspace(&self, path: &Path, name: &str) -> Result<WorkspaceRecord, WorkspaceError> {
        let canonical_path = canonical_workspace_path(path, true)?;
        let manifest_path = canonical_path.join(WORKSPACE_MANIFEST_FILE);

        if manifest_path.exists() {
            return Err(WorkspaceError::WorkspaceExists);
        }

        self.ensure_writable(&canonical_path)?;
        for directory_name in ["revisions", "blobs", "exports"] {
            fs::create_dir_all(canonical_path.join(directory_name))
                .map_err(|error| map_io_error("criar a estrutura do espaço", error))?;
        }

        let valid_name = validate_workspace_name(name).map_err(WorkspaceError::InvalidInput)?;
        let manifest = WorkspaceManifest::new(valid_name);
        let record = WorkspaceRecord {
            manifest,
            path: canonical_path,
        };

        self.prepare_active_database(&record.manifest)?;
        write_json_atomically(&manifest_path, &record.manifest)?;
        self.write_active_workspace(&record)?;

        Ok(record)
    }

    fn open_workspace(&self, path: &Path) -> Result<WorkspaceRecord, WorkspaceError> {
        let record = self.inspect_workspace(path)?;
        self.ensure_writable(&record.path)?;
        self.prepare_active_database(&record.manifest)?;
        self.write_active_workspace(&record)?;
        Ok(record)
    }

    fn active_workspace(&self) -> Result<Option<WorkspaceRecord>, WorkspaceError> {
        let pointer_file = self.active_workspace_file();
        let pointer_source = if pointer_file.is_file() {
            pointer_file
        } else {
            let backup_file = backup_path(&pointer_file)?;
            if !backup_file.is_file() {
                return Ok(None);
            }
            backup_file
        };

        let contents = fs::read_to_string(pointer_source)
            .map_err(|error| WorkspaceError::ActiveWorkspace(format!("ler o espaço ativo: {error}")))?;
        let pointer: ActiveWorkspacePointer = serde_json::from_str(&contents)
            .map_err(|error| WorkspaceError::ActiveWorkspace(format!("ponteiro inválido: {error}")))?;
        let record = self.inspect_workspace(Path::new(&pointer.workspace_path))?;

        if record.manifest.workspace_id != pointer.workspace_id {
            return Err(WorkspaceError::ActiveWorkspace(
                "o identificador do espaço ativo não corresponde ao manifesto".to_string(),
            ));
        }

        self.prepare_active_database(&record.manifest)?;
        Ok(Some(record))
    }
}

impl StudyPlanStore for LocalWorkspaceStore {
    fn study_plan(&self) -> Result<StudyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        let mut preparation_statement = connection
            .prepare(
                "SELECT id, name, organization, role, exam_date, is_primary
                 FROM preparations
                 WHERE archived_at IS NULL
                 ORDER BY is_primary DESC, name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar leitura das preparações", error))?;
        let preparation_rows = preparation_statement
            .query_map([], |row| {
                let is_primary: i64 = row.get(5)?;
                Ok(PreparationSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    organization: row.get(2)?,
                    role: row.get(3)?,
                    exam_date: row.get(4)?,
                    is_primary: is_primary == 1,
                })
            })
            .map_err(|error| map_database_error("consultar as preparações", error))?;
        let mut preparations = Vec::new();
        for row in preparation_rows {
            preparations.push(
                row.map_err(|error| map_database_error("ler uma preparação", error))?,
            );
        }
        drop(preparation_statement);

        let mut subject_statement = connection
            .prepare(
                "SELECT s.id, s.preparation_id, s.parent_id, s.name, s.position
                 FROM subjects s
                 JOIN preparations p ON p.id = s.preparation_id
                 WHERE s.archived_at IS NULL AND p.archived_at IS NULL
                 ORDER BY s.preparation_id, s.parent_id IS NOT NULL, s.position, s.name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar leitura dos assuntos", error))?;
        let subject_rows = subject_statement
            .query_map([], |row| {
                Ok(SubjectSummary {
                    id: row.get(0)?,
                    preparation_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    name: row.get(3)?,
                    position: row.get(4)?,
                })
            })
            .map_err(|error| map_database_error("consultar os assuntos", error))?;
        let mut subjects = Vec::new();
        for row in subject_rows {
            subjects.push(row.map_err(|error| map_database_error("ler um assunto", error))?);
        }

        Ok(StudyPlan {
            preparations,
            subjects,
        })
    }

    fn create_preparation(
        &self,
        input: &CreatePreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da preparação", error))?;
        let primary_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM preparations WHERE archived_at IS NULL AND is_primary = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("verificar preparação principal", error))?;
        let is_primary = primary_count == 0 || input.make_primary;

        if is_primary {
            transaction
                .execute(
                    "UPDATE preparations SET is_primary = 0 WHERE archived_at IS NULL",
                    [],
                )
                .map_err(|error| map_database_error("alternar preparação principal", error))?;
        }

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO preparations
                    (id, name, organization, role, exam_date, is_primary)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id.as_str(),
                    &input.name,
                    input.organization.as_deref(),
                    input.role.as_deref(),
                    input.exam_date.as_deref(),
                    if is_primary { 1_i64 } else { 0_i64 },
                ],
            )
            .map_err(|error| map_database_error("gravar preparação", error))?;

        let summary = PreparationSummary {
            id,
            name: input.name.clone(),
            organization: input.organization.clone(),
            role: input.role.clone(),
            exam_date: input.exam_date.clone(),
            is_primary,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar preparação", error))?;

        Ok(summary)
    }

    fn create_subject(&self, input: &CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação do assunto", error))?;
        let preparation_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
                params![input.preparation_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("verificar preparação do assunto", error))?;

        if preparation_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A preparação escolhida não existe mais.".to_string(),
            ));
        }

        if let Some(parent_id) = input.parent_id.as_deref() {
            let parent_exists: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM subjects
                     WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
                    params![parent_id, input.preparation_id.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("verificar assunto pai", error))?;

            if parent_exists.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "O assunto pai não pertence à preparação escolhida.".to_string(),
                ));
            }
        }

        let position: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1
                 FROM subjects
                 WHERE preparation_id = ?1 AND parent_id IS ?2 AND archived_at IS NULL",
                params![input.preparation_id.as_str(), input.parent_id.as_deref()],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("calcular posição do assunto", error))?;
        let id = Uuid::new_v4().to_string();

        transaction
            .execute(
                "INSERT INTO subjects (id, preparation_id, parent_id, name, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id.as_str(),
                    input.preparation_id.as_str(),
                    input.parent_id.as_deref(),
                    &input.name,
                    position,
                ],
            )
            .map_err(|error| map_database_error("gravar assunto", error))?;

        let summary = SubjectSummary {
            id,
            preparation_id: input.preparation_id.clone(),
            parent_id: input.parent_id.clone(),
            name: input.name.clone(),
            position,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar assunto", error))?;

        Ok(summary)
    }
}

impl StudyStore for LocalWorkspaceStore {
    fn daily_plan(&self, date: &str) -> Result<DailyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        let mut task_statement = connection
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
        let task_rows = task_statement
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
        let mut tasks = Vec::new();
        for row in task_rows {
            let parts = row.map_err(|error| map_database_error("ler tarefa do dia", error))?;
            tasks.push(study_task_summary_from_parts(parts)?);
        }
        drop(task_statement);

        let active_parts: Option<(String, String, Option<String>, String, i64, String)> = connection
            .query_row(
                "SELECT id, task_id, subject_id, started_at, effective_seconds, status
                 FROM study_sessions
                 WHERE status IN ('active', 'paused')
                 ORDER BY started_at
                 LIMIT 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| map_database_error("consultar sessão ativa", error))?;
        let active_session = active_parts
            .map(session_summary_from_parts)
            .transpose()?;

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
        let preparation_exists: Option<i64> = transaction
            .query_row(
                "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
                params![input.preparation_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("verificar preparação da tarefa", error))?;

        if preparation_exists.is_none() {
            return Err(WorkspaceError::InvalidInput(
                "A preparação escolhida não existe mais.".to_string(),
            ));
        }

        let subject_name = if let Some(subject_id) = input.subject_id.as_deref() {
            let subject_name: Option<String> = transaction
                .query_row(
                    "SELECT name FROM subjects
                     WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
                    params![subject_id, input.preparation_id.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("verificar assunto da tarefa", error))?;

            if subject_name.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "O assunto escolhido não pertence à preparação.".to_string(),
                ));
            }
            subject_name
        } else {
            None
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

    fn start_study_session(
        &self,
        input: &StartStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da sessão", error))?;
        let task: Option<(Option<String>, String)> = transaction
            .query_row(
                "SELECT subject_id, status FROM study_tasks WHERE id = ?1",
                params![input.task_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| map_database_error("verificar tarefa da sessão", error))?;
        let Some((subject_id, task_status)) = task else {
            return Err(WorkspaceError::InvalidInput(
                "A tarefa escolhida não existe mais.".to_string(),
            ));
        };
        let task_status = parse_task_status(&task_status).map_err(WorkspaceError::Database)?;
        if matches!(task_status, StudyTaskStatus::Completed | StudyTaskStatus::Skipped) {
            return Err(WorkspaceError::InvalidInput(
                "Esta tarefa já não pode iniciar uma nova sessão.".to_string(),
            ));
        }

        let existing: Option<(String, String, Option<String>, String, i64, String)> = transaction
            .query_row(
                "SELECT id, task_id, subject_id, started_at, effective_seconds, status
                 FROM study_sessions
                 WHERE status IN ('active', 'paused')
                 LIMIT 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| map_database_error("verificar sessão ativa", error))?;

        if let Some(parts) = existing {
            let summary = session_summary_from_parts(parts)?;
            if summary.task_id == input.task_id {
                transaction
                    .commit()
                    .map_err(|error| map_database_error("confirmar sessão existente", error))?;
                return Ok(summary);
            }
            return Err(WorkspaceError::ActiveSessionExists);
        }

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO study_sessions
                    (id, task_id, subject_id, started_at, effective_seconds, status)
                 VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, 0, 'active')",
                params![id.as_str(), input.task_id.as_str(), subject_id.as_deref()],
            )
            .map_err(|error| map_database_error("gravar sessão", error))?;
        let parts: (String, String, Option<String>, String, i64, String) = transaction
            .query_row(
                "SELECT id, task_id, subject_id, started_at, effective_seconds, status
                 FROM study_sessions WHERE id = ?1",
                params![id.as_str()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .map_err(|error| map_database_error("ler sessão criada", error))?;
        let summary = session_summary_from_parts(parts)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar sessão", error))?;
        Ok(summary)
    }

    fn finish_study_session(
        &self,
        input: &FinishStudySessionInput,
    ) -> Result<StudySessionSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar encerramento da sessão", error))?;
        let parts: Option<(String, String, Option<String>, String, i64, String)> = transaction
            .query_row(
                "SELECT id, task_id, subject_id, started_at, effective_seconds, status
                 FROM study_sessions WHERE id = ?1",
                params![input.session_id.as_str()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| map_database_error("localizar sessão", error))?;
        let Some(parts) = parts else {
            return Err(WorkspaceError::InvalidInput(
                "A sessão escolhida não existe mais.".to_string(),
            ));
        };
        let current = session_summary_from_parts(parts)?;

        if matches!(
            current.status,
            StudySessionStatus::Completed | StudySessionStatus::Interrupted
        ) {
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar sessão já encerrada", error))?;
            return Ok(current);
        }

        let task_status = match input.task_status {
            TaskCompletion::Completed => "completed",
            TaskCompletion::Partial => "partial",
        };
        transaction
            .execute(
                "UPDATE study_sessions
                 SET ended_at = CURRENT_TIMESTAMP, effective_seconds = ?1, status = 'completed'
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
        let updated_parts: (String, String, Option<String>, String, i64, String) = transaction
            .query_row(
                "SELECT id, task_id, subject_id, started_at, effective_seconds, status
                 FROM study_sessions WHERE id = ?1",
                params![input.session_id.as_str()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .map_err(|error| map_database_error("ler sessão encerrada", error))?;
        let summary = session_summary_from_parts(updated_parts)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar encerramento da sessão", error))?;
        Ok(summary)
    }
}

fn study_task_summary_from_parts(
    parts: (
        String,
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        i64,
        String,
        String,
    ),
) -> Result<StudyTaskSummary, WorkspaceError> {
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

fn session_summary_from_parts(
    parts: (String, String, Option<String>, String, i64, String),
) -> Result<StudySessionSummary, WorkspaceError> {
    let (id, task_id, subject_id, started_at, effective_seconds, status) = parts;
    let status = parse_session_status(&status).map_err(WorkspaceError::Database)?;
    Ok(StudySessionSummary {
        id,
        task_id,
        subject_id,
        started_at,
        effective_seconds,
        status,
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveWorkspacePointer {
    workspace_id: Uuid,
    workspace_path: String,
}

fn canonical_workspace_path(path: &Path, create_missing: bool) -> Result<PathBuf, WorkspaceError> {
    if create_missing && !path.exists() {
        fs::create_dir_all(path).map_err(|error| map_io_error("criar a pasta do espaço", error))?;
    }

    if !path.exists() {
        return Err(WorkspaceError::WorkspaceNotFound);
    }

    let metadata = fs::metadata(path).map_err(|error| map_io_error("ler a pasta do espaço", error))?;
    if !metadata.is_dir() {
        return Err(WorkspaceError::InvalidInput(
            "A pasta escolhida não é um diretório.".to_string(),
        ));
    }

    fs::canonicalize(path).map_err(|error| map_io_error("normalizar a pasta do espaço", error))
}

fn validate_manifest(manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
    if manifest.format_version != CURRENT_FORMAT_VERSION {
        return Err(WorkspaceError::UnsupportedFormat(manifest.format_version));
    }

    if manifest.workspace_id.is_nil() {
        return Err(WorkspaceError::InvalidWorkspace(
            "o identificador do espaço está vazio".to_string(),
        ));
    }

    validate_workspace_name(&manifest.name).map_err(WorkspaceError::InvalidWorkspace)?;
    Ok(())
}

fn write_json_atomically<T: Serialize>(path: &Path, value: &T) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta do arquivo".to_string())
    })?;
    fs::create_dir_all(parent).map_err(|error| map_io_error("preparar arquivo", error))?;

    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome do arquivo".to_string())
    })?;
    let temporary_path = parent.join(format!(".{}.tmp-{}", file_name.to_string_lossy(), Uuid::new_v4()));
    let backup_file = backup_path(path)?;
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| WorkspaceError::Serialization(format!("serializar arquivo: {error}")))?;

    let write_result = (|| {
        let mut file = File::create(&temporary_path)
            .map_err(|error| map_io_error("criar arquivo temporário", error))?;
        file.write_all(&serialized)
            .map_err(|error| map_io_error("gravar arquivo temporário", error))?;
        file.sync_all()
            .map_err(|error| map_io_error("confirmar arquivo temporário", error))?;

        let had_original = path.exists();
        if had_original {
            if backup_file.exists() {
                fs::remove_file(&backup_file)
                    .map_err(|error| map_io_error("limpar backup temporário", error))?;
            }
            fs::rename(path, &backup_file)
                .map_err(|error| map_io_error("preservar arquivo anterior", error))?;
        }

        match fs::rename(&temporary_path, path) {
            Ok(()) => {
                if had_original {
                    let _ = fs::remove_file(&backup_file);
                }
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(path);
                if had_original {
                    if let Err(restore_error) = fs::rename(&backup_file, path) {
                        return Err(WorkspaceError::Io(format!(
                            "publicar arquivo: {error}; restaurar arquivo anterior: {restore_error}"
                        )));
                    }
                }
                Err(map_io_error("publicar arquivo", error))
            }
        }
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    write_result
}

fn backup_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta do backup".to_string())
    })?;
    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome do backup".to_string())
    })?;

    Ok(parent.join(format!(".{}.bak", file_name.to_string_lossy())))
}

fn apply_migrations(connection: &mut Connection) -> Result<(), WorkspaceError> {
    let transaction = connection
        .transaction()
        .map_err(|error| WorkspaceError::Database(format!("iniciar migração: {error}")))?;
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|error| WorkspaceError::Database(format!("criar controle de migração: {error}")))?;

    let current_version: i64 = transaction
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .map_err(|error| WorkspaceError::Database(format!("ler versão do esquema: {error}")))?;

    if current_version > CURRENT_SCHEMA_VERSION {
        return Err(WorkspaceError::Database(
            "o banco local foi criado por uma versão mais nova".to_string(),
        ));
    }

    let migrations = [
        (1_i64, include_str!("../../migrations/001_initial.sql")),
        (2_i64, include_str!("../../migrations/002_study_plan_indexes.sql")),
        (3_i64, include_str!("../../migrations/003_study_tasks_indexes.sql")),
    ];

    for (version, sql) in migrations {
        if current_version >= version {
            continue;
        }

        transaction
            .execute_batch(sql)
            .map_err(|error| WorkspaceError::Database(format!("executar migração {version}: {error}")))?;
        transaction
            .execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                params![version],
            )
            .map_err(|error| WorkspaceError::Database(format!("registrar migração {version}: {error}")))?;
    }

    transaction
        .commit()
        .map_err(|error| WorkspaceError::Database(format!("confirmar migração: {error}")))
}

fn ensure_workspace_metadata(
    connection: &Connection,
    manifest: &WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    let existing: Option<(String, String, i64)> = connection
        .query_row(
            "SELECT workspace_id, name, format_version FROM workspace_metadata LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| WorkspaceError::Database(format!("ler metadados do espaço: {error}")))?;

    if let Some((workspace_id, name, format_version)) = existing {
        let expected_id = manifest.workspace_id.to_string();
        if workspace_id != expected_id || name != manifest.name || format_version != i64::from(manifest.format_version) {
            return Err(WorkspaceError::InvalidWorkspace(
                "o banco local não corresponde ao manifesto".to_string(),
            ));
        }
        return Ok(());
    }

    connection
        .execute(
            "INSERT INTO workspace_metadata (workspace_id, name, format_version) VALUES (?1, ?2, ?3)",
            params![manifest.workspace_id.to_string(), &manifest.name, manifest.format_version],
        )
        .map_err(|error| WorkspaceError::Database(format!("gravar metadados do espaço: {error}")))?;

    Ok(())
}

fn map_io_error(operation: &str, error: std::io::Error) -> WorkspaceError {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        WorkspaceError::PermissionDenied(format!("{operation}: {error}"))
    } else {
        WorkspaceError::Io(format!("{operation}: {error}"))
    }
}

fn map_database_error(operation: &str, error: rusqlite::Error) -> WorkspaceError {
    WorkspaceError::Database(format!("{operation}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;

    #[test]
    fn creates_reopens_and_keeps_active_database_outside_portable_folder() {
        let workspace_path = std::env::temp_dir().join(format!("cursoucon-workspace-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());

        let created = store
            .create_workspace(&workspace_path, "Preparação de teste")
            .expect("o espaço de fixture deve ser criado");
        let reopened = store
            .open_workspace(&workspace_path)
            .expect("o espaço de fixture deve reabrir");
        let active = store
            .active_workspace()
            .expect("o ponteiro ativo deve ser lido")
            .expect("deve existir um espaço ativo");

        assert_eq!(created.manifest.workspace_id, reopened.manifest.workspace_id);
        assert_eq!(reopened.manifest.workspace_id, active.manifest.workspace_id);
        assert!(workspace_path.join(WORKSPACE_MANIFEST_FILE).is_file());
        assert!(app_data_dir
            .join("workspaces")
            .join(created.manifest.workspace_id.to_string())
            .join("workspace.sqlite3")
            .is_file());
        assert!(!workspace_path.join("workspace.sqlite3").exists());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn refuses_incomplete_workspace_without_selecting_it() {
        let workspace_path = std::env::temp_dir().join(format!("cursoucon-incomplete-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace_path).expect("a pasta de fixture deve ser criada");
        let manifest = WorkspaceManifest::new("Incompleto".to_string());
        let manifest_json = serde_json::to_vec(&manifest).expect("o manifesto de fixture deve serializar");
        fs::write(workspace_path.join(WORKSPACE_MANIFEST_FILE), manifest_json)
            .expect("o manifesto de fixture deve ser gravado");
        let store = LocalWorkspaceStore::new(app_data_dir.clone());

        let result = store.open_workspace(&workspace_path);

        assert!(matches!(result, Err(WorkspaceError::IncompleteWorkspace(_))));
        assert!(store
            .active_workspace()
            .expect("a ausência de ponteiro deve ser legível")
            .is_none());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn creates_preparation_and_nested_subjects_in_one_plan() {
        let workspace_path = std::env::temp_dir().join(format!("cursoucon-plan-{}", Uuid::new_v4()));
        let app_data_dir = std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Plano de teste")
            .expect("o espaço de fixture deve ser criado");

        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Analista de TI".to_string(),
                organization: Some("Órgão".to_string()),
                role: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("a preparação deve ser criada");
        let subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Língua Portuguesa".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let child = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Interpretação de texto".to_string(),
                parent_id: Some(subject.id.clone()),
            })
            .expect("o subassunto deve ser criado");
        let plan = store.study_plan().expect("o plano deve ser lido");

        assert_eq!(plan.preparations.len(), 1);
        assert_eq!(plan.subjects.len(), 2);
        assert_eq!(plan.subjects[0].parent_id, None);
        assert_eq!(child.parent_id.as_deref(), Some(subject.id.as_str()));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
