import { useEffect, useState } from "react";
import {
  acceptStudyCycleAction,
  finishStudySession,
  getDesktopErrorMessage,
  pauseStudySession,
  rescheduleStudyTask,
  resumeStudySession,
  skipStudyTask,
  startStudySession,
} from "../../shared/desktop/commands";
import type {
  DailyPlan,
  StudyPlan,
  StudySessionSummary,
  StudyCycleSuggestion,
  StudyTaskSummary,
  StudyTaskStatus,
} from "../../shared/desktop/contracts";
import { ReviewQueue } from "./ReviewQueue";
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
} from "../../shared/ui/primitives";

type TodayViewProps = {
  plan: StudyPlan | null;
  dailyPlan: DailyPlan | null;
  isLoading: boolean;
  error: string | null;
  onOpenPlan: () => void;
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

export function TodayView({
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
  const [now, setNow] = useState(() => Date.now());
  const [pomodoroSettings, setPomodoroSettings] = useState(readPomodoroSettings);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("focus");
  const [pomodoroSecondsLeft, setPomodoroSecondsLeft] = useState(
    () => pomodoroSettings.focusMinutes * 60,
  );
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroCompletedFocusCount, setPomodoroCompletedFocusCount] = useState(0);
  const [isPomodoroTransitioning, setIsPomodoroTransitioning] = useState(false);
  const [pomodoroMessage, setPomodoroMessage] = useState<string | null>(null);

  const primaryPreparation = plan?.preparations.find((prep) => prep.isPrimary);
  const activeSession = dailyPlan?.activeSession ?? null;
  const cycleSuggestion = dailyPlan?.cycleSuggestion ?? null;

  useEffect(() => {
    setReviewOn("");
  }, [activeSession?.id]);

  const tasksToRender = dailyPlan?.tasks ?? [];
  const activeTask =
    tasksToRender.find((task) => task.id === activeSession?.taskId) ??
    tasksToRender.find((task) => task.status === "pending" || task.status === "partial") ??
    null;
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
    if (!pomodoroRunning || !activeSession) return;
    if (pomodoroPhase === "focus" && activeSession.status !== "active") {
      setPomodoroRunning(false);
    }
  }, [activeSession, pomodoroPhase, pomodoroRunning]);

  useEffect(() => {
    if (
      !pomodoroRunning ||
      pomodoroSecondsLeft > 0 ||
      isPomodoroTransitioning ||
      !activeSession
    ) {
      return;
    }

    setIsPomodoroTransitioning(true);
    const transitionPhase = async () => {
      if (pomodoroPhase === "focus") {
        if (activeSession.status !== "active") {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setPomodoroMessage("Inicie uma sessão ativa para continuar o foco.");
          setIsPomodoroTransitioning(false);
          return;
        }

        try {
          await pauseStudySession({
            sessionId: activeSession.id,
            effectiveSeconds: getElapsedSeconds(activeSession, Date.now()),
          });
        } catch (operationError: unknown) {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setActionError(getDesktopErrorMessage(operationError));
          setIsPomodoroTransitioning(false);
          return;
        }

        const completedFocusCount = pomodoroCompletedFocusCount + 1;
        const nextPhase: PomodoroPhase =
          completedFocusCount % 4 === 0 ? "long_break" : "short_break";
        setPomodoroCompletedFocusCount(completedFocusCount);
        setPomodoroPhase(nextPhase);
        setPomodoroSecondsLeft(getPomodoroPhaseSeconds(nextPhase, pomodoroSettings));
        setPomodoroMessage(
          nextPhase === "long_break"
            ? "Foco concluído. A sessão foi pausada e começou o intervalo longo."
            : "Foco concluído. A sessão foi pausada e começou o intervalo curto.",
        );
        onDataChanged();
      } else {
        if (activeSession.status !== "paused") {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setPomodoroMessage("Pause a sessão antes de iniciar um intervalo.");
          setIsPomodoroTransitioning(false);
          return;
        }

        try {
          await resumeStudySession({ sessionId: activeSession.id });
        } catch (operationError: unknown) {
          setPomodoroRunning(false);
          setPomodoroSecondsLeft(1);
          setActionError(getDesktopErrorMessage(operationError));
          setIsPomodoroTransitioning(false);
          return;
        }

        setPomodoroPhase("focus");
        setPomodoroSecondsLeft(pomodoroSettings.focusMinutes * 60);
        setPomodoroMessage("Intervalo concluído. O próximo foco começou.");
        onDataChanged();
      }

      setIsPomodoroTransitioning(false);
    };

    void transitionPhase();
  }, [
    activeSession,
    isPomodoroTransitioning,
    onDataChanged,
    pomodoroCompletedFocusCount,
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
      setActionMessage(`Ação adicionada ao plano: ${result.task.title}.`);
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsAcceptingCycleAction(false);
    }
  };

  const handlePause = async () => {
    if (!activeSession || activeSession.status !== "active") return;
    setPomodoroRunning(false);
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
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleResume = async () => {
    if (!activeSession || activeSession.status !== "paused") return;
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      await resumeStudySession({ sessionId: activeSession.id });
      setActionMessage("Sessão retomada.");
      if (pomodoroPhase === "focus") {
        setPomodoroRunning(true);
      }
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleFinish = async (taskStatus: "completed" | "partial") => {
    if (!activeSession) return;
    setPomodoroRunning(false);
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      const result = await finishStudySession({
        sessionId: activeSession.id,
        effectiveSeconds: getElapsedSeconds(activeSession, now),
        taskStatus,
        reviewOn: taskStatus === "completed" && reviewOn ? reviewOn : null,
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
      setPomodoroRunning(false);
      setPomodoroPhase("focus");
      setPomodoroSecondsLeft(pomodoroSettings.focusMinutes * 60);
      setPomodoroCompletedFocusCount(0);
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
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
      setActionMessage("Tarefa pulada.");
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
      setActionMessage("Tarefa reagendada.");
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
    const requiredStatus = pomodoroPhase === "focus" ? "active" : "paused";
    if (!activeSession || activeSession.status !== requiredStatus) {
      setActionError(
        pomodoroPhase === "focus"
          ? "Inicie uma sessão de estudo antes de iniciar o foco."
          : "O intervalo só começa depois que a sessão é pausada.",
      );
      return;
    }
    if (pomodoroSecondsLeft === 0) {
      setPomodoroSecondsLeft(getPomodoroPhaseSeconds(pomodoroPhase, pomodoroSettings));
    }
    setPomodoroRunning(true);
    setPomodoroMessage(
      pomodoroPhase === "focus" ? "Foco iniciado." : "Intervalo retomado.",
    );
  };

  const handleResumePomodoro = async () => {
    if (pomodoroPhase === "short_break" || pomodoroPhase === "long_break") {
      handleStartPomodoro();
      return;
    }
    await handleResume();
  };

  const handlePausePomodoro = async () => {
    if (!pomodoroRunning) return;
    if (pomodoroPhase === "focus" && activeSession?.status === "active") {
      await handlePause();
      return;
    }
    setPomodoroRunning(false);
    setPomodoroMessage("Pomodoro pausado.");
  };

  const handleResetPomodoro = async () => {
    if (pomodoroRunning && pomodoroPhase === "focus" && activeSession?.status === "active") {
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
  const pomodoroCanRun = Boolean(
    activeSession &&
      (pomodoroPhase === "focus"
        ? activeSession.status === "active"
        : activeSession.status === "paused"),
  );
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

      {/* 1. Hero Study Banner - Clean Typography & Tactile Glass Surface */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          {/* Status Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              <span className={`size-2 rounded-full ${activeSession?.status === "active" ? "bg-orange-400 animate-pulse" : activeSession?.status === "paused" ? "bg-amber-400" : "bg-emerald-400"}`} />
              {activeSession?.status === "paused"
                ? "Sessão Pausada"
                : activeSession?.status === "active"
                ? "Estudo em Andamento"
                : "Próxima Ação do Seu Ciclo"}
            </span>

            {primaryPreparation && (
              <span className="text-xs font-medium text-slate-300/80">
                • {primaryPreparation.name}
              </span>
            )}
          </div>

          {/* Main Title */}
          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              {activeTask?.title || (cycleSuggestion ? `Próxima ação: ${cycleSuggestion.subjectName}` : "Plano de Estudos de Hoje")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              {activeTask?.objective || "Selecione uma matéria da sua fila de hoje para iniciar a sessão de estudos com o cronômetro local."}
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
            {activeSession?.status === "paused" ? (
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
            ) : (
              <button
                className={buttonPrimaryClass}
                type="button"
                onClick={() => activeTask && handleStart(activeTask)}
                disabled={isBusy || !activeTask}
              >
                {activeTask
                  ? `▶ Iniciar Sessão (${activeTask.plannedMinutes} min)`
                  : "Nenhuma tarefa para iniciar"}
              </button>
            )}

            {activeSession && (
              <button className={buttonQuietClass} type="button" onClick={() => handleFinish("partial")} disabled={isBusy}>
                Encerrar Parcial
              </button>
            )}
          </div>

          {activeSession && (
            <div className="max-w-md rounded-xl border border-white/15 bg-white/5 p-3">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-100">
                Agendar revisão ao concluir a sessão <span className="font-normal text-slate-300">(opcional)</span>
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
          )}
        </div>
      </section>

      {dailyPlan && <ReviewQueue reviews={dailyPlan.reviews} onDataChanged={onDataChanged} />}

      {/* 2. Daily plan metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Tarefas do Dia</p>
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
          <p className="text-xs font-semibold text-muted">Tarefas Concluídas</p>
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

      {/* 3. Main Dashboard Body - Tasks & Utility Panel */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        {/* Task List Container */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <Eyebrow>Plano de Estudos do Dia</Eyebrow>
              <h3 className="mt-1 font-heading text-lg font-bold text-ink">Fila de Matérias Agendadas</h3>
            </div>
            <button
              type="button"
              onClick={onOpenPlan}
              className={`${buttonSecondaryClass} px-3 py-1.5 text-xs`}
            >
              + Adicionar Tarefa
            </button>
          </div>

          {actionError && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">{actionError}</p>}
          {actionMessage && <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 font-medium">{actionMessage}</p>}

          <div className="mt-4 grid gap-3">
            {cycleSuggestion && (
              <CycleSuggestionCard
                suggestion={cycleSuggestion}
                isBusy={isBusy}
                onAccept={() => void handleAcceptCycleAction()}
              />
            )}
            {tasksToRender.length > 0 ? (
              tasksToRender.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  isActive={activeSession?.taskId === task.id}
                  isBusy={isBusy}
                  onStart={() => handleStart(task)}
                  onSkip={() => handleSkip(task)}
                  onReschedule={(date) => handleReschedule(task, date)}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center">
                <p className="text-sm font-semibold text-ink">Nenhuma tarefa planejada para hoje.</p>
                <p className="mt-1 text-xs text-muted">
                  Crie uma tarefa no Plano para definir sua próxima ação de estudo.
                </p>
                <button
                  type="button"
                  onClick={onOpenPlan}
                  className={`${buttonPrimaryClass} mt-4 text-xs`}
                >
                  Abrir Plano
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Utility Cards */}
        <div className="grid gap-4 content-start">
          {/* Local Storage & System Info */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs">
            <Eyebrow>Status do Sistema</Eyebrow>
            <h4 className="mt-1 font-heading text-base font-bold text-ink">Espaço 100% Offline</h4>

            <div className="mt-4 grid gap-2.5 text-xs text-muted">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span>Data do Plano:</span>
                <span className="font-semibold text-ink">{formatToday()}</span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span>Modo de Armazenamento:</span>
                <span className="font-bold text-emerald-600">SQLite Local</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Privacidade de Dados:</span>
                <span className="font-semibold text-ink">Sem envio à nuvem</span>
              </div>
            </div>
          </section>

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

            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
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

            <div className="mt-4 flex flex-wrap gap-2">
              {!pomodoroRunning ? (
                <button
                  type="button"
                  className={`${buttonPrimaryClass} min-h-9 px-3 text-xs`}
                  onClick={handleStartPomodoro}
                  disabled={!pomodoroCanRun || isPomodoroTransitioning}
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
              {pomodoroMessage ||
                "O intervalo pausa a sessão automaticamente e não entra no tempo estudado."}
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
  isActive,
  isBusy,
  onStart,
  onSkip,
  onReschedule,
}: {
  task: StudyTaskSummary;
  index: number;
  isActive: boolean;
  isBusy: boolean;
  onStart: () => void;
  onSkip: () => void;
  onReschedule: (date: string) => Promise<boolean>;
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
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onStart}
                disabled={isBusy}
                className={`${buttonPrimaryClass} px-3 py-1.5 text-xs`}
              >
                ▶ Iniciar
              </button>
              <button
                type="button"
                onClick={onSkip}
                disabled={isBusy}
                className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`}
              >
                Pular
              </button>
              <button
                type="button"
                onClick={() => setIsEditingDate(!isEditingDate)}
                disabled={isBusy}
                className={`${buttonQuietClass} px-2.5 py-1.5 text-xs`}
              >
                Reagendar
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditingDate && (
        <div className="flex items-center gap-2 pt-2.5 border-t border-line">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={`${inputClass} text-xs py-1 px-2.5 w-auto`}
          />
          <button
            type="button"
            onClick={async () => {
              if (await onReschedule(newDate)) {
                setIsEditingDate(false);
              }
            }}
            className={`${buttonSecondaryClass} text-xs px-3 py-1.5`}
          >
            Salvar
          </button>
        </div>
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Próximo bloco do ciclo</p>
          <h4 className="mt-1 font-heading text-base font-bold text-ink">{suggestion.subjectName}</h4>
          <p className="mt-1 text-xs text-muted">{suggestion.plannedMinutes} minutos · posição {suggestion.cyclePosition + 1}</p>
        </div>
        <button
          type="button"
          className={`${buttonPrimaryClass} px-3 py-1.5 text-xs`}
          onClick={onAccept}
          disabled={isBusy}
        >
          {isBusy ? "Adicionando..." : "Adicionar ao plano de hoje"}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        O aceite cria uma tarefa local e avança o ciclo uma única vez. Você ainda poderá reagendar ou pular a tarefa.
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

function formatToday(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function getElapsedSeconds(session: StudySessionSummary, now: number): number {
  if (session.status !== "active") return session.effectiveSeconds;
  const startedAt = session.activeStartedAt ?? session.startedAt;
  const normalized = startedAt.includes("T") ? startedAt : startedAt.replace(" ", "T");
  const startTime = Date.parse(/[zZ]$/.test(normalized) ? normalized : `${normalized}Z`);
  if (Number.isNaN(startTime)) return session.effectiveSeconds;
  return Math.max(session.effectiveSeconds, Math.floor((now - startTime) / 1000));
}
