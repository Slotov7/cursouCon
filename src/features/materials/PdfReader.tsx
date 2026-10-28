import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  getDesktopErrorMessage,
  getMaterialSource,
  updateMaterialPage,
} from "../../shared/desktop/commands";
import type { MaterialSummary } from "../../shared/desktop/contracts";
import {
  buttonOutlineLightClass,
  buttonSecondaryClass,
  Eyebrow,
} from "../../shared/ui/primitives";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfReaderProps = {
  material: MaterialSummary;
  onClose: () => void;
  onMaterialUpdated: (material: MaterialSummary) => void;
};

type PageSaveState = "idle" | "saving" | "saved";

export function PdfReader({ material, onClose, onMaterialUpdated }: PdfReaderProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(material.currentPage);
  const [pageInput, setPageInput] = useState(material.currentPage.toString());
  const [scale, setScale] = useState(1.15);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [pageSaveState, setPageSaveState] = useState<PageSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setPdf(null);
    setPageNumber(material.currentPage);
    setPageInput(material.currentPage.toString());
    setPageCount(0);
    setIsLoading(true);
    setError(null);

    getMaterialSource({ materialId: material.id })
      .then((sourceUrl) => {
        if (cancelled) return null;
        loadingTask = getDocument({ url: sourceUrl });
        return loadingTask.promise;
      })
      .then((loadedDocument) => {
        if (!loadedDocument) return;
        if (cancelled) {
          return;
        }

        const firstPage = clampPage(material.currentPage, loadedDocument.numPages);
        setPdf(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setPageNumber(firstPage);
        setPageInput(firstPage.toString());
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setError(`Este arquivo não pôde ser lido como PDF. ${getDesktopErrorMessage(operationError)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [material.id]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setIsRendering(true);

    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new Error("O canvas de leitura não está disponível.");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvasContext: context,
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        return renderTask.promise;
      })
      .catch((operationError: unknown) => {
        if (!cancelled) {
          setError(`Não foi possível renderizar esta página. ${getDesktopErrorMessage(operationError)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRendering(false);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, scale]);

  const changePage = (requestedPage: number) => {
    if (!pageCount) return;
    const nextPage = clampPage(requestedPage, pageCount);
    setPageNumber(nextPage);
    setPageInput(nextPage.toString());
    if (nextPage === material.currentPage) return;

    setPageSaveState("saving");
    updateMaterialPage({ materialId: material.id, page: nextPage })
      .then((updatedMaterial) => {
        onMaterialUpdated(updatedMaterial);
        setPageSaveState("saved");
      })
      .catch((operationError: unknown) => {
        setPageSaveState("idle");
        setError(`A página foi exibida, mas não foi salva. ${getDesktopErrorMessage(operationError)}`);
      });
  };

  const searchPdf = async () => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!pdf || !query) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const matches: number[] = [];
      for (let page = 1; page <= pdf.numPages; page += 1) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .toLocaleLowerCase();
        if (text.includes(query)) matches.push(page);
      }
      setSearchResults(matches);
      if (matches[0]) changePage(matches[0]);
    } catch (operationError: unknown) {
      setError(`Não foi possível pesquisar este PDF. ${getDesktopErrorMessage(operationError)}`);
    } finally {
      setIsSearching(false);
    }
  };

  const extractCurrentPage = async () => {
    if (!pdf) return;
    setIsExtracting(true);
    setError(null);
    try {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      setExtractedText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    } catch (operationError: unknown) {
      setError(`Não foi possível extrair o texto da página. ${getDesktopErrorMessage(operationError)}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const commitPageInput = () => {
    const requestedPage = Number(pageInput);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      setPageInput(pageNumber.toString());
      return;
    }
    changePage(requestedPage);
  };

  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-card" aria-labelledby="pdf-reader-title">
      <header className="flex flex-wrap items-start justify-between gap-4 bg-ink px-5 py-5 text-contrast lg:px-7">
        <div className="min-w-0">
          <Eyebrow light>Leitura local</Eyebrow>
          <h3 id="pdf-reader-title" className="mt-2 truncate text-2xl font-extrabold tracking-[-.05em]">
            {material.originalName}
          </h3>
          <p className="mt-2 text-sm text-contrast/65">
            PDF renderizado no app. A última página fica salva no espaço.
          </p>
        </div>
        <button className={buttonOutlineLightClass} type="button" onClick={onClose}>
          Fechar leitura
        </button>
      </header>

      {error ? (
        <p className="border-b border-danger-line bg-danger-soft px-5 py-3 text-sm leading-relaxed text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? <p className="px-5 py-8 text-sm text-muted">Abrindo o PDF local...</p> : null}

      {pdf ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-3" role="toolbar" aria-label="Controles do leitor PDF">
            <button
              className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
              type="button"
              onClick={() => changePage(pageNumber - 1)}
              disabled={pageNumber <= 1 || isLoading}
            >
              Anterior
            </button>
            <label className="flex min-h-9 items-center gap-2 rounded-[9px] border border-line bg-card px-3 text-xs font-bold text-muted">
              Página
              <input
                className="w-12 bg-transparent text-center text-ink outline-none"
                type="number"
                min="1"
                max={pageCount}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={commitPageInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitPageInput();
                  }
                }}
                aria-label="Número da página"
              />
              <span>de {pageCount}</span>
            </label>
            <button
              className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
              type="button"
              onClick={() => changePage(pageNumber + 1)}
              disabled={pageNumber >= pageCount || isLoading}
            >
              Próxima
            </button>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
            <button
              className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
              type="button"
              onClick={() => setScale((currentScale) => Math.max(0.7, Number((currentScale - 0.1).toFixed(2))))}
              aria-label="Diminuir zoom"
            >
              −
            </button>
            <span className="min-w-14 text-center text-xs font-bold text-muted">{Math.round(scale * 100)}%</span>
            <button
              className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`}
              type="button"
              onClick={() => setScale((currentScale) => Math.min(2.5, Number((currentScale + 0.1).toFixed(2))))}
              aria-label="Aumentar zoom"
            >
              +
            </button>
            <div className="flex w-full items-center gap-2 border-t border-line pt-3 sm:ml-2 sm:w-auto sm:border-t-0 sm:pt-0">
              <label className="sr-only" htmlFor="pdf-search">Pesquisar no PDF</label>
              <input
                id="pdf-search"
                className={`${buttonSecondaryClass} min-h-9 w-44 px-3 text-xs font-normal`}
                placeholder="Pesquisar no PDF"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void searchPdf(); }}
              />
              <button className={`${buttonSecondaryClass} min-h-9 px-3 text-xs`} type="button" onClick={() => void searchPdf()} disabled={isSearching}>
                {isSearching ? "Buscando..." : "Buscar"}
              </button>
              {searchQuery && !isSearching ? <span className="text-[11px] text-muted">{searchResults.length} página(s)</span> : null}
            </div>
            <span className="ml-auto text-xs text-muted" role="status" aria-live="polite">
              {isRendering ? "Renderizando..." : pageSaveState === "saving" ? "Salvando posição..." : pageSaveState === "saved" ? "Posição salva" : "Leitura local"}
            </span>
          </div>

          <div className="max-h-[72vh] overflow-auto bg-paper-deep p-4 sm:p-8">
            <div className="mx-auto w-fit rounded-[3px] bg-white shadow-[0_16px_45px_rgba(21,38,29,.18)]">
              <canvas ref={canvasRef} aria-label={`Página ${pageNumber} de ${pageCount}`} />
            </div>
          </div>
          <section className="grid gap-3 border-t border-line bg-card p-4" aria-labelledby="pdf-import-preview-title">
            <div>
              <Eyebrow>Importação assistida</Eyebrow>
              <h4 id="pdf-import-preview-title" className="mt-1 font-heading text-base font-bold text-ink">Prévia de texto para revisar</h4>
              <p className="mt-1 text-xs text-muted">Extraia uma página, revise a separação das questões e copie o texto para o cadastro manual. O app não cria questões automaticamente sem sua conferência.</p>
            </div>
            <button type="button" className={`${buttonSecondaryClass} justify-self-start text-xs`} onClick={() => void extractCurrentPage()} disabled={isExtracting}>
              {isExtracting ? "Extraindo..." : "Extrair texto desta página"}
            </button>
            {extractedText ? <textarea className="min-h-32 w-full rounded-xl border border-line bg-paper p-3 text-sm text-ink" value={extractedText} onChange={(event) => setExtractedText(event.target.value)} aria-label="Texto extraído para revisão" /> : null}
            {extractedText ? <button type="button" className={`${buttonSecondaryClass} justify-self-start text-xs`} onClick={() => void navigator.clipboard?.writeText(extractedText)}>Copiar texto revisado</button> : null}
          </section>
        </>
      ) : null}

      {!isLoading && !pdf && !error ? (
        <p className="px-5 py-8 text-sm text-muted">O PDF não devolveu páginas para leitura.</p>
      ) : null}
    </section>
  );
}

function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
}
