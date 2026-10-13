/** Running OCR over an image or the pages of a PDF: preprocessing, progress and assembling the text. */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Plan } from "@/lib/ocr/assets";
import { createEngine, type Engine, type EngineStatus, type Recognition } from "@/lib/ocr/engine";
import { prepareCanvas, type PreprocessOptions } from "@/lib/ocr/preprocess";

export type Source = { kind: "image"; blob: Blob } | { kind: "pdf"; pdf: Pick<PDFDocumentProxy, "getPage">; pages: number[] };

export interface OcrProgress {
  /** 0–1 over the whole job. */
  fraction: number;
  stage: EngineStatus | "render";
  /** The page being worked on, 1-based, and how many there are (1 for an image). */
  page: number;
  pages: number;
}

export interface OcrResult {
  text: string;
  /** Mean confidence over the pages, 0–100. */
  confidence: number;
  pages: number;
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
  markPages: boolean;
  onProgress: (progress: OcrProgress) => void;
  signal?: AbortSignal;
  /** For tests. */
  createEngine?: typeof createEngine;
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

export async function runOcr(options: RunOptions): Promise<OcrResult> {
  const { source, languages, plan, preprocess, markPages, onProgress, signal } = options;
  const numbers = source.kind === "pdf" ? source.pages : [1];
  const pages = numbers.length;
  const start = options.createEngine ?? createEngine;
  let current = { page: 1, index: 0 };
  const report = (stage: OcrProgress["stage"], fraction: number) =>
    onProgress({ fraction: overall(stage, fraction, current.index, pages), stage, page: current.page, pages });

  if (signal?.aborted) throw abortError();
  let engine: Engine | null = null;
  const cancelled = new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(abortError()), { once: true }));
  const guard = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, cancelled]);

  try {
    engine = await guard(start(plan, languages, (status, fraction) => report(status, fraction)));
    const texts: string[] = [];
    const confidences: number[] = [];
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
      report("render", 1);
      const result: Recognition = await guard(engine.recognize(canvas));
      canvas.width = canvas.height = 0;
      texts.push(result.text);
      confidences.push(result.confidence);
      report("recognizing", 1);
    }
    return { text: joinPages(texts, numbers, markPages), confidence: confidences.reduce((a, b) => a + b, 0) / Math.max(1, confidences.length), pages };
  } finally {
    // Stopping the worker is what cancels a recognition in progress.
    await engine?.terminate().catch(() => {});
  }
}
