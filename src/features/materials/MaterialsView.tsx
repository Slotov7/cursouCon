import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  getDesktopErrorMessage,
  deleteMaterial,
  getMaterials,
  importMaterial,
  openMaterial,
  pickMaterialFile,
  registerMaterialLink,
  setMaterialSubjects,
  setMaterialTags,
} from "../../shared/desktop/commands";
import type { MaterialSummary, NoteSummary, StudyPlan } from "../../shared/desktop/contracts";
import {
  buttonOutlineLightClass,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  Eyebrow,
  fieldClass,
  inputClass,
  selectClass,
} from "../../shared/ui/primitives";
import { NotesPanel } from "./NotesPanel";

const PdfReader = lazy(() => import("./PdfReader").then(({ PdfReader: Reader }) => ({ default: Reader })));

type MaterialsViewProps = {
  plan: StudyPlan | null;
  refreshKey: number;
};

export function MaterialsView({ plan, refreshKey }: MaterialsViewProps) {
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [materialKind, setMaterialKind] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string[]>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<
    | "idle"
    | "picking"
    | "importing"
    | "registering-link"
    | "opening"
    | "deleting"
    | "tagging"
    | "subjects"
  >("idle");
  const [readerMaterial, setReaderMaterial] = useState<MaterialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isImportingModalOpen, setIsImportingModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getMaterials()
      .then((loadedMaterials) => {
        if (!cancelled) {
          setMaterials(loadedMaterials);
          setSubjectDrafts({});
          setTagDrafts({});
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
  }, [refreshKey]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (subjectFilter && !m.subjects.some((s) => s.id === subjectFilter)) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = m.originalName.toLowerCase().includes(query);
        const matchUrl = m.sourceUrl?.toLowerCase().includes(query) ?? false;
        const matchSubject = m.subjects.some((s) => s.name.toLowerCase().includes(query));
        const matchTag = m.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchNote = notes.some(
          (note) =>
            note.materialId === m.id &&
            (note.title.toLowerCase().includes(query) ||
              note.contentMarkdown.toLowerCase().includes(query)),
        );
        if (!matchName && !matchUrl && !matchSubject && !matchTag && !matchNote) {
          return false;
        }
      }
      return true;
    });
  }, [materials, notes, subjectFilter, searchQuery]);

  const chooseFile = async () => {
    setError(null);
    setMessage(null);
    setPendingAction("picking");

    try {
      const path = await pickMaterialFile();
      if (path) {
        setSelectedPath(path);
      }
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleImport = async () => {
    if (!selectedPath) {
      setError("Escolha um arquivo antes de importar.");
      return;
    }

    setError(null);
    setMessage(null);
    setPendingAction("importing");

    try {
      const importedMaterial = await importMaterial({
        sourcePath: selectedPath,
        subjectId: subjectId || null,
      });
      setMaterials((currentMaterials) => [
        importedMaterial,
        ...currentMaterials.filter((material) => material.id !== importedMaterial.id),
      ]);
      setSelectedPath("");
      setIsImportingModalOpen(false);
      setMessage(`Material salvo em Materiais: ${importedMaterial.originalName}.`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleRegisterLink = async () => {
    if (!linkUrl.trim()) {
      setError("Informe um link antes de salvar.");
      return;
    }

    setError(null);
    setMessage(null);
    setPendingAction("registering-link");

    try {
      const registeredMaterial = await registerMaterialLink({
        url: linkUrl,
        title: linkTitle || null,
        subjectId: subjectId || null,
      });
      setMaterials((currentMaterials) => [
        registeredMaterial,
        ...currentMaterials.filter((material) => material.id !== registeredMaterial.id),
      ]);
      setLinkUrl("");
      setLinkTitle("");
      setSubjectId("");
      setIsImportingModalOpen(false);
      setMessage(`Link salvo em Materiais: ${registeredMaterial.originalName}.`);
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleOpenIntegrated = (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    if (!isPdfMaterial(material)) {
      void handleOpenExternal(material);
      return;
    }
    setReaderMaterial(material);
  };

  const handleOpenExternal = async (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    setPendingAction("opening");
    try {
      await openMaterial({ materialId: material.id });
      setMessage(
        material.sourceUrl
          ? "O link foi aberto no navegador padrão."
          : `${material.originalName} foi aberto no aplicativo padrão do sistema.`,
      );
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleDeleteMaterial = async (material: MaterialSummary) => {
    const confirmed = window.confirm(
      `Remover “${material.originalName}” da biblioteca?${
        material.sourceUrl ? "" : " A cópia deste arquivo será apagada do espaço."
      }\n\nNotas ligadas apenas a este material também serão removidas. Notas associadas a uma disciplina e registros do plano serão preservados, mas perderão o vínculo com ele.`,
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setPendingAction("deleting");
    try {
      const removedNotes = await deleteMaterial(material.id);
      setMaterials((currentMaterials) => currentMaterials.filter((item) => item.id !== material.id));
      setSubjectDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[material.id];
        return nextDrafts;
      });
      setTagDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[material.id];
        return nextDrafts;
      });
      setReaderMaterial((currentMaterial) => currentMaterial?.id === material.id ? null : currentMaterial);
      setMessage(removedNotes > 0
        ? `Material removido. ${removedNotes} ${removedNotes === 1 ? "anotação ligada somente a ele também foi removida" : "anotações ligadas somente a ele também foram removidas"}.`
        : "Material removido da biblioteca.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleMaterialUpdated = (updatedMaterial: MaterialSummary) => {
    setMaterials((currentMaterials) =>
      currentMaterials.map((material) =>
        material.id === updatedMaterial.id ? updatedMaterial : material,
      ),
    );
    setReaderMaterial((currentMaterial) =>
      currentMaterial?.id === updatedMaterial.id ? updatedMaterial : currentMaterial,
    );
  };

  const handleSaveSubjects = async (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    setPendingAction("subjects");

    try {
      const subjectIds = subjectDrafts[material.id] ?? material.subjects.map((subject) => subject.id);
      const updatedMaterial = await setMaterialSubjects({
        materialId: material.id,
        subjectIds,
      });
      handleMaterialUpdated(updatedMaterial);
      setSubjectDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[material.id];
        return nextDrafts;
      });
      setMessage("Assuntos do material atualizados.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleSaveTags = async (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    setPendingAction("tagging");

    try {
      const draft = tagDrafts[material.id] ?? material.tags.join(", ");
      const updatedMaterial = await setMaterialTags({
        materialId: material.id,
        tags: draft.split(","),
      });
      handleMaterialUpdated(updatedMaterial);
      setTagDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[material.id];
        return nextDrafts;
      });
      setMessage("Etiquetas do material atualizadas.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const isBusy = pendingAction !== "idle";

  return (
    <div className="grid gap-6">
      {/* 1. Hero Banner Header */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              Sua biblioteca
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              {materials.length} documentos salvos no espaço
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Materiais de estudo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              PDFs e links ficam salvos aqui. Abra um material para ler e fazer anotações.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsImportingModalOpen(true)}
              className={buttonPrimaryClass}
            >
              + Adicionar material
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {message && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 font-medium">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* PDF reader overlay when a supported material is active */}
      {readerMaterial && (
        <Suspense fallback={<p className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">Carregando leitor de PDF...</p>}>
          <PdfReader
            material={readerMaterial}
            onClose={() => setReaderMaterial(null)}
            onMaterialUpdated={handleMaterialUpdated}
          />
        </Suspense>
      )}

      {/* Import Modal */}
      {isImportingModalOpen && (
        <div className="glass-card rounded-2xl p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/10 animate-fade-in border border-blue-500/30 max-w-xl">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Biblioteca Local</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Adicionar à biblioteca</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsImportingModalOpen(false)}
              className="text-xs text-muted hover:text-ink font-semibold"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid gap-4">
            <label className={fieldClass} htmlFor="material-kind">
              Como deseja adicionar?
              <span className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de material">
                <button type="button" aria-pressed={materialKind === "file"} onClick={() => setMaterialKind("file")} disabled={isBusy}
                  className={`${materialKind === "file" ? buttonPrimaryClass : buttonSecondaryClass} justify-center`}>
                  Arquivo do computador
                </button>
                <button type="button" aria-pressed={materialKind === "link"} onClick={() => setMaterialKind("link")} disabled={isBusy}
                  className={`${materialKind === "link" ? buttonPrimaryClass : buttonSecondaryClass} justify-center`}>
                  Link de um site
                </button>
              </span>
            </label>

            {materialKind === "file" ? (
              <label className={fieldClass}>
                Arquivo no computador
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1 text-xs`}
                    type="text"
                    placeholder="Nenhum arquivo selecionado"
                    value={selectedPath}
                    readOnly
                  />
                  <button
                    type="button"
                    onClick={chooseFile}
                    disabled={isBusy}
                    className={`${buttonSecondaryClass} shrink-0 px-3 py-2 text-xs`}
                  >
                    {pendingAction === "picking" ? "Abrindo..." : "Selecionar..."}
                  </button>
                </div>
              </label>
            ) : (
              <>
                <label className={fieldClass} htmlFor="material-url">
                  Link HTTP ou HTTPS
                  <input
                    className={inputClass}
                    id="material-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://exemplo.gov.br/edital"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    disabled={isBusy}
                  />
                </label>
                <label className={fieldClass} htmlFor="material-link-title">
                  Título <span className="font-normal text-muted">(opcional)</span>
                  <input
                    className={inputClass}
                    id="material-link-title"
                    type="text"
                    maxLength={240}
                    placeholder="Ex.: Página oficial do edital"
                    value={linkTitle}
                    onChange={(event) => setLinkTitle(event.target.value)}
                    disabled={isBusy}
                  />
                </label>
                <p className="text-xs leading-relaxed text-muted">
                  O app salva apenas o endereço. O conteúdo continua no site e abre no navegador padrão.
                </p>
              </>
            )}

            {(plan?.subjects.length ?? 0) > 0 && (
              <details className="rounded-xl border border-line bg-paper px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-muted">Associar a uma disciplina (opcional)</summary>
                <label className={`${fieldClass} mt-3`}>
                  Disciplina
                  <select className={selectClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={isBusy}>
                    <option value="">Nenhuma</option>
                    {(plan?.subjects ?? []).map((subj) => <option key={subj.id} value={subj.id}>{subj.name}</option>)}
                  </select>
                  <span className="text-[11px] font-normal text-muted">O material continua na Biblioteca e também fica associado a esta disciplina.</span>
                </label>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsImportingModalOpen(false)}
                className={buttonQuietClass}
                disabled={isBusy}
              >
                Cancelar
              </button>
              {materialKind === "file" ? (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isBusy || !selectedPath}
                  className={buttonPrimaryClass}
                >
                  {pendingAction === "importing" ? "Copiando para o espaço..." : "Confirmar importação"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRegisterLink}
                  disabled={isBusy || !linkUrl.trim()}
                  className={buttonPrimaryClass}
                >
                  {pendingAction === "registering-link" ? "Salvando link..." : "Salvar link"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Grid - Library & Notes Panel */}
      <div className="grid gap-6">
        {/* Material library list */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Sua Biblioteca</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Arquivos & Links</h3>
            </div>
            <span className="font-mono text-xs font-bold text-muted bg-paper-deep px-2.5 py-1 rounded-lg">
              {filteredMaterials.length} de {materials.length}
            </span>
          </div>

          {/* Search controls only help after there is something to find. */}
          {materials.length > 0 && <div className="grid gap-2.5 mb-4">
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar por título, link, matéria ou etiqueta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className={selectClass}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">Todas as matérias</option>
              {(plan?.subjects ?? []).map((subj) => (
                <option key={subj.id} value={subj.id}>
                  {subj.name}
                </option>
              ))}
            </select>
          </div>}

          {isLoading ? (
            <div className="flex justify-center items-center py-12 text-sm text-muted">
              <div className="size-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mr-2" />
              Carregando materiais locais...
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-xs text-muted">
              <p className="font-bold text-ink">{materials.length === 0 ? "Sua biblioteca está vazia." : "Nenhum material encontrado."}</p>
              <p className="mt-1">
                {materials.length === 0
                  ? "Adicione um PDF ou link. Ele ficará salvo aqui para abrir e fazer anotações."
                  : "Tente outro termo ou limpe a busca e o filtro de disciplina."}
              </p>
              {materials.length > 0 && <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSubjectFilter("");
                }}
                className={`${buttonPrimaryClass} mt-4 text-xs`}
              >Limpar Filtros</button>}
            </div>
          ) : (
            <div className="grid max-h-[540px] gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-paper/80 p-4 transition-all duration-150 ease-out hover:border-blue-500/40 hover:bg-paper shadow-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs border font-mono ${item.sourceUrl ? "border-blue-500/20 bg-blue-500/10 text-blue-600" : "border-red-500/20 bg-red-500/10 text-red-600"}`}>
                      {getMaterialFormat(item)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-bold text-xs text-ink">{item.originalName}</h4>
                      {item.sourceUrl ? (
                        <span className="mt-1 block truncate text-[11px] text-muted" title={item.sourceUrl}>
                          {item.sourceUrl}
                        </span>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span className="rounded bg-paper-deep px-1.5 py-0.5 font-medium border border-line">
                          {item.subjects[0]?.name || "Geral"}
                        </span>
                        <span className="font-mono tabular-nums">
                          {item.sourceUrl ? "Link externo" : `Página ${item.currentPage} · ${formatBytes(item.byteSize)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-xl border border-line bg-card px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-muted">Organizar e outras ações</summary>
                  <div className="mt-3 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Disciplinas e assuntos
                    </span>
                    <div className="flex gap-2">
                      <select
                        className={`${inputClass} min-w-0 flex-1 text-xs`}
                        multiple
                        size={Math.min(4, Math.max(2, (plan?.subjects.length ?? 0) + item.subjects.length))}
                        value={subjectDrafts[item.id] ?? item.subjects.map((subject) => subject.id)}
                        onChange={(event) =>
                          setSubjectDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [item.id]: Array.from(
                              event.target.selectedOptions,
                              (option) => option.value,
                            ),
                          }))
                        }
                        disabled={isBusy}
                        aria-label={`Disciplinas e assuntos de ${item.originalName}`}
                      >
                        {[...
                          item.subjects.map((subject) => ({ id: subject.id, name: subject.name })),
                          ...(plan?.subjects ?? [])
                            .filter((subject) => !item.subjects.some((itemSubject) => itemSubject.id === subject.id))
                            .map((subject) => ({ id: subject.id, name: subject.name })),
                        ].map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleSaveSubjects(item)}
                        className={`${buttonSecondaryClass} shrink-0 self-start px-3 py-1 text-xs`}
                        disabled={isBusy}
                      >
                        Salvar
                      </button>
                    </div>
                    <span className="text-[10px] text-muted">Use Ctrl/Cmd para selecionar mais de um vínculo.</span>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Etiquetas
                    </span>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} min-w-0 flex-1 text-xs`}
                        type="text"
                        value={tagDrafts[item.id] ?? item.tags.join(", ")}
                        onChange={(event) =>
                          setTagDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Ex.: revisão, constitucional"
                        disabled={isBusy}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveTags(item)}
                        className={`${buttonSecondaryClass} shrink-0 px-3 py-1 text-xs`}
                        disabled={isBusy}
                      >
                        Salvar
                      </button>
                    </div>
                    <span className="text-[10px] text-muted">Separe as etiquetas por vírgulas.</span>
                  </label>

                  <div className="flex items-center justify-end gap-2 border-t border-line pt-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteMaterial(item)}
                      className={`${buttonQuietClass} mr-auto px-2.5 py-1 text-xs text-danger hover:text-danger`}
                      disabled={isBusy}
                    >
                      Remover material
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenExternal(item)}
                      className={`${buttonQuietClass} text-xs px-2.5 py-1`}
                      title="Abrir com o aplicativo padrão do sistema"
                    >
                      ↗ {item.sourceUrl ? "Abrir link" : isPdfMaterial(item) ? "Externo" : "Abrir arquivo"}
                    </button>
                  </div>
                  </div>
                  </details>
                  <button type="button" onClick={() => handleOpenIntegrated(item)}
                    className={`${buttonPrimaryClass} self-start px-3.5 py-1 text-xs`}>
                    {isPdfMaterial(item) ? "Ler PDF" : item.sourceUrl ? "Abrir link" : "Abrir arquivo"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notes & Summaries Panel */}
        <details className="rounded-2xl border border-line bg-card p-5 shadow-xs">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink">
            Anotações e resumos <span className="ml-1 text-xs font-normal text-muted">(opcional, ligados a um material ou disciplina)</span>
          </summary>
          <div className="mt-4">
          <NotesPanel
            plan={plan}
            materials={materials}
            refreshKey={refreshKey}
            onNotesChanged={setNotes}
          />
          </div>
        </details>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isPdfMaterial(material: MaterialSummary): boolean {
  if (material.sourceUrl) return false;
  return (
    material.mimeType?.toLowerCase() === "application/pdf" ||
    material.originalName.toLowerCase().endsWith(".pdf")
  );
}

function getMaterialFormat(material: MaterialSummary): string {
  if (material.sourceUrl) return "WEB";
  if (isPdfMaterial(material)) return "PDF";
  const extension = material.originalName.split(".").pop()?.trim().toUpperCase();
  return extension && extension.length <= 5 ? extension : "ARQ";
}
