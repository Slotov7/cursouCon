import { useEffect, useState } from "react";
import {
  advanceStudyCycle,
  getDesktopErrorMessage,
  saveStudyPlanning,
} from "../../shared/desktop/commands";
import type {
  StudyCycleSlotSummary,
  StudyDayAvailability,
  StudyPlanningSummary,
  SubjectSummary,
} from "../../shared/desktop/contracts";
import {
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  fieldClass,
  inputClass,
  selectClass,
} from "../../shared/ui/primitives";

type StudyCyclePanelProps = {
  preparationId: string;
  subjects: SubjectSummary[];
  planning: StudyPlanningSummary | null;
  isLoading: boolean;
  error: string | null;
  onChanged: (planning: StudyPlanningSummary) => void;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DEFAULT_AVAILABILITY: StudyDayAvailability[] = WEEKDAYS.map((_, weekday) => ({
  weekday,
  availableMinutes: weekday > 0 && weekday < 6 ? 60 : 0,
  isRest: weekday === 0 || weekday === 6,
}));

export function StudyCyclePanel({
  preparationId,
  subjects,
  planning,
  isLoading,
  error,
  onChanged,
}: StudyCyclePanelProps) {
  const [availability, setAvailability] = useState<StudyDayAvailability[]>(DEFAULT_AVAILABILITY);
  const [priorities, setPriorities] = useState<Record<string, number>>({});
  const [reviewReservePercent, setReviewReservePercent] = useState(20);
  const [cycleSlots, setCycleSlots] = useState<StudyCycleSlotSummary[]>([]);
  const [cycleDirty, setCycleDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const subjectSignature = subjects
    .map((subject) => `${subject.id}:${subject.priority}`)
    .join("|");

  useEffect(() => {
    if (planning?.preparationId !== preparationId) {
      return;
    }
    setAvailability(planning.availability);
    setReviewReservePercent(planning.reviewReservePercent);
    setCycleSlots(planning.cycleSlots);
    setCycleDirty(false);
    const planningPriorities = Object.fromEntries(
      planning.subjectPriorities.map((subject) => [subject.subjectId, subject.priority]),
    );
    setPriorities(
      Object.fromEntries(
        subjects.map((subject) => [subject.id, planningPriorities[subject.id] ?? subject.priority]),
      ),
    );
  }, [planning, preparationId, subjectSignature]);

  const weeklyMinutes = availability.reduce(
    (total, day) => total + day.availableMinutes,
    0,
  );
  const weeklyStudyMinutes = Math.floor(
    (weeklyMinutes * (100 - reviewReservePercent)) / 100,
  );
  const currentSlot = cycleSlots[planning?.cyclePosition ?? 0] ?? null;

  const updateDay = (weekday: number, update: Partial<StudyDayAvailability>) => {
    setAvailability((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...update } : day)),
    );
    setSavedMessage(null);
  };

  const handleSave = async () => {
    setOperationError(null);
    setSavedMessage(null);
    setIsSaving(true);
    try {
      const nextPlanning = await saveStudyPlanning({
        preparationId,
        availability,
        subjectPriorities: subjects.map((subject) => ({
          subjectId: subject.id,
          priority: priorities[subject.id] ?? subject.priority,
        })),
        reviewReservePercent,
        cycleSlots: cycleDirty
          ? cycleSlots.map((slot) => ({
              subjectId: slot.subjectId,
              plannedMinutes: slot.plannedMinutes,
            }))
          : undefined,
      });
      setCycleDirty(false);
      onChanged(nextPlanning);
      setSavedMessage("Ritmo e prioridades salvos localmente.");
    } catch (saveError: unknown) {
      setOperationError(getDesktopErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const updateCycleSlot = (index: number, update: Partial<StudyCycleSlotSummary>) => {
    setCycleSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...update, position: slotIndex } : slot,
      ),
    );
    setCycleDirty(true);
    setSavedMessage(null);
  };

  const moveCycleSlot = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= cycleSlots.length) return;
    setCycleSlots((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((slot, position) => ({ ...slot, position }));
    });
    setCycleDirty(true);
    setSavedMessage(null);
  };

  const addCycleSlot = () => {
    if (subjects.length === 0) return;
    const subject = subjects[cycleSlots.length % subjects.length];
    if (!subject) return;
    const plannedMinutes = cycleSlots.reduce((total, slot) => total + slot.plannedMinutes, 0);
    if (plannedMinutes + 30 > weeklyStudyMinutes) {
      setOperationError("Não há minutos disponíveis para adicionar outro bloco ao ciclo.");
      return;
    }
    setCycleSlots((current) => [
      ...current,
      {
        position: current.length,
        subjectId: subject.id,
        subjectName: subject.name,
        priority: priorities[subject.id] ?? subject.priority,
        plannedMinutes: 30,
      },
    ]);
    setCycleDirty(true);
    setOperationError(null);
    setSavedMessage(null);
  };

  const removeCycleSlot = (index: number) => {
    if (cycleSlots.length <= 1) {
      setOperationError("O ciclo precisa manter ao menos um bloco.");
      return;
    }
    setCycleSlots((current) =>
      current.filter((_, slotIndex) => slotIndex !== index).map((slot, position) => ({ ...slot, position })),
    );
    setCycleDirty(true);
    setOperationError(null);
    setSavedMessage(null);
  };

  const resetCycle = () => {
    setCycleDirty(false);
    setSavedMessage("O ciclo será recalculado ao salvar.");
  };

  const handleAdvance = async () => {
    setOperationError(null);
    setSavedMessage(null);
    setIsAdvancing(true);
    try {
      const nextPlanning = await advanceStudyCycle({ preparationId });
      onChanged(nextPlanning);
    } catch (advanceError: unknown) {
      setOperationError(getDesktopErrorMessage(advanceError));
    } finally {
      setIsAdvancing(false);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-5 shadow-xs" aria-labelledby="study-cycle-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Configuração local</p>
          <h3 id="study-cycle-title" className="mt-1 font-heading text-xl font-bold text-ink">
            Ritmo e ciclo de estudos
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            O ciclo distribui blocos de 30 minutos sem ultrapassar o tempo informado. Prioridade 1 recebe mais peso que prioridade 5.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <span className="block font-semibold text-ink">{formatMinutes(weeklyStudyMinutes)} para estudar</span>
          <span className="block">{formatMinutes(weeklyMinutes)} disponíveis · {reviewReservePercent}% para revisões</span>
          <span>{isLoading ? "Lendo configuração..." : "Salvo somente neste espaço"}</span>
        </div>
      </div>

      {(error || operationError) && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {operationError ?? error}
        </p>
      )}
      {savedMessage && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700" role="status">
          {savedMessage}
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {availability.map((day) => (
          <div key={day.weekday} className="rounded-xl border border-line bg-paper/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink">{WEEKDAYS[day.weekday]}</span>
              <label className="flex items-center gap-1 text-[10px] font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={day.isRest}
                  onChange={(event) =>
                    updateDay(day.weekday, {
                      isRest: event.target.checked,
                      availableMinutes: event.target.checked ? 0 : Math.max(day.availableMinutes, 30),
                    })
                  }
                  className="size-3.5 accent-blue-600"
                />
                Folga
              </label>
            </div>
            <label className={`${fieldClass} mt-3`}>
              Minutos
              <input
                className={`${inputClass} mt-1`}
                type="number"
                min="0"
                max="1440"
                step="30"
                value={day.availableMinutes}
                onChange={(event) =>
                  updateDay(day.weekday, {
                    availableMinutes: Math.min(1440, Math.max(0, Number(event.target.value) || 0)),
                    isRest: false,
                  })
                }
                disabled={day.isRest || isSaving}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/45 p-3">
        <label className={`${fieldClass} min-w-56`}>
          Reserva para revisões
          <select
            className={`${selectClass} mt-1`}
            value={reviewReservePercent}
            onChange={(event) => {
              setReviewReservePercent(Number(event.target.value));
              setSavedMessage(null);
            }}
            disabled={isSaving || isAdvancing}
          >
            {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((percent) => (
              <option key={percent} value={percent}>{percent}% da disponibilidade</option>
            ))}
          </select>
        </label>
        <p className="max-w-xl text-[11px] leading-relaxed text-muted">
          Essa parcela fica fora da geração do ciclo principal e mantém espaço para revisões vencidas.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-heading text-sm font-bold text-ink">Peso das disciplinas</h4>
              <p className="mt-1 text-[11px] text-muted">Use 1 para o foco mais urgente e 5 para o menor peso.</p>
            </div>
            <button
              type="button"
              className={buttonPrimaryClass}
              onClick={() => void handleSave()}
              disabled={isSaving || isAdvancing || subjects.length === 0}
            >
              {isSaving ? "Salvando..." : "Salvar ciclo"}
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {subjects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">
                Cadastre uma disciplina para definir prioridades.
              </p>
            ) : (
              subjects.map((subject) => (
                <label key={subject.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/45 px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-ink">{subject.name}</span>
                  <select
                    className={`${selectClass} w-32 shrink-0 py-1.5 text-xs`}
                    value={priorities[subject.id] ?? subject.priority}
                    onChange={(event) => {
                      setPriorities((current) => ({ ...current, [subject.id]: Number(event.target.value) }));
                      setSavedMessage(null);
                    }}
                    disabled={isSaving || isAdvancing}
                    aria-label={`Prioridade de ${subject.name}`}
                  >
                    <option value="1">1 · Alta</option>
                    <option value="2">2 · Forte</option>
                    <option value="3">3 · Normal</option>
                    <option value="4">4 · Baixa</option>
                    <option value="5">5 · Menor</option>
                  </select>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-paper/55 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-heading text-sm font-bold text-ink">Próxima posição</h4>
              <p className="mt-1 text-[11px] text-muted">
                {cycleSlots.length ? `${cycleSlots.length} blocos neste ciclo` : "O ciclo ainda não foi gerado"}
              </p>
            </div>
            <button
              type="button"
              className={`${buttonSecondaryClass} px-3 py-1.5 text-xs`}
              onClick={addCycleSlot}
              disabled={isSaving || isAdvancing || subjects.length === 0 || weeklyStudyMinutes < 30}
            >
              + Adicionar bloco
            </button>
          </div>
          {cycleSlots.length === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Salve a disponibilidade e as prioridades para criar o primeiro ciclo.
            </p>
          ) : (
            <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto pr-1">
              {cycleSlots.map((slot, index) => (
                <div
                  key={`${slot.subjectId}-${index}`}
                  className={`grid grid-cols-[auto_minmax(0,1fr)_78px_auto] items-center gap-2 rounded-xl border p-2 ${
                    index === planning?.cyclePosition
                      ? "border-blue-500/40 bg-blue-500/10"
                      : "border-line bg-card"
                  }`}
                >
                  <span className="w-6 text-center text-[10px] font-bold text-muted">{index + 1}</span>
                  <select
                    className={`${selectClass} min-w-0 py-1.5 text-xs`}
                    value={slot.subjectId}
                    onChange={(event) => {
                      const subject = subjects.find((item) => item.id === event.target.value);
                      if (subject) updateCycleSlot(index, { subjectId: subject.id, subjectName: subject.name, priority: subject.priority });
                    }}
                    disabled={isSaving || isAdvancing}
                    aria-label={`Assunto do bloco ${index + 1}`}
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} px-2 py-1.5 text-xs`}
                    type="number"
                    min="5"
                    max="1440"
                    step="5"
                    value={slot.plannedMinutes}
                    onChange={(event) => updateCycleSlot(index, { plannedMinutes: Math.max(5, Number(event.target.value) || 5) })}
                    disabled={isSaving || isAdvancing}
                    aria-label={`Duração do bloco ${index + 1}`}
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" className="rounded-md px-1.5 py-1 text-xs text-muted hover:bg-paper-deep disabled:opacity-40" onClick={() => moveCycleSlot(index, -1)} disabled={index === 0 || isSaving || isAdvancing} aria-label="Mover bloco para cima">↑</button>
                    <button type="button" className="rounded-md px-1.5 py-1 text-xs text-muted hover:bg-paper-deep disabled:opacity-40" onClick={() => moveCycleSlot(index, 1)} disabled={index === cycleSlots.length - 1 || isSaving || isAdvancing} aria-label="Mover bloco para baixo">↓</button>
                    <button type="button" className={`${buttonQuietClass} px-1.5 py-1 text-xs`} onClick={() => removeCycleSlot(index)} disabled={cycleSlots.length <= 1 || isSaving || isAdvancing} aria-label={`Remover bloco ${index + 1}`}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={`${buttonSecondaryClass} px-3 py-1.5 text-xs`} onClick={resetCycle} disabled={!cycleSlots.length || isSaving || isAdvancing}>Recalcular ciclo</button>
            <button type="button" className={`${buttonSecondaryClass} px-3 py-1.5 text-xs`} onClick={() => void handleAdvance()} disabled={isSaving || isAdvancing || !cycleSlots.length}>
              {isAdvancing ? "Avançando..." : "Avançar posição"}
            </button>
          </div>
          {currentSlot && (
            <p className="mt-3 text-[11px] text-muted">Próximo: <strong className="text-ink">{currentSlot.subjectName}</strong> · {currentSlot.plannedMinutes} min</p>
          )}
          {planning?.warning && (
            <p className="mt-3 text-[11px] leading-relaxed text-orange-700">{planning.warning}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}
