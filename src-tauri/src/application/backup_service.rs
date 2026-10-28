use crate::application::workspace_service::WorkspaceError;
use crate::domain::backup::{BackupInspectionSummary, BackupSummary};
use crate::domain::workspace::WorkspaceSummary;
use std::path::Path;

pub trait BackupStore {
    fn create_backup(
        &self,
        destination_parent: &Path,
        keep_last: Option<u32>,
    ) -> Result<BackupSummary, WorkspaceError>;
    fn inspect_backup(&self, backup_path: &Path)
        -> Result<BackupInspectionSummary, WorkspaceError>;
    fn restore_backup(
        &self,
        backup_path: &Path,
        destination_parent: &Path,
    ) -> Result<WorkspaceSummary, WorkspaceError>;
}

pub struct BackupService<S> {
    store: S,
}

impl<S: BackupStore> BackupService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn create(
        &self,
        destination_parent: &Path,
        keep_last: Option<u32>,
    ) -> Result<BackupSummary, WorkspaceError> {
        self.store.create_backup(destination_parent, keep_last)
    }

    pub fn inspect(&self, backup_path: &Path) -> Result<BackupInspectionSummary, WorkspaceError> {
        self.store.inspect_backup(backup_path)
    }

    pub fn restore(
        &self,
        backup_path: &Path,
        destination_parent: &Path,
    ) -> Result<WorkspaceSummary, WorkspaceError> {
        self.store.restore_backup(backup_path, destination_parent)
    }
}
