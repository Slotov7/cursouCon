import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPreparation,
  getDesktopErrorMessage,
  getManualContests,
  getOnlineContests,
  getStudyPlan,
  importMaterial,
  openMaterial,
  pickPdfFile,
  refreshOnlineContests,
  saveOnlineContestNotice,
  saveManualContest,
  setManualContestFavorite,
  setManualContestNotice,
  setOnlineContestFavorite,
} from "../../shared/desktop/commands";
import type {
  ContestStatus,
  ManualContestSummary,
  OnlineContestSnapshot,
  OnlineContestSummary,
  PreparationSummary,
  SaveManualContestRequest,
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

type ExploreViewProps = {
  refreshKey: number;
  timezone: string;
};

type ContestFormState = Omit<SaveManualContestRequest, "id">;
type ContestFilter = "all" | "favorites";
type OnlineContestFilters = {
  area: string;
  location: string;
  education: string;
  board: string;
  minimumSalary: string;
  maximumSalary: string;
  registrationEndsBy: string;
};

type OnlineConversionFormState = {
  opportunityId: string;
  name: string;
  organization: string;
  role: string;
  board: string;
  examDate: string;
  makePrimary: boolean;
  referenceDocumentStatus: "reference" | "current";
  noticeMaterialId: string | null;
};

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

const EMPTY_ONLINE_FILTERS: OnlineContestFilters = {
  area: "",
  location: "",
  education: "",
  board: "",
  minimumSalary: "",
  maximumSalary: "",
  registrationEndsBy: "",
};

export function ExploreView({ refreshKey, timezone }: ExploreViewProps) {
  const [contests, setContests] = useState<ManualContestSummary[]>([]);
  const [onlineSnapshot, setOnlineSnapshot] = useState<OnlineContestSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnlineLoading, setIsOnlineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContestFilter>("all");
  const [onlineFilters, setOnlineFilters] = useState<OnlineContestFilters>(EMPTY_ONLINE_FILTERS);
  const [form, setForm] = useState<ContestFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [pendingOnlineFavoriteId, setPendingOnlineFavoriteId] = useState<string | null>(null);
  const [pendingOnlineNoticeId, setPendingOnlineNoticeId] = useState<string | null>(null);
  const [isRefreshingOnline, setIsRefreshingOnline] = useState(false);
  const [pendingNoticeId, setPendingNoticeId] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [conversion, setConversion] = useState<OnlineConversionFormState | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [duplicatePreparation, setDuplicatePreparation] = useState<PreparationSummary | null>(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setIsOnlineLoading(true);
    getOnlineContests()
      .then((snapshot) => {
        if (cancelled) return;
        setOnlineSnapshot(snapshot);
        setOnlineError(snapshot.source.lastError);
      })
      .catch((operationError: unknown) => {
        if (!cancelled) setOnlineError(getDesktopErrorMessage(operationError));
      })
      .finally(() => {
        if (!cancelled) setIsOnlineLoading(false);
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

  const visibleOnlineContests = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    const minimumSalary = parseSalaryFilter(onlineFilters.minimumSalary);
    const maximumSalary = parseSalaryFilter(onlineFilters.maximumSalary);
    return (onlineSnapshot?.opportunities ?? []).filter((opportunity) => {
      if (filter === "favorites" && !opportunity.isFavorite) return false;
      if (onlineFilters.area && opportunity.area !== onlineFilters.area) return false;
      if (onlineFilters.location && opportunity.location !== onlineFilters.location) return false;
      if (onlineFilters.education && opportunity.education !== onlineFilters.education) return false;
      if (onlineFilters.board && opportunity.board !== onlineFilters.board) return false;
      if (minimumSalary !== null && (opportunity.salaryMax === null || opportunity.salaryMax < minimumSalary)) return false;
      if (maximumSalary !== null && (opportunity.salaryMax === null || opportunity.salaryMax > maximumSalary)) return false;
      if (onlineFilters.registrationEndsBy && (
        opportunity.registrationEndsOn === null
        || opportunity.registrationEndsOn > onlineFilters.registrationEndsBy
      )) return false;
      if (!normalizedSearch) return true;
      return [
        opportunity.name,
        opportunity.organization,
        opportunity.role,
        opportunity.board,
        opportunity.area,
        opportunity.location,
        opportunity.education,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });
  }, [filter, onlineFilters, onlineSnapshot, search]);

  const onlineFilterOptions = useMemo(() => {
    const opportunities = onlineSnapshot?.opportunities ?? [];
    return {
      areas: uniqueValues(opportunities.map((opportunity) => opportunity.area)),
      locations: uniqueValues(opportunities.map((opportunity) => opportunity.location)),
      educations: uniqueValues(opportunities.map((opportunity) => opportunity.education)),
      boards: uniqueValues(opportunities.map((opportunity) => opportunity.board)),
    };
  }, [onlineSnapshot]);

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
      setMessage(editingId ? "Concurso atualizado em Explorar." : "Concurso salvo em Explorar.");
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

  const handleRefreshOnline = async () => {
    setIsRefreshingOnline(true);
    setOnlineError(null);
    setMessage(null);
    try {
      const refreshed = await refreshOnlineContests();
      setOnlineSnapshot({
        opportunities: refreshed.opportunities,
        source: {
          sourceName: refreshed.sourceName,
          sourceUrl: refreshed.sourceUrl,
          lastAttemptedAt: refreshed.sourceCheckedAt,
          lastSuccessfulAt: refreshed.sourceCheckedAt,
          lastError: null,
        },
      });
      setMessage(`${refreshed.importedCount} novas, ${refreshed.updatedCount} atualizadas e ${refreshed.unchangedCount} sem alteração. Fonte consultada com sucesso.`);
    } catch (operationError: unknown) {
      const message = getDesktopErrorMessage(operationError);
      setOnlineError(message);
      try {
        const cached = await getOnlineContests();
        setOnlineSnapshot(cached);
      } catch {
        // Keep the network error visible when even the local cache cannot be opened.
      }
    } finally {
      setIsRefreshingOnline(false);
    }
  };

  const handleToggleOnlineFavorite = async (opportunity: OnlineContestSummary) => {
    setPendingOnlineFavoriteId(opportunity.id);
    setOnlineError(null);
    setMessage(null);
    try {
      const updated = await setOnlineContestFavorite({
        opportunityId: opportunity.id,
        isFavorite: !opportunity.isFavorite,
      });
      setOnlineSnapshot(updated);
      setMessage(updated.opportunities.find((item) => item.id === opportunity.id)?.isFavorite
        ? "Oportunidade online adicionada aos favoritos."
        : "Oportunidade online removida dos favoritos.");
    } catch (operationError: unknown) {
      setOnlineError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingOnlineFavoriteId(null);
    }
  };

  const handleSaveOnlineNotice = async (opportunity: OnlineContestSummary) => {
    setPendingOnlineNoticeId(opportunity.id);
    setNoticeError(null);
    setMessage(null);
    try {
      const updated = await saveOnlineContestNotice({ opportunityId: opportunity.id });
      setOnlineSnapshot(updated);
      const savedOpportunity = updated.opportunities.find((item) => item.id === opportunity.id);
      if (savedOpportunity && conversion?.opportunityId === opportunity.id) {
        setConversion((previous) => previous ? { ...previous, noticeMaterialId: savedOpportunity.noticeMaterialId } : previous);
      }
      setMessage(`PDF do edital de ${opportunity.name} salvo em Materiais neste computador.`);
    } catch (operationError: unknown) {
      setNoticeError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingOnlineNoticeId(null);
    }
  };

  const handleOpenOnlineNotice = async (opportunity: OnlineContestSummary) => {
    if (!opportunity.noticeMaterialId) return;
    setNoticeError(null);
    try {
      await openMaterial({ materialId: opportunity.noticeMaterialId });
    } catch (operationError: unknown) {
      setNoticeError(getDesktopErrorMessage(operationError));
    }
  };

  const handleOpenConversionNotice = async () => {
    if (!conversion?.noticeMaterialId) return;
    setNoticeError(null);
    try {
      await openMaterial({ materialId: conversion.noticeMaterialId });
    } catch (operationError: unknown) {
      setConversionError(getDesktopErrorMessage(operationError));
    }
  };

  const handleOpenOnlineConversion = (opportunity: OnlineContestSummary) => {
    setConversion({
      opportunityId: opportunity.id,
      name: opportunity.name,
      organization: opportunity.organization ?? "",
      role: opportunity.role ?? "",
      board: opportunity.board ?? "",
      examDate: opportunity.examDate ?? "",
      makePrimary: false,
      referenceDocumentStatus: "reference",
      noticeMaterialId: opportunity.noticeMaterialId,
    });
    setConversionError(null);
    setDuplicatePreparation(null);
    setDuplicateAcknowledged(false);
    setNoticeError(null);
  };

  const handleConvertOnline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conversion) return;
    setConversionError(null);
    setMessage(null);
    setIsConverting(true);
    try {
      const studyPlan = await getStudyPlan();
      const duplicate = studyPlan.preparations.find((preparation) =>
        matchesPreparationIdentity(preparation, conversion),
      ) ?? null;
      setDuplicatePreparation(duplicate);
      if (duplicate && !duplicateAcknowledged) {
        setConversionError(`Já existe uma preparação parecida: ${duplicate.name}. Revise os dados e confirme a criação duplicada se for intencional.`);
        return;
      }

      const created = await createPreparation({
        name: conversion.name.trim(),
        organization: normalizeOptionalValue(conversion.organization),
        role: normalizeOptionalValue(conversion.role),
        board: normalizeOptionalValue(conversion.board),
        examDate: normalizeOptionalValue(conversion.examDate),
        makePrimary: conversion.makePrimary,
        referenceMaterialId: conversion.noticeMaterialId,
        referenceDocumentStatus: conversion.noticeMaterialId
          ? conversion.referenceDocumentStatus
          : undefined,
      });

      setConversion(null);
      setDuplicatePreparation(null);
      setDuplicateAcknowledged(false);
      setMessage(conversion.noticeMaterialId
        ? `Preparação ${created.name} criada. O PDF salvo em Materiais foi associado como referência.`
        : `Preparação ${created.name} criada. Revise o edital antes de marcá-lo como vigente.`);
    } catch (operationError: unknown) {
      setConversionError(getDesktopErrorMessage(operationError));
    } finally {
      setIsConverting(false);
    }
  };

  const handleImportNotice = async (contest: ManualContestSummary) => {
    setPendingNoticeId(contest.id);
    setNoticeError(null);
    setMessage(null);
    try {
      const sourcePath = await pickPdfFile();
      if (!sourcePath) return;
      if (!/\.pdf$/i.test(sourcePath)) {
        throw new Error("Escolha um PDF para salvar uma cópia em Materiais.");
      }
      const material = await importMaterial({ sourcePath, subjectId: null });
      const updated = await setManualContestNotice({ contestId: contest.id, materialId: material.id });
      setContests((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setMessage(`PDF do edital de ${contest.name} salvo em Materiais neste computador. A cópia original pode ser removida.`);
    } catch (operationError: unknown) {
      setNoticeError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingNoticeId(null);
    }
  };

  const handleOpenNotice = async (contest: ManualContestSummary) => {
    if (!contest.noticeMaterialId) return;
    setNoticeError(null);
    try {
      await openMaterial({ materialId: contest.noticeMaterialId });
    } catch (operationError: unknown) {
      setNoticeError(getDesktopErrorMessage(operationError));
    }
  };

  const handleUnlinkNotice = async (contest: ManualContestSummary) => {
    setPendingNoticeId(contest.id);
    setNoticeError(null);
    setMessage(null);
    try {
      const updated = await setManualContestNotice({ contestId: contest.id, materialId: null });
      setContests((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setMessage("Vínculo removido. O PDF permanece na biblioteca de materiais.");
    } catch (operationError: unknown) {
      setNoticeError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingNoticeId(null);
    }
  };

  const openRegistrations = contests.filter((contest) => contest.status === "registration_open").length;
  const favoriteCount = contests.filter((contest) => contest.isFavorite).length;
  const activeOnlineFilterCount = Object.values(onlineFilters).filter(Boolean).length;
  const upcomingAlerts = [
    ...buildUpcomingAlerts(contests, timezone),
    ...buildUpcomingOnlineAlerts(onlineSnapshot?.opportunities ?? [], timezone),
  ];
  const conversionOpportunity = conversion
    ? onlineSnapshot?.opportunities.find((opportunity) => opportunity.id === conversion.opportunityId) ?? null
    : null;

  return (
    <div className="grid gap-6">
      <section className="glass-hero relative overflow-hidden rounded-3xl border border-white/12 p-6 text-white shadow-xl lg:p-8">
        <div className="relative z-10 grid max-w-3xl gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300">
              Acompanhamento local
            </span>
            <span className="text-xs font-medium text-slate-300/85">
               Cadastro manual e busca online
            </span>
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-white lg:text-3xl">
              Concursos e oportunidades
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/85">
              Salve concursos para acompanhar prazos ou busque oportunidades recentes.
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
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4" aria-labelledby="online-source-title">
        <div className="min-w-0">
          <Eyebrow>Busca online</Eyebrow>
          <h3 id="online-source-title" className="mt-1 font-heading text-base font-bold text-ink">Concursos encontrados online</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {onlineSnapshot?.source.lastSuccessfulAt
              ? `Última busca: ${formatDateTime(onlineSnapshot.source.lastSuccessfulAt)}.`
              : "Ainda não há resultados. Faça uma busca para conferir oportunidades recentes."}
          </p>
          {onlineError && <p className="mt-2 text-xs text-red-600" role="alert">Não foi possível buscar agora. Os resultados anteriores continuam disponíveis: {onlineError}</p>}
        </div>
        <button type="button" className={buttonSecondaryClass} onClick={() => void handleRefreshOnline()} disabled={isRefreshingOnline || isOnlineLoading}>
          {isRefreshingOnline ? "Buscando concursos..." : "Buscar concursos"}
        </button>
      </section>
      {noticeError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600" role="alert">{noticeError}</p>}
      {message && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
          <span>{message}</span>
          <button type="button" className="font-bold" onClick={() => setMessage(null)} aria-label="Fechar mensagem">
            ×
          </button>
        </div>
      )}

      {upcomingAlerts.length > 0 && (
        <section className="grid gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5" aria-labelledby="contest-alerts-title">
          <div>
            <Eyebrow>Alertas locais · fuso {timezone === "system" ? "do sistema" : timezone}</Eyebrow>
            <h3 id="contest-alerts-title" className="mt-1 font-heading text-lg font-bold text-ink">Prazos dos seus favoritos</h3>
            <p className="mt-1 text-xs text-muted">As datas não têm horário oficial salvo; confirme o edital antes de agir.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {upcomingAlerts.map((alert) => (
              <div key={`${alert.contestId}-${alert.kind}`} className="rounded-xl border border-amber-500/20 bg-card/70 p-3 text-xs">
                <p className="font-bold text-ink">{alert.contestName}</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">{alert.label}: {formatDate(alert.date)}</p>
                <p className="mt-1 text-muted">{alert.daysRemaining === 0 ? "É hoje" : `Faltam ${alert.daysRemaining} dias`}</p>
              </div>
            ))}
          </div>
        </section>
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
            <details className="sm:col-span-2 rounded-xl border border-line bg-paper p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Mais informações (opcional): órgão, banca, prazos e fonte</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
            <label className={fieldClass}>
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
            <label className="grid gap-1.5 text-sm font-semibold text-ink sm:col-span-2">
              Observações <span className="font-normal text-muted">(opcional)</span>
              <textarea className={textareaClass} value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={10000} disabled={isSaving} placeholder="Anote requisitos a conferir ou informações ainda não confirmadas." />
            </label>
              </div>
            </details>
            <div className="flex justify-end gap-2 border-t border-line pt-3 sm:col-span-2">
              <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</button>
              <button type="submit" className={buttonPrimaryClass} disabled={isSaving}>
                {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar concurso"}
              </button>
            </div>
          </form>
        </section>
      )}

      {conversion && (
        <section className="glass-card rounded-2xl border border-emerald-500/25 p-5 shadow-xs lg:p-6" role="dialog" aria-modal="true" aria-labelledby="online-conversion-title">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-3">
            <div>
              <Eyebrow>Revisão antes de salvar</Eyebrow>
              <h3 id="online-conversion-title" className="mt-1 font-heading text-lg font-bold text-ink">Preparar a partir da oportunidade online</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                Confira os dados trazidos da fonte. A oportunidade continuará preservada no histórico online; esta ação cria uma preparação local para o seu plano.
              </p>
            </div>
            <button type="button" className={buttonQuietClass} onClick={() => setConversion(null)} disabled={isConverting}>Fechar</button>
          </div>
          {conversionError && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{conversionError}</p>}
          {duplicatePreparation && (
            <label className="mb-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                checked={duplicateAcknowledged}
                onChange={(event) => setDuplicateAcknowledged(event.target.checked)}
                disabled={isConverting}
              />
              <span>
                Já existe <strong>{duplicatePreparation.name}</strong>. Confirmo que quero criar outra preparação mesmo assim.
              </span>
            </label>
          )}
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleConvertOnline}>
            <label className={`${fieldClass} sm:col-span-2`}>
              Preparação <span className="text-red-600">*</span>
              <input className={inputClass} value={conversion.name} onChange={(event) => setConversion({ ...conversion, name: event.target.value })} maxLength={160} required disabled={isConverting} />
            </label>
            <label className={fieldClass}>
              Órgão <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={conversion.organization} onChange={(event) => setConversion({ ...conversion, organization: event.target.value })} maxLength={120} disabled={isConverting} />
            </label>
            <label className={fieldClass}>
              Cargo <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={conversion.role} onChange={(event) => setConversion({ ...conversion, role: event.target.value })} maxLength={120} disabled={isConverting} />
            </label>
            <label className={fieldClass}>
              Banca <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} value={conversion.board} onChange={(event) => setConversion({ ...conversion, board: event.target.value })} maxLength={120} disabled={isConverting} />
            </label>
            <label className={fieldClass}>
              Data da prova <span className="font-normal text-muted">(opcional)</span>
              <input className={inputClass} type="date" value={conversion.examDate} onChange={(event) => setConversion({ ...conversion, examDate: event.target.value })} disabled={isConverting} />
            </label>
            <div className="rounded-xl border border-line bg-paper/60 p-3 text-xs sm:col-span-2">
              <p className="font-semibold text-ink">Edital usado na revisão</p>
              <p className="mt-1 text-muted">
                {conversion.noticeMaterialId
                  ? "O PDF salvo em Materiais será associado à preparação."
                  : "Ainda não há PDF salvo em Materiais. Salve o edital no cartão da oportunidade para associá-lo à preparação."}
              </p>
              {!conversion.noticeMaterialId && conversionOpportunity && (
                <button type="button" className={`${buttonSecondaryClass} mt-3`} onClick={() => void handleSaveOnlineNotice(conversionOpportunity)} disabled={pendingOnlineNoticeId === conversionOpportunity.id}>
                  {pendingOnlineNoticeId === conversionOpportunity.id ? "Baixando edital..." : "Baixar edital para revisar"}
                </button>
              )}
              {conversion.noticeMaterialId && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button type="button" className={buttonSecondaryClass} onClick={() => void handleOpenConversionNotice()} disabled={isConverting}>Abrir PDF salvo</button>
                  <label className={fieldClass}>
                    Estado do edital
                    <select
                      className={selectClass}
                      value={conversion.referenceDocumentStatus}
                      onChange={(event) => setConversion({ ...conversion, referenceDocumentStatus: event.target.value as "reference" | "current" })}
                      disabled={isConverting}
                    >
                      <option value="reference">Referência a conferir</option>
                      <option value="current">Vigente confirmado no edital</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
            <label className="flex items-start gap-3 text-xs text-muted sm:col-span-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={conversion.makePrimary} onChange={(event) => setConversion({ ...conversion, makePrimary: event.target.checked })} disabled={isConverting} />
              <span>Usar esta preparação como principal.</span>
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-3 sm:col-span-2">
              <button type="button" className={buttonQuietClass} onClick={() => setConversion(null)} disabled={isConverting}>Cancelar</button>
              <button type="submit" className={buttonPrimaryClass} disabled={isConverting || !conversion.name.trim()}>
                {isConverting ? "Criando..." : duplicatePreparation && !duplicateAcknowledged ? "Revisar duplicação" : "Criar preparação"}
              </button>
            </div>
          </form>
        </section>
      )}

      <label className={`${fieldClass} rounded-2xl border border-line bg-card p-4`}>
        Buscar em oportunidades online e concursos salvos
        <input className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: Analista de TI" />
      </label>

      <details className="rounded-2xl border border-line bg-card shadow-xs" aria-label="Resumo de oportunidades">
        <summary className="cursor-pointer list-none p-4 text-xs font-semibold text-muted">
          Resumo de oportunidades{!isLoading && !error ? ` · ${contests.length} concursos · ${favoriteCount} favoritos · ${openRegistrations} inscrições abertas` : ""}
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line p-4 sm:grid-cols-3">
          <SummaryCard label="Concursos cadastrados" value={isLoading || error ? "—" : contests.length} detail="Registros locais" />
          <SummaryCard label="Favoritos" value={isLoading || error ? "—" : favoriteCount} detail="Acompanhados por você" />
          <SummaryCard label="Inscrições abertas" value={isLoading || error ? "—" : openRegistrations} detail="Conforme situação informada" />
        </div>
      </details>

      <section className="glass-card grid gap-4 rounded-2xl p-5 shadow-xs lg:p-6" aria-labelledby="online-contest-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <Eyebrow>Resultados da fonte</Eyebrow>
            <h3 id="online-contest-list-title" className="mt-1 font-heading text-lg font-bold text-ink">Oportunidades online</h3>
          </div>
          <span className="text-xs font-semibold text-muted">{visibleOnlineContests.length} exibidas</span>
        </div>
        <details className="rounded-xl border border-line bg-paper/60 p-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            Filtros detalhados{activeOnlineFilterCount > 0 ? ` · ${activeOnlineFilterCount} ativos` : ""}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={fieldClass}>
            Área
            <select
              className={selectClass}
              value={onlineFilters.area}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, area: event.target.value })}
            >
              <option value="">Todas</option>
              {onlineFilterOptions.areas.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={fieldClass}>
            Local
            <select
              className={selectClass}
              value={onlineFilters.location}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, location: event.target.value })}
            >
              <option value="">Todos</option>
              {onlineFilterOptions.locations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={fieldClass}>
            Formação
            <select
              className={selectClass}
              value={onlineFilters.education}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, education: event.target.value })}
            >
              <option value="">Todas</option>
              {onlineFilterOptions.educations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={fieldClass}>
            Banca
            <select
              className={selectClass}
              value={onlineFilters.board}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, board: event.target.value })}
            >
              <option value="">Todas</option>
              {onlineFilterOptions.boards.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={fieldClass}>
            Salário mínimo
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={onlineFilters.minimumSalary}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, minimumSalary: event.target.value })}
              placeholder="Sem mínimo"
            />
          </label>
          <label className={fieldClass}>
            Salário máximo
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={onlineFilters.maximumSalary}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, maximumSalary: event.target.value })}
              placeholder="Sem máximo"
            />
          </label>
          <label className={fieldClass}>
            Inscrição até
            <input
              className={inputClass}
              type="date"
              value={onlineFilters.registrationEndsBy}
              onChange={(event) => setOnlineFilters({ ...onlineFilters, registrationEndsBy: event.target.value })}
            />
          </label>
          <div className="flex items-end">
            <button type="button" className={`${buttonQuietClass} w-full`} onClick={() => setOnlineFilters(EMPTY_ONLINE_FILTERS)}>
              Limpar filtros online
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted sm:col-span-2 lg:col-span-4">
            Filtros estruturados só exibem registros com valor correspondente. Salário e prazo excluem oportunidades sem esse dado; valores ausentes não são tratados como zero.
          </p>
          </div>
        </details>
        {isOnlineLoading ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted" aria-live="polite">Carregando cache online...</p>
        ) : visibleOnlineContests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center">
            <p className="text-sm font-semibold text-ink">Nenhuma oportunidade online no filtro atual.</p>
            <p className="mt-1 text-xs text-muted">Atualize a fonte ou ajuste a busca. A primeira consulta é sempre explícita.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {visibleOnlineContests.map((opportunity) => (
              <OnlineContestCard
                key={opportunity.id}
                opportunity={opportunity}
                isFavoritePending={pendingOnlineFavoriteId === opportunity.id}
                 isNoticePending={pendingOnlineNoticeId === opportunity.id}
                 onToggleFavorite={() => void handleToggleOnlineFavorite(opportunity)}
                 onSaveNotice={() => void handleSaveOnlineNotice(opportunity)}
                 onOpenNotice={() => void handleOpenOnlineNotice(opportunity)}
                 onConvert={() => handleOpenOnlineConversion(opportunity)}
               />
            ))}
          </div>
        )}
      </section>

      <section className="glass-card grid gap-4 rounded-2xl p-5 shadow-xs lg:p-6" aria-labelledby="contest-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <Eyebrow>Oportunidades salvas</Eyebrow>
            <h3 id="contest-list-title" className="mt-1 font-heading text-lg font-bold text-ink">Meus concursos</h3>
          </div>
          <span className="text-xs font-semibold text-muted">{visibleContests.length} exibidos</span>
        </div>

        <div className="flex justify-end">
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
                isNoticePending={pendingNoticeId === contest.id}
                onEdit={() => openEditContestForm(contest)}
                onToggleFavorite={() => void handleToggleFavorite(contest)}
                onImportNotice={() => void handleImportNotice(contest)}
                onOpenNotice={() => void handleOpenNotice(contest)}
                onUnlinkNotice={() => void handleUnlinkNotice(contest)}
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
  isNoticePending,
  onEdit,
  onToggleFavorite,
  onImportNotice,
  onOpenNotice,
  onUnlinkNotice,
}: {
  contest: ManualContestSummary;
  isFavoritePending: boolean;
  isNoticePending: boolean;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onImportNotice: () => void;
  onOpenNotice: () => void;
  onUnlinkNotice: () => void;
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
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/60 px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted" title={contest.noticeMaterialName ?? undefined}>
          {contest.noticeMaterialName ? `PDF salvo: ${contest.noticeMaterialName}` : "Nenhum PDF salvo"}
        </span>
        {contest.noticeMaterialId && (
          <button type="button" className={buttonSecondaryClass} onClick={onOpenNotice} disabled={isNoticePending}>Abrir PDF</button>
        )}
        <button type="button" className={buttonSecondaryClass} onClick={onImportNotice} disabled={isNoticePending}>
          {isNoticePending ? "Salvando..." : contest.noticeMaterialId ? "Substituir PDF" : "Importar PDF"}
        </button>
        {contest.noticeMaterialId && (
          <button type="button" className={buttonQuietClass} onClick={onUnlinkNotice} disabled={isNoticePending}>Desvincular</button>
        )}
      </div>
      {contest.notes && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{contest.notes}</p>}
    </article>
  );
}

function OnlineContestCard({
  opportunity,
  isFavoritePending,
  isNoticePending,
  onToggleFavorite,
  onSaveNotice,
  onOpenNotice,
  onConvert,
}: {
  opportunity: OnlineContestSummary;
  isFavoritePending: boolean;
  isNoticePending: boolean;
  onToggleFavorite: () => void;
  onSaveNotice: () => void;
  onOpenNotice: () => void;
  onConvert: () => void;
}) {
  const deadlines = [
    ["Inscrições", formatDate(opportunity.registrationEndsOn)],
    ["Pagamento", formatDate(opportunity.feeDeadline)],
    ["Prova", formatDate(opportunity.examDate)],
  ] as const;

  return (
    <article className="rounded-2xl border border-blue-500/20 bg-card p-4 shadow-xs transition-colors hover:border-blue-500/45 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(opportunity.status)}`}>
              {statusLabel(opportunity.status)}
            </span>
            <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-semibold text-muted">Fonte consultada</span>
            {opportunity.hasChanges && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">Atualizada</span>}
          </div>
          <h4 className="mt-2 font-heading text-base font-bold text-ink">{opportunity.name}</h4>
          <p className="mt-1 text-xs text-muted">
            {[opportunity.organization, opportunity.role, opportunity.location].filter(Boolean).join(" · ") || "Órgão, cargo e local não informados"}
          </p>
        </div>
        <button
          type="button"
          className={`${buttonQuietClass} min-h-9 px-3 text-xs ${opportunity.isFavorite ? "text-amber-700 dark:text-amber-300" : ""}`}
          onClick={onToggleFavorite}
          disabled={isFavoritePending}
          aria-pressed={opportunity.isFavorite}
          aria-label={opportunity.isFavorite ? `Remover ${opportunity.name} dos favoritos` : `Favoritar ${opportunity.name}`}
        >
          {isFavoritePending ? "Salvando..." : opportunity.isFavorite ? "★ Favorito" : "☆ Favoritar"}
        </button>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Escolaridade</dt><dd className="mt-1 text-xs font-semibold text-ink">{opportunity.education ?? "Não informada"}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Vagas</dt><dd className="mt-1 text-xs font-semibold text-ink">{opportunity.vacanciesText ?? "Não informadas"}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Salário</dt><dd className="mt-1 text-xs font-semibold text-ink">{opportunity.salaryText ?? "Não informado"}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Última consulta</dt><dd className="mt-1 text-xs font-semibold text-ink">{formatDateTime(opportunity.sourceCheckedAt)}</dd></div>
      </dl>
      <dl className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
        {deadlines.map(([label, value]) => (
          <div key={label}><dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 text-xs font-semibold text-ink">{value}</dd></div>
        ))}
      </dl>
      <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink">Fonte da situação: </span>{opportunity.statusEvidence}
      </p>
      <p className="mt-2 break-all text-[11px] text-blue-700 dark:text-blue-300">
        <span className="font-semibold text-muted">Origem: </span>{opportunity.sourceUrl}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="button" className={buttonPrimaryClass} onClick={onConvert}>Usar no plano</button>
        {opportunity.noticeMaterialId && (
          <button type="button" className={buttonSecondaryClass} onClick={onOpenNotice} disabled={isNoticePending}>
            Abrir PDF salvo
          </button>
        )}
        <button type="button" className={buttonSecondaryClass} onClick={onSaveNotice} disabled={isNoticePending}>
          {isNoticePending ? "Baixando..." : opportunity.noticeMaterialId ? "Atualizar PDF salvo" : "Salvar PDF em Materiais"}
        </button>
      </div>
    </article>
  );
}

function uniqueValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function parseSalaryFilter(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeOptionalValue(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function matchesPreparationIdentity(preparation: PreparationSummary, conversion: OnlineConversionFormState): boolean {
  return normalizeIdentity(preparation.name) === normalizeIdentity(conversion.name)
    && normalizeIdentity(preparation.organization) === normalizeIdentity(conversion.organization)
    && normalizeIdentity(preparation.role) === normalizeIdentity(conversion.role);
}

function normalizeIdentity(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

type ContestAlert = {
  contestId: string;
  contestName: string;
  kind: "registration" | "payment" | "exam";
  label: string;
  date: string;
  daysRemaining: number;
};

function buildUpcomingAlerts(contests: ManualContestSummary[], timezone: string): ContestAlert[] {
  const today = dateKeyForTimezone(timezone);
  const todayEpoch = dateOnlyEpoch(today);
  if (todayEpoch === null) return [];
  const alerts: ContestAlert[] = [];
  for (const contest of contests) {
    if (!contest.isFavorite) continue;
    const deadlines: Array<[ContestAlert["kind"], string, string | null]> = [
      ["registration", "Inscrições", contest.registrationEndsOn],
      ["payment", "Pagamento", contest.feeDeadline],
      ["exam", "Prova", contest.examDate],
    ];
    for (const [kind, label, date] of deadlines) {
      if (!date) continue;
      const epoch = dateOnlyEpoch(date);
      if (epoch === null) continue;
      const daysRemaining = Math.round((epoch - todayEpoch) / 86_400_000);
      if (daysRemaining >= 0 && daysRemaining <= 7) {
        alerts.push({ contestId: contest.id, contestName: contest.name, kind, label, date, daysRemaining });
      }
    }
  }
  return alerts.sort((left, right) => left.daysRemaining - right.daysRemaining || left.contestName.localeCompare(right.contestName, "pt-BR"));
}

function buildUpcomingOnlineAlerts(contests: OnlineContestSummary[], timezone: string): ContestAlert[] {
  const today = dateKeyForTimezone(timezone);
  const todayEpoch = dateOnlyEpoch(today);
  if (todayEpoch === null) return [];
  const alerts: ContestAlert[] = [];
  for (const contest of contests) {
    if (!contest.isFavorite) continue;
    const deadlines: Array<[ContestAlert["kind"], string, string | null]> = [
      ["registration", "Inscrições", contest.registrationEndsOn],
      ["payment", "Pagamento", contest.feeDeadline],
      ["exam", "Prova", contest.examDate],
    ];
    for (const [kind, label, date] of deadlines) {
      if (!date) continue;
      const epoch = dateOnlyEpoch(date);
      if (epoch === null) continue;
      const daysRemaining = Math.round((epoch - todayEpoch) / 86_400_000);
      if (daysRemaining >= 0 && daysRemaining <= 7) {
        alerts.push({ contestId: `online-${contest.id}`, contestName: contest.name, kind, label, date, daysRemaining });
      }
    }
  }
  return alerts;
}

function dateOnlyEpoch(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const epoch = Date.UTC(year, month - 1, day);
  return Number.isNaN(epoch) ? null : epoch;
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

function formatDateTime(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function formatDateRange(start: string | null, end: string | null): string {
  if (start && end) return `${formatDate(start)} até ${formatDate(end)}`;
  if (start) return `A partir de ${formatDate(start)}`;
  if (end) return `Até ${formatDate(end)}`;
  return "Não informado";
}
