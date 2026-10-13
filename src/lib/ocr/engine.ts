/**
 * The OCR engine: tesseract.js running in a web worker, with every file (the worker
 * script, the WebAssembly engine, the language data) loaded from this site, never
 * from a CDN. The library itself is imported only when recognition starts.
 */

import type { Plan } from "@/lib/ocr/assets";

export interface Recognition {
  text: string;
  /** Mean word confidence, 0–100. */
  confidence: number;
}

export type EngineStatus = "engine" | "language" | "start" | "recognizing";

export interface Engine {
  recognize(image: HTMLCanvasElement | Blob): Promise<Recognition>;
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
  return {
    async recognize(image) {
      const result = await worker.recognize(image);
      return { text: result.data.text, confidence: result.data.confidence };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}
