use crate::application::study_plan_service::StudyPlanService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::study_plan::{
    CreatePreparationInput, CreateSubjectInput, PreparationSummary, ReferenceDocumentStatus,
    SavePreparationExamConfigInput, SaveStudyPlanningInput, SetPrimaryPreparationInput,
    SetSubjectStudyStatusInput, StudyCycleSlotInput, StudyDayAvailability, StudyPlan,
    StudyPlanningSummary, SubjectExamWeightInput, SubjectPriorityInput, SubjectStudyStatus,
    SubjectSummary, DEFAULT_REVIEW_RESERVE_PERCENT,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePreparationRequest {
    pub name: String,
    pub organization: Option<String>,
    pub role: Option<String>,
    pub board: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPrimaryPreparationRequest {
    pub preparation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectExamWeightRequest {
    pub subject_id: String,
    pub exam_weight: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePreparationExamConfigRequest {
    pub preparation_id: String,
    pub reference_material_id: Option<String>,
    pub reference_document_status: ReferenceDocumentStatus,
    pub exam_rules_markdown: Option<String>,
    pub subject_exam_weights: Vec<SubjectExamWeightRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSubjectStudyStatusRequest {
    pub subject_id: String,
    pub status: SubjectStudyStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyDayAvailabilityRequest {
    pub weekday: u8,
    pub available_minutes: i64,
    pub is_rest: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectPriorityRequest {
    pub subject_id: String,
    pub priority: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyCycleSlotRequest {
    pub subject_id: String,
    pub planned_minutes: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStudyPlanningRequest {
    pub preparation_id: String,
    pub availability: Vec<StudyDayAvailabilityRequest>,
    pub subject_priorities: Vec<SubjectPriorityRequest>,
    #[serde(default = "default_review_reserve_percent")]
    pub review_reserve_percent: i64,
    #[serde(default)]
    pub cycle_slots: Option<Vec<StudyCycleSlotRequest>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyPlanningPreparationRequest {
    pub preparation_id: String,
}

fn default_review_reserve_percent() -> i64 {
    DEFAULT_REVIEW_RESERVE_PERCENT
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
        board: request.board,
        exam_date: request.exam_date,
        make_primary: request.make_primary,
    };

    StudyPlanService::new(store)
        .create_preparation(input)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn set_primary_preparation(
    app: AppHandle,
    request: SetPrimaryPreparationRequest,
) -> Result<PreparationSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .set_primary_preparation(SetPrimaryPreparationInput {
            preparation_id: request.preparation_id,
        })
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

#[tauri::command]
pub fn save_preparation_exam_config(
    app: AppHandle,
    request: SavePreparationExamConfigRequest,
) -> Result<PreparationSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .save_preparation_exam_config(SavePreparationExamConfigInput {
            preparation_id: request.preparation_id,
            reference_material_id: request.reference_material_id,
            reference_document_status: request.reference_document_status,
            exam_rules_markdown: request.exam_rules_markdown,
            subject_exam_weights: request
                .subject_exam_weights
                .into_iter()
                .map(|subject| SubjectExamWeightInput {
                    subject_id: subject.subject_id,
                    exam_weight: subject.exam_weight,
                })
                .collect(),
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn set_subject_study_status(
    app: AppHandle,
    request: SetSubjectStudyStatusRequest,
) -> Result<SubjectSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .set_subject_study_status(SetSubjectStudyStatusInput {
            subject_id: request.subject_id,
            status: request.status,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn get_study_planning(
    app: AppHandle,
    request: StudyPlanningPreparationRequest,
) -> Result<StudyPlanningSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .planning(&request.preparation_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn save_study_planning(
    app: AppHandle,
    request: SaveStudyPlanningRequest,
) -> Result<StudyPlanningSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    let input = SaveStudyPlanningInput {
        preparation_id: request.preparation_id,
        availability: request
            .availability
            .into_iter()
            .map(|day| StudyDayAvailability {
                weekday: day.weekday,
                available_minutes: day.available_minutes,
                is_rest: day.is_rest,
            })
            .collect(),
        subject_priorities: request
            .subject_priorities
            .into_iter()
            .map(|subject| SubjectPriorityInput {
                subject_id: subject.subject_id,
                priority: subject.priority,
            })
            .collect(),
        review_reserve_percent: request.review_reserve_percent,
        cycle_slots: request.cycle_slots.map(|slots| {
            slots
                .into_iter()
                .map(|slot| StudyCycleSlotInput {
                    subject_id: slot.subject_id,
                    planned_minutes: slot.planned_minutes,
                })
                .collect()
        }),
    };

    StudyPlanService::new(store)
        .save_planning(input)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn advance_study_cycle(
    app: AppHandle,
    request: StudyPlanningPreparationRequest,
) -> Result<StudyPlanningSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    StudyPlanService::new(store)
        .advance_cycle(&request.preparation_id)
        .map_err(CommandError::from)
}
