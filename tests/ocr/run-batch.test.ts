// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runOcrBatch, type BatchOutcome, type BatchProgress } from "@/lib/ocr/run";
import { DEFAULT_PREPROCESS } from "@/lib/ocr/preprocess";
import type { Engine } from "@/lib/ocr/engine";

const plan = { core: "c", worker: "w", langPath: "l", files: [] };

const blobCalls = vi.hoisted(() => ({ count: 0 }));
const tools = {
  gray: () => ({ data: new Uint8Array(100).fill(255), width: 10, height: 10, scale: 1 }),
  rotate: (canvas: HTMLCanvasElement) => canvas,
  crop: (canvas: HTMLCanvasElement) => canvas,
  blob: async () => {
    blobCalls.count += 1;
    return new Blob(["page"]);
  },
};

beforeEach(() => {
  blobCalls.count = 0;
  const context = { fillStyle: "", fillRect() {}, drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h }), putImageData() {}, imageSmoothingQuality: "" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 400, close() {} }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface FakeEngine extends Engine {
  recognized: number;
  terminated: number;
}
function fakeEngine(texts: string[], delay = 0): FakeEngine {
  const engine = {
    recognized: 0,
    terminated: 0,
    async recognize() {
      const i = engine.recognized++;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { text: texts[i] ?? "", confidence: 90, words: [] };
    },
    async terminate() {
      engine.terminated++;
    },
  };
  return engine;
}

const sources = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, blob: async () => new Blob(["x"], { type: "image/png" }) }));
const base = { languages: ["eng"], plan, preprocess: DEFAULT_PREPROCESS, tools };

describe("runOcrBatch", () => {
  it("starts one engine for the whole batch and stops it at the end", async () => {
    const engine = fakeEngine(["one", "two", "three"]);
    const createEngine = vi.fn(async () => engine);
    const results = new Map<number, BatchOutcome>();
    await runOcrBatch({ ...base, sources: sources(3), createEngine, onResult: (id, outcome) => void results.set(id, outcome), onProgress: () => {} });
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(engine.recognized).toBe(3);
    expect(engine.terminated).toBe(1);
    expect([...results.values()].map((r) => (r.ok ? r.result.text : "failed"))).toEqual(["one\n", "two\n", "three\n"]);
  });

  it("reports each file as it starts and finishes, in order", async () => {
    const events: string[] = [];
    await runOcrBatch({
      ...base,
      sources: sources(2),
      createEngine: async () => fakeEngine(["a", "b"]),
      onStart: (id) => events.push(`start ${id}`),
      onResult: (id) => events.push(`result ${id}`),
      onProgress: () => {},
    });
    expect(events).toEqual(["start 1", "result 1", "start 2", "result 2"]);
  });

  it("does not encode a page picture for each file", async () => {
    await runOcrBatch({ ...base, sources: sources(2), createEngine: async () => fakeEngine(["a", "b"]), onResult: () => {}, onProgress: () => {} });
    expect(blobCalls.count).toBe(0);
  });

  it("carries on past a file that cannot be read", async () => {
    const list = sources(3);
    list[1] = { id: 2, blob: async () => Promise.reject(new Error("unreadable")) };
    const results = new Map<number, BatchOutcome>();
    await runOcrBatch({ ...base, sources: list, createEngine: async () => fakeEngine(["a", "c"]), onResult: (id, outcome) => void results.set(id, outcome), onProgress: () => {} });
    expect(results.get(1)?.ok).toBe(true);
    expect(results.get(2)?.ok).toBe(false);
    expect(results.get(3)?.ok).toBe(true);
  });

  it("reports progress from 0 to 1 and never backwards", async () => {
    const seen: BatchProgress[] = [];
    await runOcrBatch({ ...base, sources: sources(3), createEngine: async () => fakeEngine(["a", "b", "c"]), onResult: () => {}, onProgress: (p) => seen.push(p) });
    const fractions = seen.map((p) => p.fraction);
    for (let i = 1; i < fractions.length; i += 1) expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!);
    expect(fractions.at(-1)).toBe(1);
    expect(seen.at(-1)).toMatchObject({ done: 3, total: 3 });
  });

  it("stops the engine and rejects with an AbortError when stopped part-way", async () => {
    const engine = fakeEngine(["a", "b", "c"], 20);
    const controller = new AbortController();
    const results: number[] = [];
    const promise = runOcrBatch({
      ...base,
      sources: sources(3),
      createEngine: async () => engine,
      signal: controller.signal,
      onResult: (id) => {
        results.push(id);
        if (id === 1) controller.abort();
      },
      onProgress: () => {},
    });
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(results).toEqual([1]);
    expect(engine.terminated).toBe(1);
  });

  it("does not even start the engine if already stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    const createEngine = vi.fn(async () => fakeEngine([]));
    await expect(runOcrBatch({ ...base, sources: sources(2), createEngine, signal: controller.signal, onResult: () => {}, onProgress: () => {} })).rejects.toMatchObject({ name: "AbortError" });
    expect(createEngine).not.toHaveBeenCalled();
  });
});
