import { useMemo, useState, useEffect } from "react";
import { getDesktopErrorMessage, getStudyProgress } from "../../shared/desktop/commands";
import type { StudyProgressSummary } from "../../shared/desktop/contracts";
import { buttonSecondaryClass, Eyebrow } from "../../shared/ui/primitives";

type ProgressViewProps = {
  refreshKey: number;
};

// Level definitions based on total XP
function calculateLevel(totalXp: number): {
  level: number;
  title: string;
  currentXpInLevel: number;
  xpRequiredForNextLevel: number;
  percent: number;
} {
  const xpPerLevel = 250;
  const level = Math.max(1, Math.floor(totalXp / xpPerLevel) + 1);
  const currentXpInLevel = totalXp % xpPerLevel;
  const xpRequiredForNextLevel = xpPerLevel;
  const percent = Math.min(100, Math.round((currentXpInLevel / xpPerLevel) * 100));

  const titles = [
    "Iniciante Dedicado",
    "Estudante Focado",
    "Concurseiro Estratégico",
    "Avançado no Ciclo",
    "Especialista do Edital",
    "Quase Nomeado",
    "Mestre dos Concursos",
  ];
  const title = titles[Math.min(level - 1, titles.length - 1)];

  return { level, title, currentXpInLevel, xpRequiredForNextLevel, percent };
}

export function ProgressView({ refreshKey }: ProgressViewProps) {
  const [summary, setSummary] = useState<StudyProgressSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getStudyProgress({ asOfDate: getLocalDateKey() })
      .then((loadedSummary) => {
        if (!cancelled) {
          setSummary(loadedSummary);
          setError(null);
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
  }, [refreshKey, retryVersion]);

  const levelInfo = useMemo(() => {
    return calculateLevel(summary?.totalXp ?? 0);
  }, [summary?.totalXp]);

  const subjectActivity = useMemo(() => {
    const activity = new Map<string, { name: string; sessions: number; effectiveSeconds: number }>();

    for (const session of summary?.recentSessions ?? []) {
      const name = session.subjectName || "Geral";
      const current = activity.get(name) ?? { name, sessions: 0, effectiveSeconds: 0 };
      activity.set(name, {
        name,
        sessions: current.sessions + 1,
        effectiveSeconds: current.effectiveSeconds + session.effectiveSeconds,
      });
    }

    return [...activity.values()].sort((left, right) => right.effectiveSeconds - left.effectiveSeconds);
  }, [summary?.recentSessions]);

  if (isLoading) {
    return <ProgressState message="Carregando dados de evolução local..." />;
  }

  if (error || !summary) {
    return (
      <ProgressState
        message={error ?? "Não foi possível carregar o histórico de evolução."}
        isError
        onRetry={() => setRetryVersion((current) => current + 1)}
      />
    );
  }

  return (
    <div className="grid gap-6">
      {/* 1. Hero Header Banner */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              Evolução & Desempenho
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              SQLite Local · 100% Offline e Privado
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Painel de Desempenho & Conquistas de Estudo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Acompanhe horas líquidas acumuladas, histórico local e evolução de nível de experiência.
            </p>
          </div>
        </div>
      </section>

      {/* 2. XP level and recent activity */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <section className="glass-card rounded-2xl p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <div>
                <Eyebrow>Sistema de Recompensas</Eyebrow>
                <h3 className="font-heading text-lg font-bold text-ink">Nível de Experiência</h3>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-extrabold text-orange-600 dark:text-orange-400">
                <span>Nível {levelInfo.level}</span>
                <span>★</span>
              </div>
            </div>

            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <p className="font-heading text-xl font-extrabold text-ink">
                  {levelInfo.title}
                </p>
                <span className="font-mono text-xs font-bold text-muted tabular-nums">
                  {levelInfo.currentXpInLevel} / {levelInfo.xpRequiredForNextLevel} XP
                </span>
              </div>

              {/* Visual XP Progress Bar */}
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-deep border border-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500 ease-out"
                  style={{ width: `${levelInfo.percent}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted font-medium">
                <span>{levelInfo.percent}% concluído para o Nível {levelInfo.level + 1}</span>
                <span className="text-orange-600 dark:text-orange-400 font-bold">
                  +{levelInfo.xpRequiredForNextLevel - levelInfo.currentXpInLevel} XP para avançar
                </span>
              </div>
            </div>
          </div>

        </section>

        <section className="glass-card rounded-2xl p-5 lg:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="border-b border-line pb-3 mb-4">
              <Eyebrow>Histórico Local</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Atividade Recente</h3>
            </div>

            {summary.recentSessions.length > 0 ? (
              <div className="grid gap-3">
                <p className="text-xs leading-relaxed text-muted">
                  O núcleo retornou {summary.recentSessions.length} registros recentes para este espaço.
                </p>
                <div className="rounded-xl border border-line bg-paper/60 p-3">
                  <p className="truncate text-xs font-bold text-ink">{summary.recentSessions[0].taskTitle}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {summary.recentSessions[0].subjectName || "Geral"} · {formatHistoryDate(summary.recentSessions[0].endedAt)}
                  </p>
                  <p className="mt-2 font-mono text-[11px] font-semibold text-blue-600">
                    {formatDuration(summary.recentSessions[0].effectiveSeconds)} de estudo efetivo
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                Ainda não há sessões concluídas para formar um histórico recente.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* 3. Metrics Row - 4 Tactile Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Total de Pontos XP</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-heading text-xl font-extrabold text-orange-500 tabular-nums">
              {summary.totalXp} XP
            </span>
            <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              Nível {levelInfo.level}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted">Pontos acumulados no espaço</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Sessões Concluídas</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {summary.completedSessions}
          </p>
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            Todas gravadas no SQLite
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Tempo Efetivo Total</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums font-mono">
            {formatDuration(summary.effectiveSeconds)}
          </p>
          <p className="mt-2 text-[11px] text-muted">Tempo líquido sem pausas</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Registros Recentes</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-blue-600 tabular-nums">
            {summary.recentSessions.length}
          </p>
          <p className="mt-2 text-[11px] text-muted font-medium">Sessões retornadas pelo núcleo</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Sequência planejada</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {summary.streak.currentPlannedDays} {summary.streak.currentPlannedDays === 1 ? "dia" : "dias"}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Recorde: {summary.streak.longestPlannedDays}. Conta tarefas concluídas ou parciais; dias sem tarefas são descanso.
          </p>
        </div>
      </div>

      {/* 4. Recent activity by subject */}
      <section className="glass-card rounded-2xl p-5 lg:p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <div>
            <Eyebrow>Atividade Registrada</Eyebrow>
            <h3 className="font-heading text-lg font-bold text-ink">Tempo por Disciplina</h3>
          </div>
          <span className="text-xs font-semibold text-muted">Somente histórico recente</span>
        </div>

        {subjectActivity.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjectActivity.map((activity) => (
              <div key={activity.name} className="rounded-xl border border-line bg-paper/60 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="truncate text-xs font-bold text-ink">{activity.name}</h4>
                  <span className="font-mono text-xs font-extrabold text-blue-600 tabular-nums">
                    {formatDuration(activity.effectiveSeconds)}
                  </span>
                </div>
                <p className="mt-2 text-[10px] font-medium text-muted">
                  {activity.sessions} {activity.sessions === 1 ? "sessão registrada" : "sessões registradas"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-xs text-muted">
            <p className="font-semibold text-ink">Ainda não há atividade por disciplina.</p>
            <p className="mt-1">Conclua uma sessão na tela Hoje para formar este resumo.</p>
          </div>
        )}
      </section>

      {/* 5. History of Recent Sessions */}
      <section className="glass-card rounded-2xl p-5 lg:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <Eyebrow>Histórico de Sessões</Eyebrow>
            <h3 className="font-heading text-lg font-bold text-ink">Registro de Estudos Concluídos</h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">
              {summary.recentSessions.length} sessões registradas
            </span>
          </div>
        </div>

        {summary.recentSessions.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {summary.recentSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-paper/70 p-4 transition-all duration-150 ease-out hover:border-blue-500/30 hover:bg-paper shadow-xs sm:flex-row sm:items-start"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 font-bold text-xs border border-blue-500/20">
                    ✓
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-bold text-xs text-ink">{session.taskTitle}</h4>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {session.subjectName || "Geral"} · {formatHistoryDate(session.endedAt)}
                    </p>
                    {(session.summaryMarkdown || session.difficulty || session.nextSteps) && (
                      <details className="mt-2 text-[11px]">
                        <summary className="cursor-pointer font-semibold text-blue-700 dark:text-blue-300">
                          Ver registro da sessão
                        </summary>
                        <div className="mt-2 grid gap-2 rounded-lg border border-line bg-card p-3 text-muted">
                          {session.difficulty && (
                            <p><strong className="text-ink">Dificuldade:</strong> {formatSessionDifficulty(session.difficulty)}</p>
                          )}
                          {session.summaryMarkdown && (
                            <div>
                              <p className="font-semibold text-ink">Resumo</p>
                              <p className="mt-1 whitespace-pre-wrap">{session.summaryMarkdown}</p>
                            </div>
                          )}
                          {session.nextSteps && (
                            <div>
                              <p className="font-semibold text-ink">Próximos passos</p>
                              <p className="mt-1 whitespace-pre-wrap">{session.nextSteps}</p>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs font-semibold">
                  <span className="font-mono text-muted tabular-nums bg-paper-deep px-2.5 py-1 rounded-lg border border-line">
                    {formatDuration(session.effectiveSeconds)}
                  </span>
                  <span className="rounded-full bg-orange-500/20 px-2.5 py-1 text-[11px] font-extrabold text-orange-600 dark:text-orange-400 border border-orange-500/30">
                    +{session.xpGranted} XP
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-paper p-8 text-center text-xs text-muted">
            <p className="font-semibold text-ink">Nenhuma sessão registrada ainda.</p>
            <p className="mt-1">Inicie e conclua sua primeira tarefa na tela "Hoje" para acumular horas e XP.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressState({
  message,
  isError = false,
  onRetry,
}: {
  message: string;
  isError?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section
      className={`grid min-h-[300px] content-center justify-items-start rounded-2xl border p-6 lg:p-8 ${
        isError ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-line bg-card shadow-xs text-muted"
      }`}
      aria-live="polite"
    >
      <Eyebrow>{isError ? "Erro" : "Carregando"}</Eyebrow>
      <p className="mt-3 text-sm leading-relaxed max-w-md">{message}</p>
      {isError && onRetry && (
        <button className={`${buttonSecondaryClass} mt-4 text-xs`} type="button" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes} min`;
}

function formatSessionDifficulty(difficulty: "easy" | "normal" | "hard"): string {
  if (difficulty === "easy") return "Fácil";
  if (difficulty === "hard") return "Difícil";
  return "Regular";
}

function getLocalDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
