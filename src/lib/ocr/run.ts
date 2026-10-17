/** Running OCR over an image or the pages of a PDF: preprocessing, progress and assembling the text. */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Plan } from "@/lib/ocr/assets";
import { canvasTools, type CanvasTools } from "@/lib/ocr/canvas";
import { createEngine, type Engine, type EngineStatus, type RecognizeOptions } from "@/lib/ocr/engine";
import { buildTable, estimateSkew, findColumnCuts, shiftWords, straightenAngle, type Word } from "@/lib/ocr/layout";
import { prepareCanvas, type PreprocessOptions } from "@/lib/ocr/preprocess";

/**
 * How the page is divided before it is read:
 * - `auto`: the engine decides;
 * - `columns`: cut at the gutters between columns and read each in turn;
 * - `block`: one block of text, as is (single lines, labels);
 * - `table`: rebuild a table from the positions of the words.
 */
export type Layout = "auto" | "columns" | "block" | "table";
export const LAYOUTS: readonly Layout[] = ["auto", "columns", "block", "table"];

export type Source = { kind: "image"; blob: Blob } | { kind: "pdf"; pdf: Pick<PDFDocumentProxy, "getPage">; pages: number[] };

export interface OcrProgress {
  /** 0–1 over the whole job. */
  fraction: number;
  stage: EngineStatus | "render";
  /** The page being worked on, 1-based, and how many there are (1 for an image). */
  page: number;
  pages: number;
}

/** What was read from one page, with what the reader saw: the page as straightened, and every word's place. */
export interface PageResult {
  /** 1-based page number in the file. */
  number: number;
  text: string;
  confidence: number;
  words: Word[];
  width: number;
  height: number;
  /** Degrees the page was turned to straighten it (0 if it was not). */
  straightened: number;
  /** How many columns it was read as. */
  columns: number;
  /** The page as read, to show doubtful words on; null where it cannot be encoded. */
  image: Blob | null;
}

export interface OcrResult {
  text: string;
  /** Mean confidence over the pages, 0–100. */
  confidence: number;
  pages: number;
  details: PageResult[];
  /** In table layout, the rows and cells that were rebuilt; otherwise null. */
  table: string[][] | null;
}

/** Pages are drawn at about this resolution before recognising; more is slower and no better. */
export const PDF_DPI = 200;
export const PDF_MAX_SIDE = 3500;
/** More pages than this in one go would take long enough to want splitting up. */
export const MAX_PDF_PAGES = 50;

/** The share of the job spent starting the engine; the pages share the rest. */
const ENGINE_SHARE = 0.1;

/** Overall progress: the engine's start, then each page's drawing (20%) and recognising (80%). */
export function overall(stage: OcrProgress["stage"], stageFraction: number, pageIndex: number, pages: number): number {
  const pageShare = (1 - ENGINE_SHARE) / pages;
  const startup = stage === "engine" || stage === "language" || stage === "start";
  if (startup) return ENGINE_SHARE * Math.max(0, Math.min(1, stageFraction));
  const within = stage === "render" ? 0.2 * stageFraction : 0.2 + 0.8 * stageFraction;
  return Math.min(1, ENGINE_SHARE + pageShare * (pageIndex + within));
}

/** Pages' texts as one document, with a marker line between pages when there are several. */
export function joinPages(texts: readonly string[], numbers: readonly number[], mark: boolean): string {
  const cleaned = texts.map((text) => text.replace(/\s+$/g, "").replace(/^\n+/, ""));
  if (cleaned.length === 1 || !mark) return `${cleaned.join("\n\n")}\n`;
  return `${cleaned.map((text, i) => `--- Page ${numbers[i]} ---\n${text}`).join("\n\n")}\n`;
}

/** The pdf.js scale that draws a page at PDF_DPI without any side passing PDF_MAX_SIDE. */
export function pdfScale(width: number, height: number): number {
  const wanted = PDF_DPI / 72;
  return Math.min(wanted, PDF_MAX_SIDE / Math.max(width, height, 1));
}

export interface RunOptions {
  source: Source;
  languages: readonly string[];
  plan: Plan;
  preprocess: PreprocessOptions;
  /** Turn a tilted page upright before reading it. */
  straighten?: boolean;
  layout?: Layout;
  markPages: boolean;
  onProgress: (progress: OcrProgress) => void;
  signal?: AbortSignal;
  /**
   * An engine that is already running, and stays the caller's: it is not
   * started or stopped here. Starting one takes a while, so a batch shares it.
   */
  engine?: Engine;
  /** Keep each page's picture in the result (to box doubtful words on). Costs an encode per page; default true. */
  keepImages?: boolean;
  /** For tests. */
  createEngine?: typeof createEngine;
  tools?: CanvasTools;
}

const abortError = () => new DOMException("Aborted", "AbortError");

/** Decode an image file; SVG goes through an <img>, since createImageBitmap cannot read it everywhere. */
async function decodeImage(blob: Blob): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  if (blob.type !== "image/svg+xml") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // An SVG with no size of its own decodes to 0x0: give it a workable one.
    const width = image.naturalWidth || 1000;
    const height = image.naturalHeight || 1000;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfPageCanvas(pdf: Pick<PDFDocumentProxy, "getPage">, number: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pdfScale(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  page.cleanup?.();
  return canvas;
}

const MODES: Record<Layout, RecognizeOptions> = {
  auto: { psm: "3" },
  columns: { psm: "4" },
  block: { psm: "6" },
  table: { psm: "6", preserveSpaces: true },
};

/** Stack the tables of several pages, padding short rows so the result is a rectangle. */
function stackTables(tables: string[][][]): string[][] {
  const rows = tables.flat();
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
}

export async function runOcr(options: RunOptions): Promise<OcrResult> {
  const { source, languages, plan, preprocess, markPages, onProgress, signal } = options;
  const layout = options.layout ?? "auto";
  const tools = options.tools ?? canvasTools;
  const numbers = source.kind === "pdf" ? source.pages : [1];
  const pages = numbers.length;
  const start = options.createEngine ?? createEngine;
  let current = { page: 1, index: 0 };
  const report = (stage: OcrProgress["stage"], fraction: number) =>
    onProgress({ fraction: overall(stage, fraction, current.index, pages), stage, page: current.page, pages });

  if (signal?.aborted) throw abortError();
  const shared = options.engine ?? null;
  let engine: Engine | null = shared;
  const cancelled = new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(abortError()), { once: true }));
  const guard = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, cancelled]);

  try {
    engine ??= await guard(start(plan, languages, (status, fraction) => report(status, fraction)));
    const details: PageResult[] = [];
    for (let index = 0; index < pages; index += 1) {
      current = { page: numbers[index]!, index };
      report("render", 0);
      let canvas: HTMLCanvasElement;
      if (source.kind === "image") {
        const bitmap = await guard(decodeImage(source.blob));
        canvas = prepareCanvas(bitmap, preprocess);
        bitmap.close?.();
      } else {
        const drawn = await guard(pdfPageCanvas(source.pdf, numbers[index]!));
        // Pages are already drawn at a good size: only clean them up.
        canvas = prepareCanvas(drawn, { ...preprocess, enlarge: false });
        drawn.width = drawn.height = 0;
      }

      // Straighten a tilted page, so lines are level for the engine.
      let straightened = 0;
      if (options.straighten) {
        const angle = straightenAngle(estimateSkew(tools.gray(canvas)));
        if (angle !== 0) {
          const turned = tools.rotate(canvas, -angle);
          canvas.width = canvas.height = 0;
          canvas = turned;
          straightened = angle;
        }
      }

      // Columns are read one after the other, left to right.
      let strips: { canvas: HTMLCanvasElement; x: number }[] = [{ canvas, x: 0 }];
      if (layout === "columns") {
        const gray = tools.gray(canvas);
        const cuts = findColumnCuts(gray).map((cut) => Math.round(cut / gray.scale));
        if (cuts.length > 0) {
          const edges = [0, ...cuts, canvas.width];
          strips = edges.slice(0, -1).map((from, i) => ({ canvas: tools.crop(canvas, from, edges[i + 1]!), x: from }));
        }
      }
      report("render", 1);

      const texts: string[] = [];
      const words: Word[] = [];
      let weighted = 0;
      for (const strip of strips) {
        const result = await guard(engine.recognize(strip.canvas, MODES[layout]));
        texts.push(result.text.replace(/\s+$/g, ""));
        words.push(...(strip.x === 0 ? result.words : shiftWords(result.words, strip.x, 0)));
        weighted += result.confidence;
        if (strip.canvas !== canvas) strip.canvas.width = strip.canvas.height = 0;
      }
      const image = options.keepImages === false ? null : await tools.blob(canvas);
      details.push({
        number: numbers[index]!,
        text: texts.filter(Boolean).join("\n\n"),
        confidence: weighted / strips.length,
        words,
        width: canvas.width,
        height: canvas.height,
        straightened,
        columns: strips.length,
        image,
      });
      canvas.width = canvas.height = 0;
      report("recognizing", 1);
    }

    const table = layout === "table" ? stackTables(details.map((page) => buildTable(page.words))) : null;
    // In table layout the text is the table, one row per line, cells separated by tabs.
    const text = table ? `${table.map((row) => row.join("\t")).join("\n")}\n` : joinPages(details.map((page) => page.text), numbers, markPages);
    return { text, confidence: details.reduce((sum, page) => sum + page.confidence, 0) / Math.max(1, details.length), pages, details, table };
  } finally {
    // Stopping the worker is what cancels a recognition in progress. A shared
    // engine belongs to the caller, who stops it when the whole job is over.
    if (!shared) await engine?.terminate().catch(() => {});
  }
}

/* ------------------------------------------------------------------- batch */

/** One picture of a batch; its file is only opened when its turn comes. */
export interface BatchSource {
  id: number;
  blob(): Promise<Blob>;
}

export type BatchOutcome = { ok: true; result: OcrResult } | { ok: false; error: unknown };

export interface BatchProgress {
  /** 0–1 over the whole batch. */
  fraction: number;
  /** Files finished so far, and how many there are. */
  done: number;
  total: number;
  stage: OcrProgress["stage"];
  /** The file being read, or null while the engine starts. */
  id: number | null;
}

export interface BatchOptions {
  sources: readonly BatchSource[];
  languages: readonly string[];
  plan: Plan;
  preprocess: PreprocessOptions;
  straighten?: boolean;
  layout?: Layout;
  onStart?: (id: number) => void;
  /** Called once per file, as soon as it is read (or fails). */
  onResult: (id: number, outcome: BatchOutcome) => void;
  onProgress: (progress: BatchProgress) => void;
  signal?: AbortSignal;
  /** For tests. */
  createEngine?: typeof createEngine;
  tools?: CanvasTools;
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

/**
 * Read many pictures with one engine. Starting the engine costs seconds, so it
 * is started once; a file that cannot be read is reported and the rest go on.
 * Only stopping (the signal) ends the batch early, with an AbortError.
 */
export async function runOcrBatch(options: BatchOptions): Promise<void> {
  const { sources, signal } = options;
  const total = sources.length;
  const start = options.createEngine ?? createEngine;
  if (signal?.aborted) throw abortError();
  const cancelled = new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(abortError()), { once: true }));
  const guard = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, cancelled]);

  let engine: Engine | null = null;
  let done = 0;
  try {
    engine = await guard(
      start(options.plan, options.languages, (status, fraction) =>
        options.onProgress({ fraction: ENGINE_SHARE * Math.max(0, Math.min(1, fraction)), done, total, stage: status, id: null }),
      ),
    );
    for (const source of sources) {
      if (signal?.aborted) throw abortError();
      options.onStart?.(source.id);
      try {
        const blob = await guard(source.blob());
        const result = await runOcr({
          source: { kind: "image", blob },
          languages: options.languages,
          plan: options.plan,
          preprocess: options.preprocess,
          straighten: options.straighten,
          layout: options.layout,
          markPages: false,
          // Boxing doubtful words needs each page's picture; a batch has no such view.
          keepImages: false,
          engine,
          signal,
          tools: options.tools,
          onProgress: (progress) => {
            const inner = Math.max(0, Math.min(1, (progress.fraction - ENGINE_SHARE) / (1 - ENGINE_SHARE)));
            options.onProgress({
              fraction: ENGINE_SHARE + (1 - ENGINE_SHARE) * ((done + inner) / total),
              done,
              total,
              stage: progress.stage,
              id: source.id,
            });
          },
        });
        options.onResult(source.id, { ok: true, result });
      } catch (error) {
        if (isAbort(error)) throw error;
        options.onResult(source.id, { ok: false, error });
      }
      done += 1;
    }
    options.onProgress({ fraction: 1, done, total, stage: "recognizing", id: null });
  } finally {
    await engine?.terminate().catch(() => {});
  }
}
