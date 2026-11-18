import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { Button } from "@/components/viewer/ui/button";
import type { AppLang } from "@/lib/apps/lang";
import { stringsFor, t } from "@/lib/viewer/i18n";
import { loadPdfJs, openPdf, PdfPasswordError } from "@/lib/viewer/pdf";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
/** Pages further than this from the viewport release their canvas. */
const RENDER_MARGIN = "900px 0px";

type PdfViewProps = {
  lang: AppLang;
  bytes: Uint8Array;
  /** Called once with the opened document, so the host can export its text. */
  onLoaded?: (doc: PDFDocumentProxy) => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "password"; reason: "needed" | "incorrect" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: PDFDocumentProxy; pageWidth: number; pageHeight: number };

/** Continuous-scroll PDF viewer: lazy canvas pages with a selectable text layer. */
export function PdfView({ lang, bytes, onLoaded }: PdfViewProps) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [password, setPassword] = React.useState<string | undefined>(undefined);
  /** null means "fit to width". */
  const [zoom, setZoom] = React.useState<number | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const onLoadedRef = React.useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  React.useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | undefined;
    setState({ status: "loading" });
    (async () => {
      try {
        const doc = await openPdf(bytes, password);
        if (cancelled) {
          void doc.loadingTask.destroy();
          return;
        }
        opened = doc;
        const first = await doc.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setState({ status: "ready", doc, pageWidth: viewport.width, pageHeight: viewport.height });
        setCurrentPage(1);
        onLoadedRef.current?.(doc);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PdfPasswordError) setState({ status: "password", reason: error.reason });
        else setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      if (opened) void opened.loadingTask.destroy();
    };
  }, [bytes, password]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setContainerWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [state.status]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-(--muted-fg)" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        {t(lang, "readingFile")}
      </div>
    );
  }

  if (state.status === "password") {
    return <PasswordForm lang={lang} reason={state.reason} onSubmit={setPassword} />;
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-(--warning)" role="alert">
        {state.message}
      </div>
    );
  }

  const { doc, pageWidth, pageHeight } = state;
  const fitScale = containerWidth > 0 ? Math.max(0.3, (containerWidth - 32) / pageWidth) : 1;
  const scale = zoom ?? Math.min(fitScale, 2.5);
  const pageNumbers = Array.from({ length: doc.numPages }, (_, index) => index + 1);

  const goTo = (page: number) => {
    const target = Math.min(Math.max(page, 1), doc.numPages);
    scrollRef.current?.querySelector(`[data-page="${target}"]`)?.scrollIntoView?.({ block: "start" });
    setCurrentPage(target);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-print-flow="">
      <div
        role="toolbar"
        aria-label="PDF"
        data-no-print=""
        className="flex flex-wrap items-center gap-2 border-b border-(--border) bg-(--bg) px-4 py-1.5"
      >
        <Button variant="ghost" size="icon" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} aria-label={t(lang, "pdfPrevPage")}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= doc.numPages} aria-label={t(lang, "pdfNextPage")}>
          <ChevronDown />
        </Button>
        <span className="text-sm tabular-nums" role="status" aria-live="polite">
          {t(lang, "pdfPageOf", { page: currentPage, total: doc.numPages })}
        </span>
        <span className="mx-1 h-5 w-px bg-(--border)" aria-hidden="true" />
        <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(MIN_ZOOM, scale / ZOOM_STEP))} aria-label={t(lang, "pdfZoomOut")}>
          <ZoomOut />
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(MAX_ZOOM, scale * ZOOM_STEP))} aria-label={t(lang, "pdfZoomIn")}>
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom(null)} aria-label={t(lang, "pdfFitWidth")} title={t(lang, "pdfFitWidth")} aria-pressed={zoom === null}>
          <Maximize2 />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="pdf-scroller min-h-0 flex-1 overflow-auto"
        data-print-flow=""
        tabIndex={0}
        aria-label="PDF"
        onScroll={(event) => {
          const container = event.currentTarget;
          const middle = container.getBoundingClientRect().top + container.clientHeight * 0.35;
          let found = 1;
          for (const node of container.querySelectorAll<HTMLElement>("[data-page]")) {
            if (node.getBoundingClientRect().top <= middle) found = Number(node.dataset.page);
            else break;
          }
          setCurrentPage(found);
        }}
      >
        <div className="pdf-pages">
          {pageNumbers.map((number) => (
            <PdfPage key={number} doc={doc} number={number} scale={scale} placeholder={{ width: pageWidth * scale, height: pageHeight * scale }} lang={lang} root={scrollRef} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PasswordForm({ lang, reason, onSubmit }: { lang: AppLang; reason: "needed" | "incorrect"; onSubmit: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  const strings = stringsFor(lang);
  return (
    <form
      className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 px-4 text-center"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <p className="font-medium">{strings.pdfPassword}</p>
      {reason === "incorrect" && (
        <p role="alert" className="text-sm text-(--warning)">
          {strings.pdfPasswordWrong}
        </p>
      )}
      <label className="flex w-full flex-col gap-1 text-left text-sm">
        {strings.pdfPasswordLabel}
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="rounded-md border border-(--border) bg-(--bg) px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={value === ""}>
        {strings.pdfUnlock}
      </Button>
    </form>
  );
}

type PdfPageProps = {
  doc: PDFDocumentProxy;
  number: number;
  scale: number;
  placeholder: { width: number; height: number };
  lang: AppLang;
  root: React.RefObject<HTMLDivElement | null>;
};

/** One page. Renders only while near the viewport and frees its canvas after. */
function PdfPage({ doc, number, scale, placeholder, lang, root }: PdfPageProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [size, setSize] = React.useState(placeholder);

  React.useEffect(() => {
    setSize({ width: placeholder.width, height: placeholder.height });
  }, [placeholder.width, placeholder.height]);

  React.useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      root: root.current,
      rootMargin: RENDER_MARGIN,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  // Printing needs every page rendered; make them all visible for the print job.
  React.useEffect(() => {
    const before = () => setVisible(true);
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const textDiv = textRef.current;
    if (!visible || !canvas || !textDiv) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | undefined;
    let textLayer: { cancel(): void } | undefined;

    (async () => {
      try {
        const page = await doc.getPage(number);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setSize({ width: viewport.width, height: viewport.height });

        const context = canvas.getContext("2d");
        if (!context) return;
        renderTask = page.render({
          canvasContext: context,
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;

        textDiv.replaceChildren();
        textDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        const pdfjs = await loadPdfJs();
        textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        });
        await (textLayer as InstanceType<typeof pdfjs.TextLayer>).render();
      } catch (error) {
        // Cancelled renders reject by design; anything else leaves a blank page.
        if ((error as { name?: string })?.name !== "RenderingCancelledException") {
          console.error(`Rendering PDF page ${number} failed`, error);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      // Release the bitmap so long documents don't hold every page in memory.
      canvas.width = 0;
      canvas.height = 0;
      textDiv.replaceChildren();
    };
  }, [visible, doc, number, scale]);

  return (
    <div
      ref={wrapperRef}
      data-page={number}
      role="group"
      aria-label={t(lang, "pdfPageLabel", { page: number })}
      className="pdf-page"
      style={{ width: size.width, height: size.height }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={textRef} className="pdf-text-layer" />
    </div>
  );
}
