import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerQuestion,
  createNotebook,
  createQuestion,
  exportQuestions,
  getDesktopErrorMessage,
  getNotebookEntries,
  getNotebooks,
  getQuestions,
  importQuestions,
  pickQuestionImportFile,
  previewQuestionImport,
  setNotebookEntry,
} from "../../shared/desktop/commands";
import { ERROR_NOTEBOOK_ID } from "../../shared/desktop/contracts";
import type {
  AnswerQuestionResult,
  CreateQuestionRequest,
  QuestionConfidence,
  QuestionExportResult,
  QuestionImportPreview,
  QuestionImportResult,
  QuestionNotebookEntry,
  QuestionNotebookReason,
  QuestionSummary,
  QuestionType,
  NotebookAttemptStatus,
  NotebookFilter,
  NotebookSummary,
  StudyPlan,
} from "../../shared/desktop/contracts";
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

type PracticeViewProps = {
  plan: StudyPlan | null;
  refreshKey: number;
};

type StatusFilter = "all" | "flagged" | "unsolved" | "correct";

function formatAnswerKey(key: string | null): string {
  if (!key) return "Não informado";
  if (key === "true") return "Certo";
  if (key === "false") return "Errado";
  return key;
}

export function PracticeView({ plan, refreshKey }: PracticeViewProps) {
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | QuestionType>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState(ERROR_NOTEBOOK_ID);
  const [notebookEntries, setNotebookEntries] = useState<QuestionNotebookEntry[]>([]);
  const [notebookPendingQuestionId, setNotebookPendingQuestionId] = useState<string | null>(null);
  const [isNotebookEditorOpen, setIsNotebookEditorOpen] = useState(false);
  const [notebookNameInput, setNotebookNameInput] = useState("");
  const [notebookKindInput, setNotebookKindInput] = useState<"manual" | "dynamic">("manual");
  const [dynamicAttemptStatus, setDynamicAttemptStatus] =
    useState<NotebookAttemptStatus>("incorrect");
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<QuestionImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;
  const activeNotebookName = activeNotebook?.name ?? "Caderno";

  const notebookQuestionIds = useMemo(
    () => new Set(notebookEntries.map((entry) => entry.questionId)),
    [notebookEntries],
  );
  const notebookEntryByQuestionId = useMemo(
    () => new Map(notebookEntries.map((entry) => [entry.questionId, entry])),
    [notebookEntries],
  );

  const isQuestionFlagged = (q: QuestionSummary) =>
    activeNotebook?.kind !== "dynamic" && notebookQuestionIds.has(q.id);

  const persistNotebookEntry = async ({
    questionId,
    included,
    reason,
    observation,
    successMessage,
  }: {
    questionId: string;
    included: boolean;
    reason: QuestionNotebookReason | null;
    observation: string | null;
    successMessage: string;
  }) => {
    setNotebookPendingQuestionId(questionId);
    setError(null);
    try {
      await setNotebookEntry({
        notebookId: activeNotebookId,
        questionId,
        included,
        reason,
        observation,
      });
      const now = new Date().toISOString();
      const hadEntry = notebookQuestionIds.has(questionId);
      setNotebooks((previous) =>
        previous.map((notebook) =>
          notebook.id !== activeNotebookId
            ? notebook
            : {
                ...notebook,
                questionCount: Math.max(
                  0,
                  notebook.questionCount + (included && !hadEntry ? 1 : !included && hadEntry ? -1 : 0),
                ),
                updatedAt: now,
              },
        ),
      );
      setNotebookEntries((previous) => {
        if (!included) {
          return previous.filter((entry) => entry.questionId !== questionId);
        }
        const current = previous.find((entry) => entry.questionId === questionId);
        const updatedEntry: QuestionNotebookEntry = {
          questionId,
          notebookId: activeNotebookId,
          reason,
          observation,
          addedAt: current?.addedAt ?? now,
          updatedAt: now,
        };
        return current
          ? previous.map((entry) => (entry.questionId === questionId ? updatedEntry : entry))
          : [updatedEntry, ...previous];
      });
      setMessage(successMessage);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setNotebookPendingQuestionId(null);
    }
  };

  const handleToggleFlag = async (questionId: string) => {
    if (activeNotebook?.kind === "dynamic") {
      setMessage("Este caderno é dinâmico; suas questões vêm do filtro salvo.");
      return;
    }
    const currentlyIncluded = notebookQuestionIds.has(questionId);
    const currentEntry = notebookEntryByQuestionId.get(questionId);
    await persistNotebookEntry({
      questionId,
      included: !currentlyIncluded,
      reason: currentEntry?.reason ?? null,
      observation: currentEntry?.observation ?? null,
      successMessage: currentlyIncluded
        ? `Questão removida de ${activeNotebookName}.`
        : `Questão adicionada a ${activeNotebookName}.`,
    });
  };

  const handleSaveNotebookDetails = async (
    questionId: string,
    reason: QuestionNotebookReason | null,
    observation: string | null,
  ) => {
    await persistNotebookEntry({
      questionId,
      included: true,
      reason,
      observation,
      successMessage: `Anotação de ${activeNotebookName} salva.`,
    });
  };

  const loadQuestions = () => {
    setIsLoading(true);
    let cancelled = false;
    getQuestions({
      subjectId: subjectFilter || null,
      questionType: typeFilter || null,
      status: "active",
      limit: 100,
      offset: 0,
    })
      .then((loadedQuestions) => {
        if (!cancelled) {
          setQuestions(loadedQuestions);
          if (loadedQuestions.length > 0) {
            setSelectedQuestionId((curr) =>
              curr && loadedQuestions.some((q) => q.id === curr) ? curr : loadedQuestions[0].id
            );
          } else {
            setSelectedQuestionId(null);
          }
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

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    return loadQuestions();
  }, [refreshKey, subjectFilter, typeFilter]);

  useEffect(() => {
    let cancelled = false;
    getNotebooks()
      .then((loadedNotebooks) => {
        if (!cancelled) {
          setNotebooks(loadedNotebooks);
          setActiveNotebookId((currentId) =>
            loadedNotebooks.some((notebook) => notebook.id === currentId)
              ? currentId
              : loadedNotebooks[0]?.id ?? ERROR_NOTEBOOK_ID,
          );
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setError(getDesktopErrorMessage(operationError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setNotebookEntries([]);
    getNotebookEntries(activeNotebookId)
      .then((entries) => {
        if (!cancelled) {
          setNotebookEntries(entries);
        }
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setError(getDesktopErrorMessage(operationError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, activeNotebookId]);

  // Filtering across status, subject, type, and keyword search
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const dynamicFilter = activeNotebook?.kind === "dynamic" ? activeNotebook.filter : null;
      if (dynamicFilter) {
        if (dynamicFilter.subjectId && q.subjectId !== dynamicFilter.subjectId) {
          return false;
        }
        if (dynamicFilter.questionType && q.questionType !== dynamicFilter.questionType) {
          return false;
        }
        if (dynamicFilter.attemptStatus === "incorrect" && q.lastAttemptResult !== "incorrect") {
          return false;
        }
        if (dynamicFilter.attemptStatus === "correct" && q.lastAttemptResult !== "correct") {
          return false;
        }
        if (dynamicFilter.attemptStatus === "unanswered" && (q.attemptsCount ?? 0) > 0) {
          return false;
        }
      }
      if (subjectFilter && q.subjectId !== subjectFilter) {
        return false;
      }
      if (typeFilter && q.questionType !== typeFilter) {
        return false;
      }

      if (statusFilter === "flagged") {
        if (activeNotebook?.kind !== "dynamic" && !isQuestionFlagged(q)) return false;
      } else if (statusFilter === "unsolved") {
        if ((q.attemptsCount ?? 0) > 0) return false;
      } else if (statusFilter === "correct") {
        if (q.lastAttemptResult !== "correct") return false;
      }

      if (searchQuery.trim()) {
        const term = searchQuery.toLowerCase().trim();
        const matchStatement = q.statementMarkdown.toLowerCase().includes(term);
        const matchSubject = q.subjectName?.toLowerCase().includes(term) ?? false;
        const matchBoard = q.board?.toLowerCase().includes(term) ?? false;
        const matchOrg = q.organization?.toLowerCase().includes(term) ?? false;
        const matchRole = q.role?.toLowerCase().includes(term) ?? false;
        if (!matchStatement && !matchSubject && !matchBoard && !matchOrg && !matchRole) {
          return false;
        }
      }

      return true;
    });
  }, [
    questions,
    subjectFilter,
    typeFilter,
    statusFilter,
    searchQuery,
    notebookQuestionIds,
    activeNotebook,
  ]);

  const selectedQuestionIndex = filteredQuestions.findIndex((q) => q.id === selectedQuestionId);
  const currentIndex =
    selectedQuestionIndex >= 0 ? selectedQuestionIndex : filteredQuestions.length > 0 ? 0 : -1;
  const selectedQuestion = filteredQuestions[currentIndex] ?? null;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < filteredQuestions.length - 1;

  const handlePreviousQuestion = () => {
    if (hasPrevious) {
      setSelectedQuestionId(filteredQuestions[currentIndex - 1].id);
      setMessage(null);
    }
  };

  const handleNextQuestion = () => {
    if (hasNext) {
      setSelectedQuestionId(filteredQuestions[currentIndex + 1].id);
      setMessage(null);
    }
  };

  const handleQuestionCreated = (newQ: QuestionSummary) => {
    setQuestions((prev) => [newQ, ...prev]);
    setSelectedQuestionId(newQ.id);
    setIsEditorOpen(false);
    setMessage("Questão cadastrada no banco de dados local.");
  };

  const handleQuestionAnswered = (res: AnswerQuestionResult) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === res.question.id ? res.question : q))
    );
    setMessage(
      res.xpGranted > 0
        ? `Tentativa registrada com sucesso! +${res.xpGranted} XP adicionados.`
        : "Tentativa registrada no histórico local."
    );
  };

  const handleCreateNotebook = async () => {
    const name = notebookNameInput.trim();
    if (!name) {
      setError("Informe um nome para o caderno.");
      return;
    }

    setIsCreatingNotebook(true);
    setError(null);
    try {
      const filter: NotebookFilter | null =
        notebookKindInput === "dynamic"
          ? {
              subjectId: subjectFilter || null,
              questionType: typeFilter || null,
              attemptStatus: dynamicAttemptStatus,
            }
          : null;
      const createdNotebook = await createNotebook({
        name,
        kind: notebookKindInput,
        filter,
      });
      setNotebooks((previous) => [...previous, createdNotebook]);
      setActiveNotebookId(createdNotebook.id);
      setStatusFilter("all");
      setNotebookEntries([]);
      setNotebookNameInput("");
      setNotebookKindInput("manual");
      setIsNotebookEditorOpen(false);
      setMessage(`Caderno "${createdNotebook.name}" criado.`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsCreatingNotebook(false);
    }
  };

  const handleStartImport = async () => {
    setError(null);
    setMessage(null);
    try {
      const picked = await pickQuestionImportFile();
      if (!picked) return; // User cancelled
      setImportFilePath(picked);
      const preview = await previewQuestionImport(picked);
      setImportPreview(preview);
      setIsImportModalOpen(true);
    } catch (err: unknown) {
      setError(getDesktopErrorMessage(err));
    }
  };

  const handleConfirmImport = async () => {
    if (!importFilePath || !importPreview) return;
    setIsImporting(true);
    setError(null);
    try {
      const res: QuestionImportResult = await importQuestions(
        importFilePath,
        importPreview.fileHash
      );
      setIsImportModalOpen(false);
      setImportFilePath(null);
      setImportPreview(null);
      setMessage(
        `Importação concluída com sucesso! ${res.imported} questões importadas (${res.skippedDuplicates} duplicadas ignoradas, ${res.skippedInvalid} inválidas puladas).`
      );
      loadQuestions();
    } catch (err: unknown) {
      setError(getDesktopErrorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setMessage(null);
    try {
      const exportRes: QuestionExportResult = await exportQuestions();
      setMessage(
        `Banco exportado com sucesso! ${exportRes.exported} questões salvas em: ${exportRes.path}`
      );
    } catch (err: unknown) {
      setError(getDesktopErrorMessage(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* 1. Hero Banner Header */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              Banco Local de Questões
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              {questions.length} questões cadastradas
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Treino de Questões & Revisão
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Resolva questões offline, registre sua confiança e revise erros sem perder o histórico de tentativas.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditorOpen(true)}
              className={buttonPrimaryClass}
            >
              + Nova Questão Manual
            </button>
            <button
              type="button"
              onClick={handleStartImport}
              className={buttonOutlineLightClass}
            >
              Importar JSON
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className={buttonOutlineLightClass}
            >
              {isExporting ? "Exportando..." : "Exportar JSON"}
            </button>
            <button
              type="button"
              onClick={() => setIsNotebookEditorOpen(true)}
              className={buttonOutlineLightClass}
            >
              + Novo Caderno
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-bold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {message && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-600">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-xs font-bold hover:underline"
          >
            ✕
          </button>
        </div>
      )}

      {/* Import JSON Modal */}
      {isImportModalOpen && importPreview && (
        <div className="glass-card rounded-2xl p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-fade-in border border-blue-500/30">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Importação de Questões</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Prévia do Arquivo JSON</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(false);
                setImportPreview(null);
                setImportFilePath(null);
              }}
              className="text-xs text-muted hover:text-ink font-semibold"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid gap-4">
            <p className="text-xs text-muted break-all">
              <strong>Arquivo selecionado:</strong> {importFilePath}
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-paper p-3 text-center">
                <span className="text-[11px] font-semibold text-muted">Total Detectado</span>
                <p className="text-xl font-bold font-mono text-ink mt-0.5">{importPreview.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Válidas para Importar</span>
                <p className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">{importPreview.valid}</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Duplicadas</span>
                <p className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">{importPreview.duplicates}</p>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">Inválidas</span>
                <p className="text-xl font-bold font-mono text-red-700 dark:text-red-300 mt-0.5">{importPreview.invalid}</p>
              </div>
            </div>

            {importPreview.issues.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-ink max-h-36 overflow-y-auto">
                <p className="font-bold text-amber-600 mb-1.5">Problemas encontrados na análise prévia:</p>
                <ul className="list-disc pl-4 space-y-1 text-muted">
                  {importPreview.issues.slice(0, 10).map((issue, idx) => (
                    <li key={idx}>
                      Item {issue.index}: {issue.message}
                    </li>
                  ))}
                  {importPreview.issues.length > 10 && (
                    <li className="font-semibold text-amber-600">
                      ... e mais {importPreview.issues.length - 10} apontamentos.
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                  setImportFilePath(null);
                }}
                className={buttonQuietClass}
                disabled={isImporting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || importPreview.valid === 0}
                className={buttonPrimaryClass}
              >
                {isImporting ? "Importando..." : `Confirmar Importação (${importPreview.valid} questões)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {isNotebookEditorOpen && (
        <section
          className="glass-card rounded-2xl border border-amber-500/30 p-6 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-notebook-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
            <div>
              <Eyebrow>Novo caderno local</Eyebrow>
              <h3 id="new-notebook-title" className="mt-1 font-heading text-lg font-bold text-ink">
                Organize questões por objetivo
              </h3>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-muted hover:text-ink"
              onClick={() => setIsNotebookEditorOpen(false)}
              disabled={isCreatingNotebook}
            >
              Fechar
            </button>
          </div>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateNotebook();
            }}
          >
            <label className={fieldClass}>
              Nome do caderno
              <input
                className={inputClass}
                value={notebookNameInput}
                onChange={(event) => setNotebookNameInput(event.target.value)}
                placeholder="Ex.: Revisar Direito Constitucional"
                maxLength={120}
                autoFocus
                disabled={isCreatingNotebook}
              />
            </label>
            <label className={fieldClass}>
              Tipo de caderno
              <select
                className={selectClass}
                value={notebookKindInput}
                onChange={(event) =>
                  setNotebookKindInput(event.target.value as "manual" | "dynamic")
                }
                disabled={isCreatingNotebook}
              >
                <option value="manual">Manual: eu escolho as questões</option>
                <option value="dynamic">Dinâmico: usa um filtro salvo</option>
              </select>
            </label>
            {notebookKindInput === "dynamic" && (
              <label className={fieldClass}>
                Estado acompanhado
                <select
                  className={selectClass}
                  value={dynamicAttemptStatus}
                  onChange={(event) =>
                    setDynamicAttemptStatus(event.target.value as NotebookAttemptStatus)
                  }
                  disabled={isCreatingNotebook}
                >
                  <option value="incorrect">Última tentativa errada</option>
                  <option value="unanswered">Ainda inéditas</option>
                  <option value="correct">Última tentativa certa</option>
                </select>
              </label>
            )}
            {notebookKindInput === "dynamic" && (
              <p className="text-xs leading-relaxed text-muted sm:col-span-2">
                O filtro usará a matéria e o formato atualmente selecionados, quando houver.
              </p>
            )}
            <button
              type="submit"
              className={`${buttonPrimaryClass} sm:col-span-2 sm:justify-self-end`}
              disabled={isCreatingNotebook}
            >
              {isCreatingNotebook ? "Criando..." : "Criar Caderno"}
            </button>
          </form>
        </section>
      )}

      {/* Manual Editor Modal */}
      {isEditorOpen && (
        <QuestionEditor
          plan={plan}
          onCancel={() => setIsEditorOpen(false)}
          onSaved={handleQuestionCreated}
        />
      )}

      {/* 2. Main Question Grid */}
      <div className="grid gap-6 xl:grid-cols-[minmax(330px,.85fr)_minmax(0,1.15fr)]">
        {/* Left Question Selection List & Filters */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Navegação</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Banco de Questões</h3>
            </div>
            <span className="font-mono text-xs font-bold text-muted bg-paper-deep px-2.5 py-1 rounded-lg">
              {filteredQuestions.length} de {questions.length}
            </span>
          </div>

          {/* Search bar */}
          <div className="mb-3">
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar por enunciado, banca ou tema..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status filter tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3.5 p-1 rounded-xl bg-paper border border-line">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                statusFilter === "all"
                  ? "bg-card text-ink shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("flagged")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                statusFilter === "flagged"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
               title={`Filtra as questões persistidas em ${activeNotebookName}`}
             >
               {activeNotebookName}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("unsolved")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                statusFilter === "unsolved"
                  ? "bg-card text-ink shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              Inéditas
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("correct")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                statusFilter === "correct"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              ✓ Acertos
            </button>
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className={fieldClass}>
              Caderno ativo
              <select
                className={selectClass}
                value={activeNotebookId}
                onChange={(event) => {
                  setActiveNotebookId(event.target.value);
                  setStatusFilter("all");
                }}
              >
                {notebooks.map((notebook) => (
                  <option key={notebook.id} value={notebook.id}>
                    {notebook.name} {notebook.kind === "dynamic" ? "(filtro)" : `(${notebook.questionCount})`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`${buttonSecondaryClass} min-h-11 px-3 text-xs`}
              onClick={() => setIsNotebookEditorOpen(true)}
            >
              + Novo
            </button>
          </div>

          {/* Subject and Type Dropdown Filters */}
          <div className="grid gap-2.5 sm:grid-cols-2 mb-4">
            <select
              className={selectClass}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">Todas as matérias</option>
              {(plan?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              className={selectClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "" | QuestionType)}
            >
              <option value="">Todos os formatos</option>
              <option value="multiple_choice">Múltipla escolha</option>
              <option value="true_false">Certo / Errado</option>
            </select>
          </div>

          {/* Questions Scrollable List */}
          <div className="grid gap-2 max-h-[520px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted">
                Carregando banco de questões...
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center text-muted">
                <p className="text-xs font-semibold text-ink">
                  {questions.length === 0
                    ? "Nenhuma questão cadastrada ainda."
                    : "Nenhuma questão encontrada com estes filtros."}
                </p>
                <p className="mt-1 text-[11px]">
                  {questions.length === 0
                    ? "Importe um lote JSON oficial ou cadastre sua primeira questão."
                    : "Tente redefinir os critérios de busca."}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  {questions.length === 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditorOpen(true)}
                        className={`${buttonPrimaryClass} text-xs px-3 py-1.5`}
                      >
                        + Nova Questão
                      </button>
                      <button
                        type="button"
                        onClick={handleStartImport}
                        className={`${buttonSecondaryClass} text-xs px-3 py-1.5`}
                      >
                        Importar JSON
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                        setSubjectFilter("");
                        setTypeFilter("");
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Limpar todos os filtros
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filteredQuestions.map((q, idx) => {
                const isSelected = q.id === (selectedQuestion?.id ?? null);
                const hasAnswered = (q.attemptsCount ?? 0) > 0;
                const isCorrect = q.lastAttemptResult === "correct";
                const isIncorrect = q.lastAttemptResult === "incorrect";
                const isFlagged = isQuestionFlagged(q);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setSelectedQuestionId(q.id);
                      setMessage(null);
                    }}
                    className={`flex flex-col text-left rounded-xl p-3 border transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                      isSelected
                        ? "border-blue-600 bg-blue-600/10 text-ink shadow-xs ring-1 ring-blue-600/30"
                        : "border-line bg-paper hover:border-blue-500/30 hover:bg-paper-deep"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase">
                      <span className="text-blue-600 font-extrabold truncate">
                        {idx + 1}. {q.board || "Geral"} {q.examYear ? `(${q.examYear})` : ""}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isFlagged && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300 font-bold">
                            ★
                          </span>
                        )}
                        {isCorrect && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300 font-bold">
                            ✓ Acertou
                          </span>
                        )}
                        {isIncorrect && (
                          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-700 dark:text-red-300 font-bold">
                            ✕ Errou
                          </span>
                        )}
                        {!hasAnswered && (
                          <span className="rounded bg-paper-deep px-1.5 py-0.5 text-muted">
                            Inédita
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-ink">
                      {q.statementMarkdown}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted font-medium">
                      <span>{q.subjectName || "Geral"}</span>
                      {q.questionType === "true_false" ? (
                        <span className="font-mono">C/E</span>
                      ) : (
                        <span className="font-mono">A-D</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right Question Resolution Canvas */}
        <section className="min-w-0">
          {selectedQuestion ? (
            <QuestionRunner
              key={selectedQuestion.id}
              question={selectedQuestion}
              currentIndex={currentIndex >= 0 ? currentIndex + 1 : 1}
              totalCount={filteredQuestions.length}
              hasPrevious={hasPrevious}
               hasNext={hasNext}
               isSavedNotebook={isQuestionFlagged(selectedQuestion)}
               notebookName={activeNotebookName}
               isNotebookDynamic={activeNotebook?.kind === "dynamic"}
               onToggleNotebook={() => handleToggleFlag(selectedQuestion.id)}
               isNotebookPending={notebookPendingQuestionId === selectedQuestion.id}
               notebookEntry={notebookEntryByQuestionId.get(selectedQuestion.id) ?? null}
               onSaveNotebookDetails={(reason, observation) =>
                 handleSaveNotebookDetails(selectedQuestion.id, reason, observation)
               }
              onPrevious={handlePreviousQuestion}
              onNext={handleNextQuestion}
              onAnswered={handleQuestionAnswered}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-card p-12 text-center text-muted">
              <p className="text-sm font-semibold">Nenhuma questão selecionada.</p>
              <p className="mt-1 text-xs">
                Selecione uma questão na lista à esquerda ou cadastre uma nova questão.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type QuestionRunnerProps = {
  question: QuestionSummary;
  currentIndex: number;
  totalCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  isSavedNotebook: boolean;
  notebookName: string;
  isNotebookDynamic: boolean;
  isNotebookPending: boolean;
  notebookEntry: QuestionNotebookEntry | null;
  onToggleNotebook: () => void | Promise<void>;
  onSaveNotebookDetails: (
    reason: QuestionNotebookReason | null,
    observation: string | null,
  ) => void | Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  onAnswered: (result: AnswerQuestionResult) => void;
};

function QuestionRunner({
  question,
  currentIndex,
  totalCount,
  hasPrevious,
  hasNext,
  isSavedNotebook,
  notebookName,
  isNotebookDynamic,
  isNotebookPending,
  notebookEntry,
  onToggleNotebook,
  onSaveNotebookDetails,
  onPrevious,
  onNext,
  onAnswered,
}: QuestionRunnerProps) {
  const startedAtRef = useRef(Date.now());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<QuestionConfidence>("certain");
  const [result, setResult] = useState<AnswerQuestionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runnerError, setRunnerError] = useState<string | null>(null);
  const [notebookReason, setNotebookReason] = useState<QuestionNotebookReason | null>(null);
  const [notebookObservation, setNotebookObservation] = useState("");

  useEffect(() => {
    startedAtRef.current = Date.now();
    setSelectedKey(null);
    setConfidence("certain");
    setResult(null);
    setRunnerError(null);
    setNotebookReason(notebookEntry?.reason ?? null);
    setNotebookObservation(notebookEntry?.observation ?? "");
  }, [question.id, notebookName, notebookEntry?.notebookId, notebookEntry?.reason, notebookEntry?.observation]);

  const handleAnswer = async (keyOverride?: string | null) => {
    const keyToSubmit = keyOverride !== undefined ? keyOverride : selectedKey;
    if (keyToSubmit === null) {
      setSelectedKey(null);
    }
    setIsSubmitting(true);
    setRunnerError(null);
    try {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
      const answered = await answerQuestion({
        questionId: question.id,
        selectedKey: keyToSubmit,
        confidence,
        elapsedSeconds,
      });
      setResult(answered);
      onAnswered(answered);
    } catch (err: unknown) {
      setRunnerError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    startedAtRef.current = Date.now();
    setSelectedKey(null);
    setConfidence("certain");
    setResult(null);
    setRunnerError(null);
  };

  const isBlank = result ? result.attempt.result === "blank" : selectedKey === null;
  const isCorrect = result?.attempt.result === "correct";
  const isPending = result?.attempt.result === "pending";
  const answerKeyAtAttempt = result ? result.attempt.answerKeyAtAttempt : question.answerKey;

  return (
    <article className="rounded-2xl border border-line bg-card p-6 shadow-xs grid gap-5">
      {/* 1. Header: Navigation Controls & Question Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        {/* Navigation buttons and position counter */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            className={`${buttonQuietClass} min-h-8 px-2.5 py-1 text-xs ${
              !hasPrevious ? "opacity-35 cursor-not-allowed" : ""
            }`}
            title="Questão anterior"
          >
            ← Anterior
          </button>
          <span className="font-mono text-xs font-bold text-ink px-1.5">
            {currentIndex} de {totalCount}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className={`${buttonQuietClass} min-h-8 px-2.5 py-1 text-xs ${
              !hasNext ? "opacity-35 cursor-not-allowed" : ""
            }`}
            title="Próxima questão"
          >
            Próxima →
          </button>
        </div>

        {/* Notebook flag button */}
        <button
          type="button"
          onClick={onToggleNotebook}
          disabled={isNotebookPending || isNotebookDynamic}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer ${
            isSavedNotebook
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold"
              : "border border-line text-muted hover:bg-paper"
          }`}
           title={
             isNotebookDynamic
               ? "Este caderno é atualizado pelo filtro salvo"
               : `Adicionar ou remover esta questão de ${notebookName}`
           }
        >
          {isNotebookDynamic
            ? "Filtro automático"
            : isNotebookPending
            ? "Salvando..."
            : isSavedNotebook
            ? `No ${notebookName}`
            : `Adicionar ao ${notebookName}`}
        </button>
      </div>

      {runnerError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-600">
          {runnerError}
        </div>
      )}

      {isSavedNotebook && !isNotebookDynamic && (
        <section className="grid gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4" aria-labelledby="notebook-details-title">
          <div>
            <h3 id="notebook-details-title" className="text-xs font-bold text-ink">
              Detalhes em {notebookName}
            </h3>
            <p className="mt-1 text-[11px] text-muted">
              O motivo e a observação ficam salvos localmente junto da marcação.
            </p>
          </div>
          <label className={fieldClass}>
            Motivo <span className="font-normal text-muted">(opcional)</span>
            <select
              className={selectClass}
              value={notebookReason ?? ""}
              onChange={(event) =>
                setNotebookReason(
                  event.target.value === ""
                    ? null
                    : (event.target.value as QuestionNotebookReason),
                )
              }
              disabled={isNotebookPending}
            >
              <option value="">Ainda não classificado</option>
              <option value="content">Conteúdo</option>
              <option value="interpretation">Interpretação</option>
              <option value="distraction">Distração</option>
              <option value="forgetfulness">Esquecimento</option>
            </select>
          </label>
          <label className={fieldClass}>
            Observação <span className="font-normal text-muted">(opcional)</span>
            <textarea
              className={`${textareaClass} min-h-[76px]`}
              value={notebookObservation}
              maxLength={5000}
              onChange={(event) => setNotebookObservation(event.target.value)}
              placeholder="Anote o que revisar ou o motivo da dúvida..."
              disabled={isNotebookPending}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
              onClick={() =>
                void onSaveNotebookDetails(
                  notebookReason,
                  notebookObservation.trim() || null,
                )
              }
              disabled={isNotebookPending}
            >
              {isNotebookPending ? "Salvando..." : "Salvar anotação"}
            </button>
          </div>
        </section>
      )}

      {/* Meta tags badge bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {question.board && (
          <span className="rounded-md bg-blue-600/10 px-2.5 py-1 font-extrabold text-blue-600">
            {question.board}
          </span>
        )}
        {question.organization && (
          <span className="rounded-md border border-line bg-paper px-2.5 py-1 font-semibold text-ink">
            {question.organization} {question.examYear ? `(${question.examYear})` : ""}
          </span>
        )}
        <span className="rounded-md border border-line bg-paper px-2.5 py-1 font-medium text-muted">
          {question.subjectName || "Geral"}
        </span>
        {question.role && (
          <span className="rounded-md border border-line bg-paper px-2.5 py-1 font-normal text-muted">
            {question.role}
          </span>
        )}
      </div>

      {/* Statement */}
      <div className="question-body font-reading text-pretty text-[1.05rem] font-medium leading-[1.7] text-ink whitespace-pre-line">
        {question.statementMarkdown}
      </div>

      {/* Alternatives List */}
      <div className="grid gap-2.5 pt-2">
        {question.options.map((option) => {
          const isSelected = selectedKey === option.key;
          const isCorrectKey = answerKeyAtAttempt !== null && option.key === answerKeyAtAttempt;
          const displayKey =
            option.key === "true" ? "C" : option.key === "false" ? "E" : option.key;

          let optionStyle =
            "border-line bg-paper/80 text-ink hover:border-blue-500/40 hover:bg-paper shadow-xs";
          if (result) {
            if (isCorrectKey) {
              optionStyle =
                "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-semibold shadow-xs ring-1 ring-emerald-500/40";
            } else if (isSelected && answerKeyAtAttempt === null) {
              optionStyle =
                "border-blue-500 bg-blue-500/10 text-blue-950 dark:text-blue-200 ring-1 ring-blue-500/40";
            } else if (isSelected && !isCorrectKey) {
              optionStyle =
                "border-red-500 bg-red-500/10 text-red-950 dark:text-red-200 ring-1 ring-red-500/40";
            } else {
              optionStyle = "border-line bg-paper/40 text-muted opacity-50";
            }
          } else if (isSelected) {
            optionStyle =
              "border-blue-600 bg-blue-600/10 text-blue-950 dark:text-blue-200 font-bold ring-2 ring-blue-600/30 shadow-xs";
          }

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => !result && setSelectedKey(option.key)}
              disabled={!!result}
              className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left text-xs transition-all duration-150 ease-out cursor-pointer active:scale-[0.99] ${optionStyle}`}
            >
              <span
                className={`flex size-6.5 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold transition-transform ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs scale-105"
                    : result && isCorrectKey
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-paper-deep text-muted border border-line"
                }`}
              >
                {displayKey}
              </span>
              <span className="flex-1 leading-relaxed text-pretty text-[13px]">
                {option.text}
              </span>
            </button>
          );
        })}
      </div>

      {/* Confidence Level Selector (visible before answering) */}
      {!result && (
        <div className="grid gap-2 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">
              Grau de Certeza na Resposta:
            </span>
            <span className="text-[11px] text-muted">
              {confidence === "certain" && "Certeza fundamentada"}
              {confidence === "doubt" && "Em dúvida entre opções"}
              {confidence === "guess" && "Palpite / chute"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setConfidence("certain")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                confidence === "certain"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30 font-bold"
                  : "border-line bg-paper/60 text-muted hover:bg-paper"
              }`}
            >
              <span>Certeza</span>
            </button>
            <button
              type="button"
              onClick={() => setConfidence("doubt")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                confidence === "doubt"
                  ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30 font-bold"
                  : "border-line bg-paper/60 text-muted hover:bg-paper"
              }`}
            >
              <span>Dúvida</span>
            </button>
            <button
              type="button"
              onClick={() => setConfidence("guess")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer active:scale-[0.97] ${
                confidence === "guess"
                  ? "border-purple-500 bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/30 font-bold"
                  : "border-line bg-paper/60 text-muted hover:bg-paper"
              }`}
            >
              <span>Chute</span>
            </button>
          </div>
        </div>
      )}

      {/* Answer Button & Resolution Feedback */}
      <div className="flex items-center justify-between border-t border-line pt-4">
        {!result ? (
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <button
              type="button"
              onClick={() => handleAnswer(null)}
              disabled={isSubmitting}
              className={buttonQuietClass}
              title="Registrar resposta em branco (estratégia para evitar penalidade de banca)"
            >
              Deixar em Branco
            </button>

            <button
              type="button"
              onClick={() => handleAnswer(selectedKey)}
              disabled={!selectedKey || isSubmitting}
              className={`${buttonPrimaryClass} ${
                !selectedKey ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isSubmitting ? "Gravando resposta..." : "Responder Questão"}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 w-full">
            {/* Banner of correctness */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-xs font-bold ${
                isBlank
                  ? "bg-paper-deep text-muted border border-line"
                  : isPending
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30"
                  : isCorrect
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>
                  {isBlank
                    ? "Questão deixada em branco"
                    : isPending
                    ? "Resposta registrada; gabarito pendente"
                    : isCorrect
                    ? "Resposta correta"
                    : "Resposta incorreta"}
                </span>
                <span className="font-mono text-[11px] font-normal opacity-90">
                  {result.xpGranted > 0
                    ? `+${result.xpGranted} XP`
                    : "(0 XP - repetição ou limite atingido)"}
                </span>
                {!isBlank && (
                  <span className="text-[11px] font-normal opacity-80">
                    ({confidence === "certain" ? "certeza" : confidence === "doubt" ? "dúvida" : "chute"})
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold">
                Gabarito Oficial: <strong>{formatAnswerKey(answerKeyAtAttempt)}</strong>
              </span>
            </div>

            {/* Post-answer actions: Retry and Next */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleRetry}
                className={buttonSecondaryClass}
              >
                ↺ Tentar Novamente
              </button>

              {hasNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className={buttonPrimaryClass}
                >
                  Avançar para a Próxima →
                </button>
              )}
            </div>

            {/* Explanation / Justification */}
            {question.explanationMarkdown && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-relaxed text-ink mt-1">
                <h5 className="font-bold text-blue-600 mb-1">Gabarito Comentado / Fundamentação</h5>
                <p className="text-muted whitespace-pre-line leading-relaxed">
                  {question.explanationMarkdown}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function QuestionEditor({
  plan,
  onCancel,
  onSaved,
}: {
  plan: StudyPlan | null;
  onCancel: () => void;
  onSaved: (q: QuestionSummary) => void;
}) {
  const [statement, setStatement] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [subjectId, setSubjectId] = useState("");
  const [board, setBoard] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [year, setYear] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [explanation, setExplanation] = useState("");

  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!statement.trim()) {
      setFormError("Informe o enunciado da questão.");
      return;
    }

    const options =
      questionType === "true_false"
        ? [
            { key: "true", text: "Certo" },
            { key: "false", text: "Errado" },
          ]
        : [
            { key: "A", text: optA.trim() },
            { key: "B", text: optB.trim() },
            { key: "C", text: optC.trim() },
            { key: "D", text: optD.trim() },
          ].filter((option) => option.text.length > 0);

    if (questionType === "multiple_choice" && options.length < 2) {
      setFormError("Informe pelo menos duas alternativas com texto.");
      return;
    }

    if (answerKey && !options.some((option) => option.key === answerKey)) {
      setFormError("O gabarito selecionado precisa ter uma alternativa preenchida.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const request: CreateQuestionRequest = {
      questionType,
      statementMarkdown: statement.trim(),
      options,
      answerKey: answerKey || null,
      explanationMarkdown: explanation.trim() || null,
      sourceName: "Cadastro Manual",
      board: board.trim() || null,
      organization: organization.trim() || null,
      role: role.trim() || null,
      examYear: year ? Number(year) : null,
      subjectId: subjectId || null,
    };

    try {
      const q = await createQuestion(request);
      onSaved(q);
    } catch (err: unknown) {
      setFormError(getDesktopErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card p-6 shadow-lg animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <Eyebrow>Cadastro Manual</Eyebrow>
          <h3 className="font-heading text-lg font-bold text-ink">Nova Questão</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted hover:text-ink font-semibold"
        >
          ✕ Cancelar
        </button>
      </div>

      {formError && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
          {formError}
        </p>
      )}

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={fieldClass}>
            Formato
            <select
              className={selectClass}
              value={questionType}
              onChange={(e) => {
                const t = e.target.value as QuestionType;
                setQuestionType(t);
                setAnswerKey("");
              }}
            >
              <option value="multiple_choice">Múltipla Escolha (A-D)</option>
              <option value="true_false">Certo / Errado (C/E)</option>
            </select>
          </label>

          <label className={fieldClass}>
            Disciplina
            <select
              className={selectClass}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Selecione a disciplina</option>
              {(plan?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className={fieldClass}>
            Gabarito Oficial
            <select
              className={selectClass}
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
            >
              <option value="">Ainda não informado</option>
              {questionType === "true_false" ? (
                <>
                  <option value="true">Certo (C)</option>
                  <option value="false">Errado (E)</option>
                </>
              ) : (
                <>
                  <option value="A">Alternativa A</option>
                  <option value="B">Alternativa B</option>
                  <option value="C">Alternativa C</option>
                  <option value="D">Alternativa D</option>
                </>
              )}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <label className={fieldClass}>
            Banca <span className="text-muted font-normal">(opcional)</span>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Cebraspe"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Órgão <span className="text-muted font-normal">(opcional)</span>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: STF"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Cargo <span className="text-muted font-normal">(opcional)</span>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Analista"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Ano <span className="text-muted font-normal">(opcional)</span>
            <input
              type="number"
              className={inputClass}
              placeholder="Ex.: 2025"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
        </div>

        <label className={fieldClass}>
          Enunciado da Questão
          <textarea
            className={textareaClass}
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Digite o texto do enunciado ou caso prático da questão..."
          />
        </label>

        {questionType === "multiple_choice" && (
          <div className="grid gap-2.5">
            <span className="text-xs font-semibold text-ink">Alternativas:</span>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className="size-7 flex items-center justify-center font-mono font-bold rounded-lg bg-paper-deep text-xs text-muted">
                  A
                </span>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Texto da Alternativa A"
                  value={optA}
                  onChange={(e) => setOptA(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-7 flex items-center justify-center font-mono font-bold rounded-lg bg-paper-deep text-xs text-muted">
                  B
                </span>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Texto da Alternativa B"
                  value={optB}
                  onChange={(e) => setOptB(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-7 flex items-center justify-center font-mono font-bold rounded-lg bg-paper-deep text-xs text-muted">
                  C
                </span>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Texto da Alternativa C"
                  value={optC}
                  onChange={(e) => setOptC(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-7 flex items-center justify-center font-mono font-bold rounded-lg bg-paper-deep text-xs text-muted">
                  D
                </span>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Texto da Alternativa D"
                  value={optD}
                  onChange={(e) => setOptD(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <label className={fieldClass}>
          Gabarito Comentado / Fundamentação <span className="text-muted font-normal">(opcional)</span>
          <textarea
            className={textareaClass}
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Artigo de lei, jurisprudência ou fundamentação da banca..."
          />
        </label>

        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onCancel}
            className={buttonQuietClass}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={buttonPrimaryClass}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvando..." : "Salvar Questão"}
          </button>
        </div>
      </div>
    </div>
  );
}
