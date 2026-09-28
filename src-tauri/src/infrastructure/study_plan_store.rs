use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::study_plan_service::StudyPlanStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::study_plan::{
    calculate_subject_coverage, default_study_availability, generate_cycle_slots,
    study_cycle_warning, validate_cycle_slots_capacity, CreatePreparationInput, CreateSubjectInput,
    PreparationSummary, ReferenceDocumentStatus, SavePreparationExamConfigInput,
    SaveStudyPlanningInput, SetPrimaryPreparationInput, SetSubjectStudyStatusInput,
    StudyCycleSlotInput, StudyCycleSlotSummary, StudyCycleSubject, StudyPlan, StudyPlanningSummary,
    SubjectPrioritySummary, SubjectStudyStatus, SubjectSummary, DEFAULT_REVIEW_RESERVE_PERCENT,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl StudyPlanStore for LocalWorkspaceStore {
    fn study_plan(&self) -> Result<StudyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        let preparations = load_preparations(&connection)?;
        let subjects = load_subjects(&connection)?;
        let subject_coverage = calculate_subject_coverage(&preparations, &subjects);

        Ok(StudyPlan {
            preparations,
            subjects,
            subject_coverage,
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
                    (id, name, organization, role, board, exam_date, is_primary)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    id.as_str(),
                    &input.name,
                    input.organization.as_deref(),
                    input.role.as_deref(),
                    input.board.as_deref(),
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
            board: input.board.clone(),
            exam_date: input.exam_date.clone(),
            is_primary,
            reference_material_id: None,
            reference_document_status: ReferenceDocumentStatus::Reference,
            exam_rules_markdown: None,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar preparação", error))?;

        Ok(summary)
    }

    fn set_primary_preparation(
        &self,
        input: &SetPrimaryPreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar troca de preparação principal", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;
        transaction
            .execute(
                "UPDATE preparations SET is_primary = 0 WHERE archived_at IS NULL",
                [],
            )
            .map_err(|error| map_database_error("desmarcar preparação principal", error))?;
        transaction
            .execute(
                "UPDATE preparations SET is_primary = 1 WHERE id = ?1 AND archived_at IS NULL",
                params![input.preparation_id],
            )
            .map_err(|error| map_database_error("marcar preparação principal", error))?;
        let summary = load_preparation(&transaction, &input.preparation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar troca da preparação", error))?;
        Ok(summary)
    }

    fn create_subject(&self, input: &CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação do assunto", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;

        if let Some(parent_id) = input.parent_id.as_deref() {
            ensure_parent_exists(&transaction, &input.preparation_id, parent_id)?;
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
            priority: 3,
            study_status: SubjectStudyStatus::NotStarted,
            exam_weight: None,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar assunto", error))?;

        Ok(summary)
    }

    fn save_preparation_exam_config(
        &self,
        input: &SavePreparationExamConfigInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar salvamento das regras da prova", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;

        if let Some(material_id) = input.reference_material_id.as_deref() {
            let material_exists: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM materials WHERE id = ?1",
                    params![material_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| map_database_error("verificar edital de referência", error))?;
            if material_exists.is_none() {
                return Err(WorkspaceError::InvalidInput(
                    "O edital de referência escolhido não existe mais.".to_string(),
                ));
            }
        }

        for subject in &input.subject_exam_weights {
            let updated = transaction
                .execute(
                    "UPDATE subjects SET exam_weight = ?1
                     WHERE id = ?2 AND preparation_id = ?3 AND archived_at IS NULL",
                    params![
                        subject.exam_weight,
                        subject.subject_id,
                        input.preparation_id
                    ],
                )
                .map_err(|error| map_database_error("salvar peso da prova", error))?;
            if updated != 1 {
                return Err(WorkspaceError::InvalidInput(
                    "Um dos assuntos escolhidos não pertence à preparação.".to_string(),
                ));
            }
        }

        transaction
            .execute(
                "UPDATE preparations
                 SET reference_material_id = ?1, exam_rules_markdown = ?2,
                     reference_document_status = ?3
                 WHERE id = ?4 AND archived_at IS NULL",
                params![
                    input.reference_material_id,
                    input.exam_rules_markdown,
                    input.reference_document_status.as_str(),
                    input.preparation_id
                ],
            )
            .map_err(|error| map_database_error("salvar configuração da prova", error))?;
        let summary = load_preparation(&transaction, &input.preparation_id)?;

        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar configuração da prova", error))?;
        Ok(summary)
    }

    fn set_subject_study_status(
        &self,
        input: &SetSubjectStudyStatusInput,
    ) -> Result<SubjectSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection.transaction().map_err(|error| {
            map_database_error("iniciar atualização do estado do assunto", error)
        })?;
        load_subject_by_id(&transaction, &input.subject_id)?;
        transaction
            .execute(
                "UPDATE subjects SET study_status = ?1
                 WHERE id = ?2 AND archived_at IS NULL",
                params![input.status.as_str(), input.subject_id],
            )
            .map_err(|error| map_database_error("atualizar estado do assunto", error))?;

        let subject = load_subject_by_id(&transaction, &input.subject_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar estado do assunto", error))?;
        Ok(subject)
    }

    fn study_planning(&self, preparation_id: &str) -> Result<StudyPlanningSummary, WorkspaceError> {
        let connection = self.active_database()?;
        ensure_preparation_exists(&connection, preparation_id)?;
        load_study_planning(&connection, preparation_id)
    }

    fn save_study_planning(
        &self,
        input: &SaveStudyPlanningInput,
    ) -> Result<StudyPlanningSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar salvamento do ciclo", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;

        for subject in &input.subject_priorities {
            let updated = transaction
                .execute(
                    "UPDATE subjects SET priority = ?1
                     WHERE id = ?2 AND preparation_id = ?3 AND archived_at IS NULL",
                    params![subject.priority, subject.subject_id, input.preparation_id],
                )
                .map_err(|error| map_database_error("salvar prioridade do assunto", error))?;
            if updated != 1 {
                return Err(WorkspaceError::InvalidInput(
                    "Um dos assuntos escolhidos não pertence à preparação.".to_string(),
                ));
            }
        }

        let weekly_available_minutes: i64 = input
            .availability
            .iter()
            .map(|day| day.available_minutes)
            .sum();
        let weekly_study_minutes =
            weekly_available_minutes * (100 - input.review_reserve_percent) / 100;

        transaction
            .execute(
                "INSERT INTO study_planning_settings
                    (preparation_id, cycle_position, review_reserve_percent, cycle_step, updated_at)
                 VALUES (?1, 0, ?2, 0, CURRENT_TIMESTAMP)
                 ON CONFLICT(preparation_id) DO UPDATE SET
                     cycle_position = 0,
                     review_reserve_percent = excluded.review_reserve_percent,
                     cycle_step = 0,
                     updated_at = CURRENT_TIMESTAMP",
                params![input.preparation_id, input.review_reserve_percent],
            )
            .map_err(|error| map_database_error("salvar configuração do ciclo", error))?;
        transaction
            .execute(
                "DELETE FROM study_availability WHERE preparation_id = ?1",
                params![input.preparation_id],
            )
            .map_err(|error| map_database_error("substituir disponibilidade semanal", error))?;
        for day in &input.availability {
            transaction
                .execute(
                    "INSERT INTO study_availability
                        (preparation_id, weekday, available_minutes, is_rest)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![
                        input.preparation_id,
                        day.weekday,
                        day.available_minutes,
                        if day.is_rest { 1_i64 } else { 0_i64 },
                    ],
                )
                .map_err(|error| map_database_error("salvar disponibilidade semanal", error))?;
        }

        if let Some(cycle_slots) = input.cycle_slots.as_deref() {
            replace_cycle_slots(
                &transaction,
                &input.preparation_id,
                cycle_slots,
                weekly_study_minutes,
            )?;
        } else {
            regenerate_cycle(&transaction, &input.preparation_id, weekly_study_minutes)?;
        }
        let summary = load_study_planning(&transaction, &input.preparation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar salvamento do ciclo", error))?;
        Ok(summary)
    }

    fn advance_study_cycle(
        &self,
        preparation_id: &str,
    ) -> Result<StudyPlanningSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar avanço do ciclo", error))?;
        ensure_preparation_exists(&transaction, preparation_id)?;
        let slot_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM study_cycle_slots WHERE preparation_id = ?1",
                params![preparation_id],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("contar posições do ciclo", error))?;
        if slot_count == 0 {
            return Err(WorkspaceError::InvalidInput(
                "Salve uma disponibilidade e uma prioridade antes de avançar o ciclo.".to_string(),
            ));
        }

        let (current_position, current_step): (i64, i64) = transaction
            .query_row(
                "SELECT cycle_position, cycle_step
                 FROM study_planning_settings WHERE preparation_id = ?1",
                params![preparation_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| map_database_error("ler posição atual do ciclo", error))?
            .unwrap_or((0, 0));
        let next_position = (current_position + 1).rem_euclid(slot_count);
        transaction
            .execute(
                "UPDATE study_planning_settings
                 SET cycle_position = ?1, cycle_step = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE preparation_id = ?3",
                params![next_position, current_step + 1, preparation_id],
            )
            .map_err(|error| map_database_error("avançar posição do ciclo", error))?;
        let summary = load_study_planning(&transaction, preparation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar avanço do ciclo", error))?;
        Ok(summary)
    }
}

fn load_preparations(
    connection: &rusqlite::Connection,
) -> Result<Vec<PreparationSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, organization, role, exam_date, is_primary,
                    reference_material_id, exam_rules_markdown, reference_document_status, board
             FROM preparations
             WHERE archived_at IS NULL
             ORDER BY is_primary DESC, name COLLATE NOCASE",
        )
        .map_err(|error| map_database_error("preparar leitura das preparações", error))?;
    let rows = statement
        .query_map([], read_preparation_row)
        .map_err(|error| map_database_error("consultar as preparações", error))?;

    rows.map(|row| row.map_err(|error| map_database_error("ler uma preparação", error)))
        .collect()
}

fn load_preparation(
    connection: &rusqlite::Connection,
    preparation_id: &str,
) -> Result<PreparationSummary, WorkspaceError> {
    connection
        .query_row(
            "SELECT id, name, organization, role, exam_date, is_primary,
                    reference_material_id, exam_rules_markdown, reference_document_status, board
             FROM preparations
             WHERE id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            read_preparation_row,
        )
        .optional()
        .map_err(|error| map_database_error("consultar preparação", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("A preparação escolhida não existe mais.".to_string())
        })
}

fn read_preparation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PreparationSummary> {
    let status: String = row.get(8)?;
    let reference_document_status =
        ReferenceDocumentStatus::from_storage(&status).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "a preparação possui uma classificação de edital inválida",
                )),
            )
        })?;
    let is_primary: i64 = row.get(5)?;
    Ok(PreparationSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        organization: row.get(2)?,
        role: row.get(3)?,
        board: row.get(9)?,
        exam_date: row.get(4)?,
        is_primary: is_primary == 1,
        reference_material_id: row.get(6)?,
        exam_rules_markdown: row.get(7)?,
        reference_document_status,
    })
}

fn load_subjects(connection: &rusqlite::Connection) -> Result<Vec<SubjectSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT s.id, s.preparation_id, s.parent_id, s.name, s.position, s.priority,
                    s.study_status, s.exam_weight
             FROM subjects s
             JOIN preparations p ON p.id = s.preparation_id
             WHERE s.archived_at IS NULL AND p.archived_at IS NULL
             ORDER BY s.preparation_id, s.parent_id IS NOT NULL, s.position, s.name COLLATE NOCASE",
        )
        .map_err(|error| map_database_error("preparar leitura dos assuntos", error))?;
    let rows = statement
        .query_map([], read_subject_row)
        .map_err(|error| map_database_error("consultar os assuntos", error))?;

    rows.map(|row| {
        let row = row.map_err(|error| map_database_error("ler um assunto", error))?;
        subject_summary_from_row(row)
    })
    .collect()
}

type SubjectRow = (
    String,
    String,
    Option<String>,
    String,
    i64,
    i64,
    String,
    Option<f64>,
);

fn read_subject_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SubjectRow> {
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
}

fn subject_summary_from_row(row: SubjectRow) -> Result<SubjectSummary, WorkspaceError> {
    let (id, preparation_id, parent_id, name, position, priority, study_status, exam_weight) = row;
    let study_status = SubjectStudyStatus::from_storage(&study_status).ok_or_else(|| {
        WorkspaceError::Database("um assunto possui um estado de estudo inválido".to_string())
    })?;
    Ok(SubjectSummary {
        id,
        preparation_id,
        parent_id,
        name,
        position,
        priority,
        study_status,
        exam_weight,
    })
}

fn load_subject_by_id(
    connection: &rusqlite::Connection,
    subject_id: &str,
) -> Result<SubjectSummary, WorkspaceError> {
    let row = connection
        .query_row(
            "SELECT id, preparation_id, parent_id, name, position, priority,
                    study_status, exam_weight
             FROM subjects WHERE id = ?1 AND archived_at IS NULL",
            params![subject_id],
            read_subject_row,
        )
        .optional()
        .map_err(|error| map_database_error("localizar assunto", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("O assunto escolhido não existe mais.".to_string())
        })?;
    subject_summary_from_row(row)
}

fn load_study_planning(
    connection: &rusqlite::Connection,
    preparation_id: &str,
) -> Result<StudyPlanningSummary, WorkspaceError> {
    let mut availability = default_study_availability();
    let mut statement = connection
        .prepare(
            "SELECT weekday, available_minutes, is_rest
             FROM study_availability
             WHERE preparation_id = ?1
             ORDER BY weekday",
        )
        .map_err(|error| map_database_error("preparar leitura da disponibilidade", error))?;
    let rows = statement
        .query_map(params![preparation_id], |row| {
            let weekday: i64 = row.get(0)?;
            let is_rest: i64 = row.get(2)?;
            Ok((weekday, row.get::<_, i64>(1)?, is_rest == 1))
        })
        .map_err(|error| map_database_error("consultar a disponibilidade", error))?;
    let mut stored_day_count = 0;
    for row in rows {
        let (weekday, available_minutes, is_rest) =
            row.map_err(|error| map_database_error("ler um dia de disponibilidade", error))?;
        let index = usize::try_from(weekday).map_err(|_| {
            WorkspaceError::Database("a disponibilidade possui um dia inválido".to_string())
        })?;
        let Some(day) = availability.get_mut(index) else {
            return Err(WorkspaceError::Database(
                "a disponibilidade possui um dia inválido".to_string(),
            ));
        };
        day.available_minutes = available_minutes;
        day.is_rest = is_rest;
        stored_day_count += 1;
    }
    if stored_day_count != 0 && stored_day_count != 7 {
        return Err(WorkspaceError::Database(
            "a disponibilidade semanal está incompleta".to_string(),
        ));
    }

    let weekly_available_minutes = availability.iter().map(|day| day.available_minutes).sum();
    let subject_priorities = {
        let mut priority_statement = connection
            .prepare(
                "SELECT id, priority FROM subjects
                 WHERE preparation_id = ?1 AND archived_at IS NULL
                 ORDER BY position, name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar leitura das prioridades", error))?;
        let priority_rows = priority_statement
            .query_map(params![preparation_id], |row| {
                Ok(SubjectPrioritySummary {
                    subject_id: row.get(0)?,
                    priority: row.get(1)?,
                })
            })
            .map_err(|error| map_database_error("consultar as prioridades", error))?;
        priority_rows
            .map(|row| row.map_err(|error| map_database_error("ler uma prioridade", error)))
            .collect::<Result<Vec<_>, _>>()?
    };
    let settings = connection
        .query_row(
            "SELECT cycle_position, review_reserve_percent, cycle_step, updated_at
             FROM study_planning_settings
             WHERE preparation_id = ?1",
            params![preparation_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|error| map_database_error("ler configuração do ciclo", error))?;
    let has_saved_settings = settings.is_some();
    let (stored_position, review_reserve_percent, cycle_step, updated_at) =
        settings.unwrap_or((0, DEFAULT_REVIEW_RESERVE_PERCENT, 0, String::new()));
    let weekly_study_minutes = weekly_available_minutes * (100 - review_reserve_percent) / 100;

    let mut slot_statement = connection
        .prepare(
            "SELECT slots.position, slots.subject_id, subjects.name,
                     subjects.priority, slots.planned_minutes
               FROM study_cycle_slots slots
              JOIN subjects ON subjects.id = slots.subject_id
                AND subjects.preparation_id = slots.preparation_id
                AND subjects.archived_at IS NULL
              WHERE slots.preparation_id = ?1
              ORDER BY slots.position",
        )
        .map_err(|error| map_database_error("preparar leitura do ciclo", error))?;
    let slot_rows = slot_statement
        .query_map(params![preparation_id], |row| {
            Ok(StudyCycleSlotSummary {
                position: row.get(0)?,
                subject_id: row.get(1)?,
                subject_name: row.get(2)?,
                priority: row.get(3)?,
                planned_minutes: row.get(4)?,
            })
        })
        .map_err(|error| map_database_error("consultar posições do ciclo", error))?;
    let cycle_slots = slot_rows
        .map(|row| row.map_err(|error| map_database_error("ler uma posição do ciclo", error)))
        .collect::<Result<Vec<_>, _>>()?;
    let cycle_position = if cycle_slots.is_empty() {
        0
    } else {
        stored_position.rem_euclid(cycle_slots.len() as i64)
    };
    let subject_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM subjects
             WHERE preparation_id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("contar assuntos do ciclo", error))?;
    let cycle_subject_count: i64 = connection
        .query_row(
            "SELECT COUNT(DISTINCT slots.subject_id) FROM study_cycle_slots slots
              JOIN subjects ON subjects.id = slots.subject_id
                AND subjects.preparation_id = slots.preparation_id
                AND subjects.archived_at IS NULL
              WHERE slots.preparation_id = ?1",
            params![preparation_id],
            |row| row.get(0),
        )
        .map_err(|error| map_database_error("contar assuntos já incluídos no ciclo", error))?;
    let warning = if !has_saved_settings && subject_count > 0 {
        Some("Salve a disponibilidade e as prioridades para gerar o ciclo.".to_string())
    } else {
        study_cycle_warning(
            subject_count,
            cycle_subject_count,
            weekly_study_minutes,
            cycle_slots.len() as i64,
        )
    };

    Ok(StudyPlanningSummary {
        preparation_id: preparation_id.to_string(),
        availability,
        subject_priorities,
        weekly_available_minutes,
        weekly_study_minutes,
        review_reserve_percent,
        cycle_position,
        cycle_step,
        cycle_slots,
        warning,
        updated_at: if updated_at.is_empty() {
            None
        } else {
            Some(updated_at)
        },
    })
}

fn regenerate_cycle(
    connection: &rusqlite::Connection,
    preparation_id: &str,
    weekly_study_minutes: i64,
) -> Result<(), WorkspaceError> {
    connection
        .execute(
            "DELETE FROM study_cycle_slots WHERE preparation_id = ?1",
            params![preparation_id],
        )
        .map_err(|error| map_database_error("limpar ciclo anterior", error))?;

    let subjects = {
        let mut subject_statement = connection
            .prepare(
                "SELECT id, priority
                 FROM subjects
                 WHERE preparation_id = ?1 AND archived_at IS NULL
                 ORDER BY priority, position, name COLLATE NOCASE",
            )
            .map_err(|error| map_database_error("preparar assuntos do ciclo", error))?;
        let rows = subject_statement
            .query_map(params![preparation_id], |row| {
                Ok(StudyCycleSubject {
                    subject_id: row.get(0)?,
                    priority: row.get(1)?,
                })
            })
            .map_err(|error| map_database_error("consultar assuntos do ciclo", error))?;
        rows.map(|row| row.map_err(|error| map_database_error("ler assunto do ciclo", error)))
            .collect::<Result<Vec<_>, _>>()?
    };

    let slots =
        generate_cycle_slots(&subjects, weekly_study_minutes).map_err(WorkspaceError::Database)?;
    for (position, slot) in slots.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO study_cycle_slots
                    (preparation_id, position, subject_id, planned_minutes)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    preparation_id,
                    position as i64,
                    slot.subject_id,
                    slot.planned_minutes
                ],
            )
            .map_err(|error| map_database_error("gravar posição do ciclo", error))?;
    }

    Ok(())
}

fn replace_cycle_slots(
    connection: &rusqlite::Connection,
    preparation_id: &str,
    slots: &[StudyCycleSlotInput],
    weekly_study_minutes: i64,
) -> Result<(), WorkspaceError> {
    validate_cycle_slots_capacity(slots, weekly_study_minutes)
        .map_err(WorkspaceError::InvalidInput)?;

    connection
        .execute(
            "DELETE FROM study_cycle_slots WHERE preparation_id = ?1",
            params![preparation_id],
        )
        .map_err(|error| map_database_error("limpar ciclo editado", error))?;
    for (position, slot) in slots.iter().enumerate() {
        let updated = connection
            .execute(
                "INSERT INTO study_cycle_slots
                    (preparation_id, position, subject_id, planned_minutes)
                 SELECT ?1, ?2, id, ?3 FROM subjects
                 WHERE id = ?4 AND preparation_id = ?1 AND archived_at IS NULL",
                params![
                    preparation_id,
                    position as i64,
                    slot.planned_minutes,
                    slot.subject_id
                ],
            )
            .map_err(|error| map_database_error("gravar ciclo editado", error))?;
        if updated != 1 {
            return Err(WorkspaceError::InvalidInput(
                "Um dos assuntos do ciclo não pertence à preparação.".to_string(),
            ));
        }
    }
    Ok(())
}

fn ensure_preparation_exists(
    connection: &rusqlite::Connection,
    preparation_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar preparação", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "A preparação escolhida não existe mais.".to_string(),
        ));
    }

    Ok(())
}

fn ensure_parent_exists(
    transaction: &rusqlite::Transaction<'_>,
    preparation_id: &str,
    parent_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM subjects
             WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
            params![parent_id, preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto pai", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto pai não pertence à preparação escolhida.".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::study_plan::{
        default_study_availability, SavePreparationExamConfigInput, SaveStudyPlanningInput,
        StudyCycleSlotInput, SubjectExamWeightInput, SubjectPriorityInput,
    };
    use std::fs;

    #[test]
    fn creates_preparation_and_nested_subjects_in_one_plan() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-plan-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Plano de teste")
            .expect("o espaço de fixture deve ser criado");

        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Analista de TI".to_string(),
                organization: Some("Órgão".to_string()),
                role: None,
                board: None,
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
        assert_eq!(plan.subject_coverage[0].total_subjects, 2);
        assert_eq!(plan.subject_coverage[0].completed_subjects, 0);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_exam_board_and_switches_primary_preparation_atomically() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-primary-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-primary-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Preparações de teste")
            .expect("o espaço deve ser criado");
        let first = store
            .create_preparation(&CreatePreparationInput {
                name: "Primeira".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a primeira preparação deve ser criada");
        let second = store
            .create_preparation(&CreatePreparationInput {
                name: "Segunda".to_string(),
                organization: None,
                role: None,
                board: Some("Cebraspe".to_string()),
                exam_date: None,
                make_primary: false,
            })
            .expect("a segunda preparação deve ser criada");
        assert_eq!(second.board.as_deref(), Some("Cebraspe"));
        assert!(store
            .set_primary_preparation(&SetPrimaryPreparationInput {
                preparation_id: Uuid::new_v4().to_string(),
            })
            .is_err());
        assert!(store
            .study_plan()
            .expect("o plano deve permanecer válido")
            .preparations
            .iter()
            .any(|preparation| preparation.id == first.id && preparation.is_primary));

        let switched = store
            .set_primary_preparation(&SetPrimaryPreparationInput {
                preparation_id: second.id.clone(),
            })
            .expect("a preparação principal deve ser trocada");
        assert!(switched.is_primary);
        store
            .open_workspace(&workspace_path)
            .expect("o espaço deve reabrir sem perder a escolha");
        let plan = store.study_plan().expect("o plano deve ser relido");
        assert_eq!(
            plan.preparations
                .iter()
                .filter(|item| item.is_primary)
                .count(),
            1
        );
        assert!(plan.preparations.iter().any(|item| item.id == second.id
            && item.is_primary
            && item.board.as_deref() == Some("Cebraspe")));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_editable_exam_reference_rules_and_weights_per_preparation() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-exam-config-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-exam-config-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Configuração da prova")
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
        let first_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("o primeiro assunto deve ser criado");
        let second_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Língua Portuguesa".to_string(),
                parent_id: None,
            })
            .expect("o segundo assunto deve ser criado");
        let material_id = Uuid::new_v4().to_string();
        let connection = store
            .active_database()
            .expect("o banco ativo deve ser aberto");
        connection
            .execute(
                "INSERT INTO materials (id, original_name, content_hash, byte_size)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    material_id,
                    "edital.pdf",
                    Uuid::new_v4().to_string(),
                    128_i64
                ],
            )
            .expect("o edital da fixture deve ser inserido");
        drop(connection);

        let saved = store
            .save_preparation_exam_config(&SavePreparationExamConfigInput {
                preparation_id: preparation.id.clone(),
                reference_material_id: Some(material_id.clone()),
                reference_document_status: ReferenceDocumentStatus::Current,
                exam_rules_markdown: Some("- Cada questão vale 1 ponto.".to_string()),
                subject_exam_weights: vec![
                    SubjectExamWeightInput {
                        subject_id: first_subject.id.clone(),
                        exam_weight: Some(2.5),
                    },
                    SubjectExamWeightInput {
                        subject_id: second_subject.id.clone(),
                        exam_weight: None,
                    },
                ],
            })
            .expect("a configuração da prova deve ser salva");
        let plan = store.study_plan().expect("o plano deve ser relido");

        assert_eq!(
            saved.reference_material_id.as_deref(),
            Some(material_id.as_str())
        );
        assert_eq!(
            saved.reference_document_status,
            ReferenceDocumentStatus::Current
        );
        assert_eq!(
            saved.exam_rules_markdown.as_deref(),
            Some("- Cada questão vale 1 ponto.")
        );
        assert_eq!(
            plan.subjects
                .iter()
                .find(|subject| subject.id == first_subject.id)
                .and_then(|subject| subject.exam_weight),
            Some(2.5)
        );
        assert_eq!(
            plan.subjects
                .iter()
                .find(|subject| subject.id == second_subject.id)
                .and_then(|subject| subject.exam_weight),
            None
        );

        let previous = store
            .save_preparation_exam_config(&SavePreparationExamConfigInput {
                preparation_id: preparation.id.clone(),
                reference_material_id: Some(material_id.clone()),
                reference_document_status: ReferenceDocumentStatus::Reference,
                exam_rules_markdown: saved.exam_rules_markdown.clone(),
                subject_exam_weights: Vec::new(),
            })
            .expect("o edital anterior deve continuar vinculado como referência");
        assert_eq!(
            previous.reference_document_status,
            ReferenceDocumentStatus::Reference
        );

        let cleared = store
            .save_preparation_exam_config(&SavePreparationExamConfigInput {
                preparation_id: preparation.id,
                reference_material_id: None,
                reference_document_status: ReferenceDocumentStatus::Reference,
                exam_rules_markdown: None,
                subject_exam_weights: vec![SubjectExamWeightInput {
                    subject_id: first_subject.id,
                    exam_weight: None,
                }],
            })
            .expect("a configuração deve poder ser editada");
        assert_eq!(cleared.reference_material_id, None);
        assert_eq!(cleared.exam_rules_markdown, None);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_study_status_separately_and_updates_coverage() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-coverage-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-coverage-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Cobertura de teste")
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
        let discipline = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("a disciplina deve ser criada");
        let topic = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id,
                name: "Direitos fundamentais".to_string(),
                parent_id: Some(discipline.id.clone()),
            })
            .expect("o assunto deve ser criado");

        let started = store
            .set_subject_study_status(&SetSubjectStudyStatusInput {
                subject_id: discipline.id.clone(),
                status: SubjectStudyStatus::InProgress,
            })
            .expect("o estado em andamento deve ser salvo");
        let completed = store
            .set_subject_study_status(&SetSubjectStudyStatusInput {
                subject_id: topic.id.clone(),
                status: SubjectStudyStatus::TheoryCompleted,
            })
            .expect("a conclusão da teoria deve ser salva");
        let plan = store.study_plan().expect("o plano deve ser relido");

        assert_eq!(started.study_status, SubjectStudyStatus::InProgress);
        assert_eq!(completed.study_status, SubjectStudyStatus::TheoryCompleted);
        assert_eq!(plan.subject_coverage[0].total_subjects, 2);
        assert_eq!(plan.subject_coverage[0].started_subjects, 2);
        assert_eq!(plan.subject_coverage[0].completed_subjects, 1);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_availability_priorities_and_cycle_position() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-cycle-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-cycle-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Ciclo de teste")
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
        let first_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Direito Constitucional".to_string(),
                parent_id: None,
            })
            .expect("o primeiro assunto deve ser criado");
        let second_subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Língua Portuguesa".to_string(),
                parent_id: None,
            })
            .expect("o segundo assunto deve ser criado");

        let planning = store
            .save_study_planning(&SaveStudyPlanningInput {
                preparation_id: preparation.id.clone(),
                availability: default_study_availability(),
                subject_priorities: vec![
                    SubjectPriorityInput {
                        subject_id: first_subject.id.clone(),
                        priority: 1,
                    },
                    SubjectPriorityInput {
                        subject_id: second_subject.id.clone(),
                        priority: 5,
                    },
                ],
                review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
                cycle_slots: None,
            })
            .expect("o planejamento deve ser salvo");

        assert_eq!(planning.weekly_available_minutes, 300);
        assert_eq!(planning.weekly_study_minutes, 240);
        assert_eq!(planning.review_reserve_percent, 20);
        assert_eq!(planning.cycle_slots.len(), 8);
        assert_eq!(planning.cycle_slots[0].subject_id, first_subject.id);
        assert_eq!(planning.cycle_position, 0);

        let advanced = store
            .advance_study_cycle(&preparation.id)
            .expect("o ciclo deve avançar");
        assert_eq!(advanced.cycle_position, 1);
        let plan = store.study_plan().expect("o plano deve ser relido");
        assert_eq!(
            plan.subjects
                .iter()
                .find(|subject| subject.id == second_subject.id)
                .map(|subject| subject.priority),
            Some(5)
        );

        let edited = store
            .save_study_planning(&SaveStudyPlanningInput {
                preparation_id: preparation.id.clone(),
                availability: default_study_availability(),
                subject_priorities: vec![
                    SubjectPriorityInput {
                        subject_id: first_subject.id.clone(),
                        priority: 1,
                    },
                    SubjectPriorityInput {
                        subject_id: second_subject.id.clone(),
                        priority: 5,
                    },
                ],
                review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
                cycle_slots: Some(vec![
                    StudyCycleSlotInput {
                        subject_id: second_subject.id.clone(),
                        planned_minutes: 45,
                    },
                    StudyCycleSlotInput {
                        subject_id: first_subject.id.clone(),
                        planned_minutes: 30,
                    },
                ]),
            })
            .expect("a edição manual do ciclo deve ser salva");
        assert_eq!(edited.cycle_slots.len(), 2);
        assert_eq!(edited.cycle_slots[0].subject_id, second_subject.id);
        assert_eq!(edited.cycle_slots[0].planned_minutes, 45);

        let rejected = store.save_study_planning(&SaveStudyPlanningInput {
            preparation_id: preparation.id.clone(),
            availability: default_study_availability(),
            subject_priorities: vec![
                SubjectPriorityInput {
                    subject_id: first_subject.id.clone(),
                    priority: 1,
                },
                SubjectPriorityInput {
                    subject_id: second_subject.id.clone(),
                    priority: 5,
                },
            ],
            review_reserve_percent: DEFAULT_REVIEW_RESERVE_PERCENT,
            cycle_slots: Some(vec![StudyCycleSlotInput {
                subject_id: first_subject.id.clone(),
                planned_minutes: 1_440,
            }]),
        });
        assert!(rejected.is_err());
        let preserved = store
            .study_planning(&preparation.id)
            .expect("o ciclo anterior deve permanecer após rejeição");
        assert_eq!(preserved.cycle_slots.len(), 2);
        assert_eq!(preserved.cycle_slots[0].subject_id, second_subject.id);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn rejects_cycle_slot_from_another_preparation() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-cycle-scope-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-cycle-scope-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Escopo do ciclo")
            .expect("o espaço de fixture deve ser criado");
        let first_preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Primeira preparação".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: true,
            })
            .expect("a primeira preparação deve ser criada");
        let second_preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Segunda preparação".to_string(),
                organization: None,
                role: None,
                board: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("a segunda preparação deve ser criada");
        let subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: second_preparation.id,
                name: "Assunto de outra preparação".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");

        let connection = store
            .active_database()
            .expect("o banco ativo deve ser aberto");
        let result = connection.execute(
            "INSERT INTO study_cycle_slots
                (preparation_id, position, subject_id, planned_minutes)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![first_preparation.id, 0_i64, subject.id, 30_i64],
        );

        assert!(result.is_err());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
