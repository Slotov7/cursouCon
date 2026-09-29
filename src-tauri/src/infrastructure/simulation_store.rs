use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::simulation_service::SimulationStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::question::QuestionOptionSummary;
use crate::domain::simulation::{
    AnswerSimulationInput, CreateSimulationInput, SimulationDetail, SimulationDiagnosticSummary,
    SimulationQuestionSummary, SimulationResult, SimulationStatus, SimulationSummary,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug)]
struct QuestionCandidate {
    id: String,
    question_type: String,
    statement_markdown: String,
    options: Vec<QuestionOptionSummary>,
    answer_key: Option<String>,
    status: String,
    explanation_markdown: Option<String>,
    subject_id: Option<String>,
    subject_name: Option<String>,
}

#[derive(Debug)]
struct ScoreLine {
    subject_id: Option<String>,
    subject_name: Option<String>,
    weight: f64,
    status: String,
    result: String,
    elapsed_seconds: i64,
}

#[derive(Debug, Default)]
struct DiagnosticAccumulator {
    subject_id: Option<String>,
    subject_name: Option<String>,
    question_count: i64,
    correct_count: i64,
    incorrect_count: i64,
    blank_count: i64,
    elapsed_seconds: i64,
    score: f64,
}

impl SimulationStore for LocalWorkspaceStore {
    fn list_simulations(&self) -> Result<Vec<SimulationSummary>, WorkspaceError> {
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare("SELECT id FROM simulations ORDER BY created_at DESC, id DESC LIMIT 100")
            .map_err(|error| map_database_error("preparar lista de simulados", error))?;
        let ids = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| map_database_error("consultar simulados", error))?
            .map(|row| {
                row.map_err(|error| map_database_error("ler identificador do simulado", error))
            })
            .collect::<Result<Vec<_>, _>>()?;

        ids.into_iter()
            .map(|id| load_simulation_summary(&connection, &id))
            .collect()
    }

    fn get_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError> {
        let connection = self.active_database()?;
        load_simulation_detail(&connection, simulation_id)
    }

    fn get_simulation_result(
        &self,
        simulation_id: &str,
    ) -> Result<SimulationResult, WorkspaceError> {
        let connection = self.active_database()?;
        load_simulation_result(&connection, simulation_id)
    }

    fn create_simulation(
        &self,
        input: &CreateSimulationInput,
    ) -> Result<SimulationDetail, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação do simulado", error))?;

        ensure_preparation_exists(&transaction, &input.preparation_id)?;
        for selection in &input.subject_selections {
            ensure_subject_belongs_to_preparation(
                &transaction,
                &input.preparation_id,
                &selection.subject_id,
            )?;
        }

        let question_candidates = select_questions(&transaction, input)?;
        if question_candidates.len()
            != usize::try_from(input.question_count).map_err(|_| {
                WorkspaceError::InvalidInput("A quantidade de questões é inválida.".to_string())
            })?
        {
            return Err(WorkspaceError::InvalidInput(format!(
                "Há apenas {} questões disponíveis para esta configuração; nenhuma questão foi repetida.",
                question_candidates.len()
            )));
        }

        let simulation_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO simulations
                    (id, preparation_id, title, mode, question_count, time_limit_seconds,
                     negative_points, blank_points, annulled_points)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    simulation_id.as_str(),
                    input.preparation_id.as_str(),
                    input.title.as_str(),
                    input.mode.as_str(),
                    input.question_count,
                    input.time_limit_seconds,
                    input.negative_points,
                    input.blank_points,
                    input.annulled_points,
                ],
            )
            .map_err(|error| map_database_error("gravar simulado", error))?;

        let weights = selection_weights(input);
        for (position, candidate) in question_candidates.iter().enumerate() {
            let options_json = serde_json::to_string(&candidate.options).map_err(|error| {
                WorkspaceError::Serialization(format!(
                    "serializar alternativas do simulado: {error}"
                ))
            })?;
            let weight = candidate
                .subject_id
                .as_ref()
                .and_then(|subject_id| weights.get(subject_id))
                .copied()
                .unwrap_or(1.0);
            transaction
                .execute(
                    "INSERT INTO simulation_questions
                        (simulation_id, question_id, position, subject_id, subject_name,
                         question_type, statement_markdown, options_json, answer_key_snapshot,
                         status_snapshot, explanation_markdown, weight)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        simulation_id.as_str(),
                        candidate.id.as_str(),
                        i64::try_from(position).map_err(|_| {
                            WorkspaceError::InvalidInput(
                                "O simulado tem questões demais.".to_string(),
                            )
                        })?,
                        candidate.subject_id.as_deref(),
                        candidate.subject_name.as_deref(),
                        candidate.question_type.as_str(),
                        candidate.statement_markdown.as_str(),
                        options_json.as_str(),
                        candidate.answer_key.as_deref(),
                        candidate.status.as_str(),
                        candidate.explanation_markdown.as_deref(),
                        weight,
                    ],
                )
                .map_err(|error| map_database_error("congelar questão no simulado", error))?;
        }

        let detail = load_simulation_detail(&transaction, &simulation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar criação do simulado", error))?;
        Ok(detail)
    }

    fn start_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar simulado", error))?;
        let state = load_simulation_state(&transaction, simulation_id)?;
        match state.status {
            SimulationStatus::Draft | SimulationStatus::Paused => {
                transaction
                    .execute(
                        "UPDATE simulations
                         SET status = 'in_progress',
                             started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                             ends_at = CASE
                                 WHEN time_limit_seconds IS NULL THEN NULL
                                 WHEN ends_at IS NOT NULL THEN ends_at
                                 ELSE datetime('now', '+' || time_limit_seconds || ' seconds')
                             END,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?1",
                        params![simulation_id],
                    )
                    .map_err(|error| map_database_error("começar relógio do simulado", error))?;
            }
            SimulationStatus::InProgress | SimulationStatus::Completed => {}
        }
        let detail = load_simulation_detail(&transaction, simulation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar início do simulado", error))?;
        Ok(detail)
    }

    fn pause_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("pausar simulado", error))?;
        let state = load_simulation_state(&transaction, simulation_id)?;
        if state.mode.as_str() != "training" {
            return Err(WorkspaceError::InvalidInput(
                "O modo prova não pode ser pausado; o relógio continua correndo.".to_string(),
            ));
        }
        if state.status != SimulationStatus::InProgress {
            return Err(WorkspaceError::InvalidInput(
                "Somente um simulado em andamento pode ser pausado.".to_string(),
            ));
        }
        transaction
            .execute(
                "UPDATE simulations SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![simulation_id],
            )
            .map_err(|error| map_database_error("salvar pausa do simulado", error))?;
        let detail = load_simulation_detail(&transaction, simulation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar pausa do simulado", error))?;
        Ok(detail)
    }

    fn resume_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError> {
        self.start_simulation(simulation_id)
    }

    fn answer_simulation(
        &self,
        input: &AnswerSimulationInput,
    ) -> Result<SimulationDetail, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("responder simulado", error))?;
        let state = load_simulation_state(&transaction, &input.simulation_id)?;
        if state.status != SimulationStatus::InProgress {
            return Err(WorkspaceError::InvalidInput(
                "O simulado precisa estar em andamento para receber respostas.".to_string(),
            ));
        }
        let expired: bool = transaction
            .query_row(
                "SELECT ends_at IS NOT NULL AND datetime('now') >= ends_at
                 FROM simulations WHERE id = ?1",
                params![input.simulation_id.as_str()],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("verificar relógio do simulado", error))?;
        if expired {
            return Err(WorkspaceError::InvalidInput(
                "O tempo da prova terminou; finalize o simulado para ver o resultado.".to_string(),
            ));
        }

        let question =
            load_simulation_question_meta(&transaction, &input.simulation_id, &input.question_id)?;
        if let Some(selected_key) = input.selected_key.as_deref() {
            if !question
                .options
                .iter()
                .any(|option| option.key == selected_key)
            {
                return Err(WorkspaceError::InvalidInput(
                    "A alternativa escolhida não pertence à questão do simulado.".to_string(),
                ));
            }
        }
        let result = if question.status == "annulled" {
            "annulled"
        } else {
            match question.answer_key.as_deref() {
                Some(answer_key) => match input.selected_key.as_deref() {
                    Some(selected_key) if selected_key == answer_key => "correct",
                    Some(_) => "incorrect",
                    None => "blank",
                },
                None => "pending",
            }
        };
        transaction
            .execute(
                "INSERT INTO simulation_answers
                    (simulation_id, question_id, selected_key, elapsed_seconds, result)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(simulation_id, question_id) DO UPDATE SET
                    selected_key = excluded.selected_key,
                    elapsed_seconds = excluded.elapsed_seconds,
                    result = excluded.result,
                    answered_at = CURRENT_TIMESTAMP",
                params![
                    input.simulation_id.as_str(),
                    input.question_id.as_str(),
                    input.selected_key.as_deref(),
                    input.elapsed_seconds,
                    result,
                ],
            )
            .map_err(|error| map_database_error("gravar resposta do simulado", error))?;
        transaction
            .execute(
                "UPDATE simulations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![input.simulation_id.as_str()],
            )
            .map_err(|error| map_database_error("atualizar simulado respondido", error))?;
        let detail = load_simulation_detail(&transaction, &input.simulation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar resposta do simulado", error))?;
        Ok(detail)
    }

    fn finish_simulation(&self, simulation_id: &str) -> Result<SimulationResult, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("finalizar simulado", error))?;
        let state = load_simulation_state(&transaction, simulation_id)?;
        if state.status == SimulationStatus::Completed {
            let result = load_simulation_result(&transaction, simulation_id)?;
            transaction
                .commit()
                .map_err(|error| map_database_error("confirmar resultado existente", error))?;
            return Ok(result);
        }
        if state.status == SimulationStatus::Draft {
            return Err(WorkspaceError::InvalidInput(
                "Inicie o simulado antes de finalizá-lo.".to_string(),
            ));
        }

        let lines = load_score_lines(&transaction, simulation_id)?;
        let mut score = 0.0;
        let mut max_score = 0.0;
        let mut correct_count = 0_i64;
        let mut incorrect_count = 0_i64;
        let mut blank_count = 0_i64;
        let mut annulled_count = 0_i64;
        let mut diagnostics: HashMap<Option<String>, DiagnosticAccumulator> = HashMap::new();

        for line in lines {
            let diagnostic = diagnostics
                .entry(line.subject_id.clone())
                .or_insert_with(|| DiagnosticAccumulator {
                    subject_id: line.subject_id.clone(),
                    subject_name: line.subject_name.clone(),
                    ..DiagnosticAccumulator::default()
                });
            diagnostic.question_count += 1;
            diagnostic.elapsed_seconds += line.elapsed_seconds;
            if line.status != "annulled" && line.result != "pending" {
                max_score += line.weight;
            }
            let line_score = match line.result.as_str() {
                "correct" => {
                    correct_count += 1;
                    line.weight
                }
                "incorrect" => {
                    incorrect_count += 1;
                    -state.negative_points * line.weight
                }
                "blank" => {
                    blank_count += 1;
                    state.blank_points * line.weight
                }
                "annulled" => {
                    annulled_count += 1;
                    state.annulled_points * line.weight
                }
                _ => 0.0,
            };
            score += line_score;
            diagnostic.score += line_score;
            if line.result == "correct" {
                diagnostic.correct_count += 1;
            } else if line.result == "incorrect" {
                diagnostic.incorrect_count += 1;
            } else if line.result == "blank" {
                diagnostic.blank_count += 1;
            }
        }

        let percentage = (max_score > 0.0).then_some(score / max_score * 100.0);
        transaction
            .execute(
                "INSERT INTO simulation_results
                    (simulation_id, score, max_score, percentage, correct_count,
                     incorrect_count, blank_count, annulled_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    simulation_id,
                    score,
                    max_score,
                    percentage,
                    correct_count,
                    incorrect_count,
                    blank_count,
                    annulled_count,
                ],
            )
            .map_err(|error| map_database_error("gravar resultado do simulado", error))?;
        for diagnostic in diagnostics.values() {
            transaction
                .execute(
                    "INSERT INTO simulation_diagnostics
                        (simulation_id, subject_id, subject_name, question_count,
                         correct_count, incorrect_count, blank_count, elapsed_seconds, score)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        simulation_id,
                        diagnostic.subject_id.as_deref(),
                        diagnostic.subject_name.as_deref(),
                        diagnostic.question_count,
                        diagnostic.correct_count,
                        diagnostic.incorrect_count,
                        diagnostic.blank_count,
                        diagnostic.elapsed_seconds,
                        diagnostic.score,
                    ],
                )
                .map_err(|error| map_database_error("gravar diagnóstico do simulado", error))?;
        }
        transaction
            .execute(
                "UPDATE simulations
                 SET status = 'completed', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1",
                params![simulation_id],
            )
            .map_err(|error| map_database_error("marcar simulado finalizado", error))?;

        let result = load_simulation_result(&transaction, simulation_id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar finalização do simulado", error))?;
        Ok(result)
    }
}

fn select_questions(
    connection: &Connection,
    input: &CreateSimulationInput,
) -> Result<Vec<QuestionCandidate>, WorkspaceError> {
    let mut selected = Vec::new();
    let mut selected_ids = HashSet::new();
    if input.subject_selections.is_empty() {
        let candidates = load_candidates(
            connection,
            &input.preparation_id,
            None,
            input.question_type.as_deref(),
        )?;
        for candidate in candidates {
            if selected_ids.insert(candidate.id.clone()) {
                selected.push(candidate);
                if selected.len() == usize::try_from(input.question_count).unwrap_or(0) {
                    break;
                }
            }
        }
        return Ok(selected);
    }

    for selection in &input.subject_selections {
        let candidates = load_candidates(
            connection,
            &input.preparation_id,
            Some(selection.subject_id.as_str()),
            input.question_type.as_deref(),
        )?;
        let mut added = 0_i64;
        for candidate in candidates {
            if selected_ids.insert(candidate.id.clone()) {
                selected.push(candidate);
                added += 1;
                if added == selection.question_count {
                    break;
                }
            }
        }
    }
    Ok(selected)
}

fn load_candidates(
    connection: &Connection,
    preparation_id: &str,
    subject_id: Option<&str>,
    question_type: Option<&str>,
) -> Result<Vec<QuestionCandidate>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT q.id, q.question_type, q.statement_markdown, q.answer_key, q.status,
                    q.explanation_markdown,
                     (SELECT qs.subject_id FROM question_subjects qs
                      WHERE qs.question_id = q.id
                        AND (?2 IS NULL OR qs.subject_id = ?2)
                      ORDER BY qs.subject_id LIMIT 1),
                     (SELECT s.name FROM question_subjects qs JOIN subjects s ON s.id = qs.subject_id
                      WHERE qs.question_id = q.id
                        AND (?2 IS NULL OR qs.subject_id = ?2)
                      ORDER BY qs.subject_id LIMIT 1)
             FROM questions q
             WHERE q.status = 'active'
               AND q.is_discursive = 0
               AND EXISTS (
                   SELECT 1 FROM question_subjects qs
                   JOIN subjects s ON s.id = qs.subject_id
                   WHERE qs.question_id = q.id
                     AND s.preparation_id = ?1
                     AND s.archived_at IS NULL
               )
               AND (?2 IS NULL OR EXISTS (
                   SELECT 1 FROM question_subjects qs
                   WHERE qs.question_id = q.id AND qs.subject_id = ?2
               ))
               AND (?3 IS NULL OR q.question_type = ?3)
             ORDER BY q.updated_at DESC, q.id",
        )
        .map_err(|error| map_database_error("preparar seleção de questões do simulado", error))?;
    let rows = statement
        .query_map(params![preparation_id, subject_id, question_type], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|error| map_database_error("consultar questões do simulado", error))?;
    let mut candidates = Vec::new();
    for row in rows {
        let (
            id,
            question_type,
            statement_markdown,
            answer_key,
            status,
            explanation_markdown,
            candidate_subject_id,
            subject_name,
        ) = row.map_err(|error| map_database_error("ler questão do simulado", error))?;
        let options = load_question_options(connection, &id)?;
        candidates.push(QuestionCandidate {
            id,
            question_type,
            statement_markdown,
            options,
            answer_key,
            status,
            explanation_markdown,
            subject_id: candidate_subject_id,
            subject_name,
        });
    }
    Ok(candidates)
}

fn load_question_options(
    connection: &Connection,
    question_id: &str,
) -> Result<Vec<QuestionOptionSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT option_key, option_text FROM question_options
             WHERE question_id = ?1 ORDER BY position, option_key",
        )
        .map_err(|error| map_database_error("preparar alternativas do simulado", error))?;
    let options = statement
        .query_map(params![question_id], |row| {
            Ok(QuestionOptionSummary {
                key: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|error| map_database_error("consultar alternativas do simulado", error))?
        .map(|row| row.map_err(|error| map_database_error("ler alternativa do simulado", error)))
        .collect();
    options
}

fn selection_weights(input: &CreateSimulationInput) -> HashMap<String, f64> {
    input
        .subject_selections
        .iter()
        .map(|selection| (selection.subject_id.clone(), selection.weight))
        .collect()
}

struct SimulationState {
    mode: crate::domain::simulation::SimulationMode,
    status: SimulationStatus,
    negative_points: f64,
    blank_points: f64,
    annulled_points: f64,
}

fn load_simulation_state(
    connection: &Connection,
    simulation_id: &str,
) -> Result<SimulationState, WorkspaceError> {
    connection
        .query_row(
            "SELECT mode, status, negative_points, blank_points, annulled_points
             FROM simulations WHERE id = ?1",
            params![simulation_id],
            |row| {
                let mode: String = row.get(0)?;
                let status: String = row.get(1)?;
                Ok((mode, status, row.get(2)?, row.get(3)?, row.get(4)?))
            },
        )
        .optional()
        .map_err(|error| map_database_error("localizar simulado", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("O simulado escolhido não existe mais.".to_string())
        })
        .and_then(
            |(mode, status, negative_points, blank_points, annulled_points)| {
                let mode = crate::domain::simulation::SimulationMode::from_storage(&mode)
                    .ok_or_else(|| {
                        WorkspaceError::Database("o modo do simulado é inválido".to_string())
                    })?;
                let status = SimulationStatus::from_storage(&status).ok_or_else(|| {
                    WorkspaceError::Database("a situação do simulado é inválida".to_string())
                })?;
                Ok(SimulationState {
                    mode,
                    status,
                    negative_points,
                    blank_points,
                    annulled_points,
                })
            },
        )
}

fn load_simulation_summary(
    connection: &Connection,
    simulation_id: &str,
) -> Result<SimulationSummary, WorkspaceError> {
    connection
        .query_row(
            "SELECT s.id, s.preparation_id, p.name, s.title, s.mode, s.question_count,
                    (SELECT COUNT(*) FROM simulation_answers a WHERE a.simulation_id = s.id),
                    s.time_limit_seconds, s.negative_points, s.blank_points, s.annulled_points,
                    s.status, s.started_at, s.ends_at, s.finished_at, s.created_at
             FROM simulations s JOIN preparations p ON p.id = s.preparation_id
             WHERE s.id = ?1",
            params![simulation_id],
            |row| {
                let mode: String = row.get(4)?;
                let status: String = row.get(11)?;
                Ok(SimulationSummary {
                    id: row.get(0)?,
                    preparation_id: row.get(1)?,
                    preparation_name: row.get(2)?,
                    title: row.get(3)?,
                    mode: crate::domain::simulation::SimulationMode::from_storage(&mode)
                        .ok_or_else(|| rusqlite::Error::InvalidQuery)?,
                    question_count: row.get(5)?,
                    answered_count: row.get(6)?,
                    time_limit_seconds: row.get(7)?,
                    negative_points: row.get(8)?,
                    blank_points: row.get(9)?,
                    annulled_points: row.get(10)?,
                    status: SimulationStatus::from_storage(&status)
                        .ok_or_else(|| rusqlite::Error::InvalidQuery)?,
                    started_at: row.get(12)?,
                    ends_at: row.get(13)?,
                    finished_at: row.get(14)?,
                    created_at: row.get(15)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                WorkspaceError::InvalidInput("O simulado escolhido não existe mais.".to_string())
            }
            other => map_database_error("ler resumo do simulado", other),
        })
}

fn load_simulation_detail(
    connection: &Connection,
    simulation_id: &str,
) -> Result<SimulationDetail, WorkspaceError> {
    let simulation = load_simulation_summary(connection, simulation_id)?;
    let reveal_answers = simulation.status == SimulationStatus::Completed;
    let mut statement = connection
        .prepare(
            "SELECT q.question_id, q.position, q.subject_id, q.subject_name,
                    q.question_type, q.statement_markdown, q.options_json,
                    a.selected_key, COALESCE(a.elapsed_seconds, 0), q.answer_key_snapshot,
                    a.result, q.explanation_markdown, q.weight
             FROM simulation_questions q
             LEFT JOIN simulation_answers a
               ON a.simulation_id = q.simulation_id AND a.question_id = q.question_id
             WHERE q.simulation_id = ?1
             ORDER BY q.position",
        )
        .map_err(|error| map_database_error("preparar questões do simulado", error))?;
    let rows = statement
        .query_map(params![simulation_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
                row.get::<_, f64>(12)?,
            ))
        })
        .map_err(|error| map_database_error("consultar questões do simulado", error))?;
    let mut questions = Vec::new();
    for row in rows {
        let (
            question_id,
            position,
            subject_id,
            subject_name,
            question_type,
            statement_markdown,
            options_json,
            selected_key,
            elapsed_seconds,
            answer_key,
            result,
            explanation_markdown,
            weight,
        ) = row.map_err(|error| map_database_error("ler questão do simulado", error))?;
        let options = serde_json::from_str(&options_json).map_err(|error| {
            WorkspaceError::Database(format!(
                "as alternativas congeladas do simulado são inválidas: {error}"
            ))
        })?;
        questions.push(SimulationQuestionSummary {
            question_id,
            position,
            subject_id,
            subject_name,
            question_type,
            statement_markdown,
            options,
            selected_key,
            elapsed_seconds,
            answer_key: reveal_answers.then_some(answer_key).flatten(),
            result: reveal_answers.then_some(result).flatten(),
            explanation_markdown: reveal_answers.then_some(explanation_markdown).flatten(),
            weight,
        });
    }
    Ok(SimulationDetail {
        simulation,
        questions,
    })
}

struct SimulationQuestionMeta {
    options: Vec<QuestionOptionSummary>,
    answer_key: Option<String>,
    status: String,
}

fn load_simulation_question_meta(
    connection: &Connection,
    simulation_id: &str,
    question_id: &str,
) -> Result<SimulationQuestionMeta, WorkspaceError> {
    connection
        .query_row(
            "SELECT options_json, answer_key_snapshot, status_snapshot
             FROM simulation_questions WHERE simulation_id = ?1 AND question_id = ?2",
            params![simulation_id, question_id],
            |row| {
                let options_json: String = row.get(0)?;
                Ok((
                    options_json,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| map_database_error("localizar questão do simulado", error))?
        .ok_or_else(|| {
            WorkspaceError::InvalidInput("A questão não pertence a este simulado.".to_string())
        })
        .and_then(|(options_json, answer_key, status)| {
            let options = serde_json::from_str(&options_json).map_err(|error| {
                WorkspaceError::Database(format!(
                    "as alternativas da questão são inválidas: {error}"
                ))
            })?;
            Ok(SimulationQuestionMeta {
                options,
                answer_key,
                status,
            })
        })
}

fn load_score_lines(
    connection: &Connection,
    simulation_id: &str,
) -> Result<Vec<ScoreLine>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT q.subject_id, q.subject_name, q.weight, q.status_snapshot,
                    q.answer_key_snapshot,
                    COALESCE(a.result, CASE
                        WHEN q.status_snapshot = 'annulled' THEN 'annulled'
                        WHEN q.answer_key_snapshot IS NULL THEN 'pending'
                        ELSE 'blank'
                    END),
                    COALESCE(a.elapsed_seconds, 0)
             FROM simulation_questions q
             LEFT JOIN simulation_answers a
               ON a.simulation_id = q.simulation_id AND a.question_id = q.question_id
             WHERE q.simulation_id = ?1
             ORDER BY q.position",
        )
        .map_err(|error| map_database_error("preparar cálculo do simulado", error))?;
    let score_lines = statement
        .query_map(params![simulation_id], |row| {
            Ok(ScoreLine {
                subject_id: row.get(0)?,
                subject_name: row.get(1)?,
                weight: row.get(2)?,
                status: row.get(3)?,
                result: row.get(5)?,
                elapsed_seconds: row.get(6)?,
            })
        })
        .map_err(|error| map_database_error("calcular linhas do simulado", error))?
        .map(|row| row.map_err(|error| map_database_error("ler linha do simulado", error)))
        .collect();
    score_lines
}

fn load_simulation_result(
    connection: &Connection,
    simulation_id: &str,
) -> Result<SimulationResult, WorkspaceError> {
    let (score, max_score, percentage, correct_count, incorrect_count, blank_count, annulled_count): (
        f64,
        f64,
        Option<f64>,
        i64,
        i64,
        i64,
        i64,
    ) = connection
        .query_row(
            "SELECT score, max_score, percentage, correct_count, incorrect_count,
                    blank_count, annulled_count
             FROM simulation_results WHERE simulation_id = ?1",
            params![simulation_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .map_err(|error| map_database_error("ler resultado do simulado", error))?;
    let mut statement = connection
        .prepare(
            "SELECT subject_id, subject_name, question_count, correct_count,
                    incorrect_count, blank_count, elapsed_seconds, score
             FROM simulation_diagnostics
             WHERE simulation_id = ?1
             ORDER BY COALESCE(subject_name, '') COLLATE NOCASE, subject_id",
        )
        .map_err(|error| map_database_error("preparar diagnóstico do simulado", error))?;
    let diagnostics = statement
        .query_map(params![simulation_id], |row| {
            Ok(SimulationDiagnosticSummary {
                subject_id: row.get(0)?,
                subject_name: row.get(1)?,
                question_count: row.get(2)?,
                correct_count: row.get(3)?,
                incorrect_count: row.get(4)?,
                blank_count: row.get(5)?,
                elapsed_seconds: row.get(6)?,
                score: row.get(7)?,
            })
        })
        .map_err(|error| map_database_error("consultar diagnóstico do simulado", error))?
        .map(|row| row.map_err(|error| map_database_error("ler diagnóstico do simulado", error)))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SimulationResult {
        detail: load_simulation_detail(connection, simulation_id)?,
        score,
        max_score,
        percentage,
        correct_count,
        incorrect_count,
        blank_count,
        annulled_count,
        diagnostics,
    })
}

fn ensure_preparation_exists(
    connection: &Connection,
    preparation_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("validar preparação do simulado", error))?;
    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "A preparação escolhida não existe mais.".to_string(),
        ));
    }
    Ok(())
}

fn ensure_subject_belongs_to_preparation(
    connection: &Connection,
    preparation_id: &str,
    subject_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM subjects
             WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
            params![subject_id, preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("validar assunto do simulado", error))?;
    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "Um assunto escolhido não pertence à preparação.".to_string(),
        ));
    }
    Ok(())
}
