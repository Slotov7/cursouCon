import { useEffect, useState } from "react";
import {
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
  StudyTaskSummary,
  StudyTaskStatus,
} from "../../shared/desktop/contracts";
import {
  buttonLightClass,
  buttonOutlineLightClass,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  inputClass,
} from "../../shared/ui/primitives";

type TodayViewProps = {
  plan: StudyPlan | null;
  dailyPlan: DailyPlan | null;
  isLoading: boolean;
  error: string | null;
  onOpenPlan: () => void;
  onDataChanged: () => void;
};

const DEFAULT_DEMO_TASKS: StudyTaskSummary[] = [
  {
    id: "demo-t1",
    preparationId: "prep-1",
    subjectId: "subj-1",
    subjectName: "Direito Constitucional",
    title: "Controle de Constitucionalidade (Concentrado vs Difuso)",
    objective: "Revisar ADI, ADC, ADPF e fazer 15 questões.",
    plannedMinutes: 45,
    scheduledFor: new Date().toISOString().split("T")[0],
    status: "pending",
  },
  {
    id: "demo-t2",
    preparationId: "prep-1",
    subjectId: "subj-2",
    subjectName: "Engenharia de Software",
    title: "Arquitetura Hexagonal, Ports & Adapters e DDD",
    objective: "Estudo de padrões de projeto e casos de uso isolados.",
    plannedMinutes: 60,
    scheduledFor: new Date().toISOString().split("T")[0],
    status: "pending",
  },
  {
    id: "demo-t3",
    preparationId: "prep-1",
    subjectId: "subj-3",
    subjectName: "Língua Portuguesa",
    title: "Sintaxe da Oração, Período e Regência da Crase",
    objective: "Bateria de questões da banca com foco em pegadinhas.",
    plannedMinutes: 30,
    scheduledFor: new Date().toISOString().split("T")[0],
    status: "pending",
  },
];

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
  const [now, setNow] = useState(() => Date.now());

  const primaryPreparation = plan?.preparations.find((prep) => prep.isPrimary);
  const activeSession = dailyPlan?.activeSession ?? null;

  // Use tasks from dailyPlan or fallback to default tasks if empty
  const tasksToRender = dailyPlan?.tasks.length ? dailyPlan.tasks : DEFAULT_DEMO_TASKS;
  const activeTask = tasksToRender.find((task) => task.id === activeSession?.taskId) ?? tasksToRender[0];

  useEffect(() => {
    if (!activeSession || activeSession.status !== "active") return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSession?.id, activeSession?.status]);

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

  const handlePause = async () => {
    if (!activeSession || activeSession.status !== "active") return;
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
      onDataChanged();
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleFinish = async (taskStatus: "completed" | "partial") => {
    if (!activeSession) return;
    setActionError(null);
    setActionMessage(null);
    setPendingTaskId(activeSession.taskId);
    try {
      const result = await finishStudySession({
        sessionId: activeSession.id,
        effectiveSeconds: getElapsedSeconds(activeSession, now),
        taskStatus,
      });
      setActionMessage(
        result.xpGranted > 0
          ? `Sessão encerrada com sucesso! +${result.xpGranted} XP adicionados.`
          : "Sessão encerrada.",
      );
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

  const isBusy = isLoading || pendingTaskId !== null;

  return (
    <div className="grid gap-6">
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
              {activeTask?.title || "Plano de Estudos de Hoje"}
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
              <button className={buttonPrimaryClass} type="button" onClick={handleResume} disabled={isBusy}>
                ▶ Retomar Sessão
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
                disabled={isBusy}
              >
                ▶ Iniciar Sessão ({activeTask?.plannedMinutes || 45} min)
              </button>
            )}

            {activeSession && (
              <button className={buttonQuietClass} type="button" onClick={() => handleFinish("partial")} disabled={isBusy}>
                Encerrar Parcial
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Quick Metrics Bar - 4 Tactile Surface Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Horas de Estudo Hoje</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">1h 45m</p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
            <div className="h-full w-[70%] rounded-full bg-blue-600 transition-all duration-300"></div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Sequência de Estudos</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="font-heading text-xl font-extrabold text-ink tabular-nums">7 Dias</span>
            <span className="text-base">🔥</span>
          </div>
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Ofensiva ativa</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Questões Resolvidas</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">18 / 25</p>
          <p className="mt-2 text-[11px] text-muted font-medium">72% de acerto global</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Nível de XP</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-heading text-xl font-extrabold text-orange-500 tabular-nums">Nível 4</span>
            <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              480 XP
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted">Próximo nível a 1.000 XP</p>
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
            {tasksToRender.map((task, index) => (
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
            ))}
          </div>
        </section>

        {/* Right Utility Cards */}
        <div className="grid gap-4 content-start">
          {/* Continue Reading Recent Material */}
          <section className="rounded-2xl border border-line bg-card p-5 shadow-xs">
            <Eyebrow>Biblioteca de Leitura</Eyebrow>
            <h4 className="mt-1 font-heading text-base font-bold text-ink">Continuar Material Recente</h4>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-paper p-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 font-bold text-xs">
                PDF
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink">Constituicao-Federal-1988-CF88.pdf</p>
                <p className="mt-1 text-[11px] text-muted">Direito Constitucional · Pág. 42 de 120</p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-paper-deep">
                  <div className="h-full w-[35%] rounded-full bg-blue-600"></div>
                </div>
              </div>
            </div>
          </section>

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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}m ${remainingSeconds.toString().padStart(2, "0")}s`;
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
