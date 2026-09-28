import { useEffect, useState } from "react";
import {
  createWorkspaceBackup,
  createWorkspaceRevision,
  configureSyncDestination,
  exportWorkspaceData,
  getDesktopErrorMessage,
  getRecentWorkspaces,
  getSyncDestinationSettings,
  getWorkspaceRevisions,
  inspectWorkspaceBackup,
  openWorkspace,
  pickDirectory,
  publishConfiguredWorkspaceRevision,
  restoreWorkspaceBackup,
  restoreWorkspaceRevision,
} from "../../shared/desktop/commands";
import type {
  BackupInspectionSummary,
  RevisionSummary,
  WorkspaceSummary,
} from "../../shared/desktop/contracts";
import {
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
} from "../../shared/ui/primitives";

type WorkspaceDataActionsProps = {
  workspace: WorkspaceSummary;
  onWorkspaceRestored: (workspace: WorkspaceSummary) => void;
};

type PendingAction =
  | "idle"
  | "pickingBackupDestination"
  | "creatingBackup"
  | "pickingBackup"
  | "inspectingBackup"
  | "pickingRestoreDestination"
  | "restoringBackup"
  | "creatingRevision"
  | "exportingData"
  | "pickingRevisionDestination"
  | "savingSyncDestination"
  | "publishingRevision"
  | "openingRecentWorkspace"
  | "restoringRevision";

export function WorkspaceDataActions({ workspace, onWorkspaceRestored }: WorkspaceDataActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [backupDestinationPath, setBackupDestinationPath] = useState("");
  const [revisionDestinationPath, setRevisionDestinationPath] = useState("");
  const [syncDestinationEnabled, setSyncDestinationEnabled] = useState(false);
  const [backupPath, setBackupPath] = useState("");
  const [backupPreview, setBackupPreview] = useState<BackupInspectionSummary | null>(null);
  const [restoreDestinationPath, setRestoreDestinationPath] = useState("");
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingSyncDestination, setIsLoadingSyncDestination] = useState(false);
  const [revisionWorkspacePath, setRevisionWorkspacePath] = useState<string | null>(null);
  const [availableRevisions, setAvailableRevisions] = useState<RevisionSummary[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pendingAction === "idle") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, pendingAction]);

  const chooseBackupDestination = async () => {
    setError(null);
    setPendingAction("pickingBackupDestination");
    try {
      const selectedPath = await pickDirectory("Escolha onde salvar o backup");
      if (selectedPath) {
        setBackupDestinationPath(selectedPath);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleCreateBackup = async () => {
    if (!backupDestinationPath) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("creatingBackup");
    try {
      const backup = await createWorkspaceBackup({
        destinationParentPath: backupDestinationPath,
      });
      setMessage(`Backup criado em ${backup.path}`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleCreateRevision = async () => {
    setError(null);
    setMessage(null);
    setPendingAction("creatingRevision");
    try {
      const revision = await createWorkspaceRevision();
      setMessage(`Revisão preparada em ${revision.path} (${revision.blobCount} blobs verificados).`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleExportData = async () => {
    setError(null);
    setMessage(null);
    setPendingAction("exportingData");
    try {
      const exported = await exportWorkspaceData();
      setMessage(
        `Exportação criada em ${exported.path}: ${exported.exportedRecords} registros, ${exported.exportedNotes} notas e ${exported.exportedAttachments} anexos.`,
      );
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const chooseRevisionDestination = async () => {
    setError(null);
    setPendingAction("pickingRevisionDestination");
    try {
      const selectedPath = await pickDirectory("Escolha a pasta externa para publicar a revisão");
      if (selectedPath) {
        setRevisionDestinationPath(selectedPath);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handlePublishRevision = async () => {
    if (!syncDestinationEnabled || !revisionDestinationPath) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("publishingRevision");
    try {
      const revision = await publishConfiguredWorkspaceRevision();
      setMessage(`Revisão publicada em ${revision.path}`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleSaveSyncDestination = async () => {
    if (syncDestinationEnabled && !revisionDestinationPath) {
      setError("Escolha uma pasta externa antes de ativar a publicação.");
      return;
    }

    setError(null);
    setMessage(null);
    setPendingAction("savingSyncDestination");
    try {
      const settings = await configureSyncDestination({
        enabled: syncDestinationEnabled,
        destinationParentPath: revisionDestinationPath || null,
      });
      setSyncDestinationEnabled(settings.enabled);
      setRevisionDestinationPath(settings.destinationPath ?? "");
      setMessage(settings.enabled ? "O destino externo foi ativado." : "Publicações futuras foram desativadas.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const chooseBackup = async () => {
    setError(null);
    setPendingAction("pickingBackup");
    try {
      const selectedPath = await pickDirectory("Escolha a pasta do backup");
      if (selectedPath) {
        setBackupPath(selectedPath);
        setBackupPreview(null);
        setMessage(null);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleInspectBackup = async () => {
    if (!backupPath) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("inspectingBackup");
    try {
      const preview = await inspectWorkspaceBackup({ backupPath });
      setBackupPreview(preview);
      setMessage("Backup validado. Confira a prévia antes de restaurar.");
    } catch (operationError: unknown) {
      setBackupPreview(null);
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const chooseRestoreDestination = async () => {
    setError(null);
    setPendingAction("pickingRestoreDestination");
    try {
      const selectedPath = await pickDirectory("Escolha onde criar o espaço restaurado");
      if (selectedPath) {
        setRestoreDestinationPath(selectedPath);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupPath || !restoreDestinationPath || !backupPreview) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("restoringBackup");
    try {
      const restoredWorkspace = await restoreWorkspaceBackup({
        backupPath,
        destinationParentPath: restoreDestinationPath,
      });
      onWorkspaceRestored(restoredWorkspace);
      setIsOpen(false);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const isBusy = pendingAction !== "idle";

  const openWorkspaceActions = async () => {
    setError(null);
    setMessage(null);
    setRevisionWorkspacePath(null);
    setAvailableRevisions([]);
    setIsOpen(true);
    setIsLoadingRecent(true);
    setIsLoadingSyncDestination(true);
    try {
      setRecentWorkspaces(await getRecentWorkspaces());
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsLoadingRecent(false);
    }
    try {
      const settings = await getSyncDestinationSettings();
      setSyncDestinationEnabled(settings.enabled);
      setRevisionDestinationPath(settings.destinationPath ?? "");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsLoadingSyncDestination(false);
    }
  };

  const handleOpenRecentWorkspace = async (recentWorkspace: WorkspaceSummary) => {
    if (recentWorkspace.workspaceId === workspace.workspaceId) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("openingRecentWorkspace");
    try {
      const openedWorkspace = await openWorkspace(recentWorkspace.path);
      onWorkspaceRestored(openedWorkspace);
      setIsOpen(false);
    } catch (operationError: unknown) {
      const openError = getDesktopErrorMessage(operationError);
      setError(openError);
      setRevisionWorkspacePath(recentWorkspace.path);
      setAvailableRevisions([]);
      setIsLoadingRevisions(true);
      try {
        setAvailableRevisions(await getWorkspaceRevisions(recentWorkspace.path));
      } catch (revisionError: unknown) {
        setError(`${openError} ${getDesktopErrorMessage(revisionError)}`);
      } finally {
        setIsLoadingRevisions(false);
      }
    } finally {
      setPendingAction("idle");
    }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    if (!revisionWorkspacePath) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingAction("restoringRevision");
    try {
      const restoredWorkspace = await restoreWorkspaceRevision({
        workspacePath: revisionWorkspacePath,
        revisionId,
      });
      onWorkspaceRestored(restoredWorkspace);
      setIsOpen(false);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  return (
    <>
      <button
        type="button"
        className={buttonSecondaryClass}
        onClick={openWorkspaceActions}
      >
        Dados & backup
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => {
            if (!isBusy) {
              setIsOpen(false);
            }
          }}
        >
          <section
            className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-data-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <Eyebrow>Proteção local</Eyebrow>
                <h2 id="workspace-data-title" className="mt-1 font-heading text-xl font-bold text-ink">
                  Backup e restauração
                </h2>
                <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
                  O backup inclui banco, materiais e revisões. A restauração cria outro espaço e não substitui o original.
                </p>
              </div>
              <button
                type="button"
                className={buttonQuietClass}
                onClick={() => setIsOpen(false)}
                disabled={isBusy}
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-5">
              <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="recent-workspaces-title">
                <div>
                  <h3 id="recent-workspaces-title" className="font-heading font-bold text-ink">Espaços recentes</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    A troca é bloqueada enquanto houver uma sessão ativa para evitar misturar dados entre espaços.
                  </p>
                </div>
                {isLoadingRecent ? (
                  <p className="text-xs text-muted" role="status">Carregando espaços recentes...</p>
                ) : recentWorkspaces.length > 0 ? (
                  <div className="grid gap-2">
                    {recentWorkspaces.map((recentWorkspace) => (
                      <button
                        key={recentWorkspace.workspaceId}
                        type="button"
                        className="grid gap-1 rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors hover:border-blue-500/50 hover:bg-paper disabled:cursor-default disabled:opacity-60"
                        onClick={() => handleOpenRecentWorkspace(recentWorkspace)}
                        disabled={isBusy || recentWorkspace.workspaceId === workspace.workspaceId}
                      >
                        <span className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
                          <span className="truncate">{recentWorkspace.name}</span>
                          {recentWorkspace.workspaceId === workspace.workspaceId ? (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Ativo</span>
                          ) : null}
                        </span>
                        <span className="break-all text-[11px] font-normal text-muted">{recentWorkspace.path}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Nenhum outro espaço recente válido foi encontrado.</p>
                )}
              </section>

              {revisionWorkspacePath ? (
                <section className="grid gap-3 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4" aria-labelledby="choose-revision-title">
                  <div>
                    <h3 id="choose-revision-title" className="font-heading font-bold text-ink">Escolher revisão preservada</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      A abertura automática foi interrompida. Escolha explicitamente uma revisão; as demais permanecerão intactas.
                    </p>
                  </div>
                  {isLoadingRevisions ? (
                    <p className="text-xs text-muted" role="status">Validando revisões...</p>
                  ) : availableRevisions.length > 0 ? (
                    <div className="grid gap-2">
                      {availableRevisions.map((revision) => (
                        <button
                          key={revision.revisionId}
                          type="button"
                          className="grid gap-1 rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors hover:border-orange-500/60 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleRestoreRevision(revision.revisionId)}
                          disabled={isBusy}
                        >
                          <span className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
                            <span className="truncate">Revisão {revision.revisionId.slice(0, 8)}</span>
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">{revision.blobCount} blobs</span>
                          </span>
                          <span className="text-[11px] font-normal text-muted">{formatRevisionTimestamp(revision.createdAtEpochSeconds)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">Nenhuma revisão válida está disponível para recuperação.</p>
                  )}
                </section>
              ) : null}

              <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="create-revision-title">
                <div>
                  <h3 id="create-revision-title" className="font-heading font-bold text-ink">Preparar revisão portátil</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Cria um snapshot verificável em <code>revisions/</code>, pronto para ser levado junto com a pasta do espaço.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonSecondaryClass} justify-self-start`}
                  onClick={handleCreateRevision}
                  disabled={isBusy}
                >
                  {pendingAction === "creatingRevision" ? "Preparando snapshot..." : "Preparar revisão"}
                </button>
              </section>

              <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="export-data-title">
                <div>
                  <h3 id="export-data-title" className="font-heading font-bold text-ink">Exportar dados legíveis</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Cria um pacote com <code>data.json</code>, notas Markdown e anexos verificados em <code>exports/</code>. O banco ativo e caminhos da máquina ficam fora dele.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonSecondaryClass} justify-self-start`}
                  onClick={handleExportData}
                  disabled={isBusy}
                >
                  {pendingAction === "exportingData" ? "Exportando..." : "Exportar dados"}
                </button>
              </section>

              <section className="grid gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4" aria-labelledby="sync-destination-title">
                <div>
                  <h3 id="sync-destination-title" className="font-heading font-bold text-ink">Destino externo</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    O destino fica salvo apenas neste computador e neste espaço. Um cliente externo fará o transporte; o app não envia dados sozinho.
                  </p>
                </div>
                {isLoadingSyncDestination ? (
                  <p className="text-xs text-muted" role="status">Carregando configuração...</p>
                ) : (
                  <>
                    <label className={fieldClass}>
                      Pasta externa
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input className={inputClass} value={revisionDestinationPath} readOnly placeholder="Nenhuma pasta escolhida" />
                        <button type="button" className={buttonSecondaryClass} onClick={chooseRevisionDestination} disabled={isBusy}>
                          {pendingAction === "pickingRevisionDestination" ? "Abrindo..." : "Escolher pasta"}
                        </button>
                      </div>
                    </label>
                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="enable-sync-destination"
                        checked={syncDestinationEnabled}
                        onChange={(event) => setSyncDestinationEnabled(event.target.checked)}
                        className="accent-blue-600 size-4"
                        disabled={isBusy}
                      />
                      <label htmlFor="enable-sync-destination" className="cursor-pointer text-xs font-semibold leading-relaxed text-ink">
                        Permitir publicações futuras neste destino
                      </label>
                    </div>
                    <button
                      type="button"
                      className={`${buttonSecondaryClass} justify-self-start`}
                      onClick={handleSaveSyncDestination}
                      disabled={isBusy || (syncDestinationEnabled && !revisionDestinationPath)}
                    >
                      {pendingAction === "savingSyncDestination" ? "Salvando..." : "Salvar configuração"}
                    </button>
                  </>
                )}
              </section>

              <section className="grid gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4" aria-labelledby="publish-revision-title">
                <div>
                  <h3 id="publish-revision-title" className="font-heading font-bold text-ink">Publicar para troca</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Cria uma cópia portátil no destino configurado. A publicação só fica disponível quando o destino estiver ativado.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonPrimaryClass} justify-self-start`}
                  onClick={handlePublishRevision}
                  disabled={isBusy || !syncDestinationEnabled || !revisionDestinationPath || isLoadingSyncDestination}
                >
                  {pendingAction === "publishingRevision" ? "Copiando espaço portátil..." : "Publicar revisão"}
                </button>
              </section>

              <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="create-backup-title">
                <div>
                  <h3 id="create-backup-title" className="font-heading font-bold text-ink">Criar backup</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Escolha uma pasta fora do espaço atual. Uma nova subpasta será publicada somente após a validação.
                  </p>
                </div>
                <label className={fieldClass}>
                  Pasta de destino
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input className={inputClass} value={backupDestinationPath} readOnly placeholder="Nenhuma pasta escolhida" />
                    <button type="button" className={buttonSecondaryClass} onClick={chooseBackupDestination} disabled={isBusy}>
                      {pendingAction === "pickingBackupDestination" ? "Abrindo..." : "Escolher pasta"}
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  className={`${buttonPrimaryClass} justify-self-start`}
                  onClick={handleCreateBackup}
                  disabled={isBusy || !backupDestinationPath}
                >
                  {pendingAction === "creatingBackup" ? "Validando e copiando..." : "Criar backup"}
                </button>
              </section>

              <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="restore-backup-title">
                <div>
                  <h3 id="restore-backup-title" className="font-heading font-bold text-ink">Restaurar backup</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Selecione uma pasta de backup válida e uma pasta-pai vazia ou separada para o novo espaço.
                  </p>
                </div>
                <label className={fieldClass}>
                  Pasta do backup
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input className={inputClass} value={backupPath} readOnly placeholder="Nenhum backup escolhido" />
                    <button type="button" className={buttonSecondaryClass} onClick={chooseBackup} disabled={isBusy}>
                      {pendingAction === "pickingBackup" ? "Abrindo..." : "Escolher pasta"}
                    </button>
                  </div>
                </label>
                <label className={fieldClass}>
                  Pasta-pai do novo espaço
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input className={inputClass} value={restoreDestinationPath} readOnly placeholder="Nenhuma pasta escolhida" />
                    <button type="button" className={buttonSecondaryClass} onClick={chooseRestoreDestination} disabled={isBusy}>
                      {pendingAction === "pickingRestoreDestination" ? "Abrindo..." : "Escolher pasta"}
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  className={`${buttonSecondaryClass} justify-self-start`}
                  onClick={handleInspectBackup}
                  disabled={isBusy || !backupPath}
                >
                  {pendingAction === "inspectingBackup" ? "Validando backup..." : "Validar e mostrar prévia"}
                </button>
                {backupPreview ? (
                  <section className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" aria-labelledby="backup-preview-title">
                    <div>
                      <h4 id="backup-preview-title" className="font-heading font-bold text-ink">Prévia validada</h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        Nenhum dado foi alterado. O espaço atual continuará intacto; a restauração criará outro espaço.
                      </p>
                    </div>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">Espaço de origem</dt>
                        <dd className="font-semibold text-ink">{backupPreview.workspaceName}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Criado em</dt>
                        <dd className="font-semibold text-ink">{formatRevisionTimestamp(backupPreview.createdAtEpochSeconds)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Formato</dt>
                        <dd className="font-semibold text-ink">Backup {backupPreview.backupFormatVersion} · espaço {backupPreview.workspaceFormatVersion}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Conteúdo portátil</dt>
                        <dd className="font-semibold text-ink">{backupPreview.blobCount} blobs · {backupPreview.revisionFileCount} revisões · {backupPreview.exportFileCount} exportações</dd>
                      </div>
                    </dl>
                    <dl>
                      <dt className="text-[11px] text-muted">SHA-256 do banco</dt>
                      <dd className="mt-1 break-all font-mono text-[11px] text-ink">{backupPreview.databaseSha256}</dd>
                    </dl>
                  </section>
                ) : null}
                <button
                  type="button"
                  className={`${buttonPrimaryClass} justify-self-start`}
                  onClick={handleRestoreBackup}
                  disabled={isBusy || !backupPath || !restoreDestinationPath || !backupPreview}
                >
                  {pendingAction === "restoringBackup" ? "Validando e restaurando..." : "Restaurar em novo espaço"}
                </button>
              </section>

              {error ? (
                <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-700 dark:text-emerald-300" role="status">
                  {message}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatRevisionTimestamp(epochSeconds: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(epochSeconds * 1000));
}
