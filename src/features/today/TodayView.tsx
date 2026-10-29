import { lazy, Suspense, useEffect, useState } from "react";
import {
  createPreparation,
  acceptStudyCycleAction,
  finishStudySession,
  getDesktopErrorMessage,
  getMaterials,
  openMaterial,
  pauseStudySession,
  rescheduleStudyTask,
  resumeStudySession,
  saveStudySessionReflection,
  skipStudyTask,
  startStudySession,
} from "../../shared/desktop/commands";
import type {
  DailyPlan,
  MaterialSummary,
  StudySessionDifficulty,
  StudyPlan,
  StudySessionSummary,
  StudyCycleSuggestion,
  StudyTaskSummary,
  StudyTaskStatus,
} from "../../shared/desktop/contracts";
import {
  notifyPomodoroPhaseCompleted,
  preparePomodoroNotifications,
} from "./pomodoroNotification";
import { ReviewQueue } from "./ReviewQueue";
import { NotesPanel } from "../materials/NotesPanel";
import { displayTimezone } from "../../shared/date";
import {
  buttonLightClass,
  buttonOutlineLightClass,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
  selectClass,
  textareaClass,
} from "../../shared/ui/primitives";

type TodayViewProps = {
  timezone: string;
  plan: StudyPlan | null;
  dailyPlan: DailyPlan | null;
  isLoading: boolean;
  error: string | null;
  onOpenPlan: (step?: "preparation" | "subject" | "task") => void;
  onDataChanged: () => void;
};

type PomodoroPhase = "focus" | "short_break" | "long_break";

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
};

const POMODORO_STORAGE_KEY = "cursoucon.pomodoro.settings";
const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

const PdfReader = lazy(() => import("../materials/PdfReader").then(({ PdfReader: Reader }) => ({ default: Reader })));

export function TodayView({
  timezone,
  plan,
  dailyPlan,
  isLoading,
  error,
  onOpenPlan,
  onDataChanged,
}: TodayViewProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [isAcceptingCycleAction, setIsAcceptingCycleAction] = useState(false);
  const [reviewOn, setReviewOn] = useState("");
  const [sessionSummaryMarkdown, setSessionSummaryMarkdown] = useState("");
  const [sessionDifficulty, setSessionDifficulty] = useState<StudySessionDifficulty | null>(null);
  const [sessionNextSteps, setSessionNextSteps] = useState("");
  const [recoveryMinutes, setRecoveryMinutes] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pomodoroSettings, setPomodoroSettings] = useState(readPomodoroSettings);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("focus");
  const [pomodoroSecondsLeft, setPomodoroSecondsLeft] = useState(
    () => pomodoroSettings.focusMinutes * 60,
  );
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroLinkedToSession, setPomodoroLinkedToSession] = useState(false);
  const [pomodoroCompletedFocusCount, setPomodoroCompletedFocusCount] = useState(0);
  const [isPomodoroTransitioning, setIsPomodoroTransitioning] = useState(false);
  const [pomodoroMessage, setPomodoroMessage] = useState<string | null>(null);
  const [contextTaskId, setContextTaskId] = useState<string | null>(null);
  const [contextMaterials, setContextMaterials] = useState<MaterialSummary[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const primaryPreparation = plan?.preparations.find((prep) => prep.isPrimary);
  const openTaskPlanner = () => {
    onOpenPlan("task");
  };
  const activeSession = dailyPlan?.activeSession ?? null;
  const cycleSuggestion = dailyPlan?.cycleSuggestion ?? null;

  useEffect(() => {
    setPomodoroLinkedToSession(false);
  }, [activeSession?.id]);

  useEffect(() => {
    setReviewOn("");
    setSessionSummaryMarkdown(activeSession?.summaryMarkdown ?? "");
    setSessionDifficulty(activeSession?.difficulty ?? null);
    setSessionNextSteps(activeSession?.nextSteps ?? "");
    setRecoveryMinutes(
      activeSession?.status === "interrupted"
        ? Math.ceil((activeSession.effectiveSeconds ?? 0) / 60).toString()
        : "",
    );
  }, [activeSession?.id, activeSession?.status, activeSession?.effectiveSeconds]);

  const tasksToRender = dailyPlan?.tasks ?? [];
  const activeTask =
    (activeSession ? dailyPlan?.activeTask : null) ??
    tasksToRender.find((task) => task.status === "pending" || task.status === "partial") ??
    null;
  const contextTask = tasksToRender.find((task) => task.id === contextTaskId) ??
    (dailyPlan?.activeTask?.id === contextTaskId ? dailyPlan.activeTask : null);
  const contextMaterial = contextMaterials.find((material) => material.id === contextTask?.materialId);

  useEffect(() => {
    if (!contextTaskId) return;
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    void getMaterials()
      .then((materials) => {
        if (!cancelled) setContextMaterials(materials);
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setContextError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => { cancelled = true; };
  }, [contextTaskId]);

  useEffect(() => {
    if (contextTaskId) document.getElementById("task-study-context")?.focus();
  }, [contextTaskId]);

  const handleOpenContext = (task: StudyTaskSummary) => {
    setContextTaskId(task.id);
  };

  const handleOpenExternalMaterial = async (materialId: string) => {
    setContextError(null);
    try {
      await openMaterial({ materialId });
    } catch (operationError: unknown) {
      setContextError(getDesktopErrorMessage(operationError));
    }
  };
  const completedTaskCount = tasksToRender.filter((task) => task.status === "completed").length;
  const plannedMinutes = tasksToRender.reduce((total, task) => total + task.plannedMinutes, 0);
  const taskProgressPercent =
    tasksToRender.length > 0 ? Math.round((completedTaskCount / tasksToRender.length) * 100) : 0;

  useEffect(() => {
    if (!activeSession || activeSession.status !== "active") return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSession?.id, activeSession?.status]);

  useEffect(() => {
    try {
      window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(pomodoroSettings));
    } catch {
      // A restricted WebView can disable localStorage without blocking the timer.
    }
  }, [pomodoroSettings]);

  useEffect(() => {
    if (!pomodoroRunning) return;
    const intervalId = window.setInterval(() => {
      setPomodoroSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroLinkedToSession || isPomodoroTransitioning) return;
    if (!activeSession) {
      setPomodoroLinkedToSession(false);
      return;
    }
    const expectedStatus = pomodoroPhase === "focus" ? "active" : "paused";
    if (activeSession.status !== expectedStatus) setPomodoroRunning(false);
  }, [
    activeSession?.id,
    activeSession?.status,
    isPomodoroTransitioning,
    pomodoroLinkedToSession,
    pomodoroPhase,
  ]);

  useEffect(() => {
    if (
      !pomodoroRunning ||
      pomodoroSecondsLeft > 0 ||
      isPomodoroTransitioning
    ) {
      return;
    }

    setIsPomodoroTransitioning(true);
    const transitionPhase = async () => {
      if (pomodoroPhase === "focus") {
        if (pomodoroLinkedToSession && activeSession?.status !== "active") {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setPomodoroMessage("Retome a sessão para continuar o foco sincronizado.");
          setIsPomodoroTransitioning(false);
          return;
        }
        if (pomodoroLinkedToSession && activeSession?.status === "active") {
          try {
            await pauseStudySession({
              sessionId: activeSession.id,
              effectiveSeconds: getElapsedSeconds(activeSession, Date.now()),
            });
            onDataChanged();
          } catch (operationError: unknown) {
            setPomodoroRunning(false);
            setPomodoroSecondsLeft(1);
            setActionError(getDesktopErrorMessage(operationError));
            setIsPomodoroTransitioning(false);
            return;
          }
        }
        const completedFocusCount = pomodoroCompletedFocusCount + 1;
        const nextPhase: PomodoroPhase =
          completedFocusCount % 4 === 0 ? "long_break" : "short_break";
        setPomodoroCompletedFocusCount(completedFocusCount);
        setPomodoroPhase(nextPhase);
        setPomodoroSecondsLeft(getPomodoroPhaseSeconds(nextPhase, pomodoroSettings));
        setPomodoroMessage(
          nextPhase === "long_break"
            ? "Foco concluído. Começou o intervalo longo."
            : "Foco concluído. Começou o intervalo curto.",
        );
        notifyPomodoroPhaseCompleted(
          "Foco concluído",
          nextPhase === "long_break"
            ? "Hora do intervalo longo."
            : "Hora do intervalo curto.",
        );
      } else {
        if (pomodoroLinkedToSession && activeSession?.status !== "paused") {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setPomodoroMessage("Pause a sessão para continuar o intervalo sincronizado.");
          setIsPomodoroTransitioning(false);
          return;
        }
        if (pomodoroLinkedToSession && activeSession?.status === "paused") {
          try {
            await resumeStudySession({ sessionId: activeSession.id });
            onDataChanged();
          } catch (operationError: unknown) {
            setPomodoroRunning(false);
            setPomodoroSecondsLeft(1);
            setActionError(getDesktopErrorMessage(operationError));
            setIsPomodoroTransitioning(false);
            return;
          }
        }
        setPomodoroPhase("focus");
        setPomodoroSecondsLeft(pomodoroSettings.focusMinutes * 60);
        setPomodoroMessage("Intervalo concluído. Começou um novo foco.");
        notifyPomodoroPhaseCompleted(
          "Intervalo concluído",
          "O próximo bloco de foco começou.",
        );
      }

      setIsPomodoroTransitioning(false);
    };

    void transitionPhase();
  }, [
    activeSession,
    isPomodoroTransitioning,
    onDataChanged,
    pomodoroCompletedFocusCount,
    pomodoroLinkedToSession,
    pomodoroPhase,
    pomodoroRunning,
    pomodoroSecondsLeft,
    pomodoroSettings,
  ]);

  if (isLoading && !dailyPlan) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-line bg-card p-8 text-center">
        <div className="grid justify-items-center gap-3" aria-live="polite">
          <div className="size-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-muted">Carregando o plano de hoje...</p>
        </div>
      </div>
    );
  }

  const handleStart = async (task: StudyTaskSummary) => {
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(task.id);
    try {
      await startStudySession({ taskId: task.id });
      setActionMessage(`Sessão iniciada: ${task.title}. O cronômetro está contando em Hoje.`);
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleAcceptCycleAction = async () => {
    if (!cycleSuggestion || !dailyPlan) return;
    setActionError(null);
    setActionMessage(null);
    setIsAcceptingCycleAction(true);
    try {
      const result = await acceptStudyCycleAction({
        preparationId: cycleSuggestion.preparationId,
        cyclePosition: cycleSuggestion.cyclePosition,
        cycleStep: cycleSuggestion.cycleStep,
        scheduledFor: dailyPlan.date,
      });
      setActionMessage(`Estudo adicionado a Hoje: ${result.task.title}.`);
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsAcceptingCycleAction(false);
    }
  };

  const handlePause = async () => {
    if (!activeSession || activeSession.status !== "active") return;
    if (pomodoroLinkedToSession) setPomodoroRunning(false);
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      await pauseStudySession({
        sessionId: activeSession.id,
        effectiveSeconds: getElapsedSeconds(activeSession, now),
      });
      setActionMessage("Sessão pausada. O tempo não acumulou.");
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
      onDataChanged();
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleResume = async () => {
    if (
      !activeSession ||
      (activeSession.status !== "paused" && activeSession.status !== "interrupted")
    ) return;
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      await resumeStudySession({ sessionId: activeSession.id });
      setActionMessage(
        activeSession.status === "interrupted"
          ? "Sessão retomada. O trecho desde o último checkpoint foi descartado para revisão manual."
          : "Sessão retomada.",
      );
      if (pomodoroLinkedToSession && pomodoroPhase === "focus") {
        setPomodoroRunning(true);
      }
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleSaveSessionReflection = async () => {
    if (!activeSession) return;
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      const saved = await saveStudySessionReflection({
        sessionId: activeSession.id,
        summaryMarkdown: sessionSummaryMarkdown.trim() ? sessionSummaryMarkdown : null,
        difficulty: sessionDifficulty,
        nextSteps: sessionNextSteps.trim() ? sessionNextSteps : null,
      });
      setSessionSummaryMarkdown(saved.summaryMarkdown ?? "");
      setSessionDifficulty(saved.difficulty);
      setSessionNextSteps(saved.nextSteps ?? "");
      setActionMessage("Resumo da sessão salvo.");
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleFinish = async (taskStatus: "completed" | "partial") => {
    if (!activeSession) return;
    let effectiveSeconds = getElapsedSeconds(activeSession, now);
    if (activeSession.status === "interrupted") {
      const minutes = Number(recoveryMinutes);
      const minimumMinutes = Math.ceil(activeSession.effectiveSeconds / 60);
      if (!Number.isInteger(minutes) || minutes < minimumMinutes || minutes > 10_080) {
        setActionError(`Informe um tempo confirmado entre ${minimumMinutes} e 10.080 minutos.`);
        return;
      }
      effectiveSeconds = minutes * 60;
    }
    if (pomodoroLinkedToSession) setPomodoroRunning(false);
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      const result = await finishStudySession({
        sessionId: activeSession.id,
        effectiveSeconds,
        taskStatus,
        reviewOn: taskStatus === "completed" && reviewOn ? reviewOn : null,
        summaryMarkdown: sessionSummaryMarkdown.trim() ? sessionSummaryMarkdown : null,
        difficulty: sessionDifficulty,
        nextSteps: sessionNextSteps.trim() ? sessionNextSteps : null,
      });
      const finishMessage =
        result.xpGranted > 0
          ? `Sessão encerrada com sucesso! +${result.xpGranted} XP adicionados.`
          : "Sessão encerrada.";
      setActionMessage(
        result.review
          ? `${finishMessage} Revisão de ${result.review.subjectName} agendada para ${formatReviewDate(result.review.dueDate)}.`
          : finishMessage,
      );
      setReviewOn("");
      if (pomodoroLinkedToSession) {
        setPomodoroRunning(false);
        setPomodoroPhase("focus");
        setPomodoroSecondsLeft(pomodoroSettings.focusMinutes * 60);
        setPomodoroCompletedFocusCount(0);
      }
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
      onDataChanged();
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleSkip = async (task: StudyTaskSummary) => {
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(task.id);
    try {
      await skipStudyTask({ taskId: task.id });
      setActionMessage("Estudo pulado.");
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleReschedule = async (task: StudyTaskSummary, scheduledFor: string): Promise<boolean> => {
    if (!scheduledFor) return false;
    setActionError(null);
    setPendingTaskId(task.id);
    try {
      await rescheduleStudyTask({ taskId: task.id, scheduledFor });
      setActionMessage("Estudo reagendado.");
      onDataChanged();
      return true;
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
      return false;
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleStartPomodoro = () => {
    if (pomodoroLinkedToSession && activeSession) {
      const requiredStatus = pomodoroPhase === "focus" ? "active" : "paused";
      if (activeSession.status !== requiredStatus) {
        setPomodoroMessage(
          pomodoroPhase === "focus"
            ? "Inicie ou retome a sessão para sincronizar o foco."
            : "Pause a sessão para sincronizar o intervalo.",
        );
        return;
      }
    }
    if (pomodoroLinkedToSession && !activeSession) {
      setPomodoroMessage("Sem sessão ativa; desative a sincronização para usar livremente.");
      return;
    }
    if (pomodoroSecondsLeft === 0) {
      setPomodoroSecondsLeft(getPomodoroPhaseSeconds(pomodoroPhase, pomodoroSettings));
    }
    preparePomodoroNotifications();
    setPomodoroRunning(true);
    setPomodoroMessage(
      pomodoroPhase === "focus" ? "Foco iniciado." : "Intervalo retomado.",
    );
  };

  const handleResumePomodoro = () => {
    handleStartPomodoro();
  };

  const handlePausePomodoro = () => {
    if (!pomodoroRunning) return;
    if (pomodoroLinkedToSession && pomodoroPhase === "focus" && activeSession?.status === "active") {
      void handlePause();
      return;
    }
    setPomodoroRunning(false);
    setPomodoroMessage("Pomodoro pausado.");
  };

  const handleResetPomodoro = async () => {
    if (pomodoroLinkedToSession && pomodoroRunning && pomodoroPhase === "focus" && activeSession?.status === "active") {
      await handlePause();
    }
    setPomodoroRunning(false);
    setPomodoroPhase("focus");
    setPomodoroSecondsLeft(pomodoroSettings.focusMinutes * 60);
    setPomodoroCompletedFocusCount(0);
    setPomodoroMessage("Pomodoro reiniciado.");
  };

  const handlePomodoroSettingChange = (
    key: keyof PomodoroSettings,
    value: number,
  ) => {
    const nextSettings = { ...pomodoroSettings, [key]: value };
    setPomodoroSettings(nextSettings);
    if (!pomodoroRunning) {
      setPomodoroSecondsLeft(getPomodoroPhaseSeconds(pomodoroPhase, nextSettings));
    }
  };

  const isBusy = isLoading || pendingTaskId !== null || isAcceptingCycleAction;
  const pomodoroPhaseLabel = getPomodoroPhaseLabel(pomodoroPhase);

  return (
    <div className="grid gap-6">
      {error && (
        <div
          className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600"
          role="alert"
        >
          <span>{error}</span>
          <button className={buttonSecondaryClass} type="button" onClick={onDataChanged}>
            Tentar novamente
          </button>
        </div>
      )}

      {activeSession?.status === "interrupted" && (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 shadow-xs"
          role="alert"
          aria-labelledby="interrupted-banner-title"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
              Sessão interrompida
            </p>
            <h2 id="interrupted-banner-title" className="mt-0.5 font-heading text-base font-bold text-ink">
              Uma sessão anterior foi encerrada sem aviso
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              O tempo desde o último checkpoint não foi somado. Retome descartando esse trecho ou confirme o tempo efetivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`${buttonPrimaryClass} text-xs`}
              type="button"
              onClick={() => void handleResume()}
              disabled={isBusy}
            >
              Retomar sessão
            </button>
            <button
              className={`${buttonSecondaryClass} text-xs`}
              type="button"
              onClick={() => document.getElementById("interrupted-session-review")?.focus()}
            >
              Revisar tempo
            </button>
          </div>
        </section>
      )}

      {/* 1. Hero Study Banner - Clean Typography & Tactile Glass Surface */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          {/* Status Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              <span className={`size-2 rounded-full ${activeSession?.status === "active" ? "bg-orange-400 animate-pulse" : activeSession?.status === "paused" ? "bg-amber-400" : activeSession?.status === "interrupted" ? "bg-red-400" : "bg-emerald-400"}`} />
              {activeSession?.status === "paused"
                ? "Sessão Pausada"
                : activeSession?.status === "active"
                ? "Estudo em Andamento"
                : activeSession?.status === "interrupted"
                ? "Tempo Incerto para Revisar"
                : "Próxima ação"}
            </span>

            {primaryPreparation && (
              <span className="text-xs font-medium text-slate-300/80">
                Preparação: {primaryPreparation.name}
              </span>
            )}
          </div>

          {/* Main Title */}
          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              {activeTask?.title || (cycleSuggestion ? `Próxima ação: ${cycleSuggestion.subjectName}` : "Seu estudo de hoje")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              {activeTask
                ? activeTask.objective || "Seu próximo estudo está pronto. Comece quando quiser."
                : cycleSuggestion
                  ? "Este é o próximo estudo sugerido pelo ciclo. Adicione-o a Hoje quando quiser."
                  : "Agende o próximo estudo. Tema e duração bastam; edital, pesos e ciclo podem esperar."}
            </p>
          </div>

          {/* Live Timer Output with Tabular Figures */}
          {activeSession && (
            <div className="flex items-center gap-4 rounded-2xl border border-orange-500/30 bg-orange-500/15 px-5 py-3 w-fit backdrop-blur-xs shadow-inner">
              <div className="grid">
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Tempo Efetivo</span>
                <span className="font-mono tabular-nums text-3xl font-extrabold text-orange-400 tracking-tight">
                  {formatDuration(getElapsedSeconds(activeSession, now))}
                </span>
              </div>
            </div>
          )}

          {/* Action Button Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {activeSession?.status === "interrupted" ? null : activeSession?.status === "paused" ? (
              <button className={buttonPrimaryClass} type="button" onClick={handleResumePomodoro} disabled={isBusy}>
                ▶ {pomodoroPhase === "focus" ? "Retomar Sessão" : "Continuar Intervalo"}
              </button>
            ) : activeSession?.status === "active" ? (
              <>
                <button className={buttonPrimaryClass} type="button" onClick={() => handleFinish("completed")} disabled={isBusy}>
                  ✓ Concluir Sessão
                </button>
                <button className={buttonOutlineLightClass} type="button" onClick={handlePause} disabled={isBusy}>
                  ⏸ Pausar
                </button>
              </>
            ) : activeTask ? (
                <button className={buttonPrimaryClass} type="button" onClick={() => handleStart(activeTask)} disabled={isBusy}>
                  ▶ Começar estudo · {activeTask.plannedMinutes} min
                </button>
              ) : cycleSuggestion ? (
                <button className={buttonPrimaryClass} type="button" onClick={() => void handleAcceptCycleAction()} disabled={isBusy}>
                  {isBusy ? "Adicionando estudo..." : "Adicionar estudo de hoje"}
                </button>
              ) : (
                <button className={buttonPrimaryClass} type="button" onClick={openTaskPlanner} disabled={isBusy}>
                  Agendar estudo
                </button>
            )}

            {activeSession && activeSession.status !== "interrupted" && (
              <button className={buttonQuietClass} type="button" onClick={() => handleFinish("partial")} disabled={isBusy}>
                Encerrar sem concluir
              </button>
            )}
            {activeSession && activeTask && (activeTask.materialId || activeTask.subjectId) && (
              <button className={buttonOutlineLightClass} type="button" onClick={() => handleOpenContext(activeTask)}>
                Material e notas da sessão
              </button>
            )}
          </div>

          {activeSession && activeSession.status !== "interrupted" && (
            <p className="max-w-2xl text-[11px] leading-relaxed text-slate-300">
              Ao encerrar sem concluir, o tempo estudado fica salvo e o estudo continua marcado como pendente.
            </p>
          )}

          {activeSession?.status === "interrupted" && (
            <section className="grid max-w-2xl gap-3 rounded-xl border border-red-300/35 bg-red-950/20 p-3" id="interrupted-session-review" tabIndex={-1} aria-labelledby="interrupted-session-title">
              <div>
                <h3 id="interrupted-session-title" className="text-xs font-bold text-red-100">Revise o trecho incerto</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-red-100/80">
                  O aplicativo não somou o tempo desde o último checkpoint. Confirme somente o tempo efetivo conhecido ou retome descartando esse trecho.
                </p>
              </div>
              <label className="grid max-w-xs gap-1.5 text-xs font-semibold text-slate-100">
                Tempo efetivo confirmado (minutos)
                <input
                  className={inputClass}
                  type="number"
                  min={Math.ceil(activeSession.effectiveSeconds / 60)}
                  max="10080"
                  step="1"
                  value={recoveryMinutes}
                  onChange={(event) => setRecoveryMinutes(event.target.value)}
                  disabled={isBusy}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={buttonPrimaryClass} type="button" onClick={() => void handleFinish("completed")} disabled={isBusy}>
                  Encerrar com tempo confirmado
                </button>
                <button className={buttonOutlineLightClass} type="button" onClick={handleResume} disabled={isBusy}>
                  Retomar sem o trecho incerto
                </button>
              </div>
            </section>
          )}

          {activeSession && (
            <details className="max-w-2xl rounded-xl border border-white/15 bg-white/5 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-100">Anotar resumo ou agendar revisão <span className="font-normal text-slate-300">(opcional)</span></summary>
            <div className="mt-3 grid gap-3">
            <div className="max-w-md rounded-xl border border-white/15 bg-white/5 p-3">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-100">
                Agendar revisão ao concluir a sessão
                <input
                  className={inputClass}
                  type="date"
                  value={reviewOn}
                  onChange={(event) => setReviewOn(event.target.value)}
                  disabled={isBusy || !activeSession.subjectId}
                />
              </label>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {activeSession.subjectId
                  ? "A revisão será criada somente se você concluir a tarefa; encerramentos parciais não agendam revisão."
                  : "Vincule a tarefa a um assunto para poder agendar uma revisão."}
              </p>
            </div>

            <section className="grid max-w-2xl gap-3 rounded-xl border border-white/15 bg-white/5 p-3" aria-labelledby="session-reflection-title">
              <div>
                <h3 id="session-reflection-title" className="text-xs font-bold text-slate-100">Resumo da sessão</h3>
                <p className="mt-1 text-[11px] text-slate-300">
                  Registro opcional ligado a esta sessão e ao assunto da tarefa.
                </p>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-100">
                O que você estudou ou aprendeu?
                <textarea
                  className={textareaClass}
                  value={sessionSummaryMarkdown}
                  onChange={(event) => setSessionSummaryMarkdown(event.target.value)}
                  maxLength={20_000}
                  disabled={isBusy || activeSession.status === "interrupted"}
                  placeholder="Resumo em Markdown (opcional)"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-100">
                  Dificuldade percebida
                  <select
                    className={selectClass}
                    value={sessionDifficulty ?? ""}
                    onChange={(event) =>
                      setSessionDifficulty(
                        event.target.value === "" ? null : event.target.value as StudySessionDifficulty,
                      )
                    }
                    disabled={isBusy || activeSession.status === "interrupted"}
                  >
                    <option value="">Não informada</option>
                    <option value="easy">Fácil</option>
                    <option value="normal">Regular</option>
                    <option value="hard">Difícil</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-100">
                  Próximos passos
                  <textarea
                    className={textareaClass}
                    value={sessionNextSteps}
                    onChange={(event) => setSessionNextSteps(event.target.value)}
                    maxLength={5_000}
                    disabled={isBusy || activeSession.status === "interrupted"}
                    placeholder="O que revisar ou praticar depois?"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  className={buttonOutlineLightClass}
                  type="button"
                  onClick={() => void handleSaveSessionReflection()}
                  disabled={isBusy || activeSession.status === "interrupted"}
                >
                  Salvar resumo
                </button>
              </div>
            </section>
            </div>
            </details>
          )}
        </div>
      </section>

      {contextTask && (
        <section id="task-study-context" tabIndex={-1} className="grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-xs" aria-labelledby="task-context-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Detalhes do estudo</Eyebrow>
              <h3 id="task-context-title" className="mt-1 font-heading text-lg font-bold text-ink">{contextTask.title}</h3>
              <p className="mt-1 text-xs text-muted">{contextTask.materialName ?? "Sem material vinculado"} · {contextTask.subjectName ?? "Sem assunto vinculado"}</p>
            </div>
            <button type="button" className={buttonQuietClass} onClick={() => setContextTaskId(null)}>Fechar</button>
          </div>
          {contextLoading && <p className="text-sm text-muted" aria-live="polite">Carregando material da tarefa...</p>}
          {contextError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{contextError}</p>}
          {!contextLoading && contextTask.materialId && !contextMaterial && !contextError && (
            <p className="text-sm text-muted">O material vinculado não está disponível na biblioteca local.</p>
          )}
          {contextMaterial?.mimeType === "application/pdf" && !contextMaterial.sourceUrl && (
            <Suspense fallback={<p className="text-sm text-muted">Abrindo leitor PDF...</p>}>
              <PdfReader material={contextMaterial} onClose={() => setContextTaskId(null)} onMaterialUpdated={(updated) =>
                setContextMaterials((current) => current.map((item) => item.id === updated.id ? updated : item))
              } />
            </Suspense>
          )}
          {contextMaterial && (contextMaterial.mimeType !== "application/pdf" || contextMaterial.sourceUrl) && (
            <button type="button" className={`${buttonSecondaryClass} justify-self-start`} onClick={() => void handleOpenExternalMaterial(contextMaterial.id)}>
              {contextMaterial.sourceUrl ? "Abrir link externo" : "Abrir no aplicativo padrão"}
            </button>
          )}
          {(contextTask.materialId || contextTask.subjectId) && !contextLoading && (
            <NotesPanel key={contextTask.id} plan={plan} materials={contextMaterials}
              refreshKey={0} contextMaterialId={contextTask.materialId} contextSubjectId={contextTask.subjectId} />
          )}
        </section>
      )}

      {dailyPlan && <ReviewQueue reviews={dailyPlan.reviews} onDataChanged={onDataChanged} timezone={timezone} />}

      {/* Daily metrics stay available without delaying the next study action. */}
      {(tasksToRender.length > 0 || activeSession) && <details className="rounded-2xl border border-line bg-card px-4 py-3 shadow-xs">
      <summary className="cursor-pointer text-xs font-semibold text-muted">
        Resumo do dia · {completedTaskCount} de {tasksToRender.length} estudos concluídos · {plannedMinutes} min planejados
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Estudos de hoje</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">{tasksToRender.length}</p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${taskProgressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">{taskProgressPercent}% concluído</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Estudos concluídos</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">{completedTaskCount}</p>
          <p className="mt-2 text-[11px] text-muted font-semibold">Atualizado pelo plano local</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Tempo Planejado</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">{plannedMinutes} min</p>
          <p className="mt-2 text-[11px] text-muted font-medium">Soma das tarefas do dia</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Sessão Atual</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {activeSession ? formatDuration(getElapsedSeconds(activeSession, now)) : "Nenhuma"}
          </p>
          <p className="mt-2 text-[11px] text-muted">Tempo efetivo em andamento</p>
        </div>
      </div>
      </details>}

      {/* 3. Main Dashboard Body - Tasks & Utility Panel */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        {/* Task List Container */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <Eyebrow>Seu plano do dia</Eyebrow>
              <h3 className="mt-1 font-heading text-lg font-bold text-ink">Estudos de hoje</h3>
            </div>
            {tasksToRender.length > 0 && (
            <button
              type="button"
              onClick={openTaskPlanner}
              className={`${buttonSecondaryClass} px-3 py-1.5 text-xs`}
            >
              + Adicionar estudo
            </button>
            )}
          </div>

          {actionError && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">{actionError}</p>}
          {actionMessage && <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 font-medium">{actionMessage}</p>}

          <div className="mt-4 grid gap-3">
          {cycleSuggestion && activeTask && (
            <details className="rounded-xl border border-line bg-paper px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted">
                Ver alternativa: {cycleSuggestion.subjectName} · {cycleSuggestion.plannedMinutes} min
              </summary>
              <div className="mt-3">
                <CycleSuggestionCard
                suggestion={cycleSuggestion}
                isBusy={isBusy}
                onAccept={() => void handleAcceptCycleAction()}
                />
              </div>
            </details>
            )}
            {tasksToRender.length > 0 ? (
              tasksToRender.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  isNextAction={!activeSession && task.id === activeTask?.id}
                  isActive={activeSession?.taskId === task.id}
                  isBusy={isBusy}
                  onStart={() => handleStart(task)}
                  onSkip={() => handleSkip(task)}
                  onReschedule={(date) => handleReschedule(task, date)}
                  onOpenContext={() => handleOpenContext(task)}
                />
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted">Nenhum estudo agendado para hoje.</p>
            )}
          </div>
        </section>

        {/* Right Utility Cards */}
        <div className="grid gap-4 content-start">
          {/* Local Storage & System Info */}
          <details className="rounded-2xl border border-line bg-card px-4 py-3 shadow-xs">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Sobre este espaço e seus dados</summary>
            <div className="mt-3 grid gap-2.5 text-xs text-muted">
              <div className="font-semibold text-ink">Seus dados ficam neste computador.</div>
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span>Data do Plano:</span>
                <span className="font-semibold text-ink">{formatToday(timezone)}</span>
              </div>
              <span>O app funciona sem internet; seus dados ficam neste computador.</span>
            </div>
          </details>

          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs" aria-labelledby="pomodoro-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow>Ritmo de Foco</Eyebrow>
                <h4 id="pomodoro-title" className="mt-1 font-heading text-base font-bold text-ink">
                  Pomodoro
                </h4>
              </div>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                {pomodoroPhaseLabel}
              </span>
            </div>

            <p className="mt-4 text-center font-mono text-4xl font-extrabold tabular-nums text-ink">
              {formatPomodoroTime(pomodoroSecondsLeft)}
            </p>

            {activeSession ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-blue-600"
                  checked={pomodoroLinkedToSession}
                  disabled={activeSession.status === "interrupted" || isPomodoroTransitioning}
                  onChange={(event) => {
                    setPomodoroLinkedToSession(event.target.checked);
                    setPomodoroMessage(
                      event.target.checked
                        ? "Pomodoro sincronizado com a sessão de estudo."
                        : "Pomodoro livre; a sessão segue seu próprio cronômetro.",
                    );
                  }}
                />
                <span>
                  <span className="block font-semibold">Sincronizar com a sessão de estudo</span>
                  <span className="mt-0.5 block text-muted">
                    {activeSession.status === "interrupted"
                      ? "Retome a sessão para poder sincronizar."
                      : "Ligado: foco e pausas também pausam e retomam a sessão."}
                  </span>
                </span>
              </label>
            ) : (
              <p className="mt-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-muted">
                Modo livre: o Pomodoro funciona sem iniciar uma sessão de estudo.
              </p>
            )}

            <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Ajustar tempos de foco e pausa</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className={fieldClass}>
                Foco
                <select
                  className={`${selectClass} min-h-9 px-2 text-xs`}
                  value={pomodoroSettings.focusMinutes}
                  onChange={(event) =>
                    handlePomodoroSettingChange("focusMinutes", Number(event.target.value))
                  }
                  disabled={pomodoroRunning || isPomodoroTransitioning}
                >
                  <option value={15}>15 min</option>
                  <option value={25}>25 min</option>
                  <option value={50}>50 min</option>
                </select>
              </label>
              <label className={fieldClass}>
                Pausa curta
                <select
                  className={`${selectClass} min-h-9 px-2 text-xs`}
                  value={pomodoroSettings.shortBreakMinutes}
                  onChange={(event) =>
                    handlePomodoroSettingChange("shortBreakMinutes", Number(event.target.value))
                  }
                  disabled={pomodoroRunning || isPomodoroTransitioning}
                >
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                </select>
              </label>
              <label className={fieldClass}>
                Pausa longa
                <select
                  className={`${selectClass} min-h-9 px-2 text-xs`}
                  value={pomodoroSettings.longBreakMinutes}
                  onChange={(event) =>
                    handlePomodoroSettingChange("longBreakMinutes", Number(event.target.value))
                  }
                  disabled={pomodoroRunning || isPomodoroTransitioning}
                >
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                </select>
              </label>
            </div>
            </details>

            <div className="mt-4 flex flex-wrap gap-2">
              {!pomodoroRunning ? (
                <button
                  type="button"
                  className={`${buttonPrimaryClass} min-h-9 px-3 text-xs`}
                  onClick={handleStartPomodoro}
                  disabled={isPomodoroTransitioning}
                >
                  {pomodoroPhase === "focus" ? "Iniciar Foco" : "Iniciar Intervalo"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
                  onClick={() => void handlePausePomodoro()}
                  disabled={isPomodoroTransitioning}
                >
                  Pausar Pomodoro
                </button>
              )}
              <button
                type="button"
                className={`${buttonQuietClass} min-h-9 px-3 text-xs`}
                onClick={() => void handleResetPomodoro()}
                disabled={isPomodoroTransitioning}
              >
                Reiniciar
              </button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              {pomodoroMessage || "Temporizador independente das sessões de estudo."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  index,
  isNextAction,
  isActive,
  isBusy,
  onStart,
  onSkip,
  onReschedule,
  onOpenContext,
}: {
  task: StudyTaskSummary;
  index: number;
  isNextAction: boolean;
  isActive: boolean;
  isBusy: boolean;
  onStart: () => void;
  onSkip: () => void;
  onReschedule: (date: string) => Promise<boolean>;
  onOpenContext: () => void;
}) {
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [newDate, setNewDate] = useState(task.scheduledFor);
  const isCompleted = task.status === "completed";

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4.5 transition-all duration-150 ease-out ${
        isActive
          ? "border-orange-500/50 bg-orange-500/5 shadow-xs"
          : isCompleted
          ? "border-emerald-500/30 bg-emerald-500/5 opacity-85"
          : "border-line bg-paper/70 hover:border-blue-500/30 hover:bg-paper shadow-xs"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <span
            className={`flex size-7.5 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold transition-transform ${
              isActive
                ? "bg-orange-500 text-white shadow-xs scale-105"
                : isCompleted
                ? "bg-emerald-500 text-white shadow-xs"
                : "bg-paper-deep text-muted border border-line"
            }`}
          >
            {isCompleted ? "✓" : `${index + 1}`.padStart(2, "0")}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                {task.subjectName || "Geral"}
              </span>
              <span className="text-xs font-medium text-muted tabular-nums font-mono">{task.plannedMinutes} min</span>
            </div>
            <h4 className="mt-1 font-bold text-sm leading-snug text-ink">{task.title}</h4>
            {task.objective && <p className="mt-1 text-xs text-muted leading-relaxed text-pretty">{task.objective}</p>}
            {task.materialName && <p className="mt-1 truncate text-[11px] text-blue-700 dark:text-blue-300">Material: {task.materialName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isActive ? (
            <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-600 dark:text-orange-400 animate-pulse">
              Em andamento
            </span>
          ) : isCompleted ? (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Concluída
            </span>
          ) : null}
        </div>
      </div>

      {!isCompleted && !isActive && <details className="self-start">
        <summary className="cursor-pointer list-none text-xs font-semibold text-muted">Mais opções</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setIsEditingDate((editing) => !editing)} disabled={isBusy}
            className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`}>
            {isEditingDate ? "Cancelar reagendamento" : "Reagendar"}
          </button>
          <button type="button" onClick={onSkip} disabled={isBusy} className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`}>
            Pular tarefa
          </button>
          <button type="button" onClick={onStart} disabled={isBusy} className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`}>
            {isNextAction ? "Começar este estudo" : "Começar estudo"}
          </button>
          {(task.materialId || task.subjectId) && (
            <button type="button" className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`} onClick={onOpenContext}>
              Abrir material e notas
            </button>
          )}
        </div>
        {isEditingDate && (
          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2.5">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Nova data
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={`${inputClass} w-auto px-2.5 py-1 text-xs`} />
            </label>
            <button type="button" onClick={async () => { if (await onReschedule(newDate)) setIsEditingDate(false); }}
              className={`${buttonSecondaryClass} mt-4 px-3 py-1.5 text-xs`}>
              Salvar data
            </button>
          </div>
        )}
      </details>}
      {(isCompleted || isActive) && (task.materialId || task.subjectId) && (
        <button type="button" className={`${buttonQuietClass} self-start px-2.5 py-1.5 text-xs`} onClick={onOpenContext}>
          Abrir material e notas
        </button>
      )}
    </div>
  );
}

function CycleSuggestionCard({
  suggestion,
  isBusy,
  onAccept,
}: {
  suggestion: StudyCycleSuggestion;
  isBusy: boolean;
  onAccept: () => void;
}) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Próximo estudo sugerido</p>
          <h4 className="mt-1 font-heading text-base font-bold text-ink">{suggestion.subjectName}</h4>
          <p className="mt-1 text-xs text-muted">{suggestion.plannedMinutes} minutos</p>
        </div>
        <button
          type="button"
          className={`${buttonPrimaryClass} px-3 py-1.5 text-xs`}
          onClick={onAccept}
          disabled={isBusy}
        >
          {isBusy ? "Adicionando..." : "Adicionar estudo de hoje"}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Adicione este estudo à lista de hoje quando quiser fazê-lo.
      </p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function formatReviewDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatPomodoroTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function getPomodoroPhaseLabel(phase: PomodoroPhase): string {
  if (phase === "focus") return "Foco";
  return phase === "short_break" ? "Pausa curta" : "Pausa longa";
}

function getPomodoroPhaseSeconds(
  phase: PomodoroPhase,
  settings: PomodoroSettings,
): number {
  if (phase === "focus") return settings.focusMinutes * 60;
  return (phase === "short_break" ? settings.shortBreakMinutes : settings.longBreakMinutes) * 60;
}

function readPomodoroSettings(): PomodoroSettings {
  try {
    const stored = window.localStorage.getItem(POMODORO_STORAGE_KEY);
    if (!stored) return DEFAULT_POMODORO_SETTINGS;
    const parsed: unknown = JSON.parse(stored);
    if (!isPomodoroSettings(parsed)) return DEFAULT_POMODORO_SETTINGS;
    return parsed;
  } catch {
    return DEFAULT_POMODORO_SETTINGS;
  }
}

function isPomodoroSettings(value: unknown): value is PomodoroSettings {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.focusMinutes === "number" &&
    [15, 25, 50].includes(record.focusMinutes) &&
    typeof record.shortBreakMinutes === "number" &&
    [5, 10].includes(record.shortBreakMinutes) &&
    typeof record.longBreakMinutes === "number" &&
    [15, 20, 30].includes(record.longBreakMinutes)
  );
}

function formatToday(timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: displayTimezone(timezone),
  }).format(new Date());
}

function getElapsedSeconds(session: StudySessionSummary, now: number): number {
  if (session.status !== "active") return session.effectiveSeconds;
  const startedAt = session.activeStartedAt ?? session.startedAt;
  const normalized = startedAt.includes("T") ? startedAt : startedAt.replace(" ", "T");
  const startTime = Date.parse(/[zZ]$/.test(normalized) ? normalized : `${normalized}Z`);
  if (Number.isNaN(startTime)) return session.effectiveSeconds;
  return session.effectiveSeconds + Math.max(0, Math.floor((now - startTime) / 1000));
}
