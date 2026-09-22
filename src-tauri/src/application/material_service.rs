use crate::application::workspace_service::WorkspaceError;
use crate::domain::material::{
    normalize_import_material_input, normalize_open_material_input,
    normalize_update_material_page_input, ImportMaterialInput, MaterialSummary, OpenMaterialInput,
    UpdateMaterialPageInput,
};
use std::path::PathBuf;

pub trait MaterialStore {
    fn list_materials(&self) -> Result<Vec<MaterialSummary>, WorkspaceError>;
    fn import_material(
        &self,
        input: &ImportMaterialInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
    fn material_path(&self, material_id: &str) -> Result<PathBuf, WorkspaceError>;
    fn update_material_page(
        &self,
        input: &UpdateMaterialPageInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
}

pub struct MaterialService<S> {
    store: S,
}

impl<S: MaterialStore> MaterialService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<Vec<MaterialSummary>, WorkspaceError> {
        self.store.list_materials()
    }

    pub fn import(&self, input: ImportMaterialInput) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_import_material_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.import_material(&normalized)
    }

    pub fn path(&self, input: OpenMaterialInput) -> Result<PathBuf, WorkspaceError> {
        let normalized =
            normalize_open_material_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.material_path(&normalized.material_id)
    }

    pub fn update_page(
        &self,
        input: UpdateMaterialPageInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_update_material_page_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.update_material_page(&normalized)
    }
}
