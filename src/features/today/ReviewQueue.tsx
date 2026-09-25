import { useState } from "react";
import { dateKeyForTimezone } from "../../shared/date";
import { completeStudyReview, getDesktopErrorMessage, rescheduleStudyReview } from "../../shared/desktop/commands";
import type { StudyReviewSummary } from "../../shared/desktop/contracts";
import { buttonPrimaryClass, buttonQuietClass, buttonSecondaryClass, Eyebrow, fieldClass, inputClass } from "../../shared/ui/primitives";

type ReviewQueueProps = {
  reviews: StudyReviewSummary[];
  onDataChanged: () => void;
  timezone: string;
};

export function ReviewQueue({ reviews, onDataChanged, timezone }: ReviewQueueProps) {
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleComplete = async (review: StudyReviewSummary) => {
    setPendingReviewId(review.id);
    setError(null);
    setMessage(null);
    try {
      const result = await completeStudyReview({ reviewId: review.id });
      setMessage(
        result.xpGranted > 0
          ? `Revisão de ${review.subjectName} concluída. +${result.xpGranted} XP.`
          : `Revisão de ${review.subjectName} concluída.`,
      );
      onDataChanged();
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingReviewId(null);
    }
  };

  const handleReschedule = async (review: StudyReviewSummary) => {
    if (!dueDate) {
      setError("Escolha a nova data da revisão.");
      return;
    }
    setPendingReviewId(review.id);
    setError(null);
    setMessage(null);
    try {
      await rescheduleStudyReview({ reviewId: review.id, dueDate });
      setMessage(`Revisão de ${review.subjectName} reagendada.`);
      setEditingReviewId(null);
      onDataChanged();
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingReviewId(null);
    }
  };

  return (
    <section className="glass-card grid gap-4 rounded-2xl p-5 shadow-xs lg:p-6" aria-labelledby="review-queue-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <Eyebrow>Revisões de conteúdo</Eyebrow>
          <h3 id="review-queue-title" className="mt-1 font-heading text-lg font-bold text-ink">
            Para revisar hoje
          </h3>
        </div>
        <span className="text-xs font-semibold text-muted">
          {reviews.length} {reviews.length === 1 ? "pendente" : "pendentes"}
        </span>
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">{message}</p>}

      {reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper p-5 text-center text-xs text-muted">
          Nenhuma revisão vencida. Ao concluir uma sessão vinculada a um assunto, você pode agendar a próxima.
        </p>
      ) : (
        <ul className="grid gap-3">
          {reviews.map((review) => {
            const isOverdue = review.dueDate < dateKeyForTimezone(timezone);
            const isEditing = editingReviewId === review.id;
            const isPending = pendingReviewId === review.id;

            return (
              <li key={review.id} className="grid gap-3 rounded-xl border border-line bg-paper/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isOverdue ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>
                      {isOverdue ? "Vencida" : "Vence hoje"}
                    </span>
                    <span className="text-[10px] font-medium text-muted">{formatDate(review.dueDate)}</span>
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-ink">{review.subjectName}</h4>
                  <p className="mt-1 text-xs text-muted">Revisão vinculada ao assunto estudado.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={`${buttonPrimaryClass} min-h-9 px-3 text-xs`} onClick={() => void handleComplete(review)} disabled={isPending}>
                    {isPending ? "Salvando..." : "Concluir revisão"}
                  </button>
                  <button
                    type="button"
                    className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
                    onClick={() => {
                      setEditingReviewId(isEditing ? null : review.id);
                      setDueDate(review.dueDate);
                      setError(null);
                    }}
                    disabled={isPending}
                    aria-expanded={isEditing}
                  >
                    Reagendar
                  </button>
                </div>
                {isEditing && (
                  <div className="grid w-full gap-2 border-t border-line pt-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                    <label className={fieldClass}>
                      Nova data da revisão
                      <input className={inputClass} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={isPending} />
                    </label>
                    <button type="button" className={`${buttonPrimaryClass} min-h-9 px-3 text-xs`} onClick={() => void handleReschedule(review)} disabled={isPending}>
                      Salvar data
                    </button>
                    <button type="button" className={`${buttonQuietClass} min-h-9 px-3 text-xs`} onClick={() => setEditingReviewId(null)} disabled={isPending}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
