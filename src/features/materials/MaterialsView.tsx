import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  getDesktopErrorMessage,
  getMaterials,
  importMaterial,
  openMaterial,
  pickMaterialFile,
} from "../../shared/desktop/commands";
import type { MaterialSummary, StudyPlan } from "../../shared/desktop/contracts";
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
  const [selectedPath, setSelectedPath] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"idle" | "picking" | "importing" | "opening">("idle");
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
        const matchSubject = m.subjects.some((s) => s.name.toLowerCase().includes(query));
        if (!matchName && !matchSubject) {
          return false;
        }
      }
      return true;
    });
  }, [materials, subjectFilter, searchQuery]);

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
      setMessage("Material importado para o espaço local.");
    } catch (operationError: unknown) {
      setError(getDesktopErrorMessage(operationError));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleOpenIntegrated = (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    setReaderMaterial(material);
  };

  const handleOpenExternal = async (material: MaterialSummary) => {
    setError(null);
    setMessage(null);
    setPendingAction("opening");
    try {
      await openMaterial({ materialId: material.id });
      setMessage(`${material.originalName} foi aberto no visualizador do sistema.`);
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
    setReaderMaterial(updatedMaterial);
  };

  const isBusy = pendingAction !== "idle";

  return (
    <div className="grid gap-6">
      {/* 1. Hero Banner Header */}
      <section className="glass-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl lg:p-8 border border-white/12">
        <div className="relative z-10 grid gap-4 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 backdrop-blur-xs">
              Biblioteca & Caderno
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              {materials.length} documentos salvos no espaço
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Materiais de Estudo & Apostilas PDF
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Leitura focada com marcador de página persistente, abertura no leitor embutido e bloco de notas integrado ao ciclo de estudos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsImportingModalOpen(true)}
              className={buttonPrimaryClass}
            >
              + Importar Novo PDF
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

      {/* PDF Reader Overlay Modal if active */}
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
              <h3 className="font-heading text-lg font-bold text-ink">Importar Material PDF</h3>
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
            <label className={fieldClass}>
              Arquivo no Computador
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

            <label className={fieldClass}>
              Vincular a uma Disciplina <span className="text-muted font-normal">(opcional)</span>
              <select
                className={selectClass}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={isBusy}
              >
                <option value="">Sem disciplina vinculada</option>
                {(plan?.subjects ?? []).map((subj) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsImportingModalOpen(false)}
                className={buttonQuietClass}
                disabled={isBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isBusy || !selectedPath}
                className={buttonPrimaryClass}
              >
                {pendingAction === "importing" ? "Copiando para o espaço..." : "Confirmar Importação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Grid - Library & Notes Panel */}
      <div className="grid gap-6 xl:grid-cols-[minmax(330px,1fr)_minmax(0,1.2fr)]">
        {/* PDF Library List */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Sua Biblioteca</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Arquivos & Apostilas</h3>
            </div>
            <span className="font-mono text-xs font-bold text-muted bg-paper-deep px-2.5 py-1 rounded-lg">
              {filteredMaterials.length} de {materials.length}
            </span>
          </div>

          {/* Search & Subject Filter in Library */}
          <div className="grid gap-2.5 mb-4">
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar apostila por título ou matéria..."
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
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-12 text-sm text-muted">
              <div className="size-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mr-2" />
              Carregando materiais locais...
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper p-8 text-center text-xs text-muted">
              <p className="font-bold text-ink">Nenhum material encontrado.</p>
              <p className="mt-1">
                {materials.length === 0
                  ? "Importe seu primeiro PDF de teoria ou resumo para começar a leitura."
                  : "Nenhum PDF corresponde aos filtros de busca atuais."}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (materials.length === 0) {
                    setIsImportingModalOpen(true);
                  } else {
                    setSearchQuery("");
                    setSubjectFilter("");
                  }
                }}
                className={`${buttonPrimaryClass} mt-4 text-xs`}
              >
                {materials.length === 0 ? "+ Importar Primeiro PDF" : "Limpar Filtros"}
              </button>
            </div>
          ) : (
            <div className="grid gap-3 max-h-[540px] overflow-y-auto pr-1">
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-paper/80 p-4 transition-all duration-150 ease-out hover:border-blue-500/40 hover:bg-paper shadow-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 font-extrabold text-xs border border-red-500/20 font-mono">
                      PDF
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-bold text-xs text-ink">{item.originalName}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span className="rounded bg-paper-deep px-1.5 py-0.5 font-medium border border-line">
                          {item.subjects[0]?.name || "Geral"}
                        </span>
                        <span className="font-mono tabular-nums">
                          Página {item.currentPage} · {formatBytes(item.byteSize)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                    <button
                      type="button"
                      onClick={() => handleOpenExternal(item)}
                      className={`${buttonQuietClass} text-xs px-2.5 py-1`}
                      title="Abrir com o visualizador padrão do Windows/Linux"
                    >
                      ↗ Externo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenIntegrated(item)}
                      className={`${buttonPrimaryClass} text-xs px-3.5 py-1`}
                    >
                      ▶ Ler no App
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notes & Summaries Panel */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs">
          <NotesPanel plan={plan} materials={materials} refreshKey={refreshKey} />
        </section>
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
