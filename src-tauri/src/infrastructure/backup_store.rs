use super::{
    map_database_error, map_io_error,
    workspace_store::{validate_manifest, LocalWorkspaceStore},
};
use crate::application::backup_service::BackupStore;
use crate::application::workspace_service::{WorkspaceError, WorkspaceStore};
use crate::domain::backup::{
    BackupInspectionSummary, BackupManifest, BackupSummary, BACKUP_DATABASE_FILE,
    BACKUP_FORMAT_VERSION, BACKUP_MANIFEST_FILE,
};
use crate::domain::workspace::{WorkspaceManifest, WORKSPACE_MANIFEST_FILE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const COPY_BUFFER_SIZE: usize = 64 * 1024;

struct ValidatedBackup {
    path: PathBuf,
    manifest: BackupManifest,
    workspace_manifest: WorkspaceManifest,
    blob_count: i64,
    revision_file_count: i64,
    export_file_count: i64,
}

impl ValidatedBackup {
    fn summary(&self) -> Result<BackupInspectionSummary, WorkspaceError> {
        Ok(BackupInspectionSummary {
            path: path_to_string(&self.path)?,
            backup_format_version: self.manifest.backup_format_version,
            workspace_id: self.workspace_manifest.workspace_id.to_string(),
            workspace_name: self.workspace_manifest.name.clone(),
            workspace_format_version: self.workspace_manifest.format_version,
            database_sha256: self.manifest.database_sha256.clone(),
            created_at_epoch_seconds: self.manifest.created_at_epoch_seconds,
            blob_count: self.blob_count,
            revision_file_count: self.revision_file_count,
            export_file_count: self.export_file_count,
        })
    }
}

impl BackupStore for LocalWorkspaceStore {
    fn create_backup(&self, destination_parent: &Path) -> Result<BackupSummary, WorkspaceError> {
        let workspace = self
            .active_workspace()?
            .ok_or(WorkspaceError::NoActiveWorkspace)?;
        let destination_parent = existing_directory(destination_parent, "o destino do backup")?;

        if path_is_within(&destination_parent, &workspace.path) {
            return Err(WorkspaceError::InvalidInput(
                "O backup precisa ser salvo fora da pasta do espaço ativo.".to_string(),
            ));
        }

        let backup_id = Uuid::new_v4();
        let workspace_stem = safe_directory_stem(&workspace.manifest.name);
        let final_path = destination_parent.join(format!("{workspace_stem}-backup-{backup_id}"));
        let staging_path = destination_parent.join(format!(".cursoucon-backup-{backup_id}.tmp"));
        if final_path.exists() || staging_path.exists() {
            return Err(WorkspaceError::Io(
                "Não foi possível reservar uma pasta exclusiva para o backup.".to_string(),
            ));
        }

        let created_at_epoch_seconds = current_epoch_seconds()?;
        let result = (|| {
            create_backup_directories(&staging_path)?;
            write_json_file(
                &staging_path.join(WORKSPACE_MANIFEST_FILE),
                &workspace.manifest,
            )?;

            let snapshot_path = staging_path.join(BACKUP_DATABASE_FILE);
            let connection = self.active_database()?;
            connection
                .execute(
                    "VACUUM INTO ?1",
                    params![snapshot_path.to_string_lossy().to_string()],
                )
                .map_err(|error| map_database_error("criar snapshot do banco", error))?;
            drop(connection);

            validate_database_file(&snapshot_path, &workspace.manifest)?;
            validate_blob_directory(&snapshot_path, &workspace.path.join("blobs"))?;
            let database_sha256 = sha256_file(&snapshot_path)?;

            copy_blob_directory(&workspace.path.join("blobs"), &staging_path.join("blobs"))?;
            copy_directory_contents(
                &workspace.path.join("revisions"),
                &staging_path.join("revisions"),
            )?;
            copy_directory_contents(
                &workspace.path.join("exports"),
                &staging_path.join("exports"),
            )?;

            write_json_file(
                &staging_path.join(BACKUP_MANIFEST_FILE),
                &BackupManifest {
                    backup_format_version: BACKUP_FORMAT_VERSION,
                    workspace_id: workspace.manifest.workspace_id,
                    workspace_name: workspace.manifest.name.clone(),
                    workspace_format_version: workspace.manifest.format_version,
                    database_sha256,
                    created_at_epoch_seconds,
                },
            )?;

            fs::rename(&staging_path, &final_path)
                .map_err(|error| map_io_error("publicar backup", error))?;
            Ok(BackupSummary {
                path: path_to_string(&final_path)?,
                workspace_name: workspace.manifest.name.clone(),
                created_at_epoch_seconds,
            })
        })();

        if result.is_err() {
            let _ = fs::remove_dir_all(&staging_path);
        }

        result
    }

    fn inspect_backup(
        &self,
        backup_path: &Path,
    ) -> Result<BackupInspectionSummary, WorkspaceError> {
        inspect_backup(backup_path)?.summary()
    }

    fn restore_backup(
        &self,
        backup_path: &Path,
        destination_parent: &Path,
    ) -> Result<crate::domain::workspace::WorkspaceSummary, WorkspaceError> {
        let backup = inspect_backup(backup_path)?;
        let destination_parent =
            existing_directory(destination_parent, "o destino da restauração")?;

        if path_is_within(&destination_parent, &backup.path) {
            return Err(WorkspaceError::InvalidInput(
                "O espaço restaurado precisa ser criado fora da pasta do backup.".to_string(),
            ));
        }

        let restored_manifest = WorkspaceManifest::new(backup.workspace_manifest.name.clone());
        let restored_id = restored_manifest.workspace_id;
        let workspace_stem = safe_directory_stem(&restored_manifest.name);
        let target_path =
            destination_parent.join(format!("{workspace_stem}-restaurado-{restored_id}"));
        if target_path.exists() {
            return Err(WorkspaceError::Io(
                "A pasta escolhida para restauração já existe.".to_string(),
            ));
        }

        let database_path = self.active_database_file(restored_id);
        let database_directory = database_path.parent().ok_or_else(|| {
            WorkspaceError::Database(
                "Não foi possível determinar a pasta do banco restaurado.".to_string(),
            )
        })?;

        let result = (|| {
            fs::create_dir_all(&target_path)
                .map_err(|error| map_io_error("criar espaço restaurado", error))?;
            write_json_file(
                &target_path.join(WORKSPACE_MANIFEST_FILE),
                &restored_manifest,
            )?;

            copy_blob_directory(&backup.path.join("blobs"), &target_path.join("blobs"))?;
            copy_directory_contents(
                &backup.path.join("revisions"),
                &target_path.join("revisions"),
            )?;
            copy_directory_contents(&backup.path.join("exports"), &target_path.join("exports"))?;
            super::revision_store::rebind_restored_revisions(
                &target_path.join("revisions"),
                &backup.workspace_manifest,
                &restored_manifest,
            )?;

            fs::create_dir_all(database_directory)
                .map_err(|error| map_io_error("preparar banco restaurado", error))?;
            copy_verified_file(
                &backup.path.join(BACKUP_DATABASE_FILE),
                &database_path,
                Some(&backup.manifest.database_sha256),
            )?;
            rebind_database(
                &database_path,
                &backup.workspace_manifest,
                &restored_manifest,
            )?;
            validate_database_file(&database_path, &restored_manifest)?;

            let record = WorkspaceStore::open_workspace(self, &target_path)?;
            record.summary()
        })();

        if result.is_err() {
            let _ = fs::remove_dir_all(&target_path);
            let _ = fs::remove_dir_all(database_directory);
        }

        result
    }
}

fn inspect_backup(path: &Path) -> Result<ValidatedBackup, WorkspaceError> {
    let path = existing_directory(path, "a pasta do backup")?;
    let backup_manifest: BackupManifest = read_json_file(&path.join(BACKUP_MANIFEST_FILE))?;
    if backup_manifest.backup_format_version != BACKUP_FORMAT_VERSION {
        return Err(WorkspaceError::InvalidBackup(format!(
            "a versão {} não é compatível",
            backup_manifest.backup_format_version
        )));
    }

    let workspace_manifest: WorkspaceManifest =
        read_json_file(&path.join(WORKSPACE_MANIFEST_FILE))?;
    validate_manifest(&workspace_manifest).map_err(|error| {
        WorkspaceError::InvalidBackup(format!("manifesto do espaço inválido: {error}"))
    })?;
    if backup_manifest.workspace_id != workspace_manifest.workspace_id
        || backup_manifest.workspace_name != workspace_manifest.name
        || backup_manifest.workspace_format_version != workspace_manifest.format_version
    {
        return Err(WorkspaceError::InvalidBackup(
            "os manifestos do backup não correspondem".to_string(),
        ));
    }

    let database_path = path.join(BACKUP_DATABASE_FILE);
    validate_database_file(&database_path, &workspace_manifest)?;
    let actual_database_sha256 = sha256_file(&database_path)?;
    if actual_database_sha256 != backup_manifest.database_sha256 {
        return Err(WorkspaceError::InvalidBackup(
            "o hash do banco não corresponde ao manifesto".to_string(),
        ));
    }
    validate_blob_directory(&database_path, &path.join("blobs"))?;
    for directory_name in ["revisions", "exports"] {
        ensure_directory(&path.join(directory_name), "a pasta do backup")?;
    }
    let blob_count = count_portable_files(&path.join("blobs"), "os blobs do backup")?;
    let revision_file_count =
        count_portable_files(&path.join("revisions"), "as revisões do backup")?;
    let export_file_count =
        count_portable_files(&path.join("exports"), "as exportações do backup")?;

    Ok(ValidatedBackup {
        path,
        manifest: backup_manifest,
        workspace_manifest,
        blob_count,
        revision_file_count,
        export_file_count,
    })
}

fn create_backup_directories(path: &Path) -> Result<(), WorkspaceError> {
    fs::create_dir_all(path)
        .map_err(|error| map_io_error("criar pasta temporária do backup", error))?;
    Ok(())
}

pub(crate) fn validate_database_file(
    path: &Path,
    manifest: &WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    ensure_regular_file(path, "o banco do backup")?;
    let connection = Connection::open(path).map_err(|error| {
        WorkspaceError::Database(format!("abrir banco para validação: {error}"))
    })?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| map_database_error("ativar integridade do backup", error))?;

    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| map_database_error("validar integridade do backup", error))?;
    if integrity != "ok" {
        return Err(WorkspaceError::InvalidBackup(format!(
            "o banco falhou na verificação de integridade: {integrity}"
        )));
    }

    let mut foreign_key_check = connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| map_database_error("preparar verificação referencial", error))?;
    let mut rows = foreign_key_check
        .query([])
        .map_err(|error| map_database_error("verificar referências do backup", error))?;
    if rows
        .next()
        .map_err(|error| map_database_error("ler referências do backup", error))?
        .is_some()
    {
        return Err(WorkspaceError::InvalidBackup(
            "o banco contém referências quebradas".to_string(),
        ));
    }

    let metadata: Option<(String, String, i64)> = connection
        .query_row(
            "SELECT workspace_id, name, format_version
             FROM workspace_metadata
             LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| map_database_error("ler metadados do backup", error))?;
    let Some((workspace_id, name, format_version)) = metadata else {
        return Err(WorkspaceError::InvalidBackup(
            "o banco não contém metadados do espaço".to_string(),
        ));
    };
    if workspace_id != manifest.workspace_id.to_string()
        || name != manifest.name
        || format_version != i64::from(manifest.format_version)
    {
        return Err(WorkspaceError::InvalidBackup(
            "o banco não corresponde ao manifesto do espaço".to_string(),
        ));
    }

    Ok(())
}

fn rebind_database(
    path: &Path,
    source_manifest: &WorkspaceManifest,
    restored_manifest: &WorkspaceManifest,
) -> Result<(), WorkspaceError> {
    let mut connection = Connection::open(path)
        .map_err(|error| WorkspaceError::Database(format!("abrir banco restaurado: {error}")))?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| map_database_error("ativar integridade do banco restaurado", error))?;
    let transaction = connection
        .transaction()
        .map_err(|error| map_database_error("iniciar ajuste do banco restaurado", error))?;
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
        .map_err(|error| map_database_error("ajustar identidade do espaço restaurado", error))?;
    if changed != 1 {
        return Err(WorkspaceError::InvalidBackup(
            "não foi possível ajustar a identidade do espaço restaurado".to_string(),
        ));
    }
    transaction
        .commit()
        .map_err(|error| map_database_error("confirmar banco restaurado", error))
}

fn validate_blob_directory(database_path: &Path, blobs_path: &Path) -> Result<(), WorkspaceError> {
    ensure_directory(blobs_path, "a pasta de blobs")?;
    let mut available_hashes = HashSet::new();
    for entry in
        fs::read_dir(blobs_path).map_err(|error| map_io_error("ler blobs do backup", error))?
    {
        let entry = entry.map_err(|error| map_io_error("ler blob do backup", error))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| map_io_error("ler metadado de blob", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(WorkspaceError::InvalidBackup(
                "a pasta de blobs contém um item que não é arquivo regular".to_string(),
            ));
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        validate_hash_name(&file_name)?;
        if sha256_file(&path)? != file_name {
            return Err(WorkspaceError::InvalidBackup(format!(
                "o blob {file_name} não corresponde ao próprio SHA-256"
            )));
        }
        available_hashes.insert(file_name);
    }

    let connection = Connection::open(database_path).map_err(|error| {
        WorkspaceError::Database(format!("abrir banco para validar blobs: {error}"))
    })?;
    let mut statement = connection
        .prepare(
            "SELECT content_hash FROM materials WHERE source_url IS NULL
             UNION
             SELECT sha256 FROM question_attachments",
        )
        .map_err(|error| map_database_error("preparar referências de blobs", error))?;
    let references = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| map_database_error("consultar referências de blobs", error))?;
    for reference in references {
        let reference =
            reference.map_err(|error| map_database_error("ler referência de blob", error))?;
        if !available_hashes.contains(&reference) {
            return Err(WorkspaceError::InvalidBackup(format!(
                "o blob referenciado {reference} não foi encontrado"
            )));
        }
    }
    Ok(())
}

pub(crate) fn copy_blob_directory(source: &Path, target: &Path) -> Result<(), WorkspaceError> {
    ensure_directory(source, "a pasta de blobs")?;
    ensure_new_directory(target, "a pasta de blobs")?;
    for entry in
        fs::read_dir(source).map_err(|error| map_io_error("ler blobs para cópia", error))?
    {
        let entry = entry.map_err(|error| map_io_error("ler blob para cópia", error))?;
        let source_path = entry.path();
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| map_io_error("ler metadado de blob para cópia", error))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(WorkspaceError::InvalidBackup(
                "a pasta de blobs contém um item não suportado".to_string(),
            ));
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        validate_hash_name(&file_name)?;
        copy_verified_file(&source_path, &target.join(&file_name), Some(&file_name))?;
    }
    Ok(())
}

pub(crate) fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), WorkspaceError> {
    ensure_directory(source, "a pasta portátil")?;
    ensure_new_directory(target, "uma pasta portátil")?;
    for entry in fs::read_dir(source).map_err(|error| map_io_error("ler pasta portátil", error))? {
        let entry = entry.map_err(|error| map_io_error("ler item portátil", error))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| map_io_error("ler item portátil", error))?;
        if metadata.file_type().is_symlink() {
            return Err(WorkspaceError::InvalidBackup(
                "o backup contém um link simbólico não suportado".to_string(),
            ));
        }
        if metadata.is_dir() {
            copy_directory_contents(&source_path, &target_path)?;
        } else if metadata.is_file() {
            copy_verified_file(&source_path, &target_path, None)?;
        } else {
            return Err(WorkspaceError::InvalidBackup(
                "o backup contém um tipo de arquivo não suportado".to_string(),
            ));
        }
    }
    Ok(())
}

fn count_portable_files(path: &Path, description: &str) -> Result<i64, WorkspaceError> {
    let mut count = 0_u64;
    for entry in fs::read_dir(path).map_err(|error| map_io_error(description, error))? {
        let entry = entry.map_err(|error| map_io_error(description, error))?;
        let entry_path = entry.path();
        let metadata =
            fs::symlink_metadata(&entry_path).map_err(|error| map_io_error(description, error))?;
        if metadata.file_type().is_symlink() {
            return Err(WorkspaceError::InvalidBackup(format!(
                "{description} contém um link simbólico não suportado"
            )));
        }
        if metadata.is_dir() {
            let nested = count_portable_files(&entry_path, description)?;
            count = count
                .checked_add(u64::try_from(nested).map_err(|_| {
                    WorkspaceError::InvalidBackup(format!("{description} contém arquivos demais"))
                })?)
                .ok_or_else(|| {
                    WorkspaceError::InvalidBackup(format!("{description} contém arquivos demais"))
                })?;
        } else if metadata.is_file() {
            count = count.checked_add(1).ok_or_else(|| {
                WorkspaceError::InvalidBackup(format!("{description} contém arquivos demais"))
            })?;
        } else {
            return Err(WorkspaceError::InvalidBackup(format!(
                "{description} contém um tipo de arquivo não suportado"
            )));
        }
    }
    i64::try_from(count)
        .map_err(|_| WorkspaceError::InvalidBackup(format!("{description} contém arquivos demais")))
}

pub(crate) fn copy_verified_file(
    source: &Path,
    target: &Path,
    expected_sha256: Option<&str>,
) -> Result<u64, WorkspaceError> {
    ensure_regular_file(source, "o arquivo para cópia")?;
    let parent = target.parent().ok_or_else(|| {
        WorkspaceError::Io("não foi possível determinar a pasta do arquivo copiado".to_string())
    })?;
    fs::create_dir_all(parent).map_err(|error| map_io_error("preparar arquivo copiado", error))?;

    let mut input =
        File::open(source).map_err(|error| map_io_error("abrir arquivo para cópia", error))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| map_io_error("criar arquivo copiado", error))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut total_bytes = 0_u64;

    let result = (|| {
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|error| map_io_error("ler arquivo para cópia", error))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| map_io_error("gravar arquivo copiado", error))?;
            hasher.update(&buffer[..read]);
            total_bytes = total_bytes.saturating_add(read as u64);
        }
        output
            .sync_all()
            .map_err(|error| map_io_error("confirmar arquivo copiado", error))?;
        if let Some(expected_sha256) = expected_sha256 {
            let actual_sha256 = format!("{:x}", hasher.finalize());
            if actual_sha256 != expected_sha256 {
                return Err(WorkspaceError::InvalidBackup(
                    "um arquivo copiado não corresponde ao hash esperado".to_string(),
                ));
            }
        }
        Ok(total_bytes)
    })();
    if result.is_err() {
        let _ = fs::remove_file(target);
    }
    result
}

pub(crate) fn sha256_file(path: &Path) -> Result<String, WorkspaceError> {
    ensure_regular_file(path, "o arquivo para hash")?;
    let mut file =
        File::open(path).map_err(|error| map_io_error("abrir arquivo para hash", error))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| map_io_error("ler arquivo para hash", error))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub(crate) fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, WorkspaceError> {
    ensure_regular_file(path, "o arquivo JSON do backup")?;
    let contents = fs::read_to_string(path)
        .map_err(|error| map_io_error("ler arquivo JSON do backup", error))?;
    serde_json::from_str(&contents)
        .map_err(|error| WorkspaceError::InvalidBackup(format!("JSON inválido: {error}")))
}

pub(crate) fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), WorkspaceError> {
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| WorkspaceError::Serialization(format!("serializar backup: {error}")))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| map_io_error("criar arquivo do backup", error))?;
    file.write_all(&serialized)
        .map_err(|error| map_io_error("gravar arquivo do backup", error))?;
    file.sync_all()
        .map_err(|error| map_io_error("confirmar arquivo do backup", error))
}

pub(crate) fn existing_directory(
    path: &Path,
    description: &str,
) -> Result<PathBuf, WorkspaceError> {
    if !path.is_absolute() {
        return Err(WorkspaceError::InvalidInput(format!(
            "{description} precisa usar um caminho absoluto."
        )));
    }
    ensure_directory(path, description)?;
    fs::canonicalize(path).map_err(|error| map_io_error("normalizar diretório", error))
}

pub(crate) fn ensure_directory(path: &Path, description: &str) -> Result<(), WorkspaceError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| map_io_error(description, error))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(WorkspaceError::InvalidBackup(format!(
            "{description} não é uma pasta regular"
        )));
    }
    Ok(())
}

fn ensure_new_directory(path: &Path, description: &str) -> Result<(), WorkspaceError> {
    if path.exists() {
        return Err(WorkspaceError::Io(format!(
            "{description} já existe no destino"
        )));
    }
    fs::create_dir(path).map_err(|error| map_io_error("criar diretório de cópia", error))
}

pub(crate) fn ensure_regular_file(path: &Path, description: &str) -> Result<(), WorkspaceError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| map_io_error(description, error))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(WorkspaceError::InvalidBackup(format!(
            "{description} não é um arquivo regular"
        )));
    }
    Ok(())
}

pub(crate) fn validate_hash_name(value: &str) -> Result<(), WorkspaceError> {
    if value.len() != 64 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(WorkspaceError::InvalidBackup(
            "a pasta de blobs contém um nome que não é SHA-256".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn path_is_within(candidate: &Path, ancestor: &Path) -> bool {
    candidate == ancestor || candidate.starts_with(ancestor)
}

pub(crate) fn safe_directory_stem(name: &str) -> String {
    let stem: String = name
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .take(64)
        .collect();
    let trimmed = stem.trim_matches('-');
    if trimmed.is_empty() {
        "workspace".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn current_epoch_seconds() -> Result<i64, WorkspaceError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| WorkspaceError::Io(format!("relógio do sistema inválido: {error}")))?;
    i64::try_from(duration.as_secs()).map_err(|_| {
        WorkspaceError::Io("o horário do backup não cabe no formato local".to_string())
    })
}

pub(crate) fn path_to_string(path: &Path) -> Result<String, WorkspaceError> {
    path.to_str().map(str::to_string).ok_or_else(|| {
        WorkspaceError::Io(
            "o caminho do backup não pode ser representado pelo aplicativo".to_string(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::backup_service::BackupStore;
    use crate::application::workspace_service::WorkspaceStore;

    #[test]
    fn creates_and_restores_a_verified_backup_in_a_new_workspace() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-backup-workspace-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-backup-data-{}", Uuid::new_v4()));
        let backup_parent =
            std::env::temp_dir().join(format!("cursoucon-backup-output-{}", Uuid::new_v4()));
        let restore_parent =
            std::env::temp_dir().join(format!("cursoucon-restore-output-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());

        let original = store
            .create_workspace(&workspace_path, "Backup de teste")
            .expect("o espaço de fixture deve ser criado");
        fs::create_dir_all(&backup_parent).expect("o destino de backup deve existir");
        fs::create_dir_all(&restore_parent).expect("o destino de restauração deve existir");
        fs::write(
            workspace_path.join("revisions").join("revision.json"),
            b"revision",
        )
        .expect("a revisão de fixture deve ser gravada");

        let backup = store
            .create_backup(&backup_parent)
            .expect("o backup deve ser criado");
        let backup_path = PathBuf::from(&backup.path);
        assert!(backup_path.join(BACKUP_MANIFEST_FILE).is_file());
        assert!(backup_path.join(BACKUP_DATABASE_FILE).is_file());
        assert!(backup_path.join("revisions/revision.json").is_file());

        let inspection = store
            .inspect_backup(&backup_path)
            .expect("a prévia deve validar o backup");
        assert_eq!(inspection.workspace_name, "Backup de teste");
        assert_eq!(
            inspection.workspace_id,
            original.manifest.workspace_id.to_string()
        );
        assert_eq!(inspection.blob_count, 0);
        assert_eq!(inspection.revision_file_count, 1);
        assert_eq!(inspection.export_file_count, 0);
        assert_eq!(inspection.database_sha256.len(), 64);

        let manifest_path = backup_path.join(BACKUP_MANIFEST_FILE);
        let original_manifest =
            fs::read_to_string(&manifest_path).expect("o manifesto deve ser legível");
        let corrupted_manifest = original_manifest.replace(
            &inspection.database_sha256,
            &"0".repeat(inspection.database_sha256.len()),
        );
        fs::write(&manifest_path, corrupted_manifest)
            .expect("o manifesto corrompido deve ser salvo");
        assert!(store.inspect_backup(&backup_path).is_err());
        fs::write(&manifest_path, original_manifest).expect("o manifesto deve ser restaurado");

        let restored = store
            .restore_backup(&backup_path, &restore_parent)
            .expect("o backup deve ser restaurado");
        assert_ne!(restored.workspace_id, original.manifest.workspace_id);
        assert!(Path::new(&restored.path)
            .join(WORKSPACE_MANIFEST_FILE)
            .is_file());
        assert!(Path::new(&restored.path)
            .join("revisions/revision.json")
            .is_file());

        let active = store
            .active_workspace()
            .expect("o espaço restaurado deve ser consultável")
            .expect("deve existir espaço ativo");
        assert_eq!(active.manifest.workspace_id, restored.workspace_id);

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(backup_parent);
        let _ = fs::remove_dir_all(restore_parent);
    }
}
