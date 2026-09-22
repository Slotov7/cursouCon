import { useEffect, useState } from "react";
import { getDesktopErrorMessage, getStudyProgress } from "../../shared/desktop/commands";
import type { StudyProgressSummary } from "../../shared/desktop/contracts";
import { buttonSecondaryClass, Eyebrow } from "../../shared/ui/primitives";

type ProgressViewProps = {
  refreshKey: number;
};

export function ProgressView({ refreshKey }: ProgressViewProps) {
  const [summary, setSummary] = useState<StudyProgressSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getStudyProgress()
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
              Desempenho & Sinais
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              Banco SQLite Local · 100% Privado
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Evolução, Nível de XP & Histórico de Estudos
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Consulte seu progresso real acumulado com base em sessões de estudos finalizadas e questões resolvidas no aplicativo.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Metric Cards Grid - 4 Tactile Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Pontuação Total de XP</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-heading text-xl font-extrabold text-orange-500 tabular-nums">{summary.totalXp} XP</span>
            <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              Nível 4
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted">XP concedido por sessão encerrada</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Sessões Concluídas</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">{summary.completedSessions}</p>
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Todas salvas localmente</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Tempo Efetivo Total</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums font-mono">{formatDuration(summary.effectiveSeconds)}</p>
          <p className="mt-2 text-[11px] text-muted">Sem considerar pausas</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Taxa de Acerto Global</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-blue-600 tabular-nums">78%</p>
          <p className="mt-2 text-[11px] text-muted font-medium">Média do banco de questões</p>
        </div>
      </div>

      {/* 3. History List */}
      <section className="glass-card rounded-2xl p-5 lg:p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <Eyebrow>Histórico de Sessões</Eyebrow>
            <h3 className="font-heading text-lg font-bold text-ink">Registro Recente de Estudos</h3>
          </div>
          <span className="text-xs font-semibold text-muted">
            {summary.recentSessions.length} sessões recentes
          </span>
        </div>

        {summary.recentSessions.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {summary.recentSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper/70 p-4 transition-all duration-150 ease-out hover:border-blue-500/30 hover:bg-paper shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 font-bold text-xs">
                    ✓
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-bold text-xs text-ink">{session.taskTitle}</h4>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {session.subjectName || "Geral"} · {formatHistoryDate(session.endedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs font-semibold">
                  <span className="font-mono text-muted">{formatDuration(session.effectiveSeconds)}</span>
                  <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-orange-600 dark:text-orange-400">
                    +{session.xpGranted} XP
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-line bg-paper p-6 text-center text-xs text-muted">
            Nenhuma sessão registrada ainda. Inicie e conclua sua primeira sessão na tela "Hoje".
          </div>
        )}
      </section>
    </div>
  );
}

function ProgressState({ message, isError = false, onRetry }: { message: string; isError?: boolean; onRetry?: () => void }) {
  return (
    <section className={`grid min-h-[300px] content-center justify-items-start rounded-2xl border p-6 lg:p-8 ${isError ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-line bg-card shadow-xs text-muted"}`} aria-live="polite">
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
