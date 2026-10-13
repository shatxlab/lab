// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasTools } from "@/lib/ocr/canvas";
import type { Engine, RecognizeOptions } from "@/lib/ocr/engine";
import type { GrayImage, Word } from "@/lib/ocr/layout";
import { DEFAULT_PREPROCESS } from "@/lib/ocr/preprocess";
import { runOcr, type Layout } from "@/lib/ocr/run";

const plan = { core: "c", worker: "w", langPath: "l", files: [] };

beforeEach(() => {
  const context = { fillStyle: "", fillRect() {}, drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h }), putImageData() {}, imageSmoothingQuality: "" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 400, close() {} }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Rows of ink on a white page, optionally sloping or split into columns. */
function inked(options: { width?: number; height?: number; tilt?: number; columns?: [number, number][] } = {}): GrayImage {
  const { width = 400, height = 300, tilt = 0, columns = [[30, 370]] } = options;
  const data = new Uint8Array(width * height).fill(255);
  const slope = Math.tan((tilt * Math.PI) / 180);
  for (let line = 0; line < 8; line += 1) {
    for (const [from, to] of columns) {
      let x = from;
      while (x < to) {
        const w = 22 + ((x * 7 + line * 13) % 18);
        for (let dx = 0; dx < Math.min(w, to - x); dx += 1) for (let dy = 0; dy < 9; dy += 1) {
          const y = Math.round(30 + line * 30 + dy + (x + dx) * slope);
          if (y >= 0 && y < height) data[y * width + x + dx] = 20;
        }
        x += w + 8 + ((line * 5) % 6);
      }
    }
  }
  return { data, width, height };
}

function setup(page: GrayImage) {
  const rotate = vi.fn((canvas: HTMLCanvasElement, degrees: number) => (degrees === 0 ? canvas : canvas));
  const crop = vi.fn((canvas: HTMLCanvasElement, x0: number, x1: number) => {
    const strip = document.createElement("canvas");
    strip.width = x1 - x0;
    strip.height = 10;
    return strip;
  });
  const tools: CanvasTools = { gray: () => ({ ...page, scale: 1 }), rotate, crop, blob: async () => null };
  const calls: { options: RecognizeOptions | undefined; width: number }[] = [];
  return { tools, rotate, crop, calls };
}

const word = (text: string, x0: number, y0: number, x1: number, y1: number, line: number, confidence = 90): Word => ({ text, confidence, bbox: { x0, y0, x1, y1 }, line });

async function run(layout: Layout | undefined, page: GrayImage, perCall: { text: string; words: Word[] }[], extra: { straighten?: boolean } = {}) {
  const env = setup(page);
  let n = 0;
  const engine: Engine = {
    async recognize(image, options) {
      env.calls.push({ options, width: (image as HTMLCanvasElement).width });
      const out = perCall[Math.min(n, perCall.length - 1)]!;
      n += 1;
      return { text: out.text, confidence: 80, words: out.words };
    },
    async terminate() {},
  };
  const result = await runOcr({
    source: { kind: "image", blob: new Blob(["x"]) },
    languages: ["eng"],
    plan,
    tools: env.tools,
    preprocess: DEFAULT_PREPROCESS,
    layout,
    straighten: extra.straighten,
    markPages: false,
    onProgress: () => {},
    createEngine: async () => engine,
  });
  return { result, ...env };
}

describe("choosing how the engine reads", () => {
  it.each([
    ["auto", { psm: "3" }],
    [undefined, { psm: "3" }],
    ["columns", { psm: "4" }],
    ["block", { psm: "6" }],
    ["table", { psm: "6", preserveSpaces: true }],
  ] as const)("%s layout asks the engine for %j", async (layout, expected) => {
    const { calls } = await run(layout, inked(), [{ text: "x", words: [] }]);
    expect(calls[0]!.options).toEqual(expected);
  });
});

describe("straightening", () => {
  it("turns a tilted page against its tilt before reading it", async () => {
    const { rotate, result } = await run("auto", inked({ tilt: 4 }), [{ text: "text", words: [] }], { straighten: true });
    expect(rotate).toHaveBeenCalledTimes(1);
    const degrees = rotate.mock.calls[0]![1] as number;
    expect(degrees).toBeGreaterThan(-4.8);
    expect(degrees).toBeLessThan(-3.2);
    expect(result.details[0]!.straightened).toBeGreaterThan(3.2);
  });

  it("leaves a straight page alone, and does nothing when switched off", async () => {
    const straight = await run("auto", inked(), [{ text: "t", words: [] }], { straighten: true });
    expect(straight.rotate).not.toHaveBeenCalled();
    expect(straight.result.details[0]!.straightened).toBe(0);
    const off = await run("auto", inked({ tilt: 4 }), [{ text: "t", words: [] }], { straighten: false });
    expect(off.rotate).not.toHaveBeenCalled();
    const unset = await run("auto", inked({ tilt: 4 }), [{ text: "t", words: [] }]);
    expect(unset.rotate).not.toHaveBeenCalled();
  });
});

describe("columns", () => {
  const two = inked({ columns: [[20, 180], [220, 380]] });

  it("reads each column in turn, left to right, and moves the words back to the page", async () => {
    const { result, crop, calls } = await run(
      "columns",
      two,
      [
        { text: "left column\n", words: [word("left", 10, 10, 40, 20, 0)] },
        { text: "right column\n", words: [word("right", 10, 10, 50, 20, 0)] },
      ],
    );
    expect(crop).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    expect(result.text).toBe("left column\n\nright column\n");
    expect(result.details[0]!.columns).toBe(2);
    const cut = (crop.mock.calls[0]![2] as number);
    expect(cut).toBeGreaterThan(180);
    expect(cut).toBeLessThan(220);
    // The right column's words are shifted by where its strip began.
    expect(result.details[0]!.words[1]!.bbox.x0).toBe(10 + cut);
    expect(result.details[0]!.words[0]!.bbox.x0).toBe(10);
  });

  it("reads one column as one page", async () => {
    const { result, crop, calls } = await run("columns", inked(), [{ text: "all\n", words: [] }]);
    expect(crop).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(result.details[0]!.columns).toBe(1);
  });

  it("does not split in other layouts", async () => {
    const { crop } = await run("auto", two, [{ text: "x", words: [] }]);
    expect(crop).not.toHaveBeenCalled();
  });
});

describe("table layout", () => {
  const cells = [
    word("Item", 20, 20, 60, 30, 0), word("Qty", 170, 20, 200, 30, 0), word("Price", 320, 20, 360, 30, 0),
    word("Pen", 20, 45, 50, 55, 1), word("2", 170, 45, 180, 55, 1), word("3.50", 320, 45, 360, 55, 1),
  ];

  it("rebuilds the table from the word positions, as rows of cells", async () => {
    const { result } = await run("table", inked(), [{ text: "Item Qty Price\nPen 2 3.50\n", words: cells }]);
    expect(result.table).toEqual([["Item", "Qty", "Price"], ["Pen", "2", "3.50"]]);
    expect(result.text).toBe("Item\tQty\tPrice\nPen\t2\t3.50\n");
    expect(result.details[0]!.words).toHaveLength(6);
  });

  it("is not a table in any other layout", async () => {
    const { result } = await run("block", inked(), [{ text: "Item Qty\n", words: cells }]);
    expect(result.table).toBeNull();
  });

  it("gives an empty table when no words were read", async () => {
    const { result } = await run("table", inked(), [{ text: "", words: [] }]);
    expect(result.table).toEqual([]);
    expect(result.text).toBe("\n");
  });
});
