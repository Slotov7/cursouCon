import { useEffect, useRef, useState } from "react";
import { createFlashcard, getDesktopErrorMessage, getFlashcards, reviewFlashcard } from "../../shared/desktop/commands";
import type { FlashcardSummary, StudyPlan } from "../../shared/desktop/contracts";
import { dateKeyForTimezone } from "../../shared/date";
import { buttonPrimaryClass, buttonSecondaryClass, Eyebrow, fieldClass, selectClass, textareaClass } from "../../shared/ui/primitives";

type Rating = "again" | "hard" | "good" | "easy";
const LEGACY_KEY = "cursoucon.flashcards.v1";

type LegacyCard = { front: string; back: string; schedule?: { intervalDays: number; ease: number; repetitions: number; dueDate: string } };

function legacyCards(): LegacyCard[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LegacyCard =>
      typeof item === "object" && item !== null &&
      item.id !== "local-demo" &&
      typeof item.front === "string" && item.front.trim().length > 0 &&
      typeof item.back === "string" && item.back.trim().length > 0)
      .map((item) => ({ front: item.front, back: item.back, schedule: item.schedule }));
  } catch { return []; }
}

export function FlashcardsView({ plan, timezone }: { plan: StudyPlan | null; timezone: string }) {
  const [cards, setCards] = useState<FlashcardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [showBack, setShowBack] = useState(false);
  const [legacyCount, setLegacyCount] = useState(() => legacyCards().length);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const operationId = useRef<string | null>(null);
  const today = dateKeyForTimezone(timezone);

  const load = async (nextOffset = 0) => {
    setLoading(true);
    try {
      const result = await getFlashcards(today, nextOffset);
      setCards((previous) => nextOffset === 0 ? result : [...previous, ...result]);
      setOffset(nextOffset);
      setHasMore(result.length === 100);
      setError(null);
    } catch (failure: unknown) {
      setError(getDesktopErrorMessage(failure));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [today]);

  const due = cards.find((card) => card.dueDate <= today);
  const dueCount = cards.filter((card) => card.dueDate <= today).length;

  const create = async () => {
    if (!front.trim() || !back.trim() || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await createFlashcard({ front: front.trim(), back: back.trim(), subjectId: subjectId || null, today });
      setFront(""); setBack(""); setSubjectId("");
      setMessage("Cartão salvo no espaço de estudos.");
      await load();
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  const rate = async (rating: Rating) => {
    if (!due || busy) return;
    setBusy(true); setError(null);
    operationId.current ??= crypto.randomUUID();
    try {
      await reviewFlashcard({ id: due.id, rating, today, operationId: operationId.current });
      operationId.current = null;
      setShowBack(false);
      setMessage("Avaliação salva no espaço de estudos.");
      await load();
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  const importLegacy = async () => {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const pending = legacyCards();
      for (let i = 0; i < pending.length; i += 1) {
        const old = pending[i];
        const schedule = old.schedule;
        const validSchedule = schedule && Number.isInteger(schedule.intervalDays) &&
          Number.isFinite(schedule.ease) && Number.isInteger(schedule.repetitions) &&
          typeof schedule.dueDate === "string";
        await createFlashcard({ front: old.front, back: old.back, subjectId: null, today,
          legacySchedule: validSchedule ? { ...schedule, ease: Math.round(schedule.ease * 100) } : undefined });
        // Keep remaining data if the import is interrupted; do not auto-import into another space.
        localStorage.setItem(LEGACY_KEY, JSON.stringify(pending.slice(i + 1)));
        setLegacyCount(pending.length - i - 1);
      }
      setMessage("Cartões antigos importados para este espaço.");
      await load();
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  return <div className="grid gap-6">
    <section className="glass-hero rounded-3xl p-6 text-white lg:p-8">
      <Eyebrow light>Revisão espaçada · algoritmo v1</Eyebrow>
      <h2 className="mt-2 font-heading text-3xl font-bold">Flashcards</h2>
      <p className="mt-2 text-sm text-white/75">{dueCount} cartão(ões) vencido(s) entre os {cards.length} carregados. Dados salvos no SQLite do espaço.</p>
    </section>
    {error && <p className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger" role="alert">{error} <button type="button" onClick={() => void load()} className={buttonSecondaryClass}>Tentar novamente</button></p>}
    {message && <p className="text-sm text-forest-ink" role="status">{message}</p>}
    {legacyCount > 0 && <section className="rounded-xl border border-line bg-card p-4 text-sm text-ink">
      <p>{legacyCount} cartão(ões) da versão anterior foram encontrados neste dispositivo. Eles não estavam associados a um espaço: confirme que este é o espaço correto antes de importar.</p>
      <button type="button" className={`${buttonSecondaryClass} mt-3`} onClick={() => void importLegacy()} disabled={busy}>Importar cartões antigos para este espaço</button>
    </section>}
    <section className="grid gap-3 rounded-2xl border border-line bg-card p-5" aria-labelledby="new-flashcard-title">
      <h3 id="new-flashcard-title" className="font-heading text-lg font-bold text-ink">Criar flashcard</h3>
      <label className={fieldClass}>Frente <textarea className={textareaClass} maxLength={5000} value={front} onChange={(event) => setFront(event.target.value)} /></label>
      <label className={fieldClass}>Verso <textarea className={textareaClass} maxLength={10000} value={back} onChange={(event) => setBack(event.target.value)} /></label>
      <label className={fieldClass}>Assunto (opcional)
        <select className={selectClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Sem assunto</option>
          {plan?.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <button type="button" className={`${buttonPrimaryClass} justify-self-start`} onClick={() => void create()} disabled={busy || !front.trim() || !back.trim()}>{busy ? "Salvando..." : "Salvar cartão"}</button>
    </section>
    {loading && cards.length === 0 ? <p className="text-sm text-muted">Carregando flashcards...</p> : due ?
      <section className="mx-auto grid w-full max-w-2xl gap-5 rounded-2xl border border-line bg-card p-6 text-center shadow-xs" aria-label="Revisar flashcard">
        <span className="text-xs font-bold uppercase text-muted">Próxima revisão · {due.dueDate}</span>
        <button type="button" className="grid min-h-48 place-items-center rounded-2xl border border-line bg-paper p-8 text-left text-ink" onClick={() => setShowBack((visible) => !visible)}>{showBack ? due.back : due.front}</button>
        {!showBack ? <button type="button" className={`${buttonPrimaryClass} justify-self-center`} onClick={() => setShowBack(true)}>Mostrar resposta</button> :
          <div className="grid gap-2 sm:grid-cols-4">{(["again", "hard", "good", "easy"] as const).map((rating, index) =>
            <button key={rating} type="button" className={buttonSecondaryClass} disabled={busy} onClick={() => void rate(rating)}>{["Novamente", "Difícil", "Bom", "Fácil"][index]}</button>)}</div>}
      </section> : <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted">Nenhuma revisão vencida entre os cartões carregados.</p>}
    {hasMore && <button type="button" className={buttonSecondaryClass} disabled={loading} onClick={() => void load(offset + 100)}>Carregar mais cartões</button>}
  </div>;
}
