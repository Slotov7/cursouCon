use crate::application::workspace_service::WorkspaceError;
use crate::domain::online_contest::{
    normalize_online_contest_id, normalize_online_contest_input, OnlineContestInput,
    OnlineContestNotice, OnlineContestRefreshResult, OnlineContestSnapshot,
    SetOnlineContestFavoriteInput,
};

pub trait OnlineContestStore {
    fn list_online_contests(&self) -> Result<OnlineContestSnapshot, WorkspaceError>;
    fn refresh_online_contests(
        &self,
        source_name: &str,
        source_url: &str,
        opportunities: &[OnlineContestInput],
    ) -> Result<OnlineContestRefreshResult, WorkspaceError>;
    fn record_online_contest_source_failure(
        &self,
        source_name: &str,
        source_url: &str,
        message: &str,
    ) -> Result<(), WorkspaceError>;
    fn set_online_contest_favorite(
        &self,
        input: &SetOnlineContestFavoriteInput,
    ) -> Result<OnlineContestSnapshot, WorkspaceError>;
    fn online_contest_source_url(&self, opportunity_id: &str) -> Result<String, WorkspaceError>;
    fn save_online_contest_notice(
        &self,
        opportunity_id: &str,
        notice: &OnlineContestNotice,
    ) -> Result<OnlineContestSnapshot, WorkspaceError>;
}

pub struct OnlineContestService<S> {
    store: S,
}

impl<S: OnlineContestStore> OnlineContestService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<OnlineContestSnapshot, WorkspaceError> {
        self.store.list_online_contests()
    }

    pub fn refresh(
        &self,
        source_name: &str,
        source_url: &str,
        opportunities: Vec<OnlineContestInput>,
    ) -> Result<OnlineContestRefreshResult, WorkspaceError> {
        let normalized = opportunities
            .into_iter()
            .map(normalize_online_contest_input)
            .collect::<Result<Vec<_>, _>>()
            .map_err(WorkspaceError::InvalidInput)?;
        if normalized.is_empty() {
            return Err(WorkspaceError::Network(
                "a fonte não retornou oportunidades utilizáveis".to_string(),
            ));
        }
        self.store
            .refresh_online_contests(source_name, source_url, &normalized)
    }

    pub fn record_failure(
        &self,
        source_name: &str,
        source_url: &str,
        message: &str,
    ) -> Result<(), WorkspaceError> {
        self.store
            .record_online_contest_source_failure(source_name, source_url, message)
    }

    pub fn set_favorite(
        &self,
        opportunity_id: String,
        is_favorite: bool,
    ) -> Result<OnlineContestSnapshot, WorkspaceError> {
        let input = SetOnlineContestFavoriteInput {
            opportunity_id: normalize_online_contest_id(&opportunity_id)
                .map_err(WorkspaceError::InvalidInput)?,
            is_favorite,
        };
        self.store.set_online_contest_favorite(&input)
    }

    pub fn source_url(&self, opportunity_id: &str) -> Result<String, WorkspaceError> {
        let opportunity_id =
            normalize_online_contest_id(opportunity_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.online_contest_source_url(&opportunity_id)
    }

    pub fn save_notice(
        &self,
        opportunity_id: String,
        notice: OnlineContestNotice,
    ) -> Result<OnlineContestSnapshot, WorkspaceError> {
        let opportunity_id =
            normalize_online_contest_id(&opportunity_id).map_err(WorkspaceError::InvalidInput)?;
        if notice.bytes.is_empty() {
            return Err(WorkspaceError::InvalidInput(
                "O edital baixado está vazio.".to_string(),
            ));
        }
        self.store
            .save_online_contest_notice(&opportunity_id, &notice)
    }
}
