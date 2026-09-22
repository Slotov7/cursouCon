import { useEffect, useState } from "react";
import {
  createWorkspace,
  getActiveWorkspace,
  getDesktopErrorMessage,
  getStudyPlan,
  openWorkspace,
  pickWorkspaceDirectory,
} from "../shared/desktop/commands";
import type { StudyPlan, WorkspaceSummary } from "../shared/desktop/contracts";
import { PlanView } from "../features/plan/PlanView";

type ViewId = "today" | "plan" | "materials" | "practice" | "progress" | "explore";
type PendingAction = "idle" | "picking" | "creating" | "opening";

const navigation: Array<{ id: ViewId; label: string; note: string }> = [
  { id: "today", label: "Hoje", note: "próxima ação" },
  { id: "plan", label: "Plano", note: "preparação" },
  { id: "materials", label: "Materiais", note: "biblioteca" },
  { id: "practice", label: "Praticar", note: "questões" },
  { id: "progress", label: "Evolução", note: "sinais" },
  { id: "explore", label: "Explorar", note: "concursos" },
];

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("today");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getActiveWorkspace()
      .then((activeWorkspace) => {
        if (!cancelled) {
          setWorkspace(activeWorkspace);
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setError(getDesktopErrorMessage(operationError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!workspace) {
    return (
      <WorkspaceSetup
        initialError={error}
        onWorkspaceReady={(readyWorkspace) => {
          setError(null);
          setWorkspace(readyWorkspace);
        }}
      />
    );
  }

  return (
    <AppShell
      activeView={activeView}
      workspace={workspace}
      onNavigate={setActiveView}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite">
      <div className="brand-mark brand-mark--large" aria-hidden="true">
        cc
      </div>
      <p>Preparando seu espaço local...</p>
    </main>
  );
}

type WorkspaceSetupProps = {
  initialError: string | null;
  onWorkspaceReady: (workspace: WorkspaceSummary) => void;
};

function WorkspaceSetup({ initialError, onWorkspaceReady }: WorkspaceSetupProps) {
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
    <main className="setup-screen">
      <section className="setup-intro" aria-labelledby="setup-title">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            cc
          </div>
          <span>CursouCon</span>
        </div>
        <div className="setup-intro__copy">
          <p className="eyebrow">ESTUDOS LOCAIS, SEM RUÍDO</p>
          <h1 id="setup-title">Seu próximo passo começa com um espaço.</h1>
          <p>
            Um lugar para transformar edital em plano, plano em sessão e sessão em
            continuidade. Seus dados ficam no computador.
          </p>
        </div>
        <div className="setup-principles" aria-label="Princípios do aplicativo">
          <span>offline primeiro</span>
          <span>dados seus</span>
          <span>progresso visível</span>
        </div>
      </section>

      <section className="setup-card" aria-labelledby="setup-card-title">
        <div>
          <p className="eyebrow">PRIMEIRO USO</p>
          <h2 id="setup-card-title">Criar ou abrir espaço</h2>
          <p className="muted-text">
            A pasta escolhida guarda a identidade e as revisões portáteis. O banco de
            trabalho permanece em armazenamento local do aplicativo.
          </p>
        </div>

        <div className="form-stack">
          <label className="field-label" htmlFor="workspace-name">
            Nome do espaço
            <input
              id="workspace-name"
              type="text"
              value={workspaceName}
              maxLength={80}
              placeholder="Ex.: Preparação TI"
              onChange={(event) => setWorkspaceName(event.target.value)}
              disabled={isBusy}
            />
          </label>

          <div className="field-label">
            <span>Pasta do espaço</span>
            <div className="path-picker">
              <input
                type="text"
                value={workspacePath}
                placeholder="Escolha uma pasta no computador"
                aria-label="Pasta do espaço escolhida"
                readOnly
              />
              <button
                className="button button--secondary"
                type="button"
                onClick={chooseDirectory}
                disabled={isBusy}
              >
                {pendingAction === "picking" ? "Abrindo..." : "Escolher"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="feedback feedback--error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="setup-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={handleCreate}
              disabled={isBusy}
            >
              {pendingAction === "creating" ? "Criando..." : "Criar espaço"}
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={handleOpen}
              disabled={isBusy || !workspacePath}
            >
              {pendingAction === "opening" ? "Abrindo..." : "Abrir existente"}
            </button>
          </div>
        </div>

        <p className="setup-note">
          O aplicativo não ativa sincronização nem envia materiais. Você poderá preparar
          uma revisão portátil depois, de forma explícita.
        </p>
      </section>
    </main>
  );
}

type AppShellProps = {
  activeView: ViewId;
  workspace: WorkspaceSummary;
  onNavigate: (view: ViewId) => void;
};

function AppShell({ activeView, workspace, onNavigate }: AppShellProps) {
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [isStudyPlanLoading, setIsStudyPlanLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsStudyPlanLoading(true);

    getStudyPlan()
      .then((loadedPlan) => {
        if (!cancelled) {
          setStudyPlan(loadedPlan);
          setStudyPlanError(null);
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setStudyPlanError(getDesktopErrorMessage(operationError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsStudyPlanLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshVersion, workspace.workspaceId]);

  const refreshStudyPlan = () => {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="brand-lockup brand-lockup--sidebar">
            <div className="brand-mark" aria-hidden="true">
              cc
            </div>
            <span>CursouCon</span>
          </div>
          <p className="sidebar__caption">central de preparação pessoal</p>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {navigation.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? "nav-item--active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
            >
              <span>{item.label}</span>
              <small>{item.note}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <div className="workspace-card">
            <span className="workspace-card__label">ESPAÇO ATIVO</span>
            <strong>{workspace.name}</strong>
            <span className="workspace-card__status">
              <span className="status-dot" aria-hidden="true" />
              salvo localmente
            </span>
          </div>
          <button className="settings-link" type="button" disabled>
            Configurações <span aria-hidden="true">↗</span>
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="content-header">
          <div>
            <p className="date-line">{formatToday()}</p>
            <h1>{navigation.find((item) => item.id === activeView)?.label}</h1>
          </div>
          <div className="format-badge">
            formato {workspace.formatVersion.toString().padStart(2, "0")}
          </div>
        </header>

        {activeView === "today" ? (
          <TodayView
            isLoading={isStudyPlanLoading}
            plan={studyPlan}
            error={studyPlanError}
            onOpenPlan={() => onNavigate("plan")}
          />
        ) : activeView === "plan" ? (
          <PlanView
            plan={studyPlan}
            isLoading={isStudyPlanLoading}
            error={studyPlanError}
            onRetry={refreshStudyPlan}
            onPlanChanged={refreshStudyPlan}
          />
        ) : (
          <PlaceholderView view={activeView} onBackToToday={() => onNavigate("today")} />
        )}
      </main>
    </div>
  );
}

type TodayViewProps = {
  plan: StudyPlan | null;
  isLoading: boolean;
  error: string | null;
  onOpenPlan: () => void;
};

function TodayView({ plan, isLoading, error, onOpenPlan }: TodayViewProps) {
  const primaryPreparation = plan?.preparations.find((preparation) => preparation.isPrimary);
  const subjectCount = primaryPreparation
    ? plan?.subjects.filter((subject) => subject.preparationId === primaryPreparation.id).length ?? 0
    : 0;

  let heroTitle = "Nenhuma preparação ativa ainda.";
  let heroDescription =
    "Quando você cadastrar um edital e organizar os assuntos, esta tela vai mostrar uma tarefa concreta para começar sem decidir tudo de novo.";
  let heroAction = "Montar meu plano";

  if (isLoading) {
    heroTitle = "Lendo seu plano local...";
    heroDescription = "O CursouCon está conferindo as preparações salvas antes de sugerir a próxima ação.";
    heroAction = "Abrir plano";
  } else if (error) {
    heroTitle = "Não foi possível ler o plano.";
    heroDescription = error;
    heroAction = "Tentar no Plano";
  } else if (primaryPreparation) {
    heroTitle = primaryPreparation.name;
    heroDescription = subjectCount
      ? `${subjectCount} assunto${subjectCount === 1 ? " organizado" : "s organizados"}. O próximo passo é transformar essa estrutura em uma sessão viável.`
      : "A preparação está criada. Adicione disciplinas e assuntos para dar forma ao seu ciclo.";
    heroAction = "Organizar assuntos";
  }

  return (
    <div className="today-layout">
      <section className="today-hero" aria-labelledby="today-hero-title">
        <div className="today-hero__content">
          <p className="eyebrow eyebrow--light">PRÓXIMA AÇÃO</p>
          <h2 id="today-hero-title">{heroTitle}</h2>
          <p>{heroDescription}</p>
          <button className="button button--light" type="button" onClick={onOpenPlan}>
            {heroAction} <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="hero-index" aria-hidden="true">
          <span>01</span>
          <span>começar</span>
        </div>
      </section>

      <section className="today-secondary" aria-labelledby="today-secondary-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">COMO O HOJE SE ORGANIZA</p>
            <h2 id="today-secondary-title">Poucos sinais. Ação clara.</h2>
          </div>
          <span className="section-heading__mark" aria-hidden="true">
            /
          </span>
        </div>
        <div className="principle-list">
          <article>
            <span>01</span>
            <div>
              <h3>Plano do dia</h3>
              <p>Tarefas ordenadas pelo seu ciclo e pela disponibilidade informada.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Revisões</h3>
              <p>Assuntos que pedem retorno aparecem sem esconder o motivo.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Continuidade</h3>
              <p>Uma sessão encerrada deixa a próxima ação pronta para você.</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function PlaceholderView({ view, onBackToToday }: { view: ViewId; onBackToToday: () => void }) {
  const currentSection = navigation.find((item) => item.id === view);

  return (
    <section className="placeholder-view" aria-labelledby="placeholder-title">
      <p className="eyebrow">{currentSection?.note.toUpperCase()}</p>
      <h2 id="placeholder-title">{currentSection?.label} entra na próxima fatia.</h2>
      <p>
        A navegação já está definida, mas esta área ainda não cria dados fictícios. O
        próximo passo é ligar sua persistência ao fluxo completo de estudo.
      </p>
      <button className="button button--secondary" type="button" onClick={onBackToToday}>
        Voltar para Hoje
      </button>
    </section>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}
