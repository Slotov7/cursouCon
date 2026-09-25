use crate::application::workspace_service::WorkspaceError;
use crate::domain::export::WorkspaceDataExportResult;

pub trait ExportStore {
    fn export_workspace_data(&self) -> Result<WorkspaceDataExportResult, WorkspaceError>;
}

pub struct ExportService<S> {
    store: S,
}

impl<S: ExportStore> ExportService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn export_workspace_data(&self) -> Result<WorkspaceDataExportResult, WorkspaceError> {
        self.store.export_workspace_data()
    }
}
