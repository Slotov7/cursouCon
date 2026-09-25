use crate::application::workspace_service::WorkspaceError;
use crate::domain::material::{
    normalize_import_material_input, normalize_open_material_input,
    normalize_register_material_link_input, normalize_set_material_subjects_input,
    normalize_set_material_tags_input, normalize_update_material_page_input, ImportMaterialInput,
    MaterialSummary, OpenMaterialInput, RegisterMaterialLinkInput, SetMaterialSubjectsInput,
    SetMaterialTagsInput, UpdateMaterialPageInput,
};
use std::path::PathBuf;

pub trait MaterialStore {
    fn list_materials(&self) -> Result<Vec<MaterialSummary>, WorkspaceError>;
    fn import_material(
        &self,
        input: &ImportMaterialInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
    fn register_material_link(
        &self,
        input: &RegisterMaterialLinkInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
    fn material_path(&self, material_id: &str) -> Result<PathBuf, WorkspaceError>;
    fn material_url(&self, material_id: &str) -> Result<Option<String>, WorkspaceError>;
    fn update_material_page(
        &self,
        input: &UpdateMaterialPageInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
    fn set_material_tags(
        &self,
        input: &SetMaterialTagsInput,
    ) -> Result<MaterialSummary, WorkspaceError>;
    fn set_material_subjects(
        &self,
        input: &SetMaterialSubjectsInput,
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

    pub fn register_link(
        &self,
        input: RegisterMaterialLinkInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_register_material_link_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.register_material_link(&normalized)
    }

    pub fn path(&self, input: OpenMaterialInput) -> Result<PathBuf, WorkspaceError> {
        let normalized =
            normalize_open_material_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.material_path(&normalized.material_id)
    }

    pub fn url(&self, input: OpenMaterialInput) -> Result<Option<String>, WorkspaceError> {
        let normalized =
            normalize_open_material_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.material_url(&normalized.material_id)
    }

    pub fn update_page(
        &self,
        input: UpdateMaterialPageInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_update_material_page_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.update_material_page(&normalized)
    }

    pub fn set_tags(&self, input: SetMaterialTagsInput) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_set_material_tags_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.set_material_tags(&normalized)
    }

    pub fn set_subjects(
        &self,
        input: SetMaterialSubjectsInput,
    ) -> Result<MaterialSummary, WorkspaceError> {
        let normalized =
            normalize_set_material_subjects_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.set_material_subjects(&normalized)
    }
}
