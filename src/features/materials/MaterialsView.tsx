import { lazy, Suspense, useEffect, useState } from "react";
import {
  getDesktopErrorMessage,
  getMaterials,
  importMaterial,
  openMaterial,
  pickMaterialFile,
} from "../../shared/desktop/commands";
import type { MaterialSummary, StudyPlan } from "../../shared/desktop/contracts";
import {
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

  const handleOpen = async (material: MaterialSummary) => {
    setError(null);
    setMessage(null);

    if (material.mimeType === "application/pdf" || material.originalName.endsWith(".pdf")) {
      setReaderMaterial(material);
      return;
    }

    setPendingAction("opening");
    try {
      await openMaterial({ materialId: material.id });
      setMessage(`${material.originalName} foi aberto no leitor padrão.`);
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
              Biblioteca & Anotações
            </span>
            <span className="text-xs font-medium text-slate-300/85">
              {materials.length} arquivos salvos no espaço
            </span>
          </div>

          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
              Materiais de Estudo & Apostilas PDF
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/85 max-w-2xl text-pretty">
              Visualize seus PDFs com leitor integrado e faça anotações sincronizadas à sua sessão de estudo local.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsImportingModalOpen(true)}
              className={buttonPrimaryClass}
            >
              + Importar PDF
            </button>
          </div>
        </div>
      </section>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 font-medium">{message}</p>}

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
        <div className="rounded-2xl border border-blue-500/30 bg-card p-6 shadow-lg animate-fade-in max-w-xl">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h3 className="font-heading text-lg font-bold text-ink">Importar Material PDF</h3>
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
                  className={`${inputClass} flex-1`}
                  type="text"
                  placeholder="Selecione um PDF ou documento"
                  value={selectedPath}
                  readOnly
                />
                <button
                  type="button"
                  onClick={chooseFile}
                  disabled={isBusy}
                  className={`${buttonSecondaryClass} shrink-0 px-3 py-2 text-xs`}
                >
                  {pendingAction === "picking" ? "Abrindo..." : "Escolher Arquivo"}
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
                {pendingAction === "importing" ? "Importando..." : "Confirmar Importação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Grid - Library & Notes Panel */}
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,1fr)_minmax(0,1.2fr)]">
        {/* PDF Library List */}
        <section className="rounded-2xl border border-line bg-card p-5 lg:p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <Eyebrow>Sua Biblioteca</Eyebrow>
              <h3 className="font-heading text-lg font-bold text-ink">Arquivos & Apostilas</h3>
            </div>
            <span className="text-xs font-semibold text-muted">{materials.length} itens</span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted py-6">Carregando biblioteca local...</p>
          ) : materials.length === 0 ? (
            <div className="rounded-xl border border-line bg-paper p-6 text-center">
              <p className="text-sm text-muted">Nenhum arquivo importado ainda.</p>
              <button
                type="button"
                onClick={() => setIsImportingModalOpen(true)}
                className={`${buttonPrimaryClass} mt-4 text-xs`}
              >
                + Importar Primeiro PDF
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {materials.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4 transition-all hover:border-blue-500/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 font-bold text-xs">
                      PDF
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-xs text-ink">{item.originalName}</h4>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {item.subjects[0]?.name || "Geral"} · Pág. {item.currentPage}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    className={`${buttonPrimaryClass} text-xs px-3 py-1.5 shrink-0`}
                  >
                    ▶ Abrir
                  </button>
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
