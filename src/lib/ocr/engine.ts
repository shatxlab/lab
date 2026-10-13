/**
 * The OCR engine: tesseract.js running in a web worker, with every file (the worker
 * script, the WebAssembly engine, the language data) loaded from this site, never
 * from a CDN. The library itself is imported only when recognition starts.
 */

import type { Plan } from "@/lib/ocr/assets";
import type { Word } from "@/lib/ocr/layout";

export interface Recognition {
  text: string;
  /** Mean word confidence, 0–100. */
  confidence: number;
  /** Every word with its position and confidence, in the image's pixels. */
  words: Word[];
}

/** How the engine should divide the page: automatically, as one column, or as one block of text (best for tables). */
export interface RecognizeOptions {
  psm?: "3" | "4" | "6" | "11";
  /** Keep the spaces between words as they are on the page. */
  preserveSpaces?: boolean;
}

interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface RawPage {
  text: string;
  confidence: number;
  blocks?: { paragraphs: { lines: { words: RawWord[] }[] }[] }[] | null;
}

/** The words of a page in reading order, each tagged with the line it was read on. */
export function wordsOf(page: RawPage): Word[] {
  const words: Word[] = [];
  let line = 0;
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const row of paragraph.lines) {
        for (const word of row.words) words.push({ text: word.text, confidence: word.confidence, bbox: { ...word.bbox }, line });
        line += 1;
      }
    }
  }
  return words;
}

export type EngineStatus = "engine" | "language" | "start" | "recognizing";

export interface Engine {
  recognize(image: HTMLCanvasElement | Blob, options?: RecognizeOptions): Promise<Recognition>;
  terminate(): Promise<void>;
}

/** Map tesseract.js's progress messages onto the few stages the UI cares about. */
export function statusOf(message: string): EngineStatus {
  if (message.includes("core")) return "engine";
  if (message.includes("language") || message.includes("traineddata")) return "language";
  if (message.includes("recogniz")) return "recognizing";
  return "start";
}

export type OnProgress = (status: EngineStatus, fraction: number) => void;

export async function createEngine(plan: Plan, languages: readonly string[], onProgress: OnProgress): Promise<Engine> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(languages.join("+"), 1, {
    workerPath: plan.worker,
    corePath: plan.core,
    langPath: plan.langPath,
    // The worker loads straight from its URL, not from a blob: it needs no inherited policy and no blob: workers.
    workerBlobURL: false,
    // Language data is cached by the app (Cache Storage, with a delete button), not hidden in IndexedDB.
    cacheMethod: "none",
    gzip: true,
    logger: (message: { status: string; progress: number }) => onProgress(statusOf(message.status), message.progress),
  });
  // The mode last given to the worker, so it is only changed when it differs.
  let mode = "";
  return {
    async recognize(image, options = {}) {
      const psm = options.psm ?? "3";
      const preserve = options.preserveSpaces ? "1" : "0";
      if (mode !== `${psm}/${preserve}`) {
        await worker.setParameters({ tessedit_pageseg_mode: psm as never, preserve_interword_spaces: preserve });
        mode = `${psm}/${preserve}`;
      }
      const result = await worker.recognize(image, {}, { text: true, blocks: true });
      const page = result.data as unknown as RawPage;
      return { text: page.text, confidence: page.confidence, words: wordsOf(page) };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}
