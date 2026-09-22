use crate::application::material_service::MaterialService;
use crate::commands::error::CommandError;
use crate::commands::workspace::local_workspace_store;
use crate::domain::material::{
    ImportMaterialInput, MaterialSummary, OpenMaterialInput, UpdateMaterialPageInput,
};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMaterialRequest {
    pub source_path: String,
    pub subject_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenMaterialRequest {
    pub material_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMaterialPageRequest {
    pub material_id: String,
    pub page: i64,
}

#[tauri::command]
pub fn get_materials(app: AppHandle) -> Result<Vec<MaterialSummary>, CommandError> {
    let store = local_workspace_store(&app)?;
    MaterialService::new(store)
        .list()
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn import_material(
    app: AppHandle,
    request: ImportMaterialRequest,
) -> Result<MaterialSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    MaterialService::new(store)
        .import(ImportMaterialInput {
            source_path: request.source_path,
            subject_id: request.subject_id,
        })
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn open_material(app: AppHandle, request: OpenMaterialRequest) -> Result<(), CommandError> {
    let store = local_workspace_store(&app)?;
    let path = MaterialService::new(store)
        .path(OpenMaterialInput {
            material_id: request.material_id,
        })
        .map_err(CommandError::from)?;
    let path = path.to_string_lossy().to_string();

    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|error| {
            CommandError::new(
                "open_material_error",
                format!("Não foi possível abrir o material: {error}"),
            )
        })
}

#[tauri::command]
pub fn get_material_source(
    app: AppHandle,
    request: OpenMaterialRequest,
) -> Result<String, CommandError> {
    let store = local_workspace_store(&app)?;
    let path = MaterialService::new(store)
        .path(OpenMaterialInput {
            material_id: request.material_id,
        })
        .map_err(CommandError::from)?;

    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| {
            CommandError::new(
                "material_scope_error",
                format!("Não foi possível autorizar a leitura do material: {error}"),
            )
        })?;

    path.to_str().map(str::to_string).ok_or_else(|| {
        CommandError::new(
            "material_path_error",
            "O caminho do material não pode ser representado pelo aplicativo.",
        )
    })
}

#[tauri::command]
pub fn update_material_page(
    app: AppHandle,
    request: UpdateMaterialPageRequest,
) -> Result<MaterialSummary, CommandError> {
    let store = local_workspace_store(&app)?;
    MaterialService::new(store)
        .update_page(UpdateMaterialPageInput {
            material_id: request.material_id,
            page: request.page,
        })
        .map_err(CommandError::from)
}
