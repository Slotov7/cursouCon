use super::{
    backup_store::{
        copy_blob_directory, copy_directory_contents, copy_verified_file, current_epoch_seconds,
        ensure_directory, ensure_regular_file, existing_directory, path_is_within, path_to_string,
        read_json_file, safe_directory_stem, sha256_file, validate_database_file,
        validate_hash_name, write_json_file,
    },
    map_io_error,
    workspace_store::LocalWorkspaceStore,
};
use crate::application::revision_service::RevisionStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceRecord, WorkspaceStore};
use crate::domain::revision::{
    RevisionBlobReference, RevisionManifest, RevisionSummary, SyncDestinationSettings,
    REVISION_DATABASE_FILE, REVISION_FORMAT_VERSION, REVISION_MANIFEST_FILE,
};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

struct ValidRevision {
    created_at_epoch_seconds: i64,
    path: PathBuf,
    manifest: RevisionManifest,
}

impl RevisionStore for LocalWorkspaceStore {
    fn publish_revision(&self) -> Result<RevisionSummary, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        self.ensure_no_active_session(&workspace)?;
        let parent_revision_id = latest_revision_for_workspace(&workspace)?
            .map(|revision| revision.manifest.revision_id);

        let revisions_path = workspace.path.join("revisions");
        ensure_directory(&revisions_path, "a pasta de revisões")?;
        let revision_id = Uuid::new_v4();
        let staging_path = revisions_path.join(format!(".cursoucon-revision-{revision_id}.tmp"));
        let final_path = revisions_path.join(revision_id.to_string());
        if staging_path.exists() || final_path.exists() {
            return Err(WorkspaceError::Io(
                "Não foi possível reservar uma pasta exclusiva para a revisão.".to_string(),
            ));
        }
        let created_at_epoch_seconds = current_epoch_seconds()?;

        let result = (|| {
            fs::create_dir(&staging_path)
                .map_err(|error| map_io_error("criar revisão temporária", error))?;
            let snapshot_path = staging_path.join(REVISION_DATABASE_FILE);
            let connection = self.active_database()?;
            connection
                .execute(
                    "VACUUM INTO ?1",
                    params![snapshot_path.to_string_lossy().to_string()],
                )
                .map_err(|error| {
                    WorkspaceError::Database(format!("criar snapshot da revisão: {error}"))
                })?;
            drop(connection);

            validate_database_file(&snapshot_path, &workspace.manifest)?;
            let blob_references = collect_blob_references(&snapshot_path, &workspace.path)?;
            let database_sha256 = sha256_file(&snapshot_path)?;
            let manifest = RevisionManifest {
                revision_format_version: REVISION_FORMAT_VERSION,
                revision_id,
                workspace_id: workspace.manifest.workspace_id,
                workspace_format_version: workspace.manifest.format_version,
                parent_revision_id,
                database_sha256,
                created_at_epoch_seconds,
                blob_references,
            };
            write_json_file(&staging_path.join(REVISION_MANIFEST_FILE), &manifest)?;
            fs::rename(&staging_path, &final_path)
                .map_err(|error| map_io_error("publicar revisão", error))?;

            Ok(RevisionSummary {
                revision_id,
                path: path_to_string(&final_path)?,
                created_at_epoch_seconds,
                blob_count: manifest.blob_references.len(),
            })
        })();

        if result.is_err() {
            let _ = fs::remove_dir_all(&staging_path);
        }
        result
    }

    fn publish_revision_to_destination(
        &self,
        destination_parent: &Path,
    ) -> Result<RevisionSummary, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let destination_parent = existing_directory(destination_parent, "o destino da revisão")?;
        if path_is_within(&destination_parent, &workspace.path) {
            return Err(WorkspaceError::InvalidInput(
                "A publicação precisa usar uma pasta externa ao espaço ativo.".to_string(),
            ));
        }

        let local_revision = RevisionStore::publish_revision(self)?;
        let revision_id = local_revision.revision_id;
        let package_stem = safe_directory_stem(&workspace.manifest.name);
        let final_path = destination_parent.join(format!("{package_stem}-revision-{revision_id}"));
        let staging_path =
            destination_parent.join(format!(".cursoucon-revision-{revision_id}.tmp"));
        if final_path.exists() || staging_path.exists() {
            return Err(WorkspaceError::Io(
                "Não foi possível reservar uma pasta exclusiva para a publicação.".to_string(),
            ));
        }

        let result = (|| {
            fs::create_dir(&staging_path)
                .map_err(|error| map_io_error("criar publicação temporária", error))?;
            write_json_file(
                &staging_path.join(crate::domain::workspace::WORKSPACE_MANIFEST_FILE),
                &workspace.manifest,
            )?;
            copy_blob_directory(&workspace.path.join("blobs"), &staging_path.join("blobs"))?;
            copy_directory_contents(
                &workspace.path.join("revisions"),
                &staging_path.join("revisions"),
            )?;
            copy_directory_contents(
                &workspace.path.join("exports"),
                &staging_path.join("exports"),
            )?;

            let staged_record = WorkspaceRecord {
                manifest: workspace.manifest.clone(),
                path: staging_path.clone(),
            };
            let staged_revisions = valid_revisions(&staged_record)?;
            if !staged_revisions
                .iter()
                .any(|revision| revision.manifest.revision_id == revision_id)
            {
                return Err(WorkspaceError::InvalidBackup(
                    "a revisão publicada não passou na validação do pacote externo".to_string(),
                ));
            }

            fs::rename(&staging_path, &final_path)
                .map_err(|error| map_io_error("publicar revisão externa", error))?;
            Ok(RevisionSummary {
                path: path_to_string(&final_path)?,
                ..local_revision
            })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&staging_path);
        }
        result
    }

    fn publish_configured_revision(&self) -> Result<RevisionSummary, WorkspaceError> {
        let settings = self.sync_destination_settings()?;
        if !settings.enabled {
            return Err(WorkspaceError::InvalidInput(
                "A publicação externa está desativada neste espaço.".to_string(),
            ));
        }
        let destination_path = settings.destination_path.ok_or_else(|| {
            WorkspaceError::InvalidInput(
                "O destino externo não está configurado neste espaço.".to_string(),
            )
        })?;
        self.publish_revision_to_destination(Path::new(&destination_path))
    }

    fn sync_destination_settings(&self) -> Result<SyncDestinationSettings, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        self.read_sync_destination_settings(workspace.manifest.workspace_id)
    }

    fn configure_sync_destination(
        &self,
        enabled: bool,
        destination_parent: Option<&Path>,
    ) -> Result<SyncDestinationSettings, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let current = self.read_sync_destination_settings(workspace.manifest.workspace_id)?;
        let destination_path = match destination_parent {
            Some(path) => Some(path_to_string(&validated_sync_destination(
                path,
                &workspace.path,
            )?)?),
            None => current.destination_path,
        };

        if enabled {
            let path = destination_path.as_deref().ok_or_else(|| {
                WorkspaceError::InvalidInput(
                    "Escolha uma pasta externa antes de ativar a publicação.".to_string(),
                )
            })?;
            validated_sync_destination(Path::new(path), &workspace.path)?;
        }

        let settings = SyncDestinationSettings {
            enabled,
            destination_path,
        };
        self.write_sync_destination_settings(workspace.manifest.workspace_id, &settings)?;
        Ok(settings)
    }

    fn list_revisions(
        &self,
        workspace_path: &Path,
    ) -> Result<Vec<RevisionSummary>, WorkspaceError> {
        if !workspace_path.is_absolute() {
            return Err(WorkspaceError::InvalidInput(
                "O caminho do espaço precisa ser absoluto.".to_string(),
            ));
        }
        let workspace = self.inspect_workspace(workspace_path)?;
        let mut revisions = valid_revisions(&workspace)?;
        revisions.sort_by_key(|revision| std::cmp::Reverse(revision.created_at_epoch_seconds));
        revisions.into_iter().map(revision_summary).collect()
    }

    fn restore_revision(
        &self,
        workspace_path: &Path,
        revision_id: &str,
    ) -> Result<crate::domain::workspace::WorkspaceSummary, WorkspaceError> {
        if !workspace_path.is_absolute() {
            return Err(WorkspaceError::InvalidInput(
                "O caminho do espaço precisa ser absoluto.".to_string(),
            ));
        }
        let workspace = self.inspect_workspace(workspace_path)?;
        let revision_id = Uuid::parse_str(revision_id.trim()).map_err(|_| {
            WorkspaceError::InvalidInput("O identificador da revisão é inválido.".to_string())
        })?;
        let revision = valid_revisions(&workspace)?
            .into_iter()
            .find(|revision| revision.manifest.revision_id == revision_id)
            .ok_or_else(|| {
                WorkspaceError::InvalidInput(
                    "A revisão escolhida não existe ou não passou na validação.".to_string(),
                )
            })?;

        if let Some(active) = self.active_workspace()? {
            if active.manifest.workspace_id != workspace.manifest.workspace_id {
                self.ensure_no_active_session(&active)?;
            }
        }

        let database_path = self.active_database_file(workspace.manifest.workspace_id);
        if database_path.is_file() {
            return Err(WorkspaceError::InvalidInput(
                "O espaço já possui um banco local; a restauração manual não o substituirá."
                    .to_string(),
            ));
        }
        let parent = database_path.parent().ok_or_else(|| {
            WorkspaceError::Database("não foi possível determinar o banco da revisão".to_string())
        })?;
        fs::create_dir_all(parent)
            .map_err(|error| map_io_error("preparar banco da revisão escolhida", error))?;
        let temporary_path =
            parent.join(format!(".workspace.sqlite3.manual-{}.tmp", Uuid::new_v4()));
        let result = (|| {
            copy_verified_file(
                &revision.path.join(REVISION_DATABASE_FILE),
                &temporary_path,
                Some(&revision.manifest.database_sha256),
            )?;
            fs::rename(&temporary_path, &database_path)
                .map_err(|error| map_io_error("publicar revisão escolhida", error))?;
            validate_database_file(&database_path, &workspace.manifest)?;
            let record = WorkspaceStore::open_workspace(self, &workspace.path)?;
            record.summary()
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary_path);
            let _ = fs::remove_file(&database_path);
        }
        result
    }
}

fn validated_sync_destination(
    destination_parent: &Path,
    workspace_path: &Path,
) -> Result<PathBuf, WorkspaceError> {
    let destination = existing_directory(destination_parent, "o destino externo")?;
    if path_is_within(&destination, workspace_path) {
        return Err(WorkspaceError::InvalidInput(
            "O destino externo precisa ficar fora do espaço ativo.".to_string(),
        ));
    }
    Ok(destination)
}

pub(crate) fn restore_latest_revision(
    store: &LocalWorkspaceStore,
    workspace: &WorkspaceRecord,
) -> Result<(), WorkspaceError> {
    let (revision_path, revision_manifest) = latest_valid_revision(workspace)?;
    let database_path = store.active_database_file(workspace.manifest.workspace_id);
    let parent = database_path.parent().ok_or_else(|| {
        WorkspaceError::Database("não foi possível determinar o banco da revisão".to_string())
    })?;
    fs::create_dir_all(parent).map_err(|error| map_io_error("preparar banco da revisão", error))?;
    let temporary_path = parent.join(format!(
        ".workspace.sqlite3.revision-{}.tmp",
        Uuid::new_v4()
    ));
    let result = (|| {
        copy_verified_file(
            &revision_path.join(REVISION_DATABASE_FILE),
            &temporary_path,
            Some(&revision_manifest.database_sha256),
        )?;
        fs::rename(&temporary_path, &database_path)
            .map_err(|error| map_io_error("publicar banco recuperado", error))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

pub(crate) fn rebind_restored_revisions(
    revisions_path: &Path,
    source_manifest: &crate::domain::workspace::WorkspaceManifest,
    restored_manifest: &crate::domain::workspace::WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    ensure_directory(revisions_path, "a pasta de revisões restauradas")?;
    for entry in fs::read_dir(revisions_path)
        .map_err(|error| map_io_error("ler revisões restauradas", error))?
    {
        let entry = entry.map_err(|error| map_io_error("ler revisão restaurada", error))?;
        let revision_path = entry.path();
        let metadata = fs::symlink_metadata(&revision_path)
            .map_err(|error| map_io_error("ler metadado de revisão restaurada", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let manifest_path = revision_path.join(REVISION_MANIFEST_FILE);
        if !manifest_path.exists() {
            continue;
        }
        let mut manifest: RevisionManifest = read_json_file(&manifest_path)?;
        if manifest.workspace_id != source_manifest.workspace_id
            || manifest.workspace_format_version != source_manifest.format_version
        {
            return Err(WorkspaceError::InvalidBackup(
                "uma revisão do backup não corresponde ao espaço de origem".to_string(),
            ));
        }
        let database_path = revision_path.join(REVISION_DATABASE_FILE);
        validate_database_file(&database_path, source_manifest)?;
        if sha256_file(&database_path)? != manifest.database_sha256 {
            return Err(WorkspaceError::InvalidBackup(
                "o banco de uma revisão restaurada não corresponde ao manifesto".to_string(),
            ));
        }

        rebind_revision_database(&database_path, source_manifest, restored_manifest)?;
        manifest.workspace_id = restored_manifest.workspace_id;
        manifest.database_sha256 = sha256_file(&database_path)?;
        replace_json_file(&manifest_path, &manifest)?;
        validate_database_file(&database_path, restored_manifest)?;
    }
    Ok(())
}

fn rebind_revision_database(
    path: &Path,
    source_manifest: &crate::domain::workspace::WorkspaceManifest,
    restored_manifest: &crate::domain::workspace::WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    let mut connection = Connection::open(path).map_err(|error| {
        WorkspaceError::Database(format!("abrir banco de revisão restaurada: {error}"))
    })?;
    let transaction = connection
        .transaction()
        .map_err(|error| WorkspaceError::Database(format!("iniciar ajuste de revisão: {error}")))?;
    let changed = transaction
        .execute(
            "UPDATE workspace_metadata
             SET workspace_id = ?1
             WHERE workspace_id = ?2",
            params![
                restored_manifest.workspace_id.to_string(),
                source_manifest.workspace_id.to_string()
            ],
        )
        .map_err(|error| {
            WorkspaceError::Database(format!("ajustar revisão restaurada: {error}"))
        })?;
    if changed != 1 {
        return Err(WorkspaceError::InvalidBackup(
            "o banco de uma revisão não contém a identidade esperada".to_string(),
        ));
    }
    transaction
        .commit()
        .map_err(|error| WorkspaceError::Database(format!("confirmar revisão restaurada: {error}")))
}

fn replace_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), WorkspaceError> {
    let parent = path.parent().ok_or_else(|| {
        WorkspaceError::Io(
            "não foi possível determinar a pasta do manifesto de revisão".to_string(),
        )
    })?;
    let temporary_path = parent.join(format!(".revision-manifest-{}.tmp", Uuid::new_v4()));
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| WorkspaceError::Serialization(format!("serializar revisão: {error}")))?;
    let result = (|| {
        fs::write(&temporary_path, serialized)
            .map_err(|error| map_io_error("gravar manifesto de revisão", error))?;
        fs::rename(&temporary_path, path)
            .map_err(|error| map_io_error("publicar manifesto de revisão", error))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn collect_blob_references(
    database_path: &Path,
    workspace_path: &Path,
) -> Result<Vec<RevisionBlobReference>, WorkspaceError> {
    let connection = Connection::open(database_path).map_err(|error| {
        WorkspaceError::Database(format!("abrir banco para referências da revisão: {error}"))
    })?;
    let mut statement = connection
        .prepare(
            "SELECT content_hash FROM materials WHERE source_url IS NULL
             UNION
             SELECT sha256 FROM question_attachments
             ORDER BY 1",
        )
        .map_err(|error| {
            WorkspaceError::Database(format!("consultar blobs da revisão: {error}"))
        })?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| WorkspaceError::Database(format!("ler blobs da revisão: {error}")))?;
    let mut hashes = HashSet::new();
    for row in rows {
        let hash =
            row.map_err(|error| WorkspaceError::Database(format!("ler hash da revisão: {error}")))?;
        validate_hash_name(&hash)?;
        hashes.insert(hash);
    }

    let mut hashes: Vec<String> = hashes.into_iter().collect();
    hashes.sort();
    hashes
        .into_iter()
        .map(|sha256| {
            let blob_path = workspace_path.join("blobs").join(&sha256);
            ensure_regular_file(&blob_path, "o blob referenciado pela revisão")?;
            if sha256_file(&blob_path)? != sha256 {
                return Err(WorkspaceError::InvalidBackup(format!(
                    "o blob {sha256} não corresponde ao próprio SHA-256"
                )));
            }
            Ok(RevisionBlobReference {
                relative_path: format!("blobs/{sha256}"),
                sha256,
            })
        })
        .collect()
}

fn latest_valid_revision(
    workspace: &WorkspaceRecord,
) -> Result<(PathBuf, RevisionManifest), WorkspaceError> {
    latest_revision_for_workspace(workspace)?
        .map(|revision| (revision.path, revision.manifest))
        .ok_or_else(|| {
            WorkspaceError::IncompleteWorkspace(
                "nenhuma revisão portátil válida foi encontrada".to_string(),
            )
        })
}

fn latest_revision_for_workspace(
    workspace: &WorkspaceRecord,
) -> Result<Option<ValidRevision>, WorkspaceError> {
    let mut candidates = valid_revisions(workspace)?;
    if let Some(conflict) = detect_revision_conflict(&candidates) {
        return Err(WorkspaceError::RevisionConflict(conflict));
    }
    candidates.sort_by_key(|candidate| candidate.created_at_epoch_seconds);
    Ok(candidates.pop())
}

fn valid_revisions(workspace: &WorkspaceRecord) -> Result<Vec<ValidRevision>, WorkspaceError> {
    let revisions_path = workspace.path.join("revisions");
    ensure_directory(&revisions_path, "a pasta de revisões")?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(&revisions_path)
        .map_err(|error| map_io_error("ler revisões do espaço", error))?
    {
        let entry = entry.map_err(|error| map_io_error("ler item de revisão", error))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| map_io_error("ler metadado de revisão", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let manifest_path = path.join(REVISION_MANIFEST_FILE);
        let Ok(manifest) = read_json_file::<RevisionManifest>(&manifest_path) else {
            continue;
        };
        if validate_revision(&path, &manifest, workspace).is_ok() {
            candidates.push(ValidRevision {
                created_at_epoch_seconds: manifest.created_at_epoch_seconds,
                path,
                manifest,
            });
        }
    }
    Ok(candidates)
}

fn revision_summary(revision: ValidRevision) -> Result<RevisionSummary, WorkspaceError> {
    Ok(RevisionSummary {
        revision_id: revision.manifest.revision_id,
        path: path_to_string(&revision.path)?,
        created_at_epoch_seconds: revision.created_at_epoch_seconds,
        blob_count: revision.manifest.blob_references.len(),
    })
}

fn detect_revision_conflict(candidates: &[ValidRevision]) -> Option<String> {
    let mut children_by_parent: HashMap<String, Vec<Uuid>> = HashMap::new();
    for candidate in candidates {
        let parent = candidate
            .manifest
            .parent_revision_id
            .map(|revision_id| revision_id.to_string())
            .unwrap_or_else(|| "root".to_string());
        children_by_parent
            .entry(parent)
            .or_default()
            .push(candidate.manifest.revision_id);
    }

    let mut conflicts = children_by_parent
        .into_iter()
        .filter_map(|(parent, mut children)| {
            if children.len() < 2 {
                return None;
            }
            children.sort_by_key(|revision_id| revision_id.as_u128());
            Some(format!(
                "o pai {parent} possui os descendentes {}. As revisões foram preservadas; escolha uma antes de recuperar o banco.",
                children
                    .into_iter()
                    .map(|revision_id| revision_id.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        })
        .collect::<Vec<_>>();
    conflicts.sort();
    conflicts.into_iter().next()
}

fn validate_revision(
    revision_path: &Path,
    manifest: &RevisionManifest,
    workspace: &WorkspaceRecord,
) -> Result<(), WorkspaceError> {
    if manifest.revision_format_version != REVISION_FORMAT_VERSION
        || manifest.revision_id.is_nil()
        || manifest.workspace_id != workspace.manifest.workspace_id
        || manifest.workspace_format_version != workspace.manifest.format_version
        || manifest.created_at_epoch_seconds < 0
        || manifest.parent_revision_id == Some(manifest.revision_id)
    {
        return Err(WorkspaceError::InvalidBackup(
            "manifesto de revisão incompatível".to_string(),
        ));
    }
    validate_hash_name(&manifest.database_sha256)?;
    let database_path = revision_path.join(REVISION_DATABASE_FILE);
    validate_database_file(&database_path, &workspace.manifest)?;
    if sha256_file(&database_path)? != manifest.database_sha256 {
        return Err(WorkspaceError::InvalidBackup(
            "o banco da revisão não corresponde ao hash declarado".to_string(),
        ));
    }

    let mut seen_hashes = HashSet::new();
    for reference in &manifest.blob_references {
        validate_hash_name(&reference.sha256)?;
        if !seen_hashes.insert(reference.sha256.clone())
            || reference.relative_path != format!("blobs/{}", reference.sha256)
            || !is_safe_relative_path(&reference.relative_path)
        {
            return Err(WorkspaceError::InvalidBackup(
                "a revisão contém uma referência de blob inválida".to_string(),
            ));
        }
        let blob_path = workspace.path.join(&reference.relative_path);
        ensure_regular_file(&blob_path, "o blob da revisão")?;
        if sha256_file(&blob_path)? != reference.sha256 {
            return Err(WorkspaceError::InvalidBackup(
                "um blob da revisão não corresponde ao hash declarado".to_string(),
            ));
        }
    }
    Ok(())
}

fn is_safe_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.contains('\\')
        && !path.is_absolute()
        && path.components().all(|component| {
            !matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::revision_service::RevisionStore;
    use crate::application::workspace_service::WorkspaceStore;
    use crate::domain::workspace::WorkspaceManifest;

    #[test]
    fn publishes_revision_and_recovers_missing_active_database() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-revision-workspace-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-revision-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        let created = store
            .create_workspace(&workspace_path, "Revisão de teste")
            .expect("o espaço de fixture deve ser criado");

        let revision = store
            .publish_revision()
            .expect("a revisão deve ser publicada");
        assert_eq!(revision.blob_count, 0);
        assert!(Path::new(&revision.path)
            .join(REVISION_MANIFEST_FILE)
            .is_file());

        let database_path = store.active_database_file(created.manifest.workspace_id);
        fs::remove_file(&database_path).expect("o banco de fixture deve poder ser removido");
        let reopened = store
            .open_workspace(&workspace_path)
            .expect("a revisão deve recuperar o banco");

        assert_eq!(
            reopened.manifest.workspace_id,
            created.manifest.workspace_id
        );
        assert!(database_path.is_file());

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn persists_and_disables_external_destination_without_deleting_it() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-sync-workspace-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-sync-data-{}", Uuid::new_v4()));
        let destination_path =
            std::env::temp_dir().join(format!("cursoucon-sync-destination-{}", Uuid::new_v4()));
        fs::create_dir_all(&destination_path).expect("o destino de fixture deve ser criado");
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Destino de teste")
            .expect("o espaço de fixture deve ser criado");

        let initial = store
            .sync_destination_settings()
            .expect("a configuração ausente deve usar o padrão desativado");
        assert!(!initial.enabled);
        assert!(initial.destination_path.is_none());

        let enabled = store
            .configure_sync_destination(true, Some(&destination_path))
            .expect("o destino externo deve ser configurado");
        assert!(enabled.enabled);
        assert_eq!(
            enabled.destination_path.as_deref(),
            destination_path.to_str()
        );

        let reopened_store = LocalWorkspaceStore::new(app_data_dir.clone());
        let persisted = reopened_store
            .sync_destination_settings()
            .expect("a configuração deve sobreviver à reabertura");
        assert_eq!(persisted.enabled, enabled.enabled);
        assert_eq!(persisted.destination_path, enabled.destination_path);

        let disabled = reopened_store
            .configure_sync_destination(false, None)
            .expect("a publicação deve poder ser desativada");
        assert!(!disabled.enabled);
        assert_eq!(disabled.destination_path, enabled.destination_path);
        assert!(destination_path.is_dir());
        assert!(matches!(
            reopened_store.publish_configured_revision(),
            Err(WorkspaceError::InvalidInput(_))
        ));

        let inside_workspace = workspace_path.join("exports");
        let rejected = reopened_store.configure_sync_destination(true, Some(&inside_workspace));
        assert!(matches!(rejected, Err(WorkspaceError::InvalidInput(_))));
        assert!(
            !reopened_store
                .sync_destination_settings()
                .expect("a configuração anterior deve permanecer válida")
                .enabled
        );
        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(destination_path);
    }

    #[test]
    fn detects_two_descendants_of_the_same_revision() {
        let workspace_manifest = WorkspaceManifest::new("Conflito de teste".to_string());
        let workspace = WorkspaceRecord {
            manifest: workspace_manifest.clone(),
            path: PathBuf::from("/tmp/cursoucon-conflict-test"),
        };
        let parent_revision_id = Uuid::new_v4();
        let first_revision_id = Uuid::new_v4();
        let second_revision_id = Uuid::new_v4();
        let candidate = |revision_id| ValidRevision {
            created_at_epoch_seconds: 1,
            path: PathBuf::from("/tmp/revision"),
            manifest: RevisionManifest {
                revision_format_version: REVISION_FORMAT_VERSION,
                revision_id,
                workspace_id: workspace_manifest.workspace_id,
                workspace_format_version: workspace_manifest.format_version,
                parent_revision_id: Some(parent_revision_id),
                database_sha256: "0".repeat(64),
                created_at_epoch_seconds: 1,
                blob_references: Vec::new(),
            },
        };

        let conflict = detect_revision_conflict(&[
            candidate(first_revision_id),
            candidate(second_revision_id),
        ]);

        assert!(conflict.is_some());
        assert!(conflict
            .expect("o conflito deve ser descrito")
            .contains(&parent_revision_id.to_string()));
        drop(workspace);
    }
}
