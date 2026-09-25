use crate::application::workspace_service::WorkspaceError;
use crate::domain::contest::{
    normalize_contest_id, normalize_manual_contest_input,
    normalize_set_manual_contest_notice_input, ManualContestSummary, SaveManualContestInput,
    SetManualContestNoticeInput,
};

pub trait ContestStore {
    fn list_manual_contests(&self) -> Result<Vec<ManualContestSummary>, WorkspaceError>;
    fn save_manual_contest(
        &self,
        input: &SaveManualContestInput,
    ) -> Result<ManualContestSummary, WorkspaceError>;
    fn set_manual_contest_favorite(
        &self,
        contest_id: &str,
        is_favorite: bool,
    ) -> Result<ManualContestSummary, WorkspaceError>;
    fn set_manual_contest_notice(
        &self,
        input: &SetManualContestNoticeInput,
    ) -> Result<ManualContestSummary, WorkspaceError>;
}

pub struct ContestService<S> {
    store: S,
}

impl<S: ContestStore> ContestService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<Vec<ManualContestSummary>, WorkspaceError> {
        self.store.list_manual_contests()
    }

    pub fn save(
        &self,
        input: SaveManualContestInput,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        let normalized =
            normalize_manual_contest_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.save_manual_contest(&normalized)
    }

    pub fn set_favorite(
        &self,
        contest_id: &str,
        is_favorite: bool,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        let contest_id = normalize_contest_id(contest_id).map_err(WorkspaceError::InvalidInput)?;
        self.store
            .set_manual_contest_favorite(&contest_id, is_favorite)
    }

    pub fn set_notice(
        &self,
        input: SetManualContestNoticeInput,
    ) -> Result<ManualContestSummary, WorkspaceError> {
        let normalized = normalize_set_manual_contest_notice_input(input)
            .map_err(WorkspaceError::InvalidInput)?;
        self.store.set_manual_contest_notice(&normalized)
    }
}
