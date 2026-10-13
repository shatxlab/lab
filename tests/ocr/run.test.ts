// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_PDF_PAGES, PDF_DPI, PDF_MAX_SIDE, joinPages, overall, pdfScale, runOcr } from "@/lib/ocr/run";
import { DEFAULT_PREPROCESS } from "@/lib/ocr/preprocess";
import type { Engine } from "@/lib/ocr/engine";

const plan = { core: "c", worker: "w", langPath: "l", files: [] };

/** Canvas operations that touch nothing, so a run is quick and deterministic in jsdom. */
const tools = {
  gray: () => ({ data: new Uint8Array(100).fill(255), width: 10, height: 10, scale: 1 }),
  rotate: (canvas: HTMLCanvasElement) => canvas,
  crop: (canvas: HTMLCanvasElement) => canvas,
  blob: async () => null,
};

/** A canvas context that remembers nothing, so drawing and pixel work run in jsdom. */
beforeEach(() => {
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
function fakeEngine(texts: string[], confidences: number[] = texts.map(() => 90), delay = 0): FakeEngine {
  const engine = {
    recognized: 0,
    terminated: 0,
    async recognize() {
      const i = engine.recognized++;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { text: texts[i] ?? "", confidence: confidences[i] ?? 0, words: [] };
    },
    async terminate() {
      engine.terminated++;
    },
  };
  return engine;
}

const fakePdf = (pages: number) => ({
  getPage: async (number: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve(), number }),
    cleanup() {},
  }),
  numPages: pages,
});

describe("overall progress", () => {
  it("spends the first tenth starting the engine and the rest on the pages, in order", () => {
    expect(overall("engine", 0, 0, 4)).toBe(0);
    expect(overall("language", 1, 0, 4)).toBeCloseTo(0.1, 9);
    expect(overall("render", 0, 0, 4)).toBeCloseTo(0.1, 9);
    expect(overall("recognizing", 1, 0, 4)).toBeCloseTo(0.1 + 0.9 / 4, 9);
    expect(overall("recognizing", 1, 3, 4)).toBeCloseTo(1, 9);
  });

  it("never goes backwards from one stage to the next, and stays within 0–1", () => {
    let last = -1;
    for (let page = 0; page < 3; page += 1) {
      for (const [stage, f] of [["render", 0], ["render", 1], ["recognizing", 0], ["recognizing", 0.5], ["recognizing", 1]] as const) {
        const value = overall(stage, f, page, 3);
        expect(value).toBeGreaterThanOrEqual(last);
        expect(value).toBeLessThanOrEqual(1);
        last = value;
      }
    }
    expect(overall("engine", 5, 0, 1)).toBeCloseTo(0.1, 9);
    expect(overall("engine", -1, 0, 1)).toBe(0);
  });
});

describe("joinPages and pdfScale", () => {
  it("returns one page's text as it is, ending in a newline", () => {
    expect(joinPages(["Hello\n\n"], [1], true)).toBe("Hello\n");
  });

  it("separates several pages with a marker line, or just a blank line", () => {
    expect(joinPages(["A\n", "\nB  "], [2, 5], true)).toBe("--- Page 2 ---\nA\n\n--- Page 5 ---\nB\n");
    expect(joinPages(["A", "B"], [1, 2], false)).toBe("A\n\nB\n");
  });

  it("draws pages at 200 dpi unless that would pass the size limit", () => {
    expect(pdfScale(612, 792)).toBeCloseTo(PDF_DPI / 72, 9);
    expect(pdfScale(612 * 10, 792 * 10)).toBeCloseTo(PDF_MAX_SIDE / (792 * 10), 9);
    expect(MAX_PDF_PAGES).toBe(50);
  });
});

describe("runOcr", () => {
  it("recognises an image and reports progress from start to finish", async () => {
    const engine = fakeEngine(["Hello world"], [93]);
    const seen: number[] = [];
    const result = await runOcr({
      source: { kind: "image", blob: new Blob(["x"]) },
      languages: ["eng"],
      plan,
      tools,
      preprocess: DEFAULT_PREPROCESS,
      markPages: true,
      onProgress: (p) => seen.push(p.fraction),
      createEngine: async (_plan, _langs, onStatus) => {
        onStatus("engine", 0.5);
        onStatus("language", 1);
        return engine;
      },
    });
    expect(result).toMatchObject({ text: "Hello world\n", confidence: 93, pages: 1, table: null });
    expect(seen[0]).toBeCloseTo(0.05, 9);
    expect(seen.at(-1)).toBeCloseTo(1, 9);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(engine.terminated).toBe(1);
  });

  it("goes through the chosen pages of a PDF in order, averaging confidence and marking pages", async () => {
    const engine = fakeEngine(["one", "three"], [90, 70]);
    const pages: number[] = [];
    const result = await runOcr({
      source: { kind: "pdf", pdf: fakePdf(5) as never, pages: [1, 3] },
      languages: ["eng", "rus"],
      plan,
      tools,
      preprocess: DEFAULT_PREPROCESS,
      markPages: true,
      onProgress: (p) => pages.push(p.page),
      createEngine: async () => engine,
    });
    expect(result.text).toBe("--- Page 1 ---\none\n\n--- Page 3 ---\nthree\n");
    expect(result.confidence).toBe(80);
    expect(result.pages).toBe(2);
    expect(new Set(pages)).toEqual(new Set([1, 3]));
    expect(engine.recognized).toBe(2);
  });

  it("stops the engine when it is cancelled mid-way", async () => {
    const controller = new AbortController();
    const engine = fakeEngine(["slow"], [90], 200);
    const job = runOcr({
      source: { kind: "image", blob: new Blob(["x"]) },
      languages: ["eng"],
      plan,
      tools,
      preprocess: DEFAULT_PREPROCESS,
      markPages: false,
      onProgress: () => {},
      signal: controller.signal,
      createEngine: async () => engine,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(engine.terminated).toBe(1);
  });

  it("does not even start the engine when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const start = vi.fn();
    await expect(
      runOcr({ source: { kind: "image", blob: new Blob(["x"]) }, languages: ["eng"], plan, tools, preprocess: DEFAULT_PREPROCESS, markPages: false, onProgress: () => {}, signal: controller.signal, createEngine: start as never }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(start).not.toHaveBeenCalled();
  });

  it("stops the engine when recognising fails, and passes the error on", async () => {
    const engine = fakeEngine([]);
    engine.recognize = async () => {
      throw new Error("bad image");
    };
    await expect(
      runOcr({ source: { kind: "image", blob: new Blob(["x"]) }, languages: ["eng"], plan, tools, preprocess: DEFAULT_PREPROCESS, markPages: false, onProgress: () => {}, createEngine: async () => engine }),
    ).rejects.toThrow("bad image");
    expect(engine.terminated).toBe(1);
  });
});
