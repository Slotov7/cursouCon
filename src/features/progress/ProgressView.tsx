import { useMemo, useState, useEffect } from "react";
import {
  createExternalQuestionBatch,
  correctStudySessionDuration,
  createManualStudy,
  getDesktopErrorMessage,
  getExternalQuestionBatches,
  getQuestionPerformance,
  getStudyPlan,
  getStudyProgress,
} from "../../shared/desktop/commands";
import type {
  ExternalQuestionBatchSummary,
  QuestionPerformanceSummary,
  StudyHistoryEntry,
  StudyPlan,
  StudyProgressSummary,
  StudySessionDifficulty,
} from "../../shared/desktop/contracts";
import { dateKeyForTimezone } from "../../shared/date";
import {
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
  selectClass,
  textareaClass,
} from "../../shared/ui/primitives";

type ProgressViewProps = {
  refreshKey: number;
  showGamification: boolean;
  timezone: string;
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

export function ProgressView({ refreshKey, showGamification, timezone }: ProgressViewProps) {
  const [summary, setSummary] = useState<StudyProgressSummary | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDate, setManualDate] = useState(() => dateKeyForTimezone(timezone));
  const [manualMinutes, setManualMinutes] = useState("30");
  const [manualSubjectId, setManualSubjectId] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualDifficulty, setManualDifficulty] = useState<StudySessionDifficulty | "">("");
  const [manualNextSteps, setManualNextSteps] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [correctionMinutes, setCorrectionMinutes] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [questionPerformance, setQuestionPerformance] = useState<QuestionPerformanceSummary | null>(null);
  const [externalBatches, setExternalBatches] = useState<ExternalQuestionBatchSummary[]>([]);
  const [questionMetricsError, setQuestionMetricsError] = useState<string | null>(null);
  const [isQuestionMetricsLoading, setIsQuestionMetricsLoading] = useState(true);
  const [isExternalFormOpen, setIsExternalFormOpen] = useState(false);
  const [externalDate, setExternalDate] = useState(() => dateKeyForTimezone(timezone));
  const [externalSource, setExternalSource] = useState("");
  const [externalSubjectId, setExternalSubjectId] = useState("");
  const [externalAnswered, setExternalAnswered] = useState("");
  const [externalCorrect, setExternalCorrect] = useState("");
  const [isSavingExternal, setIsSavingExternal] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getStudyProgress({ asOfDate: dateKeyForTimezone(timezone) })
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

    getStudyPlan()
      .then((loadedPlan) => {
        if (!cancelled) setPlan(loadedPlan);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      });

    setIsQuestionMetricsLoading(true);
    Promise.all([getQuestionPerformance(new Date().toISOString().slice(0, 10)), getExternalQuestionBatches()])
      .then(([performance, batches]) => {
        if (!cancelled) {
          setQuestionPerformance(performance);
          setExternalBatches(batches);
          setQuestionMetricsError(null);
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setQuestionMetricsError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setIsQuestionMetricsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, retryVersion, timezone]);

  const levelInfo = useMemo(() => {
    return calculateLevel(summary?.totalXp ?? 0);
  }, [summary?.totalXp]);

  const primaryPreparation = plan?.preparations.find((preparation) => preparation.isPrimary) ?? plan?.preparations[0];
  const availableSubjects = plan?.subjects.filter(
    (subject) => subject.preparationId === primaryPreparation?.id,
  ) ?? [];

  const handleCreateManualStudy = async () => {
    const minutes = Number(manualMinutes);
    if (!primaryPreparation) {
      setActionError("Cadastre uma preparação antes de registrar um estudo manual.");
      return;
    }
    if (!manualTitle.trim() || !Number.isInteger(minutes) || minutes < 1 || minutes > 10_080) {
      setActionError("Informe título e uma duração entre 1 e 10.080 minutos.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsSavingManual(true);
    try {
      const result = await createManualStudy({
        preparationId: primaryPreparation.id,
        subjectId: manualSubjectId || null,
        title: manualTitle,
        studiedOn: manualDate,
        effectiveSeconds: minutes * 60,
        summaryMarkdown: manualSummary.trim() ? manualSummary : null,
        difficulty: manualDifficulty || null,
        nextSteps: manualNextSteps.trim() ? manualNextSteps : null,
      });
      setActionMessage(
        showGamification && result.xpGranted > 0
          ? `Estudo manual registrado. +${result.xpGranted} XP.`
          : "Estudo manual registrado.",
      );
      setIsManualFormOpen(false);
      setManualTitle("");
      setManualSummary("");
      setManualNextSteps("");
      setManualDifficulty("");
      setRetryVersion((current) => current + 1);
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleCreateExternalBatch = async () => {
    const answeredCount = Number(externalAnswered);
    const correctCount = Number(externalCorrect);
    if (!primaryPreparation) {
      setActionError("Cadastre uma preparação antes de registrar questões externas.");
      return;
    }
    if (!externalDate || !Number.isInteger(answeredCount) || answeredCount < 1 ||
      !Number.isInteger(correctCount) || correctCount < 0 || correctCount > answeredCount) {
      setActionError("Informe data, número de respondidas acima de zero e acertos entre zero e o total respondido.");
      return;
    }
    setActionError(null);
    setActionMessage(null);
    setIsSavingExternal(true);
    try {
      await createExternalQuestionBatch({
        preparationId: primaryPreparation.id,
        subjectId: externalSubjectId || null,
        sourceName: externalSource.trim() || null,
        studiedOn: externalDate,
        answeredCount,
        correctCount,
      });
      setIsExternalFormOpen(false);
      setExternalSource("");
      setExternalAnswered("");
      setExternalCorrect("");
      setActionMessage("Lote externo salvo localmente, separado das tentativas individuais e sem XP.");
      setRetryVersion((current) => current + 1);
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSavingExternal(false);
    }
  };

  const startDurationCorrection = (session: StudyHistoryEntry) => {
    setEditingSessionId(session.sessionId);
    setCorrectionMinutes(Math.round(session.effectiveSeconds / 60).toString());
    setCorrectionReason("");
    setActionError(null);
    setActionMessage(null);
  };

  const handleCorrectDuration = async (session: StudyHistoryEntry) => {
    const minutes = Number(correctionMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10_080) {
      setActionError("Informe uma duração entre 0 e 10.080 minutos.");
      return;
    }
    if (!correctionReason.trim()) {
      setActionError("Informe o motivo da correção para manter o histórico auditável.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsSavingCorrection(true);
    try {
      const result = await correctStudySessionDuration({
        sessionId: session.sessionId,
        effectiveSeconds: minutes * 60,
        reason: correctionReason,
      });
      const deltaMessage = !showGamification
        ? "Duração corrigida; o painel de gamificação está oculto."
        : result.xpDelta === 0
          ? "O XP não mudou."
          : `Variação de XP: ${result.xpDelta > 0 ? "+" : ""}${result.xpDelta}.`;
      setActionMessage(`Duração corrigida. ${deltaMessage}`);
      setEditingSessionId(null);
      setCorrectionReason("");
      setRetryVersion((current) => current + 1);
    } catch (operationError: unknown) {
      setActionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSavingCorrection(false);
    }
  };

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

          <button
            type="button"
            className={`${buttonPrimaryClass} justify-self-start`}
            onClick={() => {
              setIsManualFormOpen((current) => !current);
              setActionError(null);
              setActionMessage(null);
            }}
          >
            {isManualFormOpen ? "Fechar registro manual" : "Registrar estudo manual"}
          </button>
          <button
            type="button"
            className={`${buttonSecondaryClass} justify-self-start`}
            onClick={() => {
              setIsExternalFormOpen((current) => !current);
              setActionError(null);
              setActionMessage(null);
            }}
          >
            {isExternalFormOpen ? "Fechar lote externo" : "Registrar questões externas"}
          </button>
        </div>
      </section>

      {actionError ? (
        <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-forest-ink" role="status">
          {actionMessage}
        </p>
      ) : null}

      {isManualFormOpen ? (
        <section className="glass-card rounded-2xl p-5 lg:p-6" aria-labelledby="manual-study-heading">
          <div className="border-b border-line pb-3">
            <Eyebrow>Registro auditável</Eyebrow>
            <h3 id="manual-study-heading" className="mt-1 font-heading text-lg font-bold text-ink">
              Estudo realizado fora do cronômetro
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Use para registrar leitura, aula ou revisão feita fora do app. O tempo entra nas métricas e recebe XP uma única vez.
            </p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={fieldClass} htmlFor="manual-study-title">
              Título
              <input
                id="manual-study-title"
                className={inputClass}
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Ex.: Revisão de anotações"
                disabled={isSavingManual}
              />
            </label>
            <label className={fieldClass} htmlFor="manual-study-date">
              Data do estudo
              <input
                id="manual-study-date"
                className={inputClass}
                type="date"
                value={manualDate}
                onChange={(event) => setManualDate(event.target.value)}
                disabled={isSavingManual}
              />
            </label>
            <label className={fieldClass} htmlFor="manual-study-minutes">
              Duração efetiva (minutos)
              <input
                id="manual-study-minutes"
                className={inputClass}
                type="number"
                min="1"
                max="10080"
                step="1"
                value={manualMinutes}
                onChange={(event) => setManualMinutes(event.target.value)}
                disabled={isSavingManual}
              />
            </label>
            <label className={fieldClass} htmlFor="manual-study-subject">
              Assunto <span className="font-normal text-muted">(opcional)</span>
              <select
                id="manual-study-subject"
                className={selectClass}
                value={manualSubjectId}
                onChange={(event) => setManualSubjectId(event.target.value)}
                disabled={isSavingManual}
              >
                <option value="">Geral da preparação</option>
                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label className={fieldClass} htmlFor="manual-study-difficulty">
              Dificuldade percebida <span className="font-normal text-muted">(opcional)</span>
              <select
                id="manual-study-difficulty"
                className={selectClass}
                value={manualDifficulty}
                onChange={(event) => setManualDifficulty(event.target.value as StudySessionDifficulty | "")}
                disabled={isSavingManual}
              >
                <option value="">Não informar</option>
                <option value="easy">Fácil</option>
                <option value="normal">Regular</option>
                <option value="hard">Difícil</option>
              </select>
            </label>
            <label className={`${fieldClass} sm:col-span-2`} htmlFor="manual-study-summary">
              Resumo <span className="font-normal text-muted">(opcional)</span>
              <textarea
                id="manual-study-summary"
                className={textareaClass}
                rows={3}
                value={manualSummary}
                onChange={(event) => setManualSummary(event.target.value)}
                placeholder="O que foi estudado?"
                disabled={isSavingManual}
              />
            </label>
            <label className={`${fieldClass} sm:col-span-2`} htmlFor="manual-study-next-steps">
              Próximos passos <span className="font-normal text-muted">(opcional)</span>
              <textarea
                id="manual-study-next-steps"
                className={textareaClass}
                rows={2}
                value={manualNextSteps}
                onChange={(event) => setManualNextSteps(event.target.value)}
                placeholder="O que revisar depois?"
                disabled={isSavingManual}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={buttonQuietClass} onClick={() => setIsManualFormOpen(false)} disabled={isSavingManual}>
              Cancelar
            </button>
            <button type="button" className={buttonPrimaryClass} onClick={handleCreateManualStudy} disabled={isSavingManual}>
              {isSavingManual ? "Registrando..." : "Salvar estudo manual"}
            </button>
          </div>
        </section>
      ) : null}

      {isExternalFormOpen && (
        <section className="glass-card rounded-2xl p-5 lg:p-6" aria-labelledby="external-batch-heading">
          <div className="border-b border-line pb-3">
            <Eyebrow>Resolução fora do app</Eyebrow>
            <h3 id="external-batch-heading" className="mt-1 font-heading text-lg font-bold text-ink">Lote de questões respondidas</h3>
            <p className="mt-2 text-xs text-muted">Registre apenas totais conhecidos. Este lote não cria tentativas individuais nem concede XP.</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={fieldClass}>
              Data da resolução
              <input className={inputClass} type="date" value={externalDate} onChange={(event) => setExternalDate(event.target.value)} disabled={isSavingExternal} />
            </label>
            <label className={fieldClass}>
              Assunto <span className="font-normal text-muted">(opcional)</span>
              <select className={selectClass} value={externalSubjectId} onChange={(event) => setExternalSubjectId(event.target.value)} disabled={isSavingExternal}>
                <option value="">Geral da preparação</option>
                {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label className={fieldClass}>
              Questões respondidas
              <input className={inputClass} type="number" min="1" step="1" value={externalAnswered} onChange={(event) => setExternalAnswered(event.target.value)} disabled={isSavingExternal} placeholder="Ex.: 40" />
            </label>
            <label className={fieldClass}>
              Acertos
              <input className={inputClass} type="number" min="0" step="1" max={externalAnswered || undefined} value={externalCorrect} onChange={(event) => setExternalCorrect(event.target.value)} disabled={isSavingExternal} placeholder="Ex.: 28" />
            </label>
            <label className={`${fieldClass} sm:col-span-2`}>
              Origem <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={externalSource} onChange={(event) => setExternalSource(event.target.value)} maxLength={160} disabled={isSavingExternal} placeholder="Ex.: Caderno impresso" />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" className={buttonQuietClass} onClick={() => setIsExternalFormOpen(false)} disabled={isSavingExternal}>Cancelar</button>
            <button type="button" className={buttonPrimaryClass} onClick={() => void handleCreateExternalBatch()} disabled={isSavingExternal}>
              {isSavingExternal ? "Salvando..." : "Salvar lote externo"}
            </button>
          </div>
        </section>
      )}

      <section className="glass-card rounded-2xl p-5 lg:p-6" aria-labelledby="question-performance-title">
        <div className="border-b border-line pb-3">
          <Eyebrow>Questões</Eyebrow>
          <h3 id="question-performance-title" className="mt-1 font-heading text-lg font-bold text-ink">Desempenho por origem</h3>
          <p className="mt-1 text-xs text-muted">
            {questionPerformance ? `Acumulado até ${questionPerformance.asOfDate}. ` : ""}
            Tentativas individuais usam data UTC e o resultado registrado na época; anuladas, respostas em branco e pendentes não entram nas taxas.
          </p>
        </div>
        {isQuestionMetricsLoading ? (
          <p className="mt-4 text-sm text-muted" aria-live="polite">Carregando indicadores de questões...</p>
        ) : questionMetricsError ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-danger" role="alert">
            <span>{questionMetricsError}</span>
            <button type="button" className={buttonSecondaryClass} onClick={() => setRetryVersion((current) => current + 1)}>Tentar novamente</button>
          </div>
        ) : questionPerformance && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <QuestionMetric label="Primeiras tentativas" correct={questionPerformance.firstAttemptCorrect} total={questionPerformance.firstAttemptGraded} detail="Tentativas avaliadas pela primeira vez" />
              <QuestionMetric label="Repetições" correct={questionPerformance.repeatCorrect} total={questionPerformance.repeatGraded} detail="Novas respostas à mesma questão" />
              <QuestionMetric label="Lotes externos" correct={questionPerformance.externalCorrect} total={questionPerformance.externalAnswered} detail={`${questionPerformance.externalBatches} lote(s) registrados`} />
            </div>
            {externalBatches.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h4 className="text-sm font-bold text-ink">Lotes externos recentes (até 20)</h4>
                <ul className="mt-2 grid gap-2">
                  {externalBatches.map((batch) => (
                    <li key={batch.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-paper/50 px-3 py-2 text-xs text-ink">
                      <span>{batch.studiedOn.split("-").reverse().join("/")} · {batch.preparationName}{batch.subjectName ? ` · ${batch.subjectName}` : ""}{batch.sourceName ? ` · ${batch.sourceName}` : ""}</span>
                      <strong>{batch.correctCount} / {batch.answeredCount} acertos</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* 2. XP level and recent activity */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        {showGamification && (
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
        )}

        <section className={`glass-card rounded-2xl p-5 lg:p-6 shadow-xs flex flex-col justify-between ${showGamification ? "" : "lg:col-span-2"}`}>
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
        {showGamification && (
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
        )}

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
                className="grid gap-4 rounded-2xl border border-line bg-paper/70 p-4 transition-all duration-150 ease-out hover:border-blue-500/30 hover:bg-paper shadow-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 font-bold text-xs border border-blue-500/20">
                    ✓
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-bold text-xs text-ink">{session.taskTitle}</h4>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {session.subjectName || "Geral"} · {formatHistoryDate(session.endedAt)} · {session.origin === "manual" ? "registro manual" : "cronômetro"}
                    </p>
                    {session.durationCorrectionCount > 0 ? (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        Duração corrigida {session.durationCorrectionCount}x
                        {session.lastDurationCorrectionAt ? ` · ${formatHistoryDate(session.lastDurationCorrectionAt)}` : ""}
                      </p>
                    ) : null}
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
                  <button
                    type="button"
                    className={`${buttonQuietClass} px-2.5 py-1 text-[11px]`}
                    onClick={() => startDurationCorrection(session)}
                    disabled={isSavingCorrection}
                  >
                    Corrigir duração
                  </button>
                </div>
                {editingSessionId === session.sessionId ? (
                  <div className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:col-span-2 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end">
                    <label className={fieldClass} htmlFor={`correction-minutes-${session.sessionId}`}>
                      Duração (minutos)
                      <input
                        id={`correction-minutes-${session.sessionId}`}
                        className={inputClass}
                        type="number"
                        min="0"
                        max="10080"
                        step="1"
                        value={correctionMinutes}
                        onChange={(event) => setCorrectionMinutes(event.target.value)}
                        disabled={isSavingCorrection}
                      />
                    </label>
                    <label className={fieldClass} htmlFor={`correction-reason-${session.sessionId}`}>
                      Motivo da correção
                      <input
                        id={`correction-reason-${session.sessionId}`}
                        className={inputClass}
                        value={correctionReason}
                        onChange={(event) => setCorrectionReason(event.target.value)}
                        placeholder="Ex.: cronômetro ficou aberto"
                        disabled={isSavingCorrection}
                      />
                    </label>
                    <div className="flex gap-2 sm:justify-end">
                      <button type="button" className={buttonQuietClass} onClick={() => setEditingSessionId(null)} disabled={isSavingCorrection}>
                        Cancelar
                      </button>
                      <button type="button" className={buttonSecondaryClass} onClick={() => handleCorrectDuration(session)} disabled={isSavingCorrection}>
                        {isSavingCorrection ? "Salvando..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                ) : null}
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

function QuestionMetric({ label, correct, total, detail }: {
  label: string;
  correct: number;
  total: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-4">
      <p className="text-xs font-bold text-ink">{label}</p>
      <p className="mt-2 font-heading text-xl font-extrabold text-blue-600">
        {total > 0 ? `${Math.round(correct * 100 / total)}%` : "Sem amostra"}
      </p>
      <p className="mt-1 text-xs text-muted">{correct} acertos / {total} respondidas avaliadas</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </div>
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

function formatHistoryDate(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
