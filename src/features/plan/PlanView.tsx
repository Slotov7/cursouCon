import { useEffect, useState, type FormEvent } from "react";
import {
  createPreparation,
  createStudyTask,
  createSubject,
  updateSubject,
  moveSubject,
  archiveSubject,
  getStudyPlanning,
  getMaterials,
  getDesktopErrorMessage,
  savePreparationExamConfig,
  setPrimaryPreparation,
  setSubjectStudyStatus,
} from "../../shared/desktop/commands";
import type {
  MaterialSummary,
  PreparationSummary,
  StudyPlan,
  StudyPlanningSummary,
  SubjectStudyStatus,
  SubjectSummary,
} from "../../shared/desktop/contracts";
import { StudyCyclePanel } from "./StudyCyclePanel";
import { dateKeyForTimezone } from "../../shared/date";
import {
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

type PlanViewProps = {
  timezone: string;
  plan: StudyPlan | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onPlanChanged: () => void;
};

type ActiveModal = "none" | "preparation" | "subject" | "task";

export function PlanView({
  timezone,
  plan,
  isLoading,
  error,
  onRetry,
  onPlanChanged,
}: PlanViewProps) {
  const [selectedPreparationId, setSelectedPreparationId] = useState("");
  const [activeModal, setActiveModal] = useState<ActiveModal>("none");

  // Preparation form state
  const [preparationName, setPreparationName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [board, setBoard] = useState("");
  const [examDate, setExamDate] = useState("");
  const [makePrimary, setMakePrimary] = useState(true);

  // Subject form state
  const [subjectName, setSubjectName] = useState("");
  const [subjectParentId, setSubjectParentId] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [editingParentId, setEditingParentId] = useState("");
  const [subjectActionError, setSubjectActionError] = useState<string | null>(null);
  const [subjectActionMessage, setSubjectActionMessage] = useState<string | null>(null);
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskObjective, setTaskObjective] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("45");
  const [taskDate, setTaskDate] = useState(() => dateKeyForTimezone(timezone));
  const [taskSubjectId, setTaskSubjectId] = useState("");
  const [taskMaterialId, setTaskMaterialId] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subjectStatusError, setSubjectStatusError] = useState<string | null>(null);
  const [updatingSubjectId, setUpdatingSubjectId] = useState<string | null>(null);
  const [studyPlanning, setStudyPlanning] = useState<StudyPlanningSummary | null>(null);
  const [studyPlanningError, setStudyPlanningError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [referenceMaterialId, setReferenceMaterialId] = useState("");
  const [referenceDocumentStatus, setReferenceDocumentStatus] = useState<PreparationSummary["referenceDocumentStatus"]>("reference");
  const [examRulesMarkdown, setExamRulesMarkdown] = useState("");
  const [examWeights, setExamWeights] = useState<Record<string, string>>({});
  const [examConfigError, setExamConfigError] = useState<string | null>(null);
  const [examConfigMessage, setExamConfigMessage] = useState<string | null>(null);
  const [isSavingExamConfig, setIsSavingExamConfig] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [primaryMessage, setPrimaryMessage] = useState<string | null>(null);
  const [isSettingPrimary, setIsSettingPrimary] = useState(false);

  const currentPlan: StudyPlan = plan ?? { preparations: [], subjects: [], subjectCoverage: [] };
  const selectedPreparation =
    currentPlan.preparations.find((prep) => prep.id === selectedPreparationId) ||
    currentPlan.preparations.find((prep) => prep.isPrimary) ||
    currentPlan.preparations[0];
  const primaryPreparation = selectedPreparation;
  const subjects = currentPlan.subjects.filter(
    (subj) => !selectedPreparation || subj.preparationId === selectedPreparation.id,
  );
  const orderedSubjects = orderSubjectsByHierarchy(subjects);
  const subjectCoverage = currentPlan.subjectCoverage.find(
    (coverage) => coverage.preparationId === selectedPreparation?.id,
  );
  const totalSubjects = subjectCoverage?.totalSubjects ?? 0;
  const startedSubjects = subjectCoverage?.startedSubjects ?? 0;
  const completedSubjects = subjectCoverage?.completedSubjects ?? 0;
  const coveragePercent = totalSubjects > 0
    ? Math.round((completedSubjects / totalSubjects) * 100)
    : 0;
  const examDateLabel = formatExamDate(selectedPreparation?.examDate ?? null);
  const examCountdownLabel = formatExamCountdown(selectedPreparation?.examDate ?? null, timezone);

  useEffect(() => {
    const preparationId = selectedPreparation?.id;
    if (!preparationId) {
      setStudyPlanning(null);
      setStudyPlanningError(null);
      return;
    }

    let cancelled = false;
    setStudyPlanningError(null);
    void getStudyPlanning({ preparationId })
      .then((planning) => {
        if (!cancelled) setStudyPlanning(planning);
      })
      .catch((planningError: unknown) => {
        if (!cancelled) setStudyPlanningError(getDesktopErrorMessage(planningError));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPreparation?.id, plan]);

  useEffect(() => {
    let cancelled = false;
    void getMaterials()
      .then((loadedMaterials) => {
        if (!cancelled) {
          setMaterials(loadedMaterials);
          setMaterialsError(null);
        }
      })
      .catch((materialError: unknown) => {
        if (!cancelled) setMaterialsError(getDesktopErrorMessage(materialError));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setReferenceMaterialId(selectedPreparation?.referenceMaterialId ?? "");
    setReferenceDocumentStatus(selectedPreparation?.referenceDocumentStatus ?? "reference");
    setExamRulesMarkdown(selectedPreparation?.examRulesMarkdown ?? "");
    setExamWeights(
      Object.fromEntries(
        subjects.map((subject) => [subject.id, subject.examWeight?.toString() ?? ""]),
      ),
    );
    setExamConfigError(null);
    setExamConfigMessage(null);
  }, [plan, selectedPreparation?.id]);

  const handleSubjectStudyStatusChange = async (
    subjectId: string,
    status: SubjectStudyStatus,
  ) => {
    setSubjectStatusError(null);
    setUpdatingSubjectId(subjectId);
    try {
      await setSubjectStudyStatus({ subjectId, status });
      onPlanChanged();
    } catch (operationError: unknown) {
      setSubjectStatusError(getDesktopErrorMessage(operationError));
    } finally {
      setUpdatingSubjectId(null);
    }
  };

  const handleUpdateSubject = async (subject: SubjectSummary) => {
    setSubjectActionError(null);
    setSubjectActionMessage(null);
    setPendingSubjectId(subject.id);
    try {
      await updateSubject({
        subjectId: subject.id,
        name: editingSubjectName,
        parentId: editingParentId || null,
      });
      setEditingSubjectId(null);
      setSubjectActionMessage("Assunto e posição na árvore salvos localmente.");
      onPlanChanged();
    } catch (operationError: unknown) {
      setSubjectActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingSubjectId(null);
    }
  };

  const handleMoveSubject = async (subject: SubjectSummary, direction: "up" | "down") => {
    setSubjectActionError(null);
    setSubjectActionMessage(null);
    setPendingSubjectId(subject.id);
    try {
      await moveSubject({ subjectId: subject.id, direction });
      setSubjectActionMessage("Ordem dos assuntos salva localmente.");
      onPlanChanged();
    } catch (operationError: unknown) {
      setSubjectActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingSubjectId(null);
    }
  };

  const handleArchiveSubject = async (subject: SubjectSummary) => {
    const descendantCount = subjects.filter((item) => isDescendantOf(subjects, item, subject.id)).length;
    if (!window.confirm(
      `Arquivar ${subject.name}${descendantCount ? ` e ${descendantCount} subassunto(s)` : ""}? Tarefas e histórico permanecem salvos.`,
    )) return;
    setSubjectActionError(null);
    setSubjectActionMessage(null);
    setPendingSubjectId(subject.id);
    try {
      await archiveSubject({ subjectId: subject.id });
      setEditingSubjectId(null);
      setSubjectActionMessage("Assunto arquivado. O histórico e as tarefas foram preservados.");
      onPlanChanged();
    } catch (operationError: unknown) {
      setSubjectActionError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingSubjectId(null);
    }
  };

  const handleSetPrimary = async () => {
    if (!selectedPreparation || selectedPreparation.isPrimary) return;
    setPrimaryError(null);
    setPrimaryMessage(null);
    setIsSettingPrimary(true);
    try {
      await setPrimaryPreparation({ preparationId: selectedPreparation.id });
      setPrimaryMessage(`${selectedPreparation.name} agora é a preparação principal.`);
      onPlanChanged();
    } catch (operationError: unknown) {
      setPrimaryError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSettingPrimary(false);
    }
  };

  const handlePreparationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!preparationName.trim()) {
      setFormError("Informe o nome do concurso / preparação.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await createPreparation({
        name: preparationName,
        organization: organization || null,
        role: role || null,
        board: board || null,
        examDate: examDate || null,
        makePrimary,
      });
      setPreparationName("");
      setOrganization("");
      setRole("");
      setBoard("");
      setExamDate("");
      setActiveModal("none");
      onPlanChanged();
    } catch (err: unknown) {
      setFormError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubjectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) {
      setFormError("Informe o nome da disciplina.");
      return;
    }
    if (!selectedPreparation) {
      setFormError("Crie uma preparação primeiro.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await createSubject({
        preparationId: selectedPreparation.id,
        name: subjectName,
        parentId: subjectParentId || null,
      });
      setSubjectName("");
      setSubjectParentId("");
      setActiveModal("none");
      onPlanChanged();
    } catch (err: unknown) {
      setFormError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTaskSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setFormError("Informe o título da tarefa.");
      return;
    }
    if (!selectedPreparation) {
      setFormError("Crie uma preparação primeiro.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await createStudyTask({
        preparationId: selectedPreparation.id,
        subjectId: taskSubjectId || null,
        materialId: taskMaterialId || null,
        title: taskTitle,
        objective: taskObjective || null,
        plannedMinutes: Number(taskMinutes) || 45,
        scheduledFor: taskDate,
      });
      setTaskTitle("");
      setTaskObjective("");
      setTaskMaterialId("");
      setActiveModal("none");
      onPlanChanged();
    } catch (err: unknown) {
      setFormError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExamConfigSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPreparation) {
      setExamConfigError("Crie uma preparação primeiro.");
      return;
    }

    const subjectExamWeights: Array<{ subjectId: string; examWeight: number | null }> = [];
    for (const subject of subjects) {
      const rawWeight = examWeights[subject.id]?.trim() ?? "";
      if (!rawWeight) {
        subjectExamWeights.push({ subjectId: subject.id, examWeight: null });
        continue;
      }
      const examWeight = Number(rawWeight);
      if (!Number.isFinite(examWeight) || examWeight <= 0) {
        setExamConfigError(`Informe um peso maior que zero para ${subject.name}.`);
        return;
      }
      subjectExamWeights.push({ subjectId: subject.id, examWeight });
    }

    setExamConfigError(null);
    setExamConfigMessage(null);
    setIsSavingExamConfig(true);
    try {
      await savePreparationExamConfig({
        preparationId: selectedPreparation.id,
        referenceMaterialId: referenceMaterialId || null,
        referenceDocumentStatus,
        examRulesMarkdown: examRulesMarkdown.trim() || null,
        subjectExamWeights,
      });
      setExamConfigMessage("Documento, classificação, regras e pesos salvos localmente.");
      onPlanChanged();
    } catch (configError: unknown) {
      setExamConfigError(getDesktopErrorMessage(configError));
    } finally {
      setIsSavingExamConfig(false);
    }
  };

  if (isLoading && !plan) {
    return (
      <div className="grid min-h-[360px] place-items-center text-center p-8">
        <div className="grid justify-items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-muted">Carregando plano de estudos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600">
          <span>{error}</span>
          <button className={buttonSecondaryClass} type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}

      {subjectStatusError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {subjectStatusError}
        </p>
      )}
      {subjectActionError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {subjectActionError}
        </p>
      )}
      {subjectActionMessage && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300" role="status">
          {subjectActionMessage}
        </p>
      )}
      {primaryError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{primaryError}</p>}
      {primaryMessage && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300" role="status">{primaryMessage}</p>}

      {/* 1. Hero Header Banner */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              Edital Verticalizado & Ciclo
            </span>
            {currentPlan.preparations.length > 1 ? (
              <select
                value={selectedPreparation?.id || ""}
                onChange={(e) => setSelectedPreparationId(e.target.value)}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-xs cursor-pointer focus:outline-none"
              >
                {currentPlan.preparations.map((p) => (
                  <option key={p.id} value={p.id} className="text-slate-900 bg-white">
                    Foco: {p.name} {p.role ? `(${p.role})` : ""} {p.isPrimary ? "★" : ""}
                  </option>
                ))}
              </select>
            ) : primaryPreparation ? (
              <span className="text-xs font-medium text-slate-300/85">
                Foco: {primaryPreparation.name} {primaryPreparation.role ? `(${primaryPreparation.role})` : ""}
              </span>
            ) : null}
            {selectedPreparation?.board && (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                Banca: {selectedPreparation.board}
              </span>
            )}
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Plano de Estudos & Grade Curricular
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Organize cada disciplina do seu edital, marque tópicos estudados e defina o ritmo ideal para a prova.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setSubjectParentId("");
                setActiveModal("subject");
              }}
              className={buttonPrimaryClass}
            >
              + Nova Disciplina
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setActiveModal("task");
              }}
              className={buttonSecondaryClass}
            >
              + Agendar Tarefa
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setActiveModal("preparation");
              }}
              className={buttonOutlineLightClass}
            >
              + Novo Concurso
            </button>
            {selectedPreparation && !selectedPreparation.isPrimary && (
              <button type="button" className={buttonOutlineLightClass} onClick={() => void handleSetPrimary()} disabled={isSettingPrimary}>
                {isSettingPrimary ? "Alternando..." : "Tornar preparação principal"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Edital Metrics Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Cobertura do Edital</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink">
            {totalSubjects > 0 ? `${completedSubjects} / ${totalSubjects}` : "Sem itens"}
          </p>
          {totalSubjects > 0 && (
            <div
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
              role="progressbar"
              aria-label="Cobertura de teoria concluída"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={coveragePercent}
            >
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${coveragePercent}%` }} />
            </div>
          )}
          <p className="mt-2 text-[11px] font-medium text-muted">
            {totalSubjects > 0
              ? `${coveragePercent}% concluído · ${startedSubjects} iniciado(s)`
              : "Cadastre disciplinas e assuntos para iniciar a cobertura."}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            Concluído = teoria marcada; denominador = todos os itens ativos cadastrados. Não mede domínio.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Previsão da Prova</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">{examDateLabel}</p>
          <p className="mt-2 text-[11px] font-medium text-orange-600 dark:text-orange-400">{examCountdownLabel}</p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Disciplinas do Ciclo</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {subjects.length} Disciplinas
          </p>
          <p className="mt-2 text-[11px] text-muted">Todas ativas no ciclo local</p>
        </div>
      </div>

      {selectedPreparation && (
        <StudyCyclePanel
          preparationId={selectedPreparation.id}
          subjects={subjects}
          planning={studyPlanning}
          isLoading={isLoading}
          error={studyPlanningError}
          onChanged={(nextPlanning) => {
            setStudyPlanning(nextPlanning);
            onPlanChanged();
          }}
        />
      )}

      {selectedPreparation && (
        <section className="glass-card rounded-2xl p-5 shadow-xs" aria-labelledby="exam-config-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Referência da prova</p>
              <h3 id="exam-config-title" className="mt-1 font-heading text-xl font-bold text-ink">
                Edital, regras e pesos
              </h3>
              <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                {selectedPreparation.referenceMaterialId
                  ? selectedPreparation.referenceDocumentStatus === "current"
                    ? "Edital vigente confirmado por você"
                    : "Pré-edital · documento anterior usado como referência"
                  : "Nenhum edital associado"}
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                O peso oficial é separado da prioridade de estudo usada no ciclo. As alterações ficam no espaço local desta preparação.
              </p>
            </div>
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-semibold text-muted">
              {subjects.filter((subject) => subject.examWeight !== null).length} peso(s) informado(s)
            </span>
          </div>

          <form className="mt-4 grid gap-4" onSubmit={handleExamConfigSubmit}>
            {materialsError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
                Não foi possível carregar os materiais: {materialsError}
              </p>
            )}
            {examConfigError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
                {examConfigError}
              </p>
            )}
            {examConfigMessage && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300" role="status">
                {examConfigMessage}
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <label className={fieldClass}>
                Documento de referência
                <select
                  className={selectClass}
                  value={referenceMaterialId}
                  onChange={(event) => {
                    setReferenceMaterialId(event.target.value);
                    setReferenceDocumentStatus("reference");
                  }}
                  disabled={isSavingExamConfig}
                >
                  <option value="">Nenhum edital selecionado</option>
                  {selectedPreparation.referenceMaterialId &&
                    !materials.some((material) => material.id === selectedPreparation.referenceMaterialId) && (
                      <option value={selectedPreparation.referenceMaterialId}>
                        Documento salvo (não carregado)
                      </option>
                    )}
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.originalName}{material.sourceUrl ? " · link externo" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-normal text-muted">
                  Importe o PDF ou registre o link na área Materiais antes de selecionar aqui.
                </span>
              </label>

              <label className={fieldClass}>
                Situação do documento
                <select
                  className={selectClass}
                  value={referenceDocumentStatus}
                  onChange={(event) => setReferenceDocumentStatus(event.target.value as PreparationSummary["referenceDocumentStatus"])}
                  disabled={isSavingExamConfig || !referenceMaterialId}
                >
                  <option value="reference">Documento anterior · referência pré-edital</option>
                  <option value="current">Edital vigente · confirmado por mim</option>
                </select>
                <span className="text-[11px] font-normal text-muted">
                  Escolher um arquivo não confirma sua vigência. Classifique-o após conferir a publicação.
                </span>
              </label>

              <label className={fieldClass}>
                Regras da prova
                <textarea
                  className={`${textareaClass} min-h-28`}
                  value={examRulesMarkdown}
                  onChange={(event) => setExamRulesMarkdown(event.target.value)}
                  maxLength={20_000}
                  disabled={isSavingExamConfig}
                  placeholder="Ex.: cada questão vale 1 ponto; penalidade por erro; critérios de desempate..."
                />
                <span className="text-[11px] font-normal text-muted">Markdown opcional para preservar as observações da banca.</span>
              </label>
            </div>

            <div className="grid gap-3">
              <div>
                <h4 className="text-sm font-bold text-ink">Peso oficial por disciplina</h4>
                <p className="mt-1 text-[11px] text-muted">Deixe em branco quando o edital não informar peso para a disciplina.</p>
              </div>
              {subjects.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
                  Cadastre disciplinas para informar os pesos da prova.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {subjects.map((subject) => (
                    <label key={subject.id} className={`${fieldClass} rounded-xl border border-line bg-paper/50 p-3`}>
                      <span className="truncate" title={subject.name}>{subject.name}</span>
                      <input
                        className={inputClass}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={examWeights[subject.id] ?? ""}
                        onChange={(event) =>
                          setExamWeights((currentWeights) => ({
                            ...currentWeights,
                            [subject.id]: event.target.value,
                          }))
                        }
                        disabled={isSavingExamConfig}
                        placeholder="Sem peso"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-line pt-3">
              <button type="submit" className={buttonPrimaryClass} disabled={isSavingExamConfig}>
                {isSavingExamConfig ? "Salvando..." : "Salvar regras e pesos"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. Modal / Drawer Forms for adding content */}
      {activeModal !== "none" && (
        <div className="glass-card rounded-2xl p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-fade-in">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h3 className="font-heading text-lg font-bold text-ink">
              {activeModal === "preparation"
                ? "Cadastrar Novo Concurso / Preparação"
                : activeModal === "subject"
                ? "Adicionar Disciplina ou Assunto ao Edital"
                : "Agendar Tarefa de Estudo"}
            </h3>
            <button
              type="button"
              onClick={() => setActiveModal("none")}
              className="text-xs text-muted hover:text-ink font-semibold"
            >
              ✕ Fechar
            </button>
          </div>

          {formError && (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
              {formError}
            </p>
          )}

          {activeModal === "preparation" && (
            <form onSubmit={handlePreparationSubmit} className="grid gap-4 sm:grid-cols-2">
              <label className={`${fieldClass} sm:col-span-2`}>
                Nome da Preparação / Concurso
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Senado Federal - Analista de TI"
                  value={preparationName}
                  onChange={(e) => setPreparationName(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className={fieldClass}>
                Órgão <span className="text-muted font-normal">(opcional)</span>
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Senado Federal"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className={fieldClass}>
                Cargo <span className="text-muted font-normal">(opcional)</span>
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Analista Legislativo"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className={fieldClass}>
                Banca <span className="text-muted font-normal">(opcional)</span>
                <input
                  className={inputClass}
                  type="text"
                  value={board}
                  onChange={(event) => setBoard(event.target.value)}
                  maxLength={120}
                  disabled={isSubmitting}
                  placeholder="Ex.: Cebraspe"
                />
              </label>
              <label className={fieldClass}>
                Data da Prova <span className="text-muted font-normal">(opcional)</span>
                <input
                  className={inputClass}
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2 pt-2">
                <input
                  type="checkbox"
                  id="make-primary"
                  checked={makePrimary}
                  onChange={(e) => setMakePrimary(e.target.checked)}
                  className="accent-blue-600 size-4"
                />
                <label htmlFor="make-primary" className="text-xs font-semibold text-ink cursor-pointer">
                  Tornar esta a preparação principal do espaço
                </label>
              </div>

              <div className="flex justify-end gap-2 sm:col-span-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setActiveModal("none")}
                  className={buttonQuietClass}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={buttonPrimaryClass} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar Concurso"}
                </button>
              </div>
            </form>
          )}

          {activeModal === "subject" && (
            <form onSubmit={handleSubjectSubmit} className="grid gap-4 max-w-lg">
              <label className={fieldClass}>
                Nome da disciplina ou assunto
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Direito Constitucional"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>

              <label className={fieldClass}>
                Assunto pai
                <select className={selectClass} value={subjectParentId} onChange={(event) => setSubjectParentId(event.target.value)} disabled={isSubmitting}>
                  <option value="">Nenhum · disciplina principal</option>
                  {orderedSubjects.map(({ subject, depth }) => (
                    <option key={subject.id} value={subject.id}>{"— ".repeat(depth)}{subject.name}</option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setActiveModal("none")}
                  className={buttonQuietClass}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={buttonPrimaryClass} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Adicionar Disciplina"}
                </button>
              </div>
            </form>
          )}

          {activeModal === "task" && (
            <form onSubmit={handleTaskSubmit} className="grid gap-4 sm:grid-cols-2">
              <label className={`${fieldClass} sm:col-span-2`}>
                Título da Tarefa
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Leitura e questões de Controle de Constitucionalidade"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>

              <label className={fieldClass}>
                Disciplina Vinculada
                <select
                  className={selectClass}
                  value={taskSubjectId}
                  onChange={(e) => setTaskSubjectId(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Selecione uma disciplina</option>
                  {subjects.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={fieldClass}>
                Material da tarefa <span className="text-muted font-normal">(opcional)</span>
                <select className={selectClass} value={taskMaterialId} onChange={(event) => setTaskMaterialId(event.target.value)} disabled={isSubmitting || Boolean(materialsError)}>
                  <option value="">Sem material vinculado</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.originalName}{material.sourceUrl ? " · link externo" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-normal text-muted">
                  {materialsError ? `Materiais indisponíveis: ${materialsError}` : "Importe o arquivo na biblioteca antes de selecionar."}
                </span>
              </label>

              <label className={fieldClass}>
                Duração Planejada (Minutos)
                <input
                  className={inputClass}
                  type="number"
                  min="5"
                  max="480"
                  value={taskMinutes}
                  onChange={(e) => setTaskMinutes(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>

              <label className={fieldClass}>
                Data do Estudo
                <input
                  className={inputClass}
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>

              <label className={`${fieldClass} sm:col-span-2`}>
                Objetivo / Roteiro do Estudo <span className="text-muted font-normal">(opcional)</span>
                <textarea
                  className={textareaClass}
                  placeholder="Ex.: Ler artigos 101 a 103 da CF e responder 15 questões no app."
                  value={taskObjective}
                  onChange={(e) => setTaskObjective(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>

              <div className="flex justify-end gap-2 sm:col-span-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setActiveModal("none")}
                  className={buttonQuietClass}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={buttonPrimaryClass} disabled={isSubmitting}>
                  {isSubmitting ? "Agendando..." : "Agendar Tarefa"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 4. Edital Verticalizado - Subject Topic Cards Grid */}
      <section className="grid gap-5" aria-labelledby="edital-grid-title">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <Eyebrow>Árvore do edital</Eyebrow>
            <h3 id="edital-grid-title" className="mt-1 font-heading text-xl font-bold text-ink">
              Conteúdo Programático do Edital
            </h3>
          </div>
          <span className="text-xs font-medium text-muted">
            {subjects.length} disciplina(s) e assunto(s) ativos
          </span>
        </div>

        {currentPlan.preparations.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <h4 className="font-heading text-base font-bold text-ink">Nenhum concurso ou preparação cadastrado</h4>
            <p className="mt-1 text-sm text-muted">Cadastre o seu concurso primeiro para organizar as disciplinas e o ciclo de estudos.</p>
            <button
              type="button"
              onClick={() => setActiveModal("preparation")}
              className={`${buttonPrimaryClass} mt-4 text-xs`}
            >
              + Cadastrar Meu Concurso
            </button>
          </div>
        ) : subjects.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <p className="text-sm text-muted">Nenhuma disciplina cadastrada para {selectedPreparation?.name} ainda.</p>
            <button
              type="button"
              onClick={() => {
                setSubjectParentId("");
                setActiveModal("subject");
              }}
              className={`${buttonPrimaryClass} mt-4 text-xs`}
            >
              + Adicionar Primeira Disciplina
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {orderedSubjects.map(({ subject: subj, depth }, idx) => (
              <div
                key={subj.id}
                className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-xs transition-all hover:border-blue-500/40"
                style={{ marginLeft: `${Math.min(depth, 3) * 12}px` }}
              >
                <div>
                  {/* Header info */}
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted">
                         Item {idx + 1} {depth > 0 ? `· nível ${depth + 1}` : ""}
                       </span>
                       <h4 className="font-heading text-lg font-bold text-ink mt-0.5">{subj.name}</h4>
                       {subj.parentId && (
                         <p className="mt-1 text-[11px] text-muted">
                           Dentro de {subjects.find((item) => item.id === subj.parentId)?.name ?? "assunto anterior"}
                         </p>
                       )}
                    </div>

                    <div className="grid text-right">
                      <span className="font-heading text-base font-extrabold text-blue-600">
                        {subj.parentId ? "Subassunto" : "Disciplina"}
                      </span>
                      <span className="text-[10px] text-muted">registrada</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-dashed border-line bg-paper/60 p-4">
                    <label className={fieldClass}>
                      Estado do estudo
                      <select
                        className={selectClass}
                        value={subj.studyStatus}
                        onChange={(event) =>
                          void handleSubjectStudyStatusChange(
                            subj.id,
                            event.target.value as SubjectStudyStatus,
                          )
                        }
                        disabled={updatingSubjectId !== null}
                      >
                        <option value="not_started">Não iniciado</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="theory_completed">Teoria concluída</option>
                      </select>
                    </label>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      {updatingSubjectId === subj.id
                        ? "Salvando estado..."
                        : "Marcar a teoria como concluída não registra domínio automaticamente."}
                    </p>
                  </div>

                  {editingSubjectId === subj.id && (
                    <div className="mt-4 grid gap-3 rounded-xl border border-blue-500/25 bg-paper/60 p-4 sm:grid-cols-2">
                      <label className={fieldClass}>
                        Nome do assunto
                        <input className={inputClass} value={editingSubjectName} onChange={(event) => setEditingSubjectName(event.target.value)} maxLength={160} disabled={pendingSubjectId !== null} />
                      </label>
                      <label className={fieldClass}>
                        Assunto pai
                        <select className={selectClass} value={editingParentId} onChange={(event) => setEditingParentId(event.target.value)} disabled={pendingSubjectId !== null}>
                          <option value="">Nenhum · disciplina principal</option>
                          {orderedSubjects
                            .filter(({ subject }) => subject.id !== subj.id && !isDescendantOf(subjects, subject, subj.id))
                            .map(({ subject, depth: parentDepth }) => (
                              <option key={subject.id} value={subject.id}>{"— ".repeat(parentDepth)}{subject.name}</option>
                            ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                        <button type="button" className={buttonQuietClass} onClick={() => setEditingSubjectId(null)} disabled={pendingSubjectId !== null}>Cancelar</button>
                        <button type="button" className={buttonPrimaryClass} onClick={() => void handleUpdateSubject(subj)} disabled={pendingSubjectId !== null || !editingSubjectName.trim()}>
                          {pendingSubjectId === subj.id ? "Salvando..." : "Salvar assunto"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button type="button" className={buttonQuietClass} onClick={() => {
                    setEditingSubjectId(subj.id);
                    setEditingSubjectName(subj.name);
                    setEditingParentId(subj.parentId ?? "");
                    setSubjectActionError(null);
                  }} disabled={pendingSubjectId !== null}>Editar</button>
                  <button type="button" className={buttonQuietClass} aria-label={`Subir ${subj.name}`} onClick={() => void handleMoveSubject(subj, "up")}
                    disabled={pendingSubjectId !== null || !hasSiblingInDirection(subjects, subj, "up")}>↑ Subir</button>
                  <button type="button" className={buttonQuietClass} aria-label={`Descer ${subj.name}`} onClick={() => void handleMoveSubject(subj, "down")}
                    disabled={pendingSubjectId !== null || !hasSiblingInDirection(subjects, subj, "down")}>↓ Descer</button>
                  <button type="button" className={buttonQuietClass} onClick={() => {
                    setSubjectName("");
                    setSubjectParentId(subj.id);
                    setActiveModal("subject");
                  }} disabled={pendingSubjectId !== null}>+ Subassunto</button>
                  <button type="button" className={buttonQuietClass} onClick={() => void handleArchiveSubject(subj)} disabled={pendingSubjectId !== null}>Arquivar</button>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskSubjectId(subj.id);
                      setTaskTitle(`Estudo focado de ${subj.name}`);
                      setActiveModal("task");
                    }}
                    className={`${buttonSecondaryClass} ml-auto px-3 py-1 text-xs`}
                  >
                    + Estudar assunto
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function orderSubjectsByHierarchy(subjects: SubjectSummary[]): Array<{ subject: SubjectSummary; depth: number }> {
  const byParent = new Map<string | null, SubjectSummary[]>();
  const ids = new Set(subjects.map((subject) => subject.id));
  for (const subject of subjects) {
    const parent = subject.parentId && ids.has(subject.parentId) ? subject.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(subject);
    byParent.set(parent, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  }
  const visited = new Set<string>();
  const result: Array<{ subject: SubjectSummary; depth: number }> = [];
  const visit = (subject: SubjectSummary, depth: number) => {
    if (visited.has(subject.id)) return;
    visited.add(subject.id);
    result.push({ subject, depth });
    for (const child of byParent.get(subject.id) ?? []) visit(child, depth + 1);
  };
  for (const root of byParent.get(null) ?? []) visit(root, 0);
  for (const subject of subjects) visit(subject, 0);
  return result;
}

function isDescendantOf(subjects: SubjectSummary[], subject: SubjectSummary, ancestorId: string): boolean {
  let parentId = subject.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = subjects.find((item) => item.id === parentId)?.parentId ?? null;
  }
  return false;
}

function hasSiblingInDirection(
  subjects: SubjectSummary[],
  subject: SubjectSummary,
  direction: "up" | "down",
): boolean {
  const siblings = subjects
    .filter((item) => item.parentId === subject.parentId)
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  const index = siblings.findIndex((item) => item.id === subject.id);
  return direction === "up" ? index > 0 : index >= 0 && index < siblings.length - 1;
}

function parseLocalDate(dateKey: string | null): Date | null {
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatExamDate(dateKey: string | null): string {
  const date = parseLocalDate(dateKey);
  if (!date) return "Não definida";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatExamCountdown(dateKey: string | null, timezone: string): string {
  const examDate = parseLocalDate(dateKey);
  if (!examDate) return "Informe uma data para acompanhar o prazo";

  const today = parseLocalDate(dateKeyForTimezone(timezone));
  if (!today) return "Não foi possível calcular o prazo";
  const daysUntilExam = Math.round((examDate.getTime() - today.getTime()) / 86_400_000);

  if (daysUntilExam < 0) return "A data informada já passou";
  if (daysUntilExam === 0) return "A prova é hoje";
  return `Faltam ${daysUntilExam} dias`;
}
