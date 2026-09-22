use crate::application::study_plan_service::StudyPlanService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::study_plan::{
    CreatePreparationInput, CreateSubjectInput, PreparationSummary, StudyPlan, SubjectSummary,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePreparationRequest {
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub exam_date: Option<String>,
    #[serde(default)]
    pub make_primary: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubjectRequest {
    pub preparation_id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub fn get_study_plan(app: AppHandle) -> Result<StudyPlan, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .load()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_preparation(
    app: AppHandle,
    request: CreatePreparationRequest,
) -> Result<PreparationSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    let input = CreatePreparationInput {
        name: request.name,
        organization: request.organization,
        role: request.role,
        exam_date: request.exam_date,
        make_primary: request.make_primary,
    };

    StudyPlanService::new(store)
        .create_preparation(input)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn create_subject(
    app: AppHandle,
    request: CreateSubjectRequest,
) -> Result<SubjectSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    let input = CreateSubjectInput {
        preparation_id: request.preparation_id,
        name: request.name,
        parent_id: request.parent_id,
    };

    StudyPlanService::new(store)
        .create_subject(input)
        .map_err(CommandError::from)
}
