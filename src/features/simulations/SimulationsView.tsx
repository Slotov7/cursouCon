import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  answerSimulation,
  createSimulation,
  createStudyTask,
  finishSimulation,
  getDesktopErrorMessage,
  getSimulation,
  getSimulationResult,
  getSimulations,
  pauseSimulation,
  resumeSimulation,
  startSimulation,
} from "../../shared/desktop/commands";
import type {
  CreateSimulationRequest,
  SimulationDetail,
  SimulationDiagnosticSummary,
  SimulationMode,
  SimulationQuestionSummary,
  SimulationResult,
  SimulationSubjectSelectionRequest,
  SimulationStatus,
  SimulationSummary,
  StudyPlan,
} from "../../shared/desktop/contracts";
import { dateKeyForTimezone } from "../../shared/date";
import { MarkdownContent } from "../../shared/ui/MarkdownContent";
import {
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
  selectClass,
} from "../../shared/ui/primitives";

type SimulationsViewProps = {
  plan: StudyPlan | null;
  refreshKey: number;
  timezone: string;
};

type DistributionRow = {
  subjectId: string;
  questionCount: string;
  weight: string;
};

const STATUS_LABELS: Record<SimulationStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  paused: "Pausado",
  completed: "Finalizado",
};

const MODE_LABELS: Record<SimulationMode, string> = {
  training: "Treino",
  exam: "Prova",
};

export function SimulationsView({ plan, refreshKey, timezone }: SimulationsViewProps) {
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SimulationDetail | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [recoveryBusySubjectId, setRecoveryBusySubjectId] = useState<string | null>(null);
  const [recoveryAddedSubjectIds, setRecoveryAddedSubjectIds] = useState<Set<string>>(() => new Set());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [title, setTitle] = useState("Simulado de treino");
  const [mode, setMode] = useState<SimulationMode>("training");
  const [questionCount, setQuestionCount] = useState("20");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("120");
  const [negativePoints, setNegativePoints] = useState("0");
  const [blankPoints, setBlankPoints] = useState("0");
  const [annulledPoints, setAnnulledPoints] = useState("0");
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const questionStartedAt = useRef(Date.now());

  const primaryPreparation =
    plan?.preparations.find((preparation) => preparation.isPrimary) ?? plan?.preparations[0] ?? null;
  const availableSubjects = plan?.subjects.filter(
    (subject) => subject.preparationId === primaryPreparation?.id,
  ) ?? [];
  const currentQuestion = detail?.questions[currentQuestionIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getSimulations()
      .then((loadedSimulations) => {
        if (cancelled) return;
        setSimulations(loadedSimulations);
        setSelectedSimulationId((currentId) =>
          currentId && loadedSimulations.some((simulation) => simulation.id === currentId)
            ? currentId
            : loadedSimulations[0]?.id ?? null,
        );
        setError(null);
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, retryVersion]);

  useEffect(() => {
    if (!selectedSimulationId) {
      setDetail(null);
      setResult(null);
      return;
    }
    let cancelled = false;
    setIsDetailLoading(true);
    getSimulation(selectedSimulationId)
      .then(async (loadedDetail) => {
        const loadedResult = loadedDetail.simulation.status === "completed"
          ? await getSimulationResult(selectedSimulationId)
          : null;
        if (cancelled) return;
        setDetail(loadedDetail);
        setResult(loadedResult);
        setCurrentQuestionIndex(0);
        setError(null);
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setIsDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSimulationId, refreshKey]);

  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [detail?.simulation.id, currentQuestion?.questionId]);

  const updateFromDetail = (updatedDetail: SimulationDetail) => {
    setDetail(updatedDetail);
    setSimulations((previous) =>
      previous.map((simulation) =>
        simulation.id === updatedDetail.simulation.id ? updatedDetail.simulation : simulation,
      ),
    );
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    if (!primaryPreparation) {
      setFormError("Cadastre uma preparação antes de criar um simulado.");
      return;
    }

    const normalizedTitle = title.trim();
    const parsedQuestionCount = Number(questionCount);
    const parsedTimeLimit = Number(timeLimitMinutes);
    const parsedNegativePoints = Number(negativePoints.replace(",", "."));
    const parsedBlankPoints = Number(blankPoints.replace(",", "."));
    const parsedAnnulledPoints = Number(annulledPoints.replace(",", "."));
    if (
      !normalizedTitle ||
      !Number.isInteger(parsedQuestionCount) ||
      parsedQuestionCount < 1 ||
      parsedQuestionCount > 500
    ) {
      setFormError("Informe um título e uma quantidade entre 1 e 500 questões.");
      return;
    }
    if (mode === "exam" && (!Number.isInteger(parsedTimeLimit) || parsedTimeLimit < 1 || parsedTimeLimit > 10080)) {
      setFormError("A prova precisa de um tempo inteiro entre 1 minuto e 7 dias.");
      return;
    }
    if ([parsedNegativePoints, parsedBlankPoints, parsedAnnulledPoints].some((value) => !Number.isFinite(value) || value < 0 || value > 10)) {
      setFormError("As pontuações de erro, branco e anulada precisam ficar entre 0 e 10.");
      return;
    }
    const subjectSelections: SimulationSubjectSelectionRequest[] = [];
    let distributionTotal = 0;
    const selectedSubjectIds = new Set<string>();
    for (const row of distribution) {
      const parsedCount = Number(row.questionCount);
      const parsedWeight = Number(row.weight.replace(",", "."));
      if (!row.subjectId || selectedSubjectIds.has(row.subjectId) || !Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 500 || !Number.isFinite(parsedWeight) || parsedWeight < 0.1 || parsedWeight > 10) {
        setFormError("Revise a distribuição: cada assunto precisa ser único, ter quantidade válida e peso entre 0,1 e 10.");
        return;
      }
      selectedSubjectIds.add(row.subjectId);
      distributionTotal += parsedCount;
      subjectSelections.push({ subjectId: row.subjectId, questionCount: parsedCount, weight: parsedWeight });
    }
    if (distribution.length > 0 && distributionTotal !== parsedQuestionCount) {
      setFormError("A soma da distribuição por assunto precisa ser igual à quantidade de questões.");
      return;
    }

    const request: CreateSimulationRequest = {
      preparationId: primaryPreparation.id,
      title: normalizedTitle,
      mode,
      questionCount: parsedQuestionCount,
      timeLimitSeconds: mode === "exam" ? parsedTimeLimit * 60 : null,
      negativePoints: parsedNegativePoints,
      blankPoints: parsedBlankPoints,
      annulledPoints: parsedAnnulledPoints,
      questionType: null,
      subjectSelections,
    };

    setIsCreating(true);
    try {
      const created = await createSimulation(request);
      setSimulations((previous) => [created.simulation, ...previous]);
      setSelectedSimulationId(created.simulation.id);
      setDetail(created);
      setResult(null);
      setCurrentQuestionIndex(0);
      setIsFormOpen(false);
      setMessage("Simulado criado localmente com um conjunto fixo de questões.");
    } catch (operationError: unknown) {
      setFormError(getDesktopErrorMessage(operationError));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSimulationAction = async (action: "start" | "pause" | "resume" | "finish") => {
    if (!detail) return;
    const simulationId = detail.simulation.id;
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      if (action === "finish") {
        const finished = await finishSimulation(simulationId);
        setResult(finished);
        updateFromDetail(finished.detail);
        setMessage("Simulado finalizado. O gabarito e o diagnóstico foram liberados.");
      } else {
        const updated = action === "pause"
          ? await pauseSimulation(simulationId)
          : action === "resume"
            ? await resumeSimulation(simulationId)
            : await startSimulation(simulationId);
        updateFromDetail(updated);
        setMessage(action === "pause" ? "Simulado pausado." : "Simulado em andamento.");
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectAnswer = async (selectedKey: string | null) => {
    if (!detail || !currentQuestion || detail.simulation.status !== "in_progress") return;
    setBusyAction(`answer:${currentQuestion.questionId}`);
    setError(null);
    try {
      const updated = await answerSimulation({
        simulationId: detail.simulation.id,
        questionId: currentQuestion.questionId,
        selectedKey,
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - questionStartedAt.current) / 1000)),
      });
      updateFromDetail(updated);
      setMessage("Resposta salva localmente.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateRecoveryTask = async (
    diagnostic: SimulationDiagnosticSummary,
    simulation: SimulationSummary,
  ) => {
    const subjectId = diagnostic.subjectId;
    const recoveryKey = subjectId ? `${simulation.id}:${subjectId}` : null;
    if (!subjectId || !recoveryKey || recoveryBusySubjectId || recoveryAddedSubjectIds.has(recoveryKey)) return;
    setRecoveryBusySubjectId(recoveryKey);
    setError(null);
    try {
      await createStudyTask({
        preparationId: simulation.preparationId,
        subjectId,
        materialId: null,
        title: `Recuperação: ${diagnostic.subjectName ?? "assunto"}`,
        objective: `Revisar o diagnóstico do simulado "${simulation.title}" (${diagnostic.correctCount}/${diagnostic.questionCount} acertos).`,
        plannedMinutes: 30,
        scheduledFor: dateKeyForTimezone(timezone),
      });
      setRecoveryAddedSubjectIds((previous) => new Set(previous).add(recoveryKey));
      setMessage("Tarefa de recuperação adicionada ao plano para hoje.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setRecoveryBusySubjectId(null);
    }
  };

  const openNewForm = () => {
    setFormError(null);
    setMessage(null);
    setTitle("Simulado de treino");
    setMode("training");
    setQuestionCount("20");
    setTimeLimitMinutes("120");
    setNegativePoints("0");
    setBlankPoints("0");
    setAnnulledPoints("0");
    setDistribution([]);
    setIsFormOpen(true);
  };

  const addDistributionRow = () => {
    const subject = availableSubjects.find(
      (candidate) => !distribution.some((row) => row.subjectId === candidate.id),
    );
    if (!subject) return;
    setDistribution((previous) => [
      ...previous,
      { subjectId: subject.id, questionCount: "1", weight: "1" },
    ]);
  };

  return (
    <div className="grid gap-6">
      <section className="glass-hero relative overflow-hidden rounded-3xl border border-white/12 p-6 text-white shadow-xl lg:p-8">
        <div className="relative z-10 grid max-w-4xl gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300">
              Simulados offline
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              {simulations.length} {simulations.length === 1 ? "simulado salvo" : "simulados salvos"}
            </span>
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-white lg:text-3xl">
              Treine no ritmo da prova
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/85">
              Monte uma seleção objetiva a partir do seu banco local. As questões são congeladas no momento da criação e o gabarito só aparece após a finalização.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="button" onClick={openNewForm} className={buttonPrimaryClass}>
              + Novo simulado
            </button>
            <span className="text-xs text-slate-300/75">
              Treino pode ser pausado; prova mantém o relógio correndo.
            </span>
          </div>
        </div>
      </section>

      {error && <InlineNotice tone="error" message={error} onClose={() => setError(null)} />}
      {message && <InlineNotice tone="success" message={message} onClose={() => setMessage(null)} />}

      {isFormOpen && (
        <section className="grid gap-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5" aria-labelledby="new-simulation-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>Configuração local</Eyebrow>
              <h3 id="new-simulation-title" className="mt-1 font-heading text-lg font-bold text-ink">
                Criar simulado
              </h3>
            </div>
            <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)}>
              Fechar
            </button>
          </div>
          <form className="grid gap-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className={fieldClass}>
                Título
                <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
              </label>
              <label className={fieldClass}>
                Modo
                <select className={selectClass} value={mode} onChange={(event) => setMode(event.target.value as SimulationMode)}>
                  <option value="training">Treino</option>
                  <option value="exam">Prova com tempo</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={fieldClass}>
                Questões
                <input className={inputClass} type="number" min="1" max="500" value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} />
              </label>
              <label className={fieldClass}>
                Tempo em minutos
                <input className={inputClass} type="number" min="1" max="10080" value={timeLimitMinutes} onChange={(event) => setTimeLimitMinutes(event.target.value)} disabled={mode !== "exam"} />
              </label>
              <label className={fieldClass}>
                Penalidade por erro
                <input className={inputClass} inputMode="decimal" value={negativePoints} onChange={(event) => setNegativePoints(event.target.value)} />
              </label>
              <label className={fieldClass}>
                Pontos do branco
                <input className={inputClass} inputMode="decimal" value={blankPoints} onChange={(event) => setBlankPoints(event.target.value)} />
              </label>
              <label className={fieldClass}>
                Pontos da anulada
                <input className={inputClass} inputMode="decimal" value={annulledPoints} onChange={(event) => setAnnulledPoints(event.target.value)} />
              </label>
            </div>
            <section className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="simulation-distribution-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p id="simulation-distribution-title" className="text-xs font-bold text-ink">Distribuição por assunto</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">Sem linhas, o núcleo considera todos os assuntos da preparação. Com linhas, a soma precisa fechar a quantidade total.</p>
                </div>
                <button type="button" className={buttonSecondaryClass} onClick={addDistributionRow} disabled={availableSubjects.length === distribution.length}>+ Adicionar assunto</button>
              </div>
              {distribution.length === 0 ? (
                <p className="text-xs text-muted">Nenhuma distribuição definida.</p>
              ) : (
                <div className="grid gap-2">
                  {distribution.map((row, index) => (
                    <div key={`${row.subjectId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_110px_auto] sm:items-end">
                      <label className={fieldClass}>
                        Assunto
                        <select className={selectClass} value={row.subjectId} onChange={(event) => setDistribution((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, subjectId: event.target.value } : item))}>
                          {availableSubjects.map((subject) => <option key={subject.id} value={subject.id} disabled={distribution.some((item, itemIndex) => itemIndex !== index && item.subjectId === subject.id)}>{subject.name}</option>)}
                        </select>
                      </label>
                      <label className={fieldClass}>
                        Questões
                        <input className={inputClass} type="number" min="1" max="500" value={row.questionCount} onChange={(event) => setDistribution((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, questionCount: event.target.value } : item))} />
                      </label>
                      <label className={fieldClass}>
                        Peso
                        <input className={inputClass} inputMode="decimal" value={row.weight} onChange={(event) => setDistribution((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, weight: event.target.value } : item))} />
                      </label>
                      <button type="button" className={buttonQuietClass} onClick={() => setDistribution((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <p className="text-xs leading-relaxed text-muted">Discursivas ficam fora desta configuração até o fluxo de correção ser concluído.</p>
            {formError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{formError}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)} disabled={isCreating}>Cancelar</button>
              <button type="submit" className={buttonPrimaryClass} disabled={isCreating}>{isCreating ? "Criando..." : "Criar simulado"}</button>
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section className="grid content-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-xs" aria-labelledby="simulation-list-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>Histórico local</Eyebrow>
              <h3 id="simulation-list-title" className="mt-1 font-heading text-lg font-bold text-ink">Seus simulados</h3>
            </div>
            {isLoading && <span className="text-[11px] text-muted">Carregando...</span>}
          </div>
          {!isLoading && simulations.length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-paper/60 p-5 text-center">
              <p className="text-sm font-semibold text-ink">Nenhum simulado ainda.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Crie o primeiro para congelar uma bateria de questões do seu banco local.</p>
              <button type="button" className={`${buttonSecondaryClass} mt-4`} onClick={openNewForm}>Criar agora</button>
            </div>
          )}
          <div className="grid max-h-[620px] gap-2 overflow-y-auto pr-1">
            {simulations.map((simulation) => {
              const isSelected = simulation.id === selectedSimulationId;
              return (
                <button
                  key={simulation.id}
                  type="button"
                  onClick={() => setSelectedSimulationId(simulation.id)}
                  className={`grid gap-2 rounded-xl border p-3 text-left transition-colors ${isSelected ? "border-blue-500/50 bg-blue-500/10" : "border-line bg-paper/60 hover:border-muted/60 hover:bg-paper"}`}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-bold text-ink">{simulation.title}</span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">{MODE_LABELS[simulation.mode]}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{simulation.answeredCount}/{simulation.questionCount} respondidas</span>
                    <span className={simulation.status === "completed" ? "text-emerald-600" : "text-blue-600"}>{STATUS_LABELS[simulation.status]}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {!isLoading && error && (
            <button type="button" className={`${buttonSecondaryClass} w-full`} onClick={() => setRetryVersion((version) => version + 1)}>Tentar novamente</button>
          )}
        </section>

        <section className="min-w-0">
          {isDetailLoading ? (
            <div className="rounded-2xl border border-line bg-card p-12 text-center text-sm text-muted">Carregando simulado...</div>
          ) : detail ? (
            <SimulationRunner
              detail={detail}
              result={result}
              currentQuestionIndex={currentQuestionIndex}
              currentQuestion={currentQuestion}
              busyAction={busyAction}
              onAction={handleSimulationAction}
              onSelectQuestion={setCurrentQuestionIndex}
              onSelectAnswer={handleSelectAnswer}
              onCreateRecoveryTask={handleCreateRecoveryTask}
              recoveryBusySubjectId={recoveryBusySubjectId}
              recoveryAddedSubjectIds={recoveryAddedSubjectIds}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-card p-12 text-center text-muted">
              <p className="text-sm font-semibold text-ink">Selecione um simulado</p>
              <p className="mt-1 text-xs">O conteúdo e as respostas ficam armazenados no espaço local.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type SimulationRunnerProps = {
  detail: SimulationDetail;
  result: SimulationResult | null;
  currentQuestionIndex: number;
  currentQuestion: SimulationQuestionSummary | null;
  busyAction: string | null;
  onAction: (action: "start" | "pause" | "resume" | "finish") => void;
  onSelectQuestion: (index: number) => void;
  onSelectAnswer: (selectedKey: string | null) => void;
  onCreateRecoveryTask: (diagnostic: SimulationDiagnosticSummary, simulation: SimulationSummary) => void;
  recoveryBusySubjectId: string | null;
  recoveryAddedSubjectIds: Set<string>;
};

function SimulationRunner({
  detail,
  result,
  currentQuestionIndex,
  currentQuestion,
  busyAction,
  onAction,
  onSelectQuestion,
  onSelectAnswer,
  onCreateRecoveryTask,
  recoveryBusySubjectId,
  recoveryAddedSubjectIds,
}: SimulationRunnerProps) {
  const [clockNow, setClockNow] = useState(() => Date.now());
  const finishRequested = useRef(false);
  const { simulation } = detail;
  const canAnswer = simulation.status === "in_progress";
  const canPause = canAnswer && simulation.mode === "training";
  const canFinish = simulation.status === "in_progress" || simulation.status === "paused";
  const remainingSeconds = simulation.mode === "exam" && simulation.status === "in_progress" && simulation.endsAt
    ? Math.ceil((parseStoredTimestamp(simulation.endsAt).getTime() - clockNow) / 1000)
    : null;

  useEffect(() => {
    finishRequested.current = false;
    setClockNow(Date.now());
  }, [simulation.id, simulation.status, simulation.endsAt]);

  useEffect(() => {
    if (remainingSeconds === null) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [remainingSeconds !== null]);

  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds > 0 || !canFinish || busyAction !== null || finishRequested.current) return;
    finishRequested.current = true;
    onAction("finish");
  }, [busyAction, canFinish, onAction, remainingSeconds]);

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-line bg-card p-5 shadow-xs lg:p-6" aria-labelledby="simulation-detail-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>{MODE_LABELS[simulation.mode]}</Eyebrow>
              <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{STATUS_LABELS[simulation.status]}</span>
            </div>
            <h3 id="simulation-detail-title" className="mt-2 truncate font-heading text-xl font-bold text-ink">{simulation.title}</h3>
            <p className="mt-1 text-xs text-muted">{simulation.preparationName} · criado em {formatDateTime(simulation.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {simulation.status === "draft" && <button type="button" className={buttonPrimaryClass} onClick={() => onAction("start")} disabled={busyAction !== null}>{busyAction === "start" ? "Iniciando..." : "Começar"}</button>}
            {simulation.status === "paused" && <button type="button" className={buttonPrimaryClass} onClick={() => onAction("resume")} disabled={busyAction !== null}>{busyAction === "resume" ? "Retomando..." : "Retomar"}</button>}
            {canPause && <button type="button" className={buttonSecondaryClass} onClick={() => onAction("pause")} disabled={busyAction !== null}>{busyAction === "pause" ? "Pausando..." : "Pausar"}</button>}
            {canFinish && <button type="button" className={buttonSecondaryClass} onClick={() => onAction("finish")} disabled={busyAction !== null}>{busyAction === "finish" ? "Finalizando..." : "Finalizar"}</button>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Questões" value={`${simulation.answeredCount}/${simulation.questionCount}`} />
           <Metric label="Peso do erro" value={formatNumber(simulation.negativePoints)} />
           <Metric label={remainingSeconds !== null ? "Tempo restante" : "Tempo"} value={remainingSeconds !== null ? formatDuration(Math.max(0, remainingSeconds)) : simulation.timeLimitSeconds ? formatDuration(simulation.timeLimitSeconds) : "Livre"} />
          <Metric label="Regra" value={simulation.mode === "exam" ? "Relógio ativo" : "Pode pausar"} />
        </div>
      </section>

      {result && (
        <ResultPanel
          result={result}
          onCreateRecoveryTask={onCreateRecoveryTask}
          recoveryBusySubjectId={recoveryBusySubjectId}
          recoveryAddedSubjectIds={recoveryAddedSubjectIds}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-card p-3 shadow-xs" aria-label="Questões do simulado">
          <div className="mb-2 flex items-center justify-between px-1">
            <Eyebrow>Roteiro</Eyebrow>
            <span className="text-[11px] text-muted">{detail.questions.length}</span>
          </div>
          <div className="grid max-h-[520px] gap-1.5 overflow-y-auto pr-1">
            {detail.questions.map((question, index) => {
              const isCurrent = index === currentQuestionIndex;
              const isAnswered = question.selectedKey !== null;
              return (
                <button
                  key={question.questionId}
                  type="button"
                  onClick={() => onSelectQuestion(index)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${isCurrent ? "border-blue-500/50 bg-blue-500/10 text-blue-700" : "border-transparent text-muted hover:border-line hover:bg-paper"}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className="font-bold">Questão {index + 1}</span>
                  <span className={isAnswered ? "text-emerald-600" : "text-muted/60"}>{isAnswered ? "Salva" : "Em branco"}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="min-w-0 rounded-2xl border border-line bg-card p-5 shadow-xs lg:p-7">
          {currentQuestion ? (
            <QuestionPanel
              question={currentQuestion}
              index={currentQuestionIndex}
              total={detail.questions.length}
              canAnswer={canAnswer}
              isSaving={busyAction === `answer:${currentQuestion.questionId}`}
              onSelectAnswer={onSelectAnswer}
              onSelectQuestion={onSelectQuestion}
            />
          ) : (
            <p className="text-sm text-muted">Este simulado não possui questões disponíveis.</p>
          )}
        </article>
      </div>
    </div>
  );
}

type QuestionPanelProps = {
  question: SimulationQuestionSummary;
  index: number;
  total: number;
  canAnswer: boolean;
  isSaving: boolean;
  onSelectAnswer: (selectedKey: string | null) => void;
  onSelectQuestion: (index: number) => void;
};

function QuestionPanel({
  question,
  index,
  total,
  canAnswer,
  isSaving,
  onSelectAnswer,
  onSelectQuestion,
}: QuestionPanelProps) {
  const isFinished = question.answerKey !== null || question.result !== null;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <Eyebrow>Questão {index + 1} de {total}</Eyebrow>
          <p className="mt-1 text-xs text-muted">{question.subjectName ?? "Sem assunto"} · peso {formatNumber(question.weight)}</p>
        </div>
        {isSaving && <span className="text-xs font-semibold text-blue-600">Salvando resposta...</span>}
      </div>
      <div className="prose prose-sm max-w-none text-ink dark:prose-invert">
        <MarkdownContent source={question.statementMarkdown} />
      </div>
      <div className="grid gap-2.5" role="radiogroup" aria-label="Alternativas">
        {question.options.map((option) => {
          const selected = question.selectedKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!canAnswer || isSaving}
              onClick={() => onSelectAnswer(selected ? null : option.key)}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition-colors ${selected ? "border-blue-500 bg-blue-500/10 text-ink" : "border-line bg-paper/60 text-ink hover:border-blue-400/60 hover:bg-blue-500/5"}`}
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-line bg-card text-muted"}`}>{option.key}</span>
              <span className="leading-relaxed">{option.text}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span>{canAnswer ? "Clique em uma alternativa para salvar a resposta." : isFinished ? "Gabarito liberado após a finalização." : "Comece o simulado para responder."}</span>
        <div className="flex gap-2">
          <button type="button" className={buttonQuietClass} onClick={() => onSelectQuestion(Math.max(0, index - 1))} disabled={index === 0}>Anterior</button>
          <button type="button" className={buttonSecondaryClass} onClick={() => onSelectQuestion(Math.min(total - 1, index + 1))} disabled={index >= total - 1}>Próxima</button>
        </div>
      </div>
      {isFinished && question.explanationMarkdown && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-ink">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Explicação</p>
          <MarkdownContent source={question.explanationMarkdown} />
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  result,
  onCreateRecoveryTask,
  recoveryBusySubjectId,
  recoveryAddedSubjectIds,
}: {
  result: SimulationResult;
  onCreateRecoveryTask: (diagnostic: SimulationDiagnosticSummary, simulation: SimulationSummary) => void;
  recoveryBusySubjectId: string | null;
  recoveryAddedSubjectIds: Set<string>;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs" aria-labelledby="simulation-result-title">
      <div>
        <Eyebrow>Resultado local</Eyebrow>
        <h3 id="simulation-result-title" className="mt-1 font-heading text-lg font-bold text-ink">Diagnóstico da prova</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Metric label="Pontuação" value={formatNumber(result.score)} />
        <Metric label="Percentual" value={result.percentage === null ? "-" : `${formatNumber(result.percentage)}%`} />
        <Metric label="Acertos" value={String(result.correctCount)} />
        <Metric label="Erros" value={String(result.incorrectCount)} />
        <Metric label="Em branco" value={String(result.blankCount)} />
      </div>
      {result.diagnostics.length > 0 && (
        <div className="grid gap-2 border-t border-emerald-500/20 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Por assunto</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {result.diagnostics.map((diagnostic) => {
              const recoveryKey = diagnostic.subjectId
                ? `${result.detail.simulation.id}:${diagnostic.subjectId}`
                : null;
              return (
                <div key={diagnostic.subjectId ?? "global"} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs">
                  <span className="truncate font-semibold text-ink">{diagnostic.subjectName ?? "Sem assunto"}</span>
                  <span className="shrink-0 text-muted">{diagnostic.correctCount}/{diagnostic.questionCount} · {formatNumber(diagnostic.score)} pts</span>
                  {diagnostic.subjectId && recoveryKey && (
                    <button
                      type="button"
                      className={buttonQuietClass}
                      disabled={recoveryBusySubjectId !== null || recoveryAddedSubjectIds.has(recoveryKey)}
                      onClick={() => onCreateRecoveryTask(diagnostic, result.detail.simulation)}
                    >
                      {recoveryAddedSubjectIds.has(recoveryKey)
                        ? "Recuperação adicionada"
                        : recoveryBusySubjectId === recoveryKey
                          ? "Adicionando..."
                          : "Adicionar recuperação"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper/70 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

function InlineNotice({
  tone,
  message,
  onClose,
}: {
  tone: "error" | "success";
  message: string;
  onClose: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-xs ${tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"}`} role={tone === "error" ? "alert" : "status"}>
      <span>{message}</span>
      <button type="button" onClick={onClose} className="font-bold hover:underline">Fechar</button>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes} min` : `${minutes}m ${remainingSeconds}s`;
}

function parseStoredTimestamp(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
