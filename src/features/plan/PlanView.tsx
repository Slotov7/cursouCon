import { useState, type FormEvent } from "react";
import {
  createPreparation,
  createStudyTask,
  createSubject,
  getDesktopErrorMessage,
} from "../../shared/desktop/commands";
import type { StudyPlan, SubjectSummary } from "../../shared/desktop/contracts";
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
  plan: StudyPlan | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onPlanChanged: () => void;
};

type ActiveModal = "none" | "preparation" | "subject" | "task";

// Sample topics per subject for visual Edital breakdown
const DEMO_SUBJECT_TOPICS: Record<string, { id: string; title: string; completed: boolean }[]> = {
  "Direito Constitucional": [
    { id: "t1", title: "Direitos e Garantias Fundamentais (Art. 5º)", completed: true },
    { id: "t2", title: "Organização do Estado e Entes Federativos", completed: true },
    { id: "t3", title: "Controle de Constitucionalidade (Concentrado e Difuso)", completed: false },
    { id: "t4", title: "Poder Executivo e Atribuições do Presidente", completed: false },
  ],
  "Engenharia de Software": [
    { id: "t5", title: "Engenharia de Requisitos & Casos de Uso", completed: true },
    { id: "t6", title: "Arquitetura Hexagonal, Ports & Adapters e DDD", completed: true },
    { id: "t7", title: "Microsserviços, Mensageria e Event Sourcing", completed: true },
    { id: "t8", title: "Metodologias Ágeis (Scrum, Kanban, Extreme Programming)", completed: false },
  ],
  "Língua Portuguesa": [
    { id: "t9", title: "Interpretação e Compreensão de Textos", completed: true },
    { id: "t10", title: "Sintaxe da Oração e do Período Composto", completed: false },
    { id: "t11", title: "Regência Verbal, Nominal e Emprego da Crase", completed: false },
  ],
  "Bancos de Dados & SQL": [
    { id: "t12", title: "Modelo Relacional, Entidades e Normalização (1FN a 3FN)", completed: true },
    { id: "t13", title: "Linguagem SQL (Queries DDL, DML, Joins e Aggregations)", completed: true },
    { id: "t14", title: "Transações, Propriedades ACID e Índices B-Tree", completed: false },
  ],
  "Direito Administrativo": [
    { id: "t15", title: "Princípios Expressos e Implícitos da Adm. Pública (LIMPE)", completed: true },
    { id: "t16", title: "Atos Administrativos: Atributos, Anulação e Revogação", completed: false },
    { id: "t17", title: "Licitações e Contratos Administrativos (Lei 14.133/21)", completed: false },
  ],
};

export function PlanView({
  plan,
  isLoading,
  error,
  onRetry,
  onPlanChanged,
}: PlanViewProps) {
  const [selectedPreparationId, setSelectedPreparationId] = useState("");
  const [activeModal, setActiveModal] = useState<ActiveModal>("none");
  const [completedTopicMap, setCompletedTopicMap] = useState<Record<string, boolean>>({});

  // Preparation form state
  const [preparationName, setPreparationName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [examDate, setExamDate] = useState("");
  const [makePrimary, setMakePrimary] = useState(true);

  // Subject form state
  const [subjectName, setSubjectName] = useState("");

  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskObjective, setTaskObjective] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("45");
  const [taskDate, setTaskDate] = useState(getLocalDateKey());
  const [taskSubjectId, setTaskSubjectId] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentPlan: StudyPlan = plan ?? { preparations: [], subjects: [] };
  const selectedPreparation =
    currentPlan.preparations.find((prep) => prep.id === selectedPreparationId) ||
    currentPlan.preparations.find((prep) => prep.isPrimary) ||
    currentPlan.preparations[0];
  const primaryPreparation = selectedPreparation;
  const subjects = currentPlan.subjects.filter(
    (subj) => !selectedPreparation || subj.preparationId === selectedPreparation.id,
  );

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
        examDate: examDate || null,
        makePrimary,
      });
      setPreparationName("");
      setOrganization("");
      setRole("");
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
        parentId: null,
      });
      setSubjectName("");
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
        title: taskTitle,
        objective: taskObjective || null,
        plannedMinutes: Number(taskMinutes) || 45,
        scheduledFor: taskDate,
      });
      setTaskTitle("");
      setTaskObjective("");
      setActiveModal("none");
      onPlanChanged();
    } catch (err: unknown) {
      setFormError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTopic = (topicId: string, initialCompleted: boolean) => {
    setCompletedTopicMap((prev) => ({
      ...prev,
      [topicId]: prev[topicId] !== undefined ? !prev[topicId] : !initialCompleted,
    }));
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
          </div>
        </div>
      </section>

      {/* 2. Edital Metrics Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Progresso do Edital</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">64% Concluído</p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
            <div className="h-full w-[64%] rounded-full bg-blue-600 transition-all duration-300"></div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Previsão da Prova</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {primaryPreparation?.examDate || "15 Nov 2026"}
          </p>
          <p className="mt-2 text-[11px] font-medium text-orange-600 dark:text-orange-400">
            Faltam ~54 dias para o grande dia
          </p>
        </div>

        <div className="glass-card rounded-2xl p-4 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-150 ease-out cursor-default">
          <p className="text-xs font-semibold text-muted">Disciplinas do Ciclo</p>
          <p className="mt-1 font-heading text-xl font-extrabold text-ink tabular-nums">
            {subjects.length} Disciplinas
          </p>
          <p className="mt-2 text-[11px] text-muted">Todas ativas no ciclo local</p>
        </div>
      </div>

      {/* 3. Modal / Drawer Forms for adding content */}
      {activeModal !== "none" && (
        <div className="glass-card rounded-2xl p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-fade-in">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h3 className="font-heading text-lg font-bold text-ink">
              {activeModal === "preparation"
                ? "Cadastrar Novo Concurso / Preparação"
                : activeModal === "subject"
                ? "Adicionar Nova Disciplina ao Edital"
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
                Nome da Disciplina
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Ex.: Direito Constitucional"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  disabled={isSubmitting}
                />
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
            <Eyebrow>Grade de Disciplinas</Eyebrow>
            <h3 id="edital-grid-title" className="mt-1 font-heading text-xl font-bold text-ink">
              Conteúdo Programático do Edital
            </h3>
          </div>
          <span className="text-xs font-medium text-muted">
            {subjects.length} disciplinas ativas
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
              onClick={() => setActiveModal("subject")}
              className={`${buttonPrimaryClass} mt-4 text-xs`}
            >
              + Adicionar Primeira Disciplina
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {subjects.map((subj, idx) => {
              const topics = DEMO_SUBJECT_TOPICS[subj.name] || [
                { id: `t-def-1-${subj.id}`, title: `Introdução e Conceitos Fundamentais de ${subj.name}`, completed: true },
                { id: `t-def-2-${subj.id}`, title: `Legislação, Jurisprudência e Súmulas de ${subj.name}`, completed: false },
                { id: `t-def-3-${subj.id}`, title: `Resolução de Questões Avançadas de ${subj.name}`, completed: false },
              ];

              const completedCount = topics.filter((t) =>
                completedTopicMap[t.id] !== undefined ? completedTopicMap[t.id] : t.completed,
              ).length;
              const percent = Math.round((completedCount / topics.length) * 100);

              return (
                <div
                  key={subj.id}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-xs transition-all hover:border-blue-500/40"
                >
                  <div>
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted">
                          Disciplina 0{idx + 1}
                        </span>
                        <h4 className="font-heading text-lg font-bold text-ink mt-0.5">{subj.name}</h4>
                      </div>

                      <div className="grid text-right">
                        <span className="font-heading text-base font-extrabold text-blue-600">{percent}%</span>
                        <span className="text-[10px] text-muted">do edital</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>

                    {/* Topics Checklist */}
                    <div className="mt-4 grid gap-2">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
                        Tópicos do Edital:
                      </p>
                      {topics.map((topic) => {
                        const isDone =
                          completedTopicMap[topic.id] !== undefined
                            ? completedTopicMap[topic.id]
                            : topic.completed;

                        return (
                          <label
                            key={topic.id}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-all ${
                              isDone
                                ? "border-emerald-500/20 bg-emerald-500/5 text-ink line-through opacity-75"
                                : "border-line bg-paper text-ink hover:bg-paper-deep"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => toggleTopic(topic.id, topic.completed)}
                              className="mt-0.5 size-4 accent-emerald-600 shrink-0"
                            />
                            <span className="leading-snug">{topic.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs font-semibold text-muted">
                      {completedCount} de {topics.length} tópicos concluídos
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskSubjectId(subj.id);
                        setTaskTitle(`Estudo focado de ${subj.name}`);
                        setActiveModal("task");
                      }}
                      className={`${buttonSecondaryClass} px-3 py-1 text-xs`}
                    >
                      + Estudar Matéria
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function getLocalDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
