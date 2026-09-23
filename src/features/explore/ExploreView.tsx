import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getDesktopErrorMessage,
  getManualContests,
  saveManualContest,
  setManualContestFavorite,
} from "../../shared/desktop/commands";
import type {
  ContestStatus,
  ManualContestSummary,
  SaveManualContestRequest,
} from "../../shared/desktop/contracts";
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

type ExploreViewProps = {
  refreshKey: number;
};

type ContestFormState = Omit<SaveManualContestRequest, "id">;
type ContestFilter = "all" | "favorites";

const STATUS_OPTIONS: Array<{ value: ContestStatus; label: string }> = [
  { value: "expected", label: "Previsto" },
  { value: "authorized", label: "Autorizado" },
  { value: "notice_published", label: "Edital publicado" },
  { value: "registration_open", label: "Inscrições abertas" },
  { value: "registration_closed", label: "Inscrições encerradas" },
  { value: "completed", label: "Concluído" },
];

const EMPTY_FORM: ContestFormState = {
  name: "",
  organization: null,
  role: null,
  board: null,
  sourceUrl: null,
  status: "expected",
  registrationStartsOn: null,
  registrationEndsOn: null,
  feeDeadline: null,
  examDate: null,
  notes: null,
};

export function ExploreView({ refreshKey }: ExploreViewProps) {
  const [contests, setContests] = useState<ManualContestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContestFilter>("all");
  const [form, setForm] = useState<ContestFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getManualContests()
      .then((loadedContests) => {
        if (!cancelled) {
          setContests(loadedContests);
          setError(null);
        }
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

  const visibleContests = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return contests.filter((contest) => {
      if (filter === "favorites" && !contest.isFavorite) return false;
      if (!normalizedSearch) return true;
      return [contest.name, contest.organization, contest.role, contest.board]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });
  }, [contests, filter, search]);

  const openNewContestForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditContestForm = (contest: ManualContestSummary) => {
    setEditingId(contest.id);
    setForm({
      name: contest.name,
      organization: contest.organization,
      role: contest.role,
      board: contest.board,
      sourceUrl: contest.sourceUrl,
      status: contest.status,
      registrationStartsOn: contest.registrationStartsOn,
      registrationEndsOn: contest.registrationEndsOn,
      feeDeadline: contest.feeDeadline,
      examDate: contest.examDate,
      notes: contest.notes,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const request: SaveManualContestRequest = {
        id: editingId,
        ...form,
        name: form.name.trim(),
        organization: normalizeOptionalValue(form.organization),
        role: normalizeOptionalValue(form.role),
        board: normalizeOptionalValue(form.board),
        sourceUrl: normalizeOptionalValue(form.sourceUrl),
        registrationStartsOn: normalizeOptionalValue(form.registrationStartsOn),
        registrationEndsOn: normalizeOptionalValue(form.registrationEndsOn),
        feeDeadline: normalizeOptionalValue(form.feeDeadline),
        examDate: normalizeOptionalValue(form.examDate),
        notes: normalizeOptionalValue(form.notes),
      };
      const savedContest = await saveManualContest(request);
      setContests((previous) => {
        const updated = previous.some((contest) => contest.id === savedContest.id)
          ? previous.map((contest) => contest.id === savedContest.id ? savedContest : contest)
          : [savedContest, ...previous];
        return updated.sort(compareContests);
      });
      setIsFormOpen(false);
      setMessage(editingId ? "Concurso atualizado localmente." : "Concurso salvo localmente.");
    } catch (operationError: unknown) {
      setFormError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFavorite = async (contest: ManualContestSummary) => {
    setPendingFavoriteId(contest.id);
    setError(null);
    setMessage(null);
    try {
      const updatedContest = await setManualContestFavorite({
        contestId: contest.id,
        isFavorite: !contest.isFavorite,
      });
      setContests((previous) =>
        previous.map((item) => item.id === updatedContest.id ? updatedContest : item).sort(compareContests),
      );
      setMessage(updatedContest.isFavorite
        ? "Concurso adicionado aos favoritos."
        : "Concurso removido dos favoritos.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingFavoriteId(null);
    }
  };

  const openRegistrations = contests.filter((contest) => contest.status === "registration_open").length;
  const favoriteCount = contests.filter((contest) => contest.isFavorite).length;

  return (
    <div className="grid gap-6">
      <section className="glass-hero relative overflow-hidden rounded-3xl border border-white/12 p-6 text-white shadow-xl lg:p-8">
        <div className="relative z-10 grid max-w-3xl gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300">
              Acompanhamento local
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              Cadastro manual · disponível offline
            </span>
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-white lg:text-3xl">
              Concursos e oportunidades
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/85">
              Registre fontes, cargos e prazos conhecidos para acompanhar oportunidades importantes.
              As informações são inseridas por você; esta tela ainda não consulta fontes externas.
            </p>
          </div>
          <button type="button" onClick={openNewContestForm} className={buttonPrimaryClass}>
            + Cadastrar concurso
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600" role="alert">
          <span>{error}</span>
          <button type="button" className={buttonSecondaryClass} onClick={() => setRetryVersion((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {message && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
          <span>{message}</span>
          <button type="button" className="font-bold" onClick={() => setMessage(null)} aria-label="Fechar mensagem">
            ×
          </button>
        </div>
      )}

      {isFormOpen && (
        <section className="glass-card rounded-2xl border border-blue-500/25 p-5 shadow-xs lg:p-6" role="dialog" aria-modal="true" aria-labelledby="contest-form-title">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-3">
            <div>
              <Eyebrow>{editingId ? "Editar registro" : "Novo registro"}</Eyebrow>
              <h3 id="contest-form-title" className="mt-1 font-heading text-lg font-bold text-ink">
                {editingId ? "Atualizar concurso" : "Cadastrar concurso manualmente"}
              </h3>
            </div>
            <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              Fechar
            </button>
          </div>
          {formError && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{formError}</p>}
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className={`${fieldClass} sm:col-span-2`}>
              Concurso / identificação <span className="text-red-600">*</span>
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} required disabled={isSaving} placeholder="Ex.: Concurso do Senado — Analista Legislativo" />
            </label>
            <label className={fieldClass}>
              Órgão <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={form.organization ?? ""} onChange={(event) => setForm({ ...form, organization: event.target.value })} maxLength={120} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Cargo <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={form.role ?? ""} onChange={(event) => setForm({ ...form, role: event.target.value })} maxLength={120} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Banca <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={form.board ?? ""} onChange={(event) => setForm({ ...form, board: event.target.value })} maxLength={120} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Situação informada
              <select className={selectClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ContestStatus })} disabled={isSaving}>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className={`${fieldClass} sm:col-span-2`}>
              URL da fonte <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="url" value={form.sourceUrl ?? ""} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} maxLength={2048} disabled={isSaving} placeholder="https://..." />
            </label>
            <label className={fieldClass}>
              Início das inscrições <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="date" value={form.registrationStartsOn ?? ""} onChange={(event) => setForm({ ...form, registrationStartsOn: event.target.value })} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Fim das inscrições <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="date" value={form.registrationEndsOn ?? ""} onChange={(event) => setForm({ ...form, registrationEndsOn: event.target.value })} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Prazo de pagamento <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="date" value={form.feeDeadline ?? ""} onChange={(event) => setForm({ ...form, feeDeadline: event.target.value })} disabled={isSaving} />
            </label>
            <label className={fieldClass}>
              Data da prova <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="date" value={form.examDate ?? ""} onChange={(event) => setForm({ ...form, examDate: event.target.value })} disabled={isSaving} />
            </label>
            <label className={`${fieldClass} sm:col-span-2`}>
              Observações <span className="font-normal text-muted">(opcional)</span>
              <textarea className={textareaClass} value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={10000} disabled={isSaving} placeholder="Anote requisitos a conferir ou informações ainda não confirmadas." />
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-3 sm:col-span-2">
              <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</button>
              <button type="submit" className={buttonPrimaryClass} disabled={isSaving}>
                {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar concurso"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumo de oportunidades">
        <SummaryCard label="Concursos cadastrados" value={isLoading || error ? "—" : contests.length} detail="Registros locais" />
        <SummaryCard label="Favoritos" value={isLoading || error ? "—" : favoriteCount} detail="Acompanhados por você" />
        <SummaryCard label="Inscrições abertas" value={isLoading || error ? "—" : openRegistrations} detail="Conforme situação informada" />
      </section>

      <section className="glass-card grid gap-4 rounded-2xl p-5 shadow-xs lg:p-6" aria-labelledby="contest-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <Eyebrow>Oportunidades salvas</Eyebrow>
            <h3 id="contest-list-title" className="mt-1 font-heading text-lg font-bold text-ink">Meus concursos</h3>
          </div>
          <span className="text-xs font-semibold text-muted">{visibleContests.length} exibidos</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className={fieldClass}>
            Buscar por concurso, órgão, cargo ou banca
            <input className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: Analista de TI" />
          </label>
          <div className="flex items-end gap-1 rounded-xl border border-line bg-paper p-1" role="group" aria-label="Filtrar concursos">
            <button type="button" className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${filter === "all" ? "bg-card text-ink shadow-xs" : "text-muted"}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos</button>
            <button type="button" className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${filter === "favorites" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-xs" : "text-muted"}`} aria-pressed={filter === "favorites"} onClick={() => setFilter("favorites")}>★ Favoritos</button>
          </div>
        </div>

        {isLoading ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted" aria-live="polite">Carregando concursos locais...</p>
        ) : error ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
            Não foi possível carregar a lista. Tente novamente para consultar os registros locais.
          </p>
        ) : visibleContests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center">
            <p className="text-sm font-semibold text-ink">
              {contests.length === 0 ? "Nenhum concurso cadastrado ainda." : "Nenhum concurso corresponde aos filtros."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {contests.length === 0 ? "Cadastre uma oportunidade para guardar situação, fonte e prazos conhecidos." : "Ajuste a busca ou confira o filtro de favoritos."}
            </p>
            {contests.length === 0 && <button type="button" className={`${buttonPrimaryClass} mt-4`} onClick={openNewContestForm}>Cadastrar primeiro concurso</button>}
          </div>
        ) : (
          <div className="grid gap-3">
            {visibleContests.map((contest) => (
              <ContestCard
                key={contest.id}
                contest={contest}
                isFavoritePending={pendingFavoriteId === contest.id}
                onEdit={() => openEditContestForm(contest)}
                onToggleFavorite={() => void handleToggleFavorite(contest)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 shadow-xs">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 font-heading text-xl font-extrabold tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-[11px] text-muted">{detail}</p>
    </div>
  );
}

function ContestCard({
  contest,
  isFavoritePending,
  onEdit,
  onToggleFavorite,
}: {
  contest: ManualContestSummary;
  isFavoritePending: boolean;
  onEdit: () => void;
  onToggleFavorite: () => void;
}) {
  const deadlines = [
    ["Inscrições", formatDateRange(contest.registrationStartsOn, contest.registrationEndsOn)],
    ["Pagamento", formatDate(contest.feeDeadline)],
    ["Prova", formatDate(contest.examDate)],
  ] as const;

  return (
    <article className="rounded-2xl border border-line bg-card p-4 shadow-xs transition-colors hover:border-blue-500/35 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(contest.status)}`}>
              {statusLabel(contest.status)}
            </span>
            {contest.board && <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-semibold text-muted">{contest.board}</span>}
          </div>
          <h4 className="mt-2 font-heading text-base font-bold text-ink">{contest.name}</h4>
          <p className="mt-1 text-xs text-muted">
            {[contest.organization, contest.role].filter(Boolean).join(" · ") || "Órgão e cargo não informados"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={`${buttonQuietClass} min-h-9 px-3 text-xs ${contest.isFavorite ? "text-amber-700 dark:text-amber-300" : ""}`}
            onClick={onToggleFavorite}
            disabled={isFavoritePending}
            aria-pressed={contest.isFavorite}
            aria-label={contest.isFavorite ? `Remover ${contest.name} dos favoritos` : `Favoritar ${contest.name}`}
          >
            {isFavoritePending ? "Salvando..." : contest.isFavorite ? "★ Favorito" : "☆ Favoritar"}
          </button>
          <button type="button" className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`} onClick={onEdit}>Editar</button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        {deadlines.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 text-xs font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {contest.sourceUrl && (
        <p className="mt-3 break-all rounded-xl bg-paper px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
          <span className="font-semibold text-muted">Fonte informada: </span>{contest.sourceUrl}
        </p>
      )}
      {contest.notes && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{contest.notes}</p>}
    </article>
  );
}

function normalizeOptionalValue(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function compareContests(left: ManualContestSummary, right: ManualContestSummary): number {
  if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
  const leftDeadline = left.registrationEndsOn ?? left.examDate ?? "9999-12-31";
  const rightDeadline = right.registrationEndsOn ?? right.examDate ?? "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || left.name.localeCompare(right.name, "pt-BR");
}

function statusLabel(status: ContestStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Situação desconhecida";
}

function statusBadgeClass(status: ContestStatus): string {
  if (status === "registration_open") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "completed" || status === "registration_closed") return "bg-paper-deep text-muted";
  if (status === "notice_published" || status === "authorized") return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

function formatDate(value: string | null): string {
  if (!value) return "Não informada";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateRange(start: string | null, end: string | null): string {
  if (start && end) return `${formatDate(start)} até ${formatDate(end)}`;
  if (start) return `A partir de ${formatDate(start)}`;
  if (end) return `Até ${formatDate(end)}`;
  return "Não informado";
}
