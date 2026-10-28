import { buttonPrimaryClass, buttonQuietClass, Eyebrow } from "../../shared/ui/primitives";

type ChecklistStep = {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
};

type GettingStartedChecklistProps = {
  hasPreparation: boolean;
  hasSubjects: boolean;
  hasCycle: boolean;
  isCyclePending: boolean;
  hasTaskToday: boolean;
  onOpenPlan: () => void;
  onDismiss: () => void;
};

export function GettingStartedChecklist({
  hasPreparation,
  hasSubjects,
  hasCycle,
  isCyclePending,
  hasTaskToday,
  onOpenPlan,
  onDismiss,
}: GettingStartedChecklistProps) {
  const steps: ChecklistStep[] = [
    {
      id: "preparation",
      title: "Criar a preparação",
      description: "Informe órgão, cargo e banca do concurso que você vai estudar.",
      isComplete: hasPreparation,
    },
    {
      id: "subjects",
      title: "Cadastrar disciplinas e assuntos",
      description: "Monte a árvore de conteúdos do edital, em ordem de prioridade.",
      isComplete: hasSubjects,
    },
    {
      id: "cycle",
      title: "Montar o ciclo de estudo",
      description: "Defina sua disponibilidade semanal e distribua os assuntos no ciclo.",
      isComplete: hasCycle,
    },
    {
      id: "task",
      title: "Agendar a primeira tarefa",
      description: "Escolha uma ação concreta para hoje e comece a sessão.",
      isComplete: hasTaskToday,
    },
  ];

  const completedCount = steps.filter((step) => step.isComplete).length;
  const isComplete = completedCount === steps.length;
  if (isComplete) return null;

  const nextStep = steps.find((step) => !step.isComplete);
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <section
      className="rounded-2xl border border-blue-500/25 bg-card p-5 shadow-xs lg:p-6"
      aria-labelledby="getting-started-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Primeiros passos</Eyebrow>
          <h3 id="getting-started-title" className="mt-1 font-heading text-lg font-bold text-ink">
            Prepare seu espaço para começar a estudar
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {nextStep
              ? `Próximo passo: ${nextStep.title.toLowerCase()}.`
              : "Configuração concluída."}
          </p>
        </div>
        <button type="button" className={buttonQuietClass} onClick={onDismiss}>
          Ocultar
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep" role="presentation">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted">
          {completedCount} de {steps.length}
        </span>
      </div>

      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => {
          const isPending = !step.isComplete && step.id === "cycle" && isCyclePending;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                step.isComplete
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-line bg-paper/60"
              }`}
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  step.isComplete
                    ? "bg-emerald-500 text-white"
                    : "border border-line bg-card text-muted"
                }`}
                aria-hidden="true"
              >
                {step.isComplete ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    step.isComplete ? "text-ink line-through decoration-emerald-500/50" : "text-ink"
                  }`}
                >
                  {step.title}
                  <span className="sr-only">{step.isComplete ? ": concluído" : ": pendente"}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {isPending ? "Verificando o ciclo salvo..." : step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={`${buttonPrimaryClass} text-xs`} onClick={onOpenPlan}>
          Abrir Plano e continuar
        </button>
        <span className="text-[11px] text-muted">
          Este guia desaparece quando os quatro passos estiverem concluídos.
        </span>
      </div>
    </section>
  );
}
