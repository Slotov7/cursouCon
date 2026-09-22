import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerQuestion,
  createQuestion,
  exportQuestions,
  getDesktopErrorMessage,
  getQuestions,
  importQuestions,
  pickQuestionImportFile,
  previewQuestionImport,
} from "../../shared/desktop/commands";
import type {
  AnswerQuestionResult,
  CreateQuestionRequest,
  QuestionConfidence,
  QuestionExportResult,
  QuestionImportPreview,
  QuestionImportResult,
  QuestionSummary,
  QuestionType,
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

type StatusFilter = "all" | "notebook" | "unsolved" | "correct";

const SAMPLE_DEMO_QUESTIONS: QuestionSummary[] = [
  {
    id: "q-demo-101",
    questionType: "multiple_choice",
    statementMarkdown:
      "A respeito dos direitos e deveres individuais e coletivos previstos na Constituição Federal de 1988, assinale a opção correta conforme a jurisprudência do STF:",
    options: [
      { key: "A", text: "É plena a liberdade de associação para fins lícitos, exigindo autorização estatal prévia." },
      { key: "B", text: "A casa é asilo inviolável do indivíduo, podendo nela penetrar durante a noite por determinação judicial." },
      { key: "C", text: "A criação de associações e cooperativas independe de autorização, sendo vedada a interferência estatal em seu funcionamento." },
      { key: "D", text: "As associações só podem ser dissolvidas compulsoriamente por decisão administrativa." },
    ],
    answerKey: "C",
    explanationMarkdown:
      "Gabarito: C. Conforme art. 5º, XVIII da CF/88: 'a criação de associações e, na forma da lei, a de cooperativas independem de autorização, sendo vedada a interferência estatal em seu funcionamento.'",
    sourceName: "Concurso STF",
    board: "Cebraspe",
    organization: "STF",
    role: "Analista Judiciário",
    examYear: 2025,
    subjectId: "subj-1",
    subjectName: "Direito Constitucional",
    status: "active",
    attemptsCount: 2,
    firstAttemptResult: "correct",
    lastAttemptResult: "correct",
  },
  {
    id: "q-demo-102",
    questionType: "multiple_choice",
    statementMarkdown:
      "Em relação ao padrão Domain-Driven Design (DDD) e Arquitetura Hexagonal (Ports and Adapters), assinale a afirmativa correta:",
    options: [
      { key: "A", text: "A camada de domínio deve importar bibliotecas de banco de dados SQL diretamente." },
      { key: "B", text: "Portas de entrada (Inbound Ports) definem contratos de uso invocados pela interface de usuário ou controladores API." },
      { key: "C", text: "Os adaptadores de infraestrutura devem conter a regra de negócio central da aplicação." },
      { key: "D", text: "Um Bounded Context compartilha todas as entidades com outros contextos livremente." },
    ],
    answerKey: "B",
    explanationMarkdown:
      "Gabarito: B. Na Arquitetura Hexagonal, as Inbound Ports definem interfaces de casos de uso expostas para acionamento por drivers (UI, APIs REST).",
    sourceName: "Concurso TRT",
    board: "FCC",
    organization: "TRT",
    role: "Analista de TI",
    examYear: 2025,
    subjectId: "subj-2",
    subjectName: "Engenharia de Software",
    status: "active",
    attemptsCount: 1,
    firstAttemptResult: "correct",
    lastAttemptResult: "correct",
  },
  {
    id: "q-demo-103",
    questionType: "true_false",
    statementMarkdown:
      "Julgue o item a seguir: Na administração pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios, a publicidade dos atos, programas, obras, serviços e campanhas dos órgãos públicos deverá ter caráter educativo, informativo ou de orientação social, dela não podendo constar nomes, símbolos ou imagens que caracterizem promoção pessoal de autoridades ou servidores públicos.",
    options: [
      { key: "C", text: "Certo" },
      { key: "E", text: "Errado" },
    ],
    answerKey: "C",
    explanationMarkdown:
      "Gabarito: Certo. Reprodução exata do art. 37, § 1º da Constituição Federal de 1988, que consagra o Princípio da Impessoalidade na publicidade dos atos governamentais.",
    sourceName: "Concurso TCU",
    board: "Cebraspe",
    organization: "TCU",
    role: "Auditor Federal de Controle Externo",
    examYear: 2025,
    subjectId: "subj-1",
    subjectName: "Direito Constitucional",
    status: "active",
    attemptsCount: 1,
    firstAttemptResult: "incorrect",
    lastAttemptResult: "incorrect",
  },
];

export function PracticeView({ plan, refreshKey }: PracticeViewProps) {
  const [questions, setQuestions] = useState<QuestionSummary[]>(SAMPLE_DEMO_QUESTIONS);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>("q-demo-101");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | QuestionType>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notebookIdMap, setNotebookIdMap] = useState<Record<string, boolean>>({
    "q-demo-103": true,
  });

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<QuestionImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isQuestionInNotebook = (q: QuestionSummary) => {
    return notebookIdMap[q.id] ?? (q.lastAttemptResult === "incorrect");
  };

  const handleToggleNotebook = (questionId: string) => {
    setNotebookIdMap((prev) => {
      const q = questions.find((item) => item.id === questionId);
      const current = prev[questionId] ?? (q?.lastAttemptResult === "incorrect");
      return { ...prev, [questionId]: !current };
    });
  };

  const loadQuestions = () => {
    setIsLoading(true);
    let cancelled = false;
    getQuestions({
      subjectId: subjectFilter || null,
      questionType: typeFilter || null,
      status: "active",
      limit: 200,
      offset: 0,
    })
      .then((loadedQuestions) => {
        if (!cancelled && loadedQuestions.length > 0) {
          setQuestions(loadedQuestions);
          if (!selectedQuestionId || !loadedQuestions.some((q) => q.id === selectedQuestionId)) {
            setSelectedQuestionId(loadedQuestions[0].id);
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

  // Client-side filtering across status, subject, type, and keyword search
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (subjectFilter && q.subjectId !== subjectFilter) {
        return false;
      }
      if (typeFilter && q.questionType !== typeFilter) {
        return false;
      }

      if (statusFilter === "notebook") {
        if (!isQuestionInNotebook(q)) return false;
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
  }, [questions, subjectFilter, typeFilter, statusFilter, searchQuery, notebookIdMap]);

  const currentIndex = filteredQuestions.findIndex((q) => q.id === selectedQuestionId);
  const selectedQuestion =
    currentIndex >= 0
      ? filteredQuestions[currentIndex]
      : filteredQuestions[0] ?? null;

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
    setMessage("Tentativa registrada com sucesso no histórico local.");
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
              Treino de Questões & Caderno de Erros
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Resolução de questões com cronometragem local, grau de confiança, gabarito fundamentado e caderno de erros automático.
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
              📥 Importar JSON
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className={buttonOutlineLightClass}
            >
              {isExporting ? "Exportando..." : "📤 Exportar JSON"}
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
              onClick={() => setStatusFilter("notebook")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                statusFilter === "notebook"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              ★ Erros
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
            {filteredQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center text-muted">
                <p className="text-xs font-medium">Nenhuma questão encontrada com estes filtros.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setSubjectFilter("");
                    setTypeFilter("");
                  }}
                  className="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              </div>
            ) : (
              filteredQuestions.map((q, idx) => {
                const isSelected = q.id === (selectedQuestion?.id ?? null);
                const hasAnswered = (q.attemptsCount ?? 0) > 0;
                const isCorrect = q.lastAttemptResult === "correct";
                const isIncorrect = q.lastAttemptResult === "incorrect";

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
                        {idx + 1}. {q.board || "Cebraspe"} ({q.examYear || 2025})
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
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
              isSavedNotebook={isQuestionInNotebook(selectedQuestion)}
              onToggleNotebook={() => handleToggleNotebook(selectedQuestion.id)}
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
  onToggleNotebook: () => void;
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
  onToggleNotebook,
  onPrevious,
  onNext,
  onAnswered,
}: QuestionRunnerProps) {
  const startedAtRef = useRef(Date.now());
  const [selectedKey, setSelectedKey] = useState("");
  const [confidence, setConfidence] = useState<QuestionConfidence>("certain");
  const [result, setResult] = useState<AnswerQuestionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    setSelectedKey("");
    setConfidence("certain");
    setResult(null);
  }, [question.id]);

  const handleAnswer = async () => {
    if (!selectedKey) return;
    setIsSubmitting(true);
    try {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
      const answered = await answerQuestion({
        questionId: question.id,
        selectedKey: selectedKey || null,
        confidence,
        elapsedSeconds,
      });
      setResult(answered);
      onAnswered(answered);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    startedAtRef.current = Date.now();
    setSelectedKey("");
    setConfidence("certain");
    setResult(null);
  };

  const isCorrect = selectedKey === (result?.question.answerKey || question.answerKey);

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

        {/* Notebook bookmark button */}
        <button
          type="button"
          onClick={onToggleNotebook}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer ${
            isSavedNotebook
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold"
              : "border border-line text-muted hover:bg-paper"
          }`}
        >
          {isSavedNotebook ? "★ No Caderno de Erros" : "☆ Salvar no Caderno"}
        </button>
      </div>

      {/* Meta tags badge bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-blue-600/10 px-2.5 py-1 font-extrabold text-blue-600">
          {question.board || "Cebraspe"}
        </span>
        <span className="rounded-md border border-line bg-paper px-2.5 py-1 font-semibold text-ink">
          {question.organization || "STF"} ({question.examYear || 2025})
        </span>
        <span className="rounded-md border border-line bg-paper px-2.5 py-1 font-medium text-muted">
          {question.subjectName || "Direito Constitucional"}
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
          const isCorrectKey = option.key === (question.answerKey || "C");

          let optionStyle =
            "border-line bg-paper/80 text-ink hover:border-blue-500/40 hover:bg-paper shadow-xs";
          if (result) {
            if (isCorrectKey) {
              optionStyle =
                "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-semibold shadow-xs ring-1 ring-emerald-500/40";
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
                {option.key}
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
              {confidence === "certain" && "🎯 Certeza fundamentada"}
              {confidence === "doubt" && "🤔 Em dúvida entre opções"}
              {confidence === "guess" && "🎲 Palpite / Chute"}
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
              <span>🎯 Certeza</span>
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
              <span>🤔 Dúvida</span>
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
              <span>🎲 Chute</span>
            </button>
          </div>
        </div>
      )}

      {/* Answer Button & Resolution Feedback */}
      <div className="flex items-center justify-between border-t border-line pt-4">
        {!result ? (
          <button
            type="button"
            onClick={handleAnswer}
            disabled={!selectedKey || isSubmitting}
            className={`${buttonPrimaryClass} ${
              !selectedKey ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Gravando resposta..." : "Responder Questão"}
          </button>
        ) : (
          <div className="grid gap-3 w-full">
            {/* Banner of correctness */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-xs font-bold ${
                isCorrect
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{isCorrect ? "✓ Resposta Correta! +15 XP" : "✕ Resposta Incorreta"}</span>
                <span className="text-[11px] font-normal opacity-80">
                  (respondida com {confidence === "certain" ? "certeza" : confidence === "doubt" ? "dúvida" : "chute"})
                </span>
              </div>
              <span className="text-[11px] font-semibold">
                Gabarito: <strong>{result.question.answerKey || question.answerKey}</strong>
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
  const [board, setBoard] = useState("Cebraspe");
  const [organization, setOrganization] = useState("Órgão Público");
  const [role, setRole] = useState("Analista");
  const [year, setYear] = useState("2025");
  const [answerKey, setAnswerKey] = useState("A");
  const [explanation, setExplanation] = useState("");

  const [optA, setOptA] = useState("Alternativa A");
  const [optB, setOptB] = useState("Alternativa B");
  const [optC, setOptC] = useState("Alternativa C");
  const [optD, setOptD] = useState("Alternativa D");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!statement.trim()) {
      setFormError("Informe o enunciado da questão.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const options =
      questionType === "true_false"
        ? [
            { key: "C", text: "Certo" },
            { key: "E", text: "Errado" },
          ]
        : [
            { key: "A", text: optA.trim() || "Alternativa A" },
            { key: "B", text: optB.trim() || "Alternativa B" },
            { key: "C", text: optC.trim() || "Alternativa C" },
            { key: "D", text: optD.trim() || "Alternativa D" },
          ];

    const request: CreateQuestionRequest = {
      questionType,
      statementMarkdown: statement.trim(),
      options,
      answerKey: questionType === "true_false" ? (answerKey === "E" ? "E" : "C") : answerKey,
      explanationMarkdown: explanation.trim() || null,
      sourceName: "Cadastro Manual",
      board: board.trim() || null,
      organization: organization.trim() || null,
      role: role.trim() || null,
      examYear: Number(year) || 2025,
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
                if (t === "true_false") {
                  setAnswerKey("C");
                } else {
                  setAnswerKey("A");
                }
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
            Gabarito Correto
            <select
              className={selectClass}
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
            >
              {questionType === "true_false" ? (
                <>
                  <option value="C">Certo (C)</option>
                  <option value="E">Errado (E)</option>
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
            Banca
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Cebraspe"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Órgão
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: STF"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Cargo
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Analista"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </label>

          <label className={fieldClass}>
            Ano
            <input
              type="number"
              className={inputClass}
              placeholder="2025"
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
            placeholder="Digite o texto do enunciado ou caso prático..."
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
            placeholder="Artigo de lei, jurisprudência do STF/STJ ou explicação doutrinária..."
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
