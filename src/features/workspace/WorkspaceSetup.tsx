import { useState } from "react";
import {
  createWorkspace,
  getDesktopErrorMessage,
  openWorkspace,
  pickWorkspaceDirectory,
} from "../../shared/desktop/commands";
import type { WorkspaceSummary } from "../../shared/desktop/contracts";
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

type PendingAction = "idle" | "picking" | "creating" | "opening";

export function WorkspaceSetup({ initialError, theme, onToggleTheme, onWorkspaceReady }: WorkspaceSetupProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [error, setError] = useState<string | null>(initialError);

  const chooseDirectory = async () => {
    setError(null);
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

  const handleOpen = async () => {
    setError(null);
    setPendingAction("opening");

    try {
      const openedWorkspace = await openWorkspace(workspacePath);
      onWorkspaceReady(openedWorkspace);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
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
