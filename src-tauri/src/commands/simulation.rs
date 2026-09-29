use crate::application::simulation_service::SimulationService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::simulation::{
    AnswerSimulationInput, CreateSimulationInput, SimulationDetail, SimulationResult,
    SimulationSubjectSelection, SimulationSummary,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSubjectSelectionRequest {
    pub subject_id: String,
    pub question_count: i64,
    pub weight: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSimulationRequest {
    pub preparation_id: String,
    pub title: String,
    pub mode: String,
    pub question_count: i64,
    pub time_limit_seconds: Option<i64>,
    pub negative_points: f64,
    pub blank_points: f64,
    pub annulled_points: f64,
    pub question_type: Option<String>,
    pub subject_selections: Vec<SimulationSubjectSelectionRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationIdRequest {
    pub simulation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerSimulationRequest {
    pub simulation_id: String,
    pub question_id: String,
    pub selected_key: Option<String>,
    pub elapsed_seconds: i64,
}

#[tauri::command]
pub fn get_simulations(app: AppHandle) -> Result<Vec<SimulationSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .list()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_simulation(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .get(request.simulation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_simulation_result(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationResult, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .result(request.simulation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_simulation(
    app: AppHandle,
    request: CreateSimulationRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .create(CreateSimulationInput {
            preparation_id: request.preparation_id,
            title: request.title,
            mode: request.mode,
            question_count: request.question_count,
            time_limit_seconds: request.time_limit_seconds,
            negative_points: request.negative_points,
            blank_points: request.blank_points,
            annulled_points: request.annulled_points,
            question_type: request.question_type,
            subject_selections: request
                .subject_selections
                .into_iter()
                .map(|selection| SimulationSubjectSelection {
                    subject_id: selection.subject_id,
                    question_count: selection.question_count,
                    weight: selection.weight,
                })
                .collect(),
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn start_simulation(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .start(request.simulation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn pause_simulation(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .pause(request.simulation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn resume_simulation(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .resume(request.simulation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn answer_simulation(
    app: AppHandle,
    request: AnswerSimulationRequest,
) -> Result<SimulationDetail, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .answer(AnswerSimulationInput {
            simulation_id: request.simulation_id,
            question_id: request.question_id,
            selected_key: request.selected_key,
            elapsed_seconds: request.elapsed_seconds,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn finish_simulation(
    app: AppHandle,
    request: SimulationIdRequest,
) -> Result<SimulationResult, CommandError> {
    let store = local_workspace_store(&app)?;
    SimulationService::new(store)
        .finish(request.simulation_id)
        .map_err(CommandError::from)
}
