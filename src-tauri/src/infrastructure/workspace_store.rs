use crate::application::workspace_service::{WorkspaceError, WorkspaceRecord, WorkspaceStore};
use crate::domain::workspace::{
    validate_workspace_name, WorkspaceManifest, CURRENT_FORMAT_VERSION, WORKSPACE_MANIFEST_FILE,
};
use crate::infrastructure::map_io_error;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const ACTIVE_WORKSPACE_FILE: &str = "active-workspace.json";

#[derive(Debug, Clone)]
pub struct LocalWorkspaceStore {
    app_data_dir: PathBuf,
}

impl LocalWorkspaceStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self { app_data_dir }
    }

    fn active_workspace_file(&self) -> PathBuf {
        self.app_data_dir.join(ACTIVE_WORKSPACE_FILE)
    }

    pub(crate) fn active_database_file(&self, workspace_id: Uuid) -> PathBuf {
        self.app_data_dir
            .join("workspaces")
            .join(workspace_id.to_string())
            .join("workspace.sqlite3")
    }

    fn inspect_workspace(&self, path: &Path) -> Result<WorkspaceRecord, WorkspaceError> {
        let canonical_path = canonical_workspace_path(path, false)?;
        let manifest_path = canonical_path.join(WORKSPACE_MANIFEST_FILE);

        if !manifest_path.is_file() {
            return Err(WorkspaceError::IncompleteWorkspace(
                "o arquivo workspace.json não foi encontrado".to_string(),
            ));
        }

        let manifest_contents = fs::read_to_string(&manifest_path)
            .map_err(|error| map_io_error("ler o manifesto do espaço", error))?;
        let manifest: WorkspaceManifest =
            serde_json::from_str(&manifest_contents).map_err(|error| {
                WorkspaceError::Serialization(format!("manifesto inválido: {error}"))
            })?;

        validate_manifest(&manifest)?;
        for directory_name in ["revisions", "blobs", "exports"] {
            let directory = canonical_path.join(directory_name);
            if !directory.is_dir() {
                return Err(WorkspaceError::IncompleteWorkspace(format!(
                    "a pasta {directory_name} não foi encontrada"
                )));
            }
        }

        Ok(WorkspaceRecord {
            manifest,
            path: canonical_path,
        })
    }

    fn write_active_workspace(&self, record: &WorkspaceRecord) -> Result<(), WorkspaceError> {
        fs::create_dir_all(&self.app_data_dir)
            .map_err(|error| map_io_error("preparar o armazenamento local", error))?;

        let pointer = ActiveWorkspacePointer {
            workspace_id: record.manifest.workspace_id,
            workspace_path: record
                .path
                .to_str()
                .ok_or_else(|| {
                    WorkspaceError::ActiveWorkspace("o caminho ativo não é válido".to_string())
                })?
                .to_string(),
        };

        write_json_atomically(&self.active_workspace_file(), &pointer)
    }

    fn ensure_writable(&self, workspace_path: &Path) -> Result<(), WorkspaceError> {
        let check_file = workspace_path.join(format!(".cursoucon-write-check-{}", Uuid::new_v4()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&check_file)
            .map_err(|error| map_io_error("validar a permissão de escrita", error))?;
        file.write_all(b"cursoucon")
            .map_err(|error| map_io_error("validar a permissão de escrita", error))?;
        drop(file);
        fs::remove_file(check_file)
            .map_err(|error| map_io_error("limpar a validação de escrita", error))?;
        Ok(())
    }
}

impl WorkspaceStore for LocalWorkspaceStore {
    fn create_workspace(&self, path: &Path, name: &str) -> Result<WorkspaceRecord, WorkspaceError> {
        let canonical_path = canonical_workspace_path(path, true)?;
        let manifest_path = canonical_path.join(WORKSPACE_MANIFEST_FILE);

        if manifest_path.exists() {
            return Err(WorkspaceError::WorkspaceExists);
        }

        self.ensure_writable(&canonical_path)?;
        for directory_name in ["revisions", "blobs", "exports"] {
            fs::create_dir_all(canonical_path.join(directory_name))
                .map_err(|error| map_io_error("criar a estrutura do espaço", error))?;
        }

        let valid_name = validate_workspace_name(name).map_err(WorkspaceError::InvalidInput)?;
        let manifest = WorkspaceManifest::new(valid_name);
        let record = WorkspaceRecord {
            manifest,
            path: canonical_path,
        };

        self.prepare_active_database(&record.manifest)?;
        write_json_atomically(&manifest_path, &record.manifest)?;
        self.write_active_workspace(&record)?;

        Ok(record)
    }

    fn open_workspace(&self, path: &Path) -> Result<WorkspaceRecord, WorkspaceError> {
        let record = self.inspect_workspace(path)?;
        self.ensure_writable(&record.path)?;
        self.prepare_active_database(&record.manifest)?;
        self.write_active_workspace(&record)?;
        Ok(record)
    }

    fn active_workspace(&self) -> Result<Option<WorkspaceRecord>, WorkspaceError> {
        let pointer_file = self.active_workspace_file();
        let pointer_source = if pointer_file.is_file() {
            pointer_file
        } else {
            let backup_file = backup_path(&pointer_file)?;
            if !backup_file.is_file() {
                return Ok(None);
            }
            backup_file
        };

        let contents = fs::read_to_string(pointer_source).map_err(|error| {
            WorkspaceError::ActiveWorkspace(format!("ler o espaço ativo: {error}"))
        })?;
        let pointer: ActiveWorkspacePointer = serde_json::from_str(&contents).map_err(|error| {
            WorkspaceError::ActiveWorkspace(format!("ponteiro inválido: {error}"))
        })?;
        let record = self.inspect_workspace(Path::new(&pointer.workspace_path))?;

        if record.manifest.workspace_id != pointer.workspace_id {
            return Err(WorkspaceError::ActiveWorkspace(
                "o identificador do espaço ativo não corresponde ao manifesto".to_string(),
            ));
        }

        self.prepare_active_database(&record.manifest)?;
        Ok(Some(record))
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveWorkspacePointer {
    workspace_id: Uuid,
    workspace_path: String,
}

fn canonical_workspace_path(path: &Path, create_missing: bool) -> Result<PathBuf, WorkspaceError> {
    if create_missing && !path.exists() {
        fs::create_dir_all(path).map_err(|error| map_io_error("criar a pasta do espaço", error))?;
    }

    if !path.exists() {
        return Err(WorkspaceError::WorkspaceNotFound);
    }

    let metadata =
        fs::metadata(path).map_err(|error| map_io_error("ler a pasta do espaço", error))?;
    if !metadata.is_dir() {
        return Err(WorkspaceError::InvalidInput(
            "A pasta escolhida não é um diretório.".to_string(),
        ));
    }

    fs::canonicalize(path).map_err(|error| map_io_error("normalizar a pasta do espaço", error))
}

fn validate_manifest(manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
    if manifest.format_version != CURRENT_FORMAT_VERSION {
        return Err(WorkspaceError::UnsupportedFormat(manifest.format_version));
    }

    if manifest.workspace_id.is_nil() {
        return Err(WorkspaceError::InvalidWorkspace(
            "o identificador do espaço está vazio".to_string(),
        ));
    }

    validate_workspace_name(&manifest.name).map_err(WorkspaceError::InvalidWorkspace)?;
    Ok(())
}

fn write_json_atomically<T: Serialize>(path: &Path, value: &T) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta do arquivo".to_string())
    })?;
    fs::create_dir_all(parent).map_err(|error| map_io_error("preparar arquivo", error))?;

    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome do arquivo".to_string())
    })?;
    let temporary_path = parent.join(format!(
        ".{}.tmp-{}",
        file_name.to_string_lossy(),
        Uuid::new_v4()
    ));
    let backup_file = backup_path(path)?;
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| WorkspaceError::Serialization(format!("serializar arquivo: {error}")))?;

    let write_result = (|| {
        let mut file = File::create(&temporary_path)
            .map_err(|error| map_io_error("criar arquivo temporário", error))?;
        file.write_all(&serialized)
            .map_err(|error| map_io_error("gravar arquivo temporário", error))?;
        file.sync_all()
            .map_err(|error| map_io_error("confirmar arquivo temporário", error))?;

        let had_original = path.exists();
        if had_original {
            if backup_file.exists() {
                fs::remove_file(&backup_file)
                    .map_err(|error| map_io_error("limpar backup temporário", error))?;
            }
            fs::rename(path, &backup_file)
                .map_err(|error| map_io_error("preservar arquivo anterior", error))?;
        }

        match fs::rename(&temporary_path, path) {
            Ok(()) => {
                if had_original {
                    let _ = fs::remove_file(&backup_file);
                }
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(path);
                if had_original {
                    if let Err(restore_error) = fs::rename(&backup_file, path) {
                        return Err(WorkspaceError::Io(format!(
                            "publicar arquivo: {error}; restaurar arquivo anterior: {restore_error}"
                        )));
                    }
                }
                Err(map_io_error("publicar arquivo", error))
            }
        }
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    write_result
}

fn backup_path(path: &Path) -> Result<PathBuf, WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta do backup".to_string())
    })?;
    let file_name = path.file_name().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar o nome do backup".to_string())
    })?;

    Ok(parent.join(format!(".{}.bak", file_name.to_string_lossy())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_reopens_and_keeps_active_database_outside_portable_folder() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-workspace-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());

        let created = store
            .create_workspace(&workspace_path, "Preparação de teste")
            .expect("o espaço de fixture deve ser criado");
        let reopened = store
            .open_workspace(&workspace_path)
            .expect("o espaço de fixture deve reabrir");
        let active = store
            .active_workspace()
            .expect("o ponteiro ativo deve ser lido")
            .expect("deve existir um espaço ativo");

        assert_eq!(
            created.manifest.workspace_id,
            reopened.manifest.workspace_id
        );
        assert_eq!(reopened.manifest.workspace_id, active.manifest.workspace_id);
        assert!(workspace_path.join(WORKSPACE_MANIFEST_FILE).is_file());
        assert!(app_data_dir
            .join("workspaces")
            .join(created.manifest.workspace_id.to_string())
            .join("workspace.sqlite3")
            .is_file());
        assert!(!workspace_path.join("workspace.sqlite3").exists());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn refuses_incomplete_workspace_without_selecting_it() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-incomplete-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace_path).expect("a pasta de fixture deve ser criada");
        let manifest = WorkspaceManifest::new("Incompleto".to_string());
        let manifest_json =
            serde_json::to_vec(&manifest).expect("o manifesto de fixture deve serializar");
        fs::write(workspace_path.join(WORKSPACE_MANIFEST_FILE), manifest_json)
            .expect("o manifesto de fixture deve ser gravado");
        let store = LocalWorkspaceStore::new(app_data_dir.clone());

        let result = store.open_workspace(&workspace_path);

        assert!(matches!(
            result,
            Err(WorkspaceError::IncompleteWorkspace(_))
        ));
        assert!(store
            .active_workspace()
            .expect("a ausência de ponteiro deve ser legível")
            .is_none());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
