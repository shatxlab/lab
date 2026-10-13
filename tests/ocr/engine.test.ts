import { afterEach, describe, expect, it, vi } from "vitest";

import { createEngine, statusOf, wordsOf } from "@/lib/ocr/engine";

const worker = vi.hoisted(() => ({
  setParameters: vi.fn(async () => {}),
  recognize: vi.fn(async () => ({ data: { text: "Hello\n", confidence: 88, blocks: [] as unknown[] } })),
  terminate: vi.fn(async () => {}),
}));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn(async () => worker) }));

afterEach(() => {
  worker.setParameters.mockClear();
  worker.recognize.mockClear();
});

const plan = { core: "c", worker: "w", langPath: "l", files: [] };

describe("wordsOf", () => {
  const raw = (text: string, x: number) => ({ text, confidence: 90, bbox: { x0: x, y0: 0, x1: x + 10, y1: 10 } });

  it("flattens blocks, paragraphs and lines, numbering the lines across the page", () => {
    const words = wordsOf({
      text: "",
      confidence: 0,
      blocks: [
        { paragraphs: [{ lines: [{ words: [raw("a", 0), raw("b", 20)] }, { words: [raw("c", 0)] }] }] },
        { paragraphs: [{ lines: [{ words: [raw("d", 0)] }] }, { lines: [{ words: [raw("e", 0)] }] }] },
      ],
    });
    expect(words.map((w) => [w.text, w.line])).toEqual([["a", 0], ["b", 0], ["c", 1], ["d", 2], ["e", 3]]);
  });

  it("copes with no blocks, and copies the boxes", () => {
    expect(wordsOf({ text: "", confidence: 0, blocks: null })).toEqual([]);
    expect(wordsOf({ text: "", confidence: 0 })).toEqual([]);
    const source = raw("x", 5);
    const [first] = wordsOf({ text: "", confidence: 0, blocks: [{ paragraphs: [{ lines: [{ words: [source] }] }] }] });
    first!.bbox.x0 = 99;
    expect(source.bbox.x0).toBe(5);
  });
});

describe("the engine", () => {
  it("sets the page mode before the first read and again only when it changes", async () => {
    const engine = await createEngine(plan, ["eng"], () => {});
    await engine.recognize(new Blob(["x"]), { psm: "6", preserveSpaces: true });
    await engine.recognize(new Blob(["x"]), { psm: "6", preserveSpaces: true });
    expect(worker.setParameters).toHaveBeenCalledTimes(1);
    expect(worker.setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    await engine.recognize(new Blob(["x"]));
    expect(worker.setParameters).toHaveBeenCalledTimes(2);
    expect(worker.setParameters).toHaveBeenLastCalledWith({ tessedit_pageseg_mode: "3", preserve_interword_spaces: "0" });
  });

  it("asks for the words' boxes, and returns the text, confidence and words", async () => {
    const engine = await createEngine(plan, ["eng"], () => {});
    const out = await engine.recognize(new Blob(["x"]));
    expect(worker.recognize).toHaveBeenCalledWith(expect.anything(), {}, { text: true, blocks: true });
    expect(out).toEqual({ text: "Hello\n", confidence: 88, words: [] });
    await engine.terminate();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("maps the engine's progress messages to stages", () => {
    expect(statusOf("loading tesseract core")).toBe("engine");
    expect(statusOf("loading language traineddata")).toBe("language");
    expect(statusOf("recognizing text")).toBe("recognizing");
    expect(statusOf("initializing api")).toBe("start");
  });
});
