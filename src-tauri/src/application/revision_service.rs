use crate::application::workspace_service::WorkspaceError;
use crate::domain::revision::{RevisionSummary, SyncDestinationSettings};
use crate::domain::workspace::WorkspaceSummary;
use std::path::Path;

pub trait RevisionStore {
    fn publish_revision(&self) -> Result<RevisionSummary, WorkspaceError>;
    fn publish_revision_to_destination(
        &self,
        destination_parent: &Path,
    ) -> Result<RevisionSummary, WorkspaceError>;
    fn publish_configured_revision(&self) -> Result<RevisionSummary, WorkspaceError>;
    fn sync_destination_settings(&self) -> Result<SyncDestinationSettings, WorkspaceError>;
    fn configure_sync_destination(
        &self,
        enabled: bool,
        destination_parent: Option<&Path>,
    ) -> Result<SyncDestinationSettings, WorkspaceError>;
    fn list_revisions(&self, workspace_path: &Path)
        -> Result<Vec<RevisionSummary>, WorkspaceError>;
    fn restore_revision(
        &self,
        workspace_path: &Path,
        revision_id: &str,
    ) -> Result<WorkspaceSummary, WorkspaceError>;
}

pub struct RevisionService<S> {
    store: S,
}

impl<S: RevisionStore> RevisionService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn publish(&self) -> Result<RevisionSummary, WorkspaceError> {
        self.store.publish_revision()
    }

    pub fn publish_to(&self, destination_parent: &Path) -> Result<RevisionSummary, WorkspaceError> {
        self.store
            .publish_revision_to_destination(destination_parent)
    }

    pub fn publish_configured(&self) -> Result<RevisionSummary, WorkspaceError> {
        self.store.publish_configured_revision()
    }

    pub fn sync_settings(&self) -> Result<SyncDestinationSettings, WorkspaceError> {
        self.store.sync_destination_settings()
    }

    pub fn configure_sync(
        &self,
        enabled: bool,
        destination_parent: Option<&Path>,
    ) -> Result<SyncDestinationSettings, WorkspaceError> {
        self.store
            .configure_sync_destination(enabled, destination_parent)
    }

    pub fn list(&self, workspace_path: &Path) -> Result<Vec<RevisionSummary>, WorkspaceError> {
        self.store.list_revisions(workspace_path)
    }

    pub fn restore(
        &self,
        workspace_path: &Path,
        revision_id: &str,
    ) -> Result<WorkspaceSummary, WorkspaceError> {
        self.store.restore_revision(workspace_path, revision_id)
    }
}
