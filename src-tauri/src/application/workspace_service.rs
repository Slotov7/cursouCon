use crate::domain::workspace::{
    validate_workspace_name, validate_workspace_path, WorkspaceManifest, WorkspaceSummary,
};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct WorkspaceRecord {
    pub manifest: WorkspaceManifest,
    pub path: PathBuf,
}

impl WorkspaceRecord {
    pub fn summary(&self) -> Result<WorkspaceSummary, WorkspaceError> {
        let path = self.path.to_str().ok_or_else(|| {
            WorkspaceError::InvalidWorkspace("O caminho do espaço não é válido.".to_string())
        })?;

        Ok(WorkspaceSummary {
            workspace_id: self.manifest.workspace_id,
            name: self.manifest.name.clone(),
            format_version: self.manifest.format_version,
            path: path.to_string(),
            storage_status: crate::domain::workspace::WorkspaceStorageStatus::Local,
        })
    }
}

pub trait WorkspaceStore {
    fn create_workspace(&self, path: &Path, name: &str) -> Result<WorkspaceRecord, WorkspaceError>;
    fn open_workspace(&self, path: &Path) -> Result<WorkspaceRecord, WorkspaceError>;
    fn active_workspace(&self) -> Result<Option<WorkspaceRecord>, WorkspaceError>;
    fn recent_workspaces(&self) -> Result<Vec<WorkspaceRecord>, WorkspaceError>;
}

pub struct WorkspaceService<S> {
    store: S,
}

impl<S: WorkspaceStore> WorkspaceService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn create(&self, path: &Path, name: &str) -> Result<WorkspaceSummary, WorkspaceError> {
        validate_workspace_path(path).map_err(WorkspaceError::InvalidInput)?;
        let valid_name = validate_workspace_name(name).map_err(WorkspaceError::InvalidInput)?;
        let record = self.store.create_workspace(path, &valid_name)?;
        record.summary()
    }

    pub fn open(&self, path: &Path) -> Result<WorkspaceSummary, WorkspaceError> {
        validate_workspace_path(path).map_err(WorkspaceError::InvalidInput)?;
        let record = self.store.open_workspace(path)?;
        record.summary()
    }

    pub fn active(&self) -> Result<Option<WorkspaceSummary>, WorkspaceError> {
        self.store
            .active_workspace()?
            .map(|record| record.summary())
            .transpose()
    }

    pub fn recent(&self) -> Result<Vec<WorkspaceSummary>, WorkspaceError> {
        self.store
            .recent_workspaces()?
            .into_iter()
            .map(|record| record.summary())
            .collect()
    }
}

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("Já existe um espaço nesta pasta.")]
    WorkspaceExists,
    #[error("O espaço não foi encontrado.")]
    WorkspaceNotFound,
    #[error("Nenhum espaço de estudos está aberto.")]
    NoActiveWorkspace,
    #[error("Já existe uma sessão de estudo ativa neste espaço.")]
    ActiveSessionExists,
    #[error("O espaço está incompleto: {0}")]
    IncompleteWorkspace(String),
    #[error("A versão de formato {0} não é compatível com esta versão do aplicativo.")]
    UnsupportedFormat(u32),
    #[error("Permissão negada: {0}")]
    PermissionDenied(String),
    #[error("Falha de acesso ao espaço: {0}")]
    Io(String),
    #[error("Falha no banco local: {0}")]
    Database(String),
    #[error("Falha ao ler o formato do espaço: {0}")]
    Serialization(String),
    #[error("Falha na consulta online: {0}")]
    Network(String),
    #[error("O espaço é inválido: {0}")]
    InvalidWorkspace(String),
    #[error("O backup é inválido: {0}")]
    InvalidBackup(String),
    #[error("Há revisões divergentes que exigem escolha: {0}")]
    RevisionConflict(String),
    #[error("Falha ao recuperar o espaço ativo: {0}")]
    ActiveWorkspace(String),
}

impl WorkspaceError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid_input",
            Self::WorkspaceExists => "workspace_exists",
            Self::WorkspaceNotFound => "workspace_not_found",
            Self::NoActiveWorkspace => "no_active_workspace",
            Self::ActiveSessionExists => "active_session_exists",
            Self::IncompleteWorkspace(_) => "incomplete_workspace",
            Self::UnsupportedFormat(_) => "unsupported_format",
            Self::PermissionDenied(_) => "permission_denied",
            Self::Io(_) => "io_error",
            Self::Database(_) => "database_error",
            Self::Serialization(_) => "serialization_error",
            Self::Network(_) => "network_error",
            Self::InvalidWorkspace(_) => "invalid_workspace",
            Self::InvalidBackup(_) => "invalid_backup",
            Self::RevisionConflict(_) => "revision_conflict",
            Self::ActiveWorkspace(_) => "active_workspace_error",
        }
    }
}
