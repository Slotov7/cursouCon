import { useEffect, useState } from "react";
import { getDesktopErrorMessage, getNotes, saveNote } from "../../shared/desktop/commands";
import type { MaterialSummary, NoteSummary, StudyPlan } from "../../shared/desktop/contracts";
import {
  buttonPrimaryClass,
  buttonQuietClass,
  Eyebrow,
  fieldClass,
  inputClass,
  selectClass,
  textareaClass,
} from "../../shared/ui/primitives";

type NotesPanelProps = {
  plan: StudyPlan | null;
  materials: MaterialSummary[];
  refreshKey: number;
  onNotesChanged?: (notes: NoteSummary[]) => void;
  contextMaterialId?: string | null;
  contextSubjectId?: string | null;
};

const feedbackClass = "rounded-[10px] border border-danger-line bg-danger-soft px-3.5 py-3 text-sm leading-relaxed text-danger";

export function NotesPanel({ plan, materials, refreshKey, onNotesChanged, contextMaterialId, contextSubjectId }: NotesPanelProps) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [materialId, setMaterialId] = useState(contextMaterialId ?? "");
  const [subjectId, setSubjectId] = useState(contextSubjectId ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getNotes()
      .then((loadedNotes) => {
        if (!cancelled) {
          setNotes(loadedNotes);
          onNotesChanged?.(loadedNotes);
          setError(null);
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
  }, [onNotesChanged, refreshKey]);

  const visibleNotes = contextMaterialId || contextSubjectId
    ? notes.filter((note) =>
        (contextMaterialId && note.materialId === contextMaterialId) ||
        (contextSubjectId && note.subjectId === contextSubjectId),
      )
    : notes;

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const hasUnsavedChanges = selectedNote
    ? title !== selectedNote.title || contentMarkdown !== selectedNote.contentMarkdown ||
      materialId !== (selectedNote.materialId ?? "") || subjectId !== (selectedNote.subjectId ?? "")
    : Boolean(title.trim() || contentMarkdown.trim() ||
      materialId !== (contextMaterialId ?? "") || subjectId !== (contextSubjectId ?? ""));

  const confirmDiscardChanges = () =>
    !hasUnsavedChanges || window.confirm("Descartar as alterações desta nota que ainda não foram salvas?");

  const startNewNote = () => {
    if (!confirmDiscardChanges()) return;
    setSelectedNoteId(null);
    setTitle("");
    setContentMarkdown("");
    setMaterialId(contextMaterialId ?? "");
    setSubjectId(contextSubjectId ?? "");
    setError(null);
    setMessage(null);
  };

  const selectNote = (note: NoteSummary) => {
    if (note.id === selectedNoteId || !confirmDiscardChanges()) return;
    setSelectedNoteId(note.id);
    setTitle(note.title);
    setContentMarkdown(note.contentMarkdown);
    setMaterialId(note.materialId ?? "");
    setSubjectId(note.subjectId ?? "");
    setError(null);
    setMessage(null);
  };

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const savedNote = await saveNote({
        id: selectedNoteId,
        title,
        contentMarkdown,
        materialId: materialId || null,
        subjectId: subjectId || null,
      });
      const updatedNotes = [savedNote, ...notes.filter((note) => note.id !== savedNote.id)];
      setNotes(updatedNotes);
      onNotesChanged?.(updatedNotes);
      setSelectedNoteId(savedNote.id);
      setTitle(savedNote.title);
      setContentMarkdown(savedNote.contentMarkdown);
      setMaterialId(savedNote.materialId ?? "");
      setSubjectId(savedNote.subjectId ?? "");
      setMessage("Nota salva neste material.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-line bg-card p-5 lg:p-7" aria-labelledby="notes-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Anotações</Eyebrow>
          <h3 id="notes-title" className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-forest-ink">Anotações de estudo</h3>
        </div>
        <button className={`${buttonQuietClass} min-h-9 px-3 text-xs`} type="button" onClick={startNewNote} disabled={isSaving}>
          Nova nota
        </button>
      </div>

      <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted">
        Guarde pontos importantes, dúvidas e lembretes. Se quiser, associe a nota a um material ou assunto para encontrá-la depois.
      </p>

      {error ? <p className={`${feedbackClass} mt-5`} role="alert">{error}</p> : null}
      {message ? <p className="mt-5 rounded-[10px] border border-success-line bg-success-soft px-3.5 py-3 text-sm leading-relaxed text-forest-ink" role="status">{message}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(190px,.42fr)_minmax(0,1fr)]">
        <aside className="border-b border-line pb-5 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6" aria-label="Notas salvas">
          {isLoading ? <p className="text-sm text-muted">Lendo notas...</p> : null}
          {!isLoading && visibleNotes.length === 0 ? <p className="text-sm leading-relaxed text-muted">Nenhuma nota neste contexto ainda.</p> : null}
          <div className="grid gap-1">
            {visibleNotes.map((note) => (
              <button
                className={`rounded-[10px] px-3 py-3 text-left transition ${selectedNoteId === note.id ? "bg-paper-deep text-forest-ink" : "text-muted hover:bg-paper hover:text-ink"}`}
                key={note.id}
                type="button"
                onClick={() => selectNote(note)}
              >
                <strong className="block truncate text-sm">{note.title}</strong>
            <span className="mt-1 block truncate text-xs">{note.subjectName ?? note.materialName ?? "Sem material ou assunto associado"}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={fieldClass} htmlFor="note-title">
              Título
              <input className={inputClass} id="note-title" type="text" value={title} maxLength={160} placeholder="Ex.: Pontos para revisar" onChange={(event) => setTitle(event.target.value)} disabled={isSaving} />
            </label>
            <label className={fieldClass} htmlFor="note-material">
              Material <span className="font-normal text-muted">opcional</span>
              <select className={selectClass} id="note-material" value={materialId} onChange={(event) => setMaterialId(event.target.value)} disabled={isSaving}>
                <option value="">Sem material</option>
                {materials.map((material) => <option key={material.id} value={material.id}>{material.originalName}</option>)}
              </select>
            </label>
          </div>

          <label className={fieldClass} htmlFor="note-subject">
            Assunto <span className="font-normal text-muted">opcional</span>
            <select className={selectClass} id="note-subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={isSaving}>
              <option value="">Sem assunto</option>
              {(plan?.subjects ?? []).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>

          <label className={fieldClass} htmlFor="note-content">
            Anotação
            <textarea className={`${textareaClass} min-h-[190px]`} id="note-content" value={contentMarkdown} placeholder="Escreva aqui o que você quer lembrar ou revisar depois." onChange={(event) => setContentMarkdown(event.target.value)} disabled={isSaving} rows={8} />
          </label>

          <button className={`${buttonPrimaryClass} justify-self-start`} type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar nota"}
          </button>
        </div>
      </div>
    </section>
  );
}
