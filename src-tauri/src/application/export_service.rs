use crate::application::workspace_service::WorkspaceError;
use crate::domain::export::{StudyProgressCsvExportResult, WorkspaceDataExportResult};

pub trait ExportStore {
    fn export_workspace_data(&self) -> Result<WorkspaceDataExportResult, WorkspaceError>;

    fn export_study_progress_csv(&self) -> Result<StudyProgressCsvExportResult, WorkspaceError>;
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

    pub fn export_study_progress_csv(
        &self,
    ) -> Result<StudyProgressCsvExportResult, WorkspaceError> {
        self.store.export_study_progress_csv()
    }
}
