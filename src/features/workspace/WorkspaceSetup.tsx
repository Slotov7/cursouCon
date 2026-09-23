import { useState } from "react";
import {
  createWorkspace,
  getDesktopErrorMessage,
  getWorkspaceRevisions,
  openWorkspace,
  pickWorkspaceDirectory,
  restoreWorkspaceRevision,
} from "../../shared/desktop/commands";
import type { RevisionSummary, WorkspaceSummary } from "../../shared/desktop/contracts";
import {
  BrandLockup,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
  ThemeToggle,
} from "../../shared/ui/primitives";
import type { Theme } from "../../shared/ui/theme";

type WorkspaceSetupProps = {
  initialError: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onWorkspaceReady: (workspace: WorkspaceSummary) => void;
};

type PendingAction = "idle" | "picking" | "creating" | "opening" | "restoringRevision";

export function WorkspaceSetup({ initialError, theme, onToggleTheme, onWorkspaceReady }: WorkspaceSetupProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [revisionRecoveryVisible, setRevisionRecoveryVisible] = useState(false);
  const [availableRevisions, setAvailableRevisions] = useState<RevisionSummary[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);

  const chooseDirectory = async () => {
    setError(null);
    setRevisionRecoveryVisible(false);
    setAvailableRevisions([]);
    setPendingAction("picking");

    try {
      const selectedPath = await pickWorkspaceDirectory();
      if (selectedPath) {
        setWorkspacePath(selectedPath);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleCreate = async () => {
    const trimmedName = workspaceName.trim();

    if (!trimmedName || !workspacePath) {
      setError("Informe um nome e escolha a pasta do espaço.");
      return;
    }

    setError(null);
    setPendingAction("creating");

    try {
      const createdWorkspace = await createWorkspace({
        name: trimmedName,
        workspacePath,
      });
      onWorkspaceReady(createdWorkspace);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
      setPendingAction("idle");
    }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    if (!workspacePath) {
      return;
    }
    setError(null);
    setPendingAction("restoringRevision");
    try {
      const restoredWorkspace = await restoreWorkspaceRevision({
        workspacePath,
        revisionId,
      });
      onWorkspaceReady(restoredWorkspace);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleOpen = async () => {
    setError(null);
    setPendingAction("opening");

    try {
      const openedWorkspace = await openWorkspace(workspacePath);
      onWorkspaceReady(openedWorkspace);
    } catch (operationError: unknown) {
      const openError = getDesktopErrorMessage(operationError);
      setError(openError);
      setRevisionRecoveryVisible(true);
      setAvailableRevisions([]);
      setIsLoadingRevisions(true);
      try {
        setAvailableRevisions(await getWorkspaceRevisions(workspacePath));
      } catch (revisionError: unknown) {
        setError(`${openError} ${getDesktopErrorMessage(revisionError)}`);
      } finally {
        setIsLoadingRevisions(false);
      }
      setPendingAction("idle");
    }
  };

  const isBusy = pendingAction !== "idle";

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 bg-paper p-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,.75fr)] lg:gap-6 lg:p-6">
      <section
        className="relative flex min-h-[480px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-forest via-forest to-forest-deep p-7 text-contrast shadow-xl lg:min-h-[calc(100vh-48px)] lg:p-10"
        aria-labelledby="setup-title"
      >
        <div className="flex items-center justify-between gap-4">
          <BrandLockup light />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} light />
        </div>

        <div className="my-auto max-w-[620px] py-8">
          <Eyebrow light>Estudos locais · Sem ruído · Sem dependência de nuvem</Eyebrow>
          <h1 id="setup-title" className="mt-4 font-heading text-[clamp(2.5rem,5.5vw,5.2rem)] font-extrabold leading-[.98] tracking-tight">
            Seu próximo passo começa com um espaço.
          </h1>
          <p className="mt-6 max-w-[560px] text-base leading-relaxed text-contrast/80 lg:text-lg">
            Um lugar para transformar edital em plano, plano em sessão e sessão em
            continuidade. Seus dados pertencem a você e ficam salvos na sua máquina.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider text-contrast/75">
          <span className="rounded-full border border-contrast/20 bg-contrast/10 px-3.5 py-1.5 backdrop-blur-xs">100% Offline</span>
          <span className="rounded-full border border-contrast/20 bg-contrast/10 px-3.5 py-1.5 backdrop-blur-xs">Dados Locais</span>
          <span className="rounded-full border border-contrast/20 bg-contrast/10 px-3.5 py-1.5 backdrop-blur-xs">Sem Login</span>
        </div>
      </section>

      <section className="flex flex-col justify-between rounded-3xl border border-line bg-card p-7 shadow-lg lg:p-10" aria-labelledby="setup-card-title">
        <div>
          <Eyebrow>Configuração Inicial</Eyebrow>
          <h2 id="setup-card-title" className="mt-3 font-heading text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold leading-tight text-forest-ink">
            Criar ou abrir espaço
          </h2>
          <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-muted">
            A pasta escolhida guarda a identidade e as revisões portáteis. O banco de
            trabalho permanece seguro no armazenamento local do aplicativo.
          </p>
        </div>

        <div className="my-8 grid gap-5">
          <label className={fieldClass} htmlFor="workspace-name">
            Nome do espaço de estudos
            <input
              id="workspace-name"
              className={inputClass}
              type="text"
              value={workspaceName}
              maxLength={80}
              placeholder="Ex.: Concurso Senado TI 2026"
              onChange={(event) => setWorkspaceName(event.target.value)}
              disabled={isBusy}
            />
          </label>

          <div className={fieldClass}>
            <span>Pasta do espaço no seu computador</span>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className={inputClass}
                type="text"
                value={workspacePath}
                placeholder="Selecione uma pasta no computador"
                aria-label="Pasta do espaço escolhida"
                readOnly
              />
              <button className={`${buttonSecondaryClass} shrink-0`} type="button" onClick={chooseDirectory} disabled={isBusy}>
                {pendingAction === "picking" ? "Abrindo..." : "Escolher Pasta"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {revisionRecoveryVisible ? (
            <section className="grid gap-3 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4" aria-labelledby="setup-revision-title">
              <div>
                <h3 id="setup-revision-title" className="font-heading font-bold text-ink">Escolher revisão preservada</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  A pasta contém revisões que não podem ser escolhidas automaticamente. Selecione uma para recuperar o espaço sem apagar as outras.
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
                      className="grid gap-1 rounded-xl border border-line bg-paper/80 px-3 py-2 text-left transition-colors hover:border-orange-500/60 hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
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

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button className={`${buttonPrimaryClass} shadow-md`} type="button" onClick={handleCreate} disabled={isBusy}>
              {pendingAction === "creating" ? "Criando..." : "Criar Novo Espaço"}
            </button>
            <button className={buttonQuietClass} type="button" onClick={handleOpen} disabled={isBusy || !workspacePath}>
              {pendingAction === "opening" ? "Abrindo..." : "Abrir Espaço Existente"}
            </button>
          </div>
        </div>

        <p className="border-t border-line pt-5 text-xs leading-relaxed text-muted">
          O aplicativo não requer conta, não ativa sincronização automática nem envia seus dados. Você poderá importar e exportar revisões a qualquer momento.
        </p>
      </section>
    </main>
  );
}

function formatRevisionTimestamp(epochSeconds: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(epochSeconds * 1000));
}
