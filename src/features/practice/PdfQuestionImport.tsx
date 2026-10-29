import { useEffect, useState } from "react";
import { createQuestionsBatch, getDesktopErrorMessage, getMaterialSource, getMaterials, importMaterial, pickPdfFile } from "../../shared/desktop/commands";
import type { CreateQuestionRequest, MaterialSummary, StudyPlan } from "../../shared/desktop/contracts";
import { buttonPrimaryClass, buttonSecondaryClass, Eyebrow, selectClass, textareaClass } from "../../shared/ui/primitives";
import { separateAlternatives, splitPdfQuestions, type PdfQuestionDraft } from "./pdfQuestions";

export function PdfQuestionImport({ plan, onSaved, onClose }: {
  plan: StudyPlan | null; onSaved: () => void; onClose: () => void;
}) {
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [drafts, setDrafts] = useState<PdfQuestionDraft[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [answerSheet, setAnswerSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getMaterials().then((items) => setMaterials(items.filter((item) => item.mimeType === "application/pdf" && !item.sourceUrl)))
      .catch((failure: unknown) => setError(getDesktopErrorMessage(failure)));
  }, []);

  const extractPdf = async (sourceId: string, fileName: string) => {
    if (!sourceId || busy) return;
    setBusy(true); setError(null); setMessage(null); setDrafts([]); setExtractedText("");
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      GlobalWorkerOptions.workerSrc = worker.default;
      const loadingTask = getDocument({ url: await getMaterialSource({ materialId: sourceId }) });
      try {
        const pdf = await loadingTask.promise;
        if (pdf.numPages > 100) throw new Error("Importe PDFs de até 100 páginas por vez.");
        const pages: string[] = [];
        for (let page = 1; page <= pdf.numPages; page += 1) {
          const content = await (await pdf.getPage(page)).getTextContent();
          pages.push(content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join(""));
        }
        const extracted = pages.join("\n");
        if (extracted.length > 500_000) throw new Error("Texto extraído muito grande. Separe o PDF em partes menores.");
        setExtractedText(extracted);
        const found = splitPdfQuestions(pages);
        setDrafts(found);
        setSourceName(fileName);
        setMessage(found.length ? `${found.length} bloco(s) sugerido(s). Revise enunciados, alternativas e gabarito antes de confirmar.` : "Nenhuma questão numerada reconhecida. PDFs digitalizados exigem OCR externo; nada foi salvo.");
      } finally { await loadingTask.destroy(); }
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  const importAndExtractPdf = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const sourcePath = await pickPdfFile();
      if (!sourcePath) return;
      const imported = await importMaterial({ sourcePath, subjectId: subjectId || null });
      if (imported.mimeType !== "application/pdf") throw new Error("Escolha um arquivo PDF válido.");
      setMaterials((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      setMaterialId(imported.id);
      await extractPdf(imported.id, imported.originalName);
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  const update = (index: number, patch: Partial<PdfQuestionDraft>) => setDrafts((items) => items.map((item, position) => position === index ? { ...item, ...patch } : item));

  const applyAnswerSheet = () => {
    const answers = new Map<string, string>();
    for (const line of answerSheet.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = line.trim().match(/^(\d{1,4})\s*[-.:)]\s*(A|B|C|D|E|Certo|Errado)$/i);
      if (!match) { setError(`Gabarito não reconhecido: ${line.slice(0, 80)}. Use uma linha por questão, como 1-A.`); return; }
      if (answers.has(match[1])) { setError(`Questão ${match[1]} repetida no gabarito.`); return; }
      const value = match[2].toLowerCase();
      answers.set(match[1], value === "certo" ? "true" : value === "errado" ? "false" : match[2].toUpperCase());
    }
    setDrafts((items) => items.map((item) => ({ ...item, answerKey: answers.get(item.number) ?? item.answerKey })));
    setError(null);
    setMessage("Gabarito sugerido. Confira cada associação antes de salvar.");
  };

  const save = async () => {
    const selected = drafts.filter((draft) => draft.included);
    if (busy || !selected.length) return;
    if (selected.length > 100) {
      setError("Selecione até 100 questões por lote. Desmarque o restante e importe em outro lote.");
      return;
    }
    const questions: CreateQuestionRequest[] = selected.map((draft) => {
      const { statement, options } = separateAlternatives(draft.statement);
      const questionType = options.length > 0 ? "multiple_choice" : "true_false";
      return {
        questionType,
        statementMarkdown: `Questão ${draft.number}\n${statement}`,
        options: questionType === "multiple_choice" ? options : [
          { key: "true", text: "Certo" }, { key: "false", text: "Errado" },
        ],
        answerKey: draft.answerKey || null,
        explanationMarkdown: null,
        sourceName: sourceName.trim() || null,
        subjectId: subjectId || null,
        board: null, organization: null, role: null, examYear: null,
      };
    });
    const missingStatement = questions.findIndex((question) => !question.statementMarkdown.replace(/^Questão \S+\s*/, "").trim());
    if (missingStatement >= 0) {
      setError(`Revise o enunciado da questão ${selected[missingStatement].number}. Nenhuma questão foi salva.`);
      return;
    }
    if (questions.some((item) => item.questionType === "multiple_choice" && (item.options.length < 2 || item.options.length > 5))) {
      setError("Revise as alternativas: múltipla escolha precisa de 2 a 5 alternativas A–E. Nenhuma questão foi salva.");
      return;
    }
    const invalidAnswer = questions.findIndex((question) => question.answerKey &&
      !question.options.some((option) => option.key === question.answerKey));
    if (invalidAnswer >= 0) {
      setError(`O gabarito da questão ${selected[invalidAnswer].number} não corresponde às alternativas. Nenhuma questão foi salva.`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const count = await createQuestionsBatch(questions);
      setMessage(`${count} questão(ões) salvas em Questões. O PDF original continua em Materiais.`);
      setDrafts([]); onSaved();
    } catch (failure: unknown) { setError(getDesktopErrorMessage(failure)); }
    finally { setBusy(false); }
  };

  return <section className="grid gap-4 rounded-2xl border border-line bg-card p-5" aria-labelledby="pdf-import-title">
    <div className="flex justify-between gap-3"><div><Eyebrow>Importação assistida</Eyebrow><h3 id="pdf-import-title" className="text-lg font-bold text-ink">Prova em PDF</h3><p className="text-xs text-muted">Escolha um PDF aqui, revise as questões sugeridas e confirme. O arquivo também ficará em Materiais.</p></div><button type="button" className={buttonSecondaryClass} onClick={onClose} disabled={busy}>Fechar</button></div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}{message && <p role="status" className="text-sm text-muted">{message}</p>}
    <button type="button" className={`${buttonPrimaryClass} justify-self-start`} onClick={() => void importAndExtractPdf()} disabled={busy}>{busy ? "Lendo PDF..." : "Escolher PDF do computador"}</button>
    <label className="grid gap-1 text-sm text-ink">Ou reutilize um PDF já salvo<select className={selectClass} value={materialId} onChange={(event) => { setMaterialId(event.target.value); setDrafts([]); setExtractedText(""); setAnswerSheet(""); setMessage(null); setError(null); }} disabled={busy}><option value="">Selecione um PDF importado</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.originalName}</option>)}</select></label>
    {materialId && <button type="button" className={`${buttonSecondaryClass} justify-self-start`} onClick={() => void extractPdf(materialId, materials.find((item) => item.id === materialId)?.originalName ?? "")} disabled={busy}>{busy ? "Aguarde..." : "Extrair prévia do PDF salvo"}</button>}
    {extractedText && <section className="grid gap-2">
      <label className="grid gap-1 text-sm text-ink">Texto extraído (corrija separadores de linhas e questões aqui)
        <textarea className={textareaClass} rows={10} maxLength={500000} value={extractedText} onChange={(event) => setExtractedText(event.target.value)} />
      </label>
      <button type="button" className={`${buttonSecondaryClass} justify-self-start`} onClick={() => { setDrafts(splitPdfQuestions([extractedText])); setError(null); }}>
        Separar questões do texto revisado
      </button>
    </section>}
    {drafts.length > 0 && <>
      <section className="grid gap-2"><label className="grid gap-1 text-sm text-ink">Gabarito (uma linha por questão, ex.: 1-A ou 2-Certo)
        <textarea className={textareaClass} rows={4} value={answerSheet} onChange={(event) => setAnswerSheet(event.target.value)} placeholder="1-A\n2-B" />
      </label><button type="button" className={`${buttonSecondaryClass} justify-self-start`} onClick={applyAnswerSheet}>Associar gabarito à prévia</button></section>
      <label className="grid gap-1 text-sm text-ink">Origem (inclua versão do caderno)<input className={selectClass} maxLength={240} value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></label>
      <label className="grid gap-1 text-sm text-ink">Assunto<select className={selectClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Sem assunto</option>{plan?.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      {drafts.map((draft, index) => <div key={index} className="grid gap-2 rounded-xl border border-line p-3">
        <label className="flex gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={draft.included} onChange={(event) => update(index, { included: event.target.checked })} />Importar questão {draft.number}</label>
        <label className="grid gap-1 text-xs text-muted">Número<input className={selectClass} value={draft.number} onChange={(event) => update(index, { number: event.target.value })} maxLength={8} /></label>
        <label className="grid gap-1 text-xs text-muted">Enunciado e alternativas<textarea className={textareaClass} value={draft.statement} onChange={(event) => update(index, { statement: event.target.value })} rows={6} /></label>
        <label className="grid gap-1 text-xs text-muted">Gabarito (revise no documento oficial; vazio se desconhecido)<select className={selectClass} value={draft.answerKey} onChange={(event) => update(index, { answerKey: event.target.value })}><option value="">Desconhecido</option>{["A", "B", "C", "D", "E", "true", "false"].map((key) => <option key={key} value={key}>{key === "true" ? "Certo" : key === "false" ? "Errado" : key}</option>)}</select></label>
      </div>)}
      <button type="button" className={`${buttonPrimaryClass} justify-self-start`} onClick={() => void save()} disabled={busy || !drafts.some((draft) => draft.included)}>Conferi as questões · Salvar selecionadas</button>
    </>}
  </section>;
}
