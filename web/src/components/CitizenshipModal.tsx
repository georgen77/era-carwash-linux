import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Loader2, AlertCircle } from "lucide-react";

const DOSAR = "12789/RD/2025";
// Proxy via allorigins to bypass CORS. We try to get the 2025 PDF from the Romanian site.
const PDF_PAGE_URL = "https://cetatenie.just.ro/stadiu-dosar/?hl=ru-RU";
// We'll attempt to fetch a known direct PDF URL pattern. 
// If it fails we show a link.
const ARTICLE_11_PDF_PROXY = `https://api.allorigins.win/raw?url=${encodeURIComponent("https://cetatenie.just.ro/wp-content/uploads/2025/art11.pdf")}`;

interface FoundPage {
  pageNum: number;
  matchIndex: number;
}

export function CitizenshipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "rendering" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [foundPage, setFoundPage] = useState<FoundPage | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  // Store pdf doc ref
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("loading");
    setFoundPage(null);
    setCurrentPage(1);
    loadPdf();
  }, [open]);

  async function loadPdf() {
    try {
      // Dynamically import pdfjs
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      // Try fetching the PDF via allorigins proxy to bypass CORS
      const proxyUrls = [
        ARTICLE_11_PDF_PROXY,
        `https://api.allorigins.win/raw?url=${encodeURIComponent("https://cetatenie.just.ro/wp-content/uploads/2025/articolul-11-2025.pdf")}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent("https://cetatenie.just.ro/wp-content/uploads/articolul-11/2025.pdf")}`,
      ];

      let pdfData: ArrayBuffer | null = null;
      for (const url of proxyUrls) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const ct = res.headers.get("content-type") || "";
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 1000) { // real PDF
              pdfData = buf;
              break;
            }
          }
        } catch {}
      }

      if (!pdfData) {
        setStatus("error");
        setErrorMsg("Не удалось загрузить PDF напрямую из-за ограничений сайта.");
        return;
      }

      setStatus("rendering");
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Search for dosar in all pages
      let found: FoundPage | null = null;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((it: any) => it.str).join(" ");
        const idx = fullText.indexOf(DOSAR);
        if (idx !== -1) {
          found = { pageNum: p, matchIndex: idx };
          break;
        }
      }
      setFoundPage(found);
      const pageToRender = found ? found.pageNum : 1;
      setCurrentPage(pageToRender);
      await renderPage(pdf, pageToRender, found);
      setStatus("done");
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Ошибка загрузки PDF");
    }
  }

  async function renderPage(pdf: any, pageNum: number, found: FoundPage | null) {
    if (!canvasRef.current || !containerRef.current) return;
    const page = await pdf.getPage(pageNum);
    const containerWidth = containerRef.current.clientWidth - 16;
    const viewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = canvasRef.current;
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    // Highlight dosar text if found on this page
    if (found && found.pageNum === pageNum) {
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items;
      // Find items that contain the dosar number
      for (const item of items) {
        if (item.str && item.str.includes("12789")) {
          const tx = item.transform;
          // tx is [scaleX, skewX, skewY, scaleY, translateX, translateY]
          const x = tx[4] * scale;
          const y = scaledViewport.height - tx[5] * scale;
          const w = item.width * scale;
          const h = item.height * scale || 14;
          ctx.fillStyle = "rgba(255, 235, 59, 0.5)";
          ctx.fillRect(x - 2, y - h - 2, w + 60, h + 4);
        }
      }
    }
  }

  async function goToPage(pageNum: number) {
    if (!pdfDocRef.current) return;
    setCurrentPage(pageNum);
    await renderPage(pdfDocRef.current, pageNum, foundPage);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex flex-col w-full h-full max-w-2xl mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground">🇷🇴 Дело {DOSAR}</h2>
            <p className="text-xs text-muted-foreground">Articolul 11 · cetatenie.just.ro</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={PDF_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1 rounded hover:bg-primary/10 transition"
            >
              <ExternalLink className="h-3 w-3" />
              Открыть сайт
            </a>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Status banner */}
        {foundPage && status === "done" && (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 shrink-0">
            <span className="text-lg">🎯</span>
            <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">
              Дело <strong>{DOSAR}</strong> найдено на стр. {foundPage.pageNum} из {totalPages} — выделено жёлтым
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-2" ref={containerRef}>
          {(status === "loading" || status === "rendering") && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {status === "loading" ? "Загрузка PDF с сайта Румынии..." : "Рендеринг документа..."}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 px-4">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-center text-muted-foreground">{errorMsg}</p>
              <p className="text-xs text-center text-muted-foreground">
                Сайт румынского гражданства ограничивает прямую загрузку PDF. Откройте страницу вручную, найдите Articolul 11 → 2025 и скачайте документ.
              </p>
              <a
                href={PDF_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть cetatenie.just.ro
              </a>
              {/* Iframe fallback */}
              <p className="text-xs text-muted-foreground mt-2">или просмотрите прямо здесь:</p>
              <iframe
                src={`https://cetatenie.just.ro/stadiu-dosar/?hl=ru-RU`}
                className="w-full h-64 rounded-lg border border-border"
                title="Romanian citizenship portal"
              />
            </div>
          )}

          {status === "done" && (
            <div className="flex flex-col items-center gap-2">
              <canvas ref={canvasRef} className="w-full rounded-lg shadow-md border border-border" />
              {/* Page navigation */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2 py-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                    className="px-3 py-1 text-xs rounded-md border border-border disabled:opacity-40 hover:bg-muted transition"
                  >← Пред</button>
                  <span className="text-xs text-muted-foreground">
                    Стр. {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                    className="px-3 py-1 text-xs rounded-md border border-border disabled:opacity-40 hover:bg-muted transition"
                  >След →</button>
                  {foundPage && currentPage !== foundPage.pageNum && (
                    <button
                      onClick={() => goToPage(foundPage.pageNum)}
                      className="px-3 py-1 text-xs rounded-md bg-yellow-400/20 border border-yellow-400/40 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-400/30 transition"
                    >🎯 К делу</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Canvas ref for when rendering happens before done */}
          {status === "rendering" && <canvas ref={canvasRef} className="hidden" />}
        </div>
      </div>
    </div>
  );
}
