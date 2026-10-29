import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import {
  getAppPreferences,
  getActiveWorkspace,
  getDailyPlan,
  getDesktopErrorMessage,
  getStudyPlan,
  heartbeatStudySession,
  saveAppPreferences,
} from "../shared/desktop/commands";
import type { AppPreferences, DailyPlan, StudyPlan, WorkspaceSummary } from "../shared/desktop/contracts";
import { useThemePreference } from "../shared/ui/theme";
import { dateKeyForTimezone } from "../shared/date";
import { PlanView } from "../features/plan/PlanView";
import { MaterialsView } from "../features/materials/MaterialsView";
import { ProgressView } from "../features/progress/ProgressView";
import { TodayView } from "../features/today/TodayView";
import { PracticeView } from "../features/practice/PracticeView";
import { SimulationsView } from "../features/simulations/SimulationsView";
import { DiscursiveView } from "../features/discursive/DiscursiveView";
import { ExploreView } from "../features/explore/ExploreView";
import { WorkspaceSetup } from "../features/workspace/WorkspaceSetup";
import { WorkspaceDataActions } from "../features/workspace/WorkspaceDataActions";
import { SettingsView } from "../features/settings/SettingsView";
import { FlashcardsView } from "../features/flashcards/FlashcardsView";
import { CommandPalette } from "../shared/ui/CommandPalette";

import {
  BrandLockup,
  BrandMark,
  IconExplore,
  IconFlashcards,
  IconMaterials,
  IconPlan,
  IconPractice,
  IconProgress,
  IconSettings,
  IconSimulation,
  IconToday,
  IconWriting,
  ThemeToggle,
} from "../shared/ui/primitives";

type ViewId = "today" | "plan" | "materials" | "practice" | "flashcards" | "discursive" | "simulations" | "progress" | "explore" | "settings";
type PlanEntryAction = "preparation" | "subject" | "task";

const navigation: Array<{
  id: ViewId;
  label: string;
  note: string;
  badge?: string;
  icon: (props: { className?: string }) => ReactElement;
}> = [
  { id: "today", label: "Hoje", note: "sua próxima ação", icon: IconToday },
  { id: "plan", label: "Plano de estudo", note: "organize o que estudar", icon: IconPlan },
  { id: "progress", label: "Progresso", note: "acompanhe seus estudos", icon: IconProgress },
  { id: "materials", label: "Materiais", note: "apostilas & pdfs", icon: IconMaterials },
  { id: "practice", label: "Questões", note: "pratique questões", badge: "Novo", icon: IconPractice },
  { id: "flashcards", label: "Cartões de revisão", note: "revise o que estudou", icon: IconFlashcards },
  { id: "discursive", label: "Questões discursivas", note: "pratique respostas abertas", icon: IconWriting },
  { id: "simulations", label: "Simulados", note: "treine com uma prova", icon: IconSimulation },
  { id: "explore", label: "Explorar", note: "concursos e prazos", icon: IconExplore },
  { id: "settings", label: "Configurações", note: "preferências locais", icon: IconSettings },
];

const primaryNavigationIds = new Set<ViewId>(["today", "plan", "progress", "materials", "practice"]);
const primaryNavigation = navigation.filter((item) => primaryNavigationIds.has(item.id));
const moreNavigation = navigation.filter((item) => !primaryNavigationIds.has(item.id));

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: "dark",
  reducedMotion: false,
  highContrast: false,
  timezone: "system",
  gamificationVisible: true,
};

export function App() {
  const { theme, setTheme } = useThemePreference();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("today");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const themeSaveInFlight = useRef(false);

  useEffect(() => {
    void getAppPreferences()
      .then((loadedPreferences) => {
        setAppPreferences(loadedPreferences);
        setTheme(loadedPreferences.theme);
      })
      .catch((operationError: unknown) => {
        setPreferencesError(getDesktopErrorMessage(operationError));
      });
  }, [setTheme]);

  const handleToggleTheme = () => {
    if (themeSaveInFlight.current) return;
    themeSaveInFlight.current = true;
    setPreferencesError(null);
    void saveAppPreferences({
      ...appPreferences,
      theme: theme === "dark" ? "light" : "dark",
    })
      .then((saved) => {
        setAppPreferences(saved);
        setTheme(saved.theme);
      })
      .catch((operationError: unknown) => {
        setPreferencesError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        themeSaveInFlight.current = false;
      });
  };

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", appPreferences.reducedMotion);
    document.documentElement.classList.toggle("high-contrast", appPreferences.highContrast);
  }, [appPreferences.reducedMotion, appPreferences.highContrast]);

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
        theme={theme}
        onToggleTheme={handleToggleTheme}
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
      theme={theme}
      appPreferences={appPreferences}
      preferencesError={preferencesError}
      onToggleTheme={handleToggleTheme}
      onPreferencesSaved={(preferences) => {
        setAppPreferences(preferences);
        setTheme(preferences.theme);
        setPreferencesError(null);
      }}
      onNavigate={setActiveView}
      onWorkspaceRestored={(restoredWorkspace) => {
        setWorkspace(restoredWorkspace);
        setActiveView("today");
      }}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-center" aria-live="polite">
      <div className="grid justify-items-center gap-5">
        <BrandMark large />
        <p className="text-sm font-medium text-muted">Carregando espaço de estudos...</p>
      </div>
    </main>
  );
}

type AppShellProps = {
  activeView: ViewId;
  workspace: WorkspaceSummary;
  theme: "light" | "dark";
  appPreferences: AppPreferences;
  preferencesError: string | null;
  onToggleTheme: () => void;
  onPreferencesSaved: (preferences: AppPreferences) => void;
  onNavigate: (view: ViewId) => void;
  onWorkspaceRestored: (workspace: WorkspaceSummary) => void;
};

function AppShell({
  activeView,
  workspace,
  theme,
  appPreferences,
  preferencesError,
  onToggleTheme,
  onPreferencesSaved,
  onNavigate,
  onWorkspaceRestored,
}: AppShellProps) {
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [studyDataError, setStudyDataError] = useState<string | null>(null);
  const [isStudyDataLoading, setIsStudyDataLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMoreNavigationOpen, setIsMoreNavigationOpen] = useState(false);
  const [planEntryAction, setPlanEntryAction] = useState<PlanEntryAction | null>(null);

  const openPlan = (step?: PlanEntryAction) => {
    setPlanEntryAction(step ?? null);
    onNavigate("plan");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsStudyDataLoading(true);

    Promise.all([getStudyPlan(), getDailyPlan(dateKeyForTimezone(appPreferences.timezone))])
      .then(([loadedPlan, loadedDailyPlan]) => {
        if (!cancelled) {
          setStudyPlan(loadedPlan);
          setDailyPlan(loadedDailyPlan);
          setStudyDataError(null);
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setStudyDataError(getDesktopErrorMessage(operationError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsStudyDataLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshVersion, workspace.workspaceId, appPreferences.timezone]);

  useEffect(() => {
    const activeSession = dailyPlan?.activeSession;
    if (!activeSession || activeSession.status !== "active") return;

    let heartbeatInFlight = false;
    let interruptionDetected = false;
    const sendHeartbeat = async () => {
      if (heartbeatInFlight || interruptionDetected || document.visibilityState !== "visible") return;
      heartbeatInFlight = true;
      try {
        const updatedSession = await heartbeatStudySession({ sessionId: activeSession.id });
        if (updatedSession.status === "interrupted") {
          interruptionDetected = true;
          setRefreshVersion((currentVersion) => currentVersion + 1);
        }
      } catch (operationError: unknown) {
        setStudyDataError(getDesktopErrorMessage(operationError));
      } finally {
        heartbeatInFlight = false;
      }
    };

    const intervalId = window.setInterval(() => void sendHeartbeat(), 5_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [dailyPlan?.activeSession?.id, dailyPlan?.activeSession?.status]);

  const refreshStudyData = () => {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  };

  const currentSection = navigation.find((item) => item.id === activeView);
  const isSessionActive = dailyPlan?.activeSession?.status === "active";
  const isInMoreNavigation = moreNavigation.some((item) => item.id === activeView);
  const showMoreNavigation = isMoreNavigationOpen || isInMoreNavigation;

  return (
    <div className="flex min-h-screen w-full min-w-0 bg-paper text-ink font-sans selection:bg-blue-600 selection:text-white">
      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onNavigate={onNavigate}
        onToggleTheme={onToggleTheme}
      />

      {/* Sidebar Navigation - Fixed Desktop Shell */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col justify-between border-r border-line bg-card/95 backdrop-blur-md p-4 transition-all duration-200 hidden lg:flex">
        <div className="grid gap-5">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-2 pt-1">
            <BrandLockup />
          </div>

          {/* Active Workspace Info Card */}
          <div className="flex items-center gap-3 rounded-xl border border-line bg-paper/60 p-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Espaço Ativo</p>
              <p className="truncate text-xs font-bold text-ink">{workspace.name}</p>
            </div>
          </div>

          {/* Sidebar Menu Group */}
          <nav className="grid gap-1" aria-label="Menu Principal">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
              Navegação
            </p>
            {primaryNavigation.map((item) => {
              const isActive = activeView === item.id;
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-150 ease-out active:scale-[0.98] cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-xs font-bold"
                      : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <IconComponent
                      className={`size-4.5 shrink-0 transition-transform duration-150 ease-out group-hover:scale-110 ${
                        isActive ? "text-white" : "text-muted group-hover:text-ink"
                      }`}
                    />
                    <span className="whitespace-nowrap truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="shrink-0 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-extrabold text-orange-600 dark:text-orange-400">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              aria-expanded={showMoreNavigation}
              onClick={() => setIsMoreNavigationOpen((open) => !open)}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:bg-paper hover:text-ink"
            >
              <span>Mais ferramentas</span>
              <span aria-hidden="true">{showMoreNavigation ? "−" : "+"}</span>
            </button>
            {showMoreNavigation && moreNavigation.map((item) => {
              const isActive = activeView === item.id;
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 pl-5 text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? "bg-blue-600 text-white" : "text-muted hover:bg-paper hover:text-ink"}`}
                >
                  <IconComponent className={`size-4.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer & Action */}
        <div className="grid gap-3 pt-3 border-t border-line">
          {/* Quick Study Action CTA */}
          {activeView !== "today" && (
            <button
              type="button"
              onClick={() => onNavigate("today")}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 p-2.5 text-xs font-bold text-white shadow-xs transition-all duration-150 ease-out active:scale-[0.97] cursor-pointer"
            >
              <span>⚡ Estudar Agora</span>
            </button>
          )}

          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <span className="font-mono text-[11px]">Dados locais</span>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-15 items-center justify-between border-b border-line bg-card/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            {/* Mobile Navigation Toggle / Brand */}
            <div className="lg:hidden flex items-center gap-3">
              <BrandLockup />
            </div>

            <div className="hidden sm:block">
              <h1 className="font-heading text-base font-bold text-ink leading-tight">{currentSection?.label}</h1>
              {activeView !== "today" && <p className="text-[11px] text-muted leading-tight">{currentSection?.note}</p>}
            </div>
          </div>

          {/* Quick Header Badges & Actions */}
          <div className="flex items-center gap-3">
            {isSessionActive && (
              <button
                type="button"
                onClick={() => onNavigate("today")}
                className="flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 active:scale-[0.97] transition-all cursor-pointer"
                title="Voltar para a sessão de estudos em andamento"
              >
                <span className="size-2 rounded-full bg-orange-500 animate-pulse"></span>
                <span>Sessão em Andamento →</span>
              </button>
            )}

            <WorkspaceDataActions
              workspace={workspace}
              onWorkspaceRestored={onWorkspaceRestored}
            />

            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-xl border border-line bg-paper/80 px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:border-blue-500/40 hover:bg-card active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer shadow-xs"
            >
              <span>Busca rápida:</span>
              <kbd className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-ink font-semibold">Ctrl + K</kbd>
            </button>

            <div className="lg:hidden">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </header>

        {/* Mobile Navigation Bar */}
        <nav className="grid gap-1 border-b border-line bg-card p-2 lg:hidden" aria-label="Navegação móvel">
          <div className="flex items-center justify-around">
          {primaryNavigation.map((item) => {
            const isActive = activeView === item.id;
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-1 p-2 text-[11px] font-semibold transition-all ${
                  isActive ? "text-blue-600 font-bold" : "text-muted"
                }`}
              >
                <IconComponent className="size-5" />
                <span>{item.label.split(" ")[0]}</span>
              </button>
            );
          })}
            <button type="button" aria-expanded={showMoreNavigation} onClick={() => setIsMoreNavigationOpen((open) => !open)} className="flex min-w-14 flex-col items-center gap-1 p-2 text-[11px] font-semibold text-muted">
              <span className="text-lg leading-5" aria-hidden="true">{showMoreNavigation ? "−" : "···"}</span>
              <span>Mais</span>
            </button>
          </div>
          {showMoreNavigation && (
            <div className="grid grid-cols-3 gap-1 border-t border-line pt-2">
              {moreNavigation.map((item) => {
                const isActive = activeView === item.id;
                const IconComponent = item.icon;
                return (
                  <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={isActive ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${isActive ? "bg-blue-600 text-white" : "text-muted hover:bg-paper hover:text-ink"}`}>
                    <IconComponent className={`size-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Main View Content Container */}
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {preferencesError && (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
              Não foi possível carregar ou salvar as preferências: {preferencesError}
            </p>
          )}
          {activeView === "today" ? (
            <TodayView
              isLoading={isStudyDataLoading}
              plan={studyPlan}
              dailyPlan={dailyPlan}
              error={studyDataError}
              onOpenPlan={openPlan}
              onDataChanged={refreshStudyData}
              timezone={appPreferences.timezone}
            />
          ) : activeView === "plan" ? (
            <PlanView
              plan={studyPlan}
              isLoading={isStudyDataLoading}
              error={studyDataError}
              onRetry={refreshStudyData}
              onPlanChanged={refreshStudyData}
              onOpenToday={() => onNavigate("today")}
              timezone={appPreferences.timezone}
              entryAction={planEntryAction}
              onEntryActionHandled={() => setPlanEntryAction(null)}
              taskPreparationIdsToday={dailyPlan?.tasks.map((task) => task.preparationId) ?? []}
            />
          ) : activeView === "materials" ? (
            <MaterialsView plan={studyPlan} refreshKey={refreshVersion} />
          ) : activeView === "practice" ? (
            <PracticeView plan={studyPlan} refreshKey={refreshVersion} />
          ) : activeView === "flashcards" ? (
            <FlashcardsView key={workspace.workspaceId} plan={studyPlan} timezone={appPreferences.timezone} />
          ) : activeView === "discursive" ? (
            <DiscursiveView plan={studyPlan} refreshKey={refreshVersion} />
          ) : activeView === "simulations" ? (
            <SimulationsView plan={studyPlan} refreshKey={refreshVersion} timezone={appPreferences.timezone} onOpenQuestions={() => onNavigate("practice")} onDataChanged={refreshStudyData} />
          ) : activeView === "progress" ? (
            <ProgressView
              refreshKey={refreshVersion}
              showGamification={appPreferences.gamificationVisible}
              timezone={appPreferences.timezone}
              onOpenToday={() => onNavigate("today")}
              onDataChanged={refreshStudyData}
            />
          ) : activeView === "explore" ? (
            <ExploreView refreshKey={refreshVersion} timezone={appPreferences.timezone} />
          ) : activeView === "settings" ? (
            <SettingsView preferences={appPreferences} onSaved={onPreferencesSaved} />
          ) : (
            <TodayView
              isLoading={isStudyDataLoading}
              plan={studyPlan}
              dailyPlan={dailyPlan}
              error={studyDataError}
              onOpenPlan={openPlan}
              onDataChanged={refreshStudyData}
              timezone={appPreferences.timezone}
            />
          )}
        </main>
      </div>
    </div>
  );
}
