use crate::application::workspace_service::WorkspaceError;
use crate::domain::diagnostic::{DiagnosticExportResult, DiagnosticSnapshot};
use std::path::Path;

pub trait DiagnosticStore {
    fn diagnostic_snapshot(&self) -> Result<DiagnosticSnapshot, WorkspaceError>;
    fn export_diagnostic(
        &self,
        destination_parent_path: &Path,
    ) -> Result<DiagnosticExportResult, WorkspaceError>;
}

pub struct DiagnosticService<S> {
    store: S,
}

impl<S: DiagnosticStore> DiagnosticService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn snapshot(&self) -> Result<DiagnosticSnapshot, WorkspaceError> {
        self.store.diagnostic_snapshot()
    }

    pub fn export(
        &self,
        destination_parent_path: &Path,
    ) -> Result<DiagnosticExportResult, WorkspaceError> {
        self.store.export_diagnostic(destination_parent_path)
    }
}
