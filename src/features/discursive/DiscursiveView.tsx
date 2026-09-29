import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  answerDiscursiveQuestion,
  createDiscursiveQuestion,
  getDesktopErrorMessage,
  getDiscursiveQuestions,
} from "../../shared/desktop/commands";
import type {
  CreateDiscursiveQuestionRequest,
  DiscursiveQuestionSummary,
  DiscursiveSelfAssessment,
  StudyPlan,
} from "../../shared/desktop/contracts";
import { MarkdownContent } from "../../shared/ui/MarkdownContent";
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

type DiscursiveViewProps = {
  plan: StudyPlan | null;
  refreshKey: number;
};

const SELF_ASSESSMENT_LABELS: Record<DiscursiveSelfAssessment, string> = {
  weak: "Preciso revisar",
  partial: "Parcial",
  strong: "Dominei a resposta",
};

export function DiscursiveView({ plan, refreshKey }: DiscursiveViewProps) {
  const [questions, setQuestions] = useState<DiscursiveQuestionSummary[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [statement, setStatement] = useState("");
  const [reference, setReference] = useState("");
  const [rubric, setRubric] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [response, setResponse] = useState("");
  const [selfAssessment, setSelfAssessment] = useState<DiscursiveSelfAssessment>("partial");
  const responseStartedAt = useRef(Date.now());

  const primaryPreparation =
    plan?.preparations.find((preparation) => preparation.isPrimary) ?? plan?.preparations[0] ?? null;
  const subjects = plan?.subjects.filter((subject) => subject.preparationId === primaryPreparation?.id) ?? [];
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getDiscursiveQuestions()
      .then((loadedQuestions) => {
        if (cancelled) return;
        setQuestions(loadedQuestions);
        setSelectedQuestionId((currentId) =>
          currentId && loadedQuestions.some((question) => question.id === currentId)
            ? currentId
            : loadedQuestions[0]?.id ?? null,
        );
        setError(null);
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
    responseStartedAt.current = Date.now();
    setResponse("");
    setSelfAssessment("partial");
  }, [selectedQuestionId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    if (!statement.trim()) {
      setFormError("Escreva o enunciado da discursiva.");
      return;
    }
    const request: CreateDiscursiveQuestionRequest = {
      statementMarkdown: statement,
      referenceMarkdown: reference.trim() || null,
      rubricMarkdown: rubric.trim() || null,
      sourceName: sourceName.trim() || null,
      board: null,
      organization: null,
      role: null,
      examYear: null,
      subjectId: subjectId || null,
    };
    setIsSaving(true);
    try {
      const created = await createDiscursiveQuestion(request);
      setQuestions((previous) => [created, ...previous]);
      setSelectedQuestionId(created.id);
      setIsFormOpen(false);
      setStatement("");
      setReference("");
      setRubric("");
      setSourceName("");
      setMessage("Discursiva salva no banco local.");
    } catch (operationError: unknown) {
      setFormError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnswer = async () => {
    if (!selectedQuestion || !response.trim()) {
      setError("Escreva uma resposta antes de salvar a tentativa.");
      return;
    }
    setIsAnswering(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await answerDiscursiveQuestion({
        questionId: selectedQuestion.id,
        responseMarkdown: response,
        selfAssessment,
        elapsedSeconds: Math.max(0, Math.floor((Date.now() - responseStartedAt.current) / 1000)),
      });
      setQuestions((previous) => previous.map((question) => question.id === saved.question.id ? saved.question : question));
      setResponse("");
      setMessage("Resposta discursiva salva separadamente da nota objetiva.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsAnswering(false);
    }
  };

  const openNewForm = () => {
    setFormError(null);
    setMessage(null);
    setStatement("");
    setReference("");
    setRubric("");
    setSourceName("");
    setSubjectId(subjects[0]?.id ?? "");
    setIsFormOpen(true);
  };

  return (
    <div className="grid gap-6">
      <section className="glass-hero relative overflow-hidden rounded-3xl border border-white/12 p-6 text-white shadow-xl lg:p-8">
        <div className="relative z-10 grid max-w-4xl gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200">Discursivas</span>
            <span className="text-xs font-medium text-slate-300/85">Resposta, referência e rubrica locais</span>
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-white lg:text-3xl">Escreva para aprender</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/85">Registre estudos de caso e respostas abertas sem misturá-los com o gabarito objetivo. A autoavaliação fica vinculada a cada tentativa.</p>
          </div>
          <button type="button" onClick={openNewForm} className={buttonPrimaryClass}>+ Nova discursiva</button>
        </div>
      </section>

      {error && <InlineNotice tone="error" message={error} onClose={() => setError(null)} />}
      {message && <InlineNotice tone="success" message={message} onClose={() => setMessage(null)} />}

      {isFormOpen && (
        <section className="grid gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5" aria-labelledby="new-discursive-title">
          <div className="flex items-start justify-between gap-4">
            <div><Eyebrow>Cadastro local</Eyebrow><h3 id="new-discursive-title" className="mt-1 font-heading text-lg font-bold text-ink">Nova questão discursiva</h3></div>
            <button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)}>Fechar</button>
          </div>
          <form className="grid gap-4" onSubmit={handleCreate}>
            <label className={fieldClass}>Enunciado em Markdown<textarea className={textareaClass} value={statement} onChange={(event) => setStatement(event.target.value)} maxLength={50000} rows={6} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldClass}>Referência esperada<textarea className={textareaClass} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={50000} rows={5} /></label>
              <label className={fieldClass}>Rubrica de correção<textarea className={textareaClass} value={rubric} onChange={(event) => setRubric(event.target.value)} maxLength={50000} rows={5} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldClass}>Assunto<select className={selectClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Sem assunto</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
              <label className={fieldClass}>Origem<input className={inputClass} value={sourceName} onChange={(event) => setSourceName(event.target.value)} maxLength={240} placeholder="Ex.: estudo de caso do edital" /></label>
            </div>
            {formError && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={buttonQuietClass} onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</button><button type="submit" className={buttonPrimaryClass} disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar discursiva"}</button></div>
          </form>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section className="grid content-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-xs" aria-labelledby="discursive-list-title">
          <div className="flex items-center justify-between"><div><Eyebrow>Banco local</Eyebrow><h3 id="discursive-list-title" className="mt-1 font-heading text-lg font-bold text-ink">Questões abertas</h3></div>{isLoading && <span className="text-[11px] text-muted">Carregando...</span>}</div>
          {!isLoading && questions.length === 0 && <div className="rounded-xl border border-dashed border-line bg-paper/60 p-5 text-center"><p className="text-sm font-semibold text-ink">Nenhuma discursiva ainda.</p><p className="mt-1 text-xs text-muted">Cadastre uma situação-problema para praticar sua argumentação.</p><button type="button" className={`${buttonSecondaryClass} mt-4`} onClick={openNewForm}>Cadastrar agora</button></div>}
          <div className="grid max-h-[620px] gap-2 overflow-y-auto pr-1">{questions.map((question) => <button key={question.id} type="button" onClick={() => setSelectedQuestionId(question.id)} className={`grid gap-2 rounded-xl border p-3 text-left transition-colors ${question.id === selectedQuestionId ? "border-amber-500/50 bg-amber-500/10" : "border-line bg-paper/60 hover:border-muted/60 hover:bg-paper"}`}><span className="line-clamp-2 text-sm font-bold text-ink">{question.statementMarkdown.split("\n")[0]}</span><span className="flex justify-between gap-2 text-[11px] text-muted"><span>{question.subjectName ?? "Sem assunto"}</span><span>{question.attemptsCount} {question.attemptsCount === 1 ? "tentativa" : "tentativas"}</span></span></button>)}</div>
          {!isLoading && error && <button type="button" className={`${buttonSecondaryClass} w-full`} onClick={() => setRetryVersion((version) => version + 1)}>Tentar novamente</button>}
        </section>

        <section className="min-w-0 rounded-2xl border border-line bg-card p-5 shadow-xs lg:p-7">
          {selectedQuestion ? <DiscursiveRunner question={selectedQuestion} isSaving={isAnswering} response={response} selfAssessment={selfAssessment} onResponseChange={setResponse} onSelfAssessmentChange={setSelfAssessment} onSave={handleAnswer} /> : <div className="p-8 text-center text-sm text-muted"><p className="font-semibold text-ink">Selecione uma discursiva</p><p className="mt-1">A resposta e a autoavaliação ficam salvas no espaço local.</p></div>}
        </section>
      </div>
    </div>
  );
}

type DiscursiveRunnerProps = {
  question: DiscursiveQuestionSummary;
  isSaving: boolean;
  response: string;
  selfAssessment: DiscursiveSelfAssessment;
  onResponseChange: (value: string) => void;
  onSelfAssessmentChange: (value: DiscursiveSelfAssessment) => void;
  onSave: () => void;
};

function DiscursiveRunner({ question, isSaving, response, selfAssessment, onResponseChange, onSelfAssessmentChange, onSave }: DiscursiveRunnerProps) {
  return (
    <div className="grid gap-5">
      <div className="border-b border-line pb-4"><Eyebrow>{question.subjectName ?? "Sem assunto"}</Eyebrow><h3 className="mt-2 font-heading text-xl font-bold text-ink">Enunciado</h3></div>
      <MarkdownContent source={question.statementMarkdown} className="question-body font-reading text-[1.05rem] font-medium leading-[1.7] text-ink" />
      <div className="grid gap-3 rounded-xl border border-line bg-paper/60 p-4">
        <label className={fieldClass}>Sua resposta<textarea className={textareaClass} value={response} onChange={(event) => onResponseChange(event.target.value)} maxLength={50000} rows={9} placeholder="Estruture sua resposta, cite fundamentos e conclua." /></label>
        <div className="flex flex-wrap items-end justify-between gap-3"><label className={`${fieldClass} min-w-48`}>Autoavaliação<select className={selectClass} value={selfAssessment} onChange={(event) => onSelfAssessmentChange(event.target.value as DiscursiveSelfAssessment)}>{Object.entries(SELF_ASSESSMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className={buttonPrimaryClass} onClick={onSave} disabled={isSaving || !response.trim()}>{isSaving ? "Salvando..." : "Salvar tentativa"}</button></div>
      </div>
      {question.latestAttempt && <section className="grid gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4" aria-labelledby="latest-discursive-attempt-title"><div className="flex flex-wrap items-center justify-between gap-3"><h4 id="latest-discursive-attempt-title" className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Última tentativa</h4><span className="rounded-full border border-blue-500/25 bg-card px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">{SELF_ASSESSMENT_LABELS[question.latestAttempt.selfAssessment]}</span></div><MarkdownContent source={question.latestAttempt.responseMarkdown} /></section>}
      <div className="grid gap-3 sm:grid-cols-2"><ReferenceBlock title="Referência esperada" source={question.referenceMarkdown} /><ReferenceBlock title="Rubrica de correção" source={question.rubricMarkdown} /></div>
    </div>
  );
}

function ReferenceBlock({ title, source }: { title: string; source: string | null }) {
  return <details className="rounded-xl border border-line bg-paper/60 p-4"><summary className="cursor-pointer text-xs font-bold text-ink">{title}</summary><div className="mt-3 text-sm text-muted">{source ? <MarkdownContent source={source} /> : "Nenhum conteúdo registrado."}</div></details>;
}

function InlineNotice({ tone, message, onClose }: { tone: "error" | "success"; message: string; onClose: () => void }) {
  return <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-xs ${tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"}`} role={tone === "error" ? "alert" : "status"}><span>{message}</span><button type="button" onClick={onClose} className="font-bold hover:underline">Fechar</button></div>;
}
