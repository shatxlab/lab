import { describe, expect, it } from "vitest";

import { allFiles, assetUrl, parseManifest, planFor } from "@/lib/ocr/assets";
import {
  DEFAULT_PREPROCESS,
  MAX_SIDE,
  applyThreshold,
  otsuThreshold,
  percentileBounds,
  processPixels,
  scaleFor,
  stretchContrast,
  toGrayscale,
} from "@/lib/ocr/preprocess";

const MANIFEST = {
  version: "7.0.0",
  worker: { path: "worker.min.js", size: 100 },
  cores: { simd: { path: "core/simd.js", size: 4000 }, baseline: { path: "core/base.js", size: 3900 } },
  languages: [
    { code: "eng", path: "lang/eng.traineddata.gz", size: 3000 },
    { code: "rus", path: "lang/rus.traineddata.gz", size: 2700 },
  ],
};

describe("manifest", () => {
  it("parses what the build writes", () => {
    expect(parseManifest(MANIFEST)).toEqual(MANIFEST);
  });

  it.each([null, "x", [], {}, { ...MANIFEST, worker: { path: 1 } }, { ...MANIFEST, cores: { simd: MANIFEST.cores.simd } }, { ...MANIFEST, languages: "no" }])("rejects %j", (bad) => {
    expect(parseManifest(bad)).toBeNull();
  });

  it("drops malformed language entries", () => {
    const parsed = parseManifest({ ...MANIFEST, languages: [...MANIFEST.languages, { code: 5, path: "x", size: 1 }, { path: "y", size: 2 }, null] });
    expect(parsed!.languages.map((l) => l.code)).toEqual(["eng", "rus"]);
  });

  it("plans the downloads for chosen languages with the engine build the browser can run", () => {
    const manifest = parseManifest(MANIFEST)!;
    const simd = planFor(manifest, ["eng"], true)!;
    expect(simd.files.map((f) => f.size)).toEqual([100, 4000, 3000]);
    expect(simd.core).toBe(assetUrl("core/simd.js"));
    expect(simd.langPath).toBe(assetUrl("lang"));
    expect(planFor(manifest, ["eng", "rus"], false)!.files.map((f) => f.size)).toEqual([100, 3900, 3000, 2700]);
    // Each file is named by its full URL, so the cache and the worker agree on it.
    for (const file of simd.files) expect(file.url).toMatch(/^https?:\/\//);
  });

  it("refuses an empty or unknown language choice", () => {
    const manifest = parseManifest(MANIFEST)!;
    expect(planFor(manifest, [], true)).toBeNull();
    expect(planFor(manifest, ["eng", "klingon"], true)).toBeNull();
  });

  it("lists every file for 'remove everything'", () => {
    expect(allFiles(parseManifest(MANIFEST)!)).toHaveLength(5);
  });
});

/** RGBA pixels of the given grey levels. */
const pixels = (levels: number[]) => Uint8ClampedArray.from(levels.flatMap((v) => [v, v, v, 255]));
const greys = (data: Uint8ClampedArray) => Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]);

describe("scaleFor", () => {
  it("enlarges small images up to a limit, leaves ordinary ones, and shrinks huge ones", () => {
    expect(scaleFor(800, 400, true)).toBe(2);
    expect(scaleFor(400, 300, true)).toBe(3); // capped
    expect(scaleFor(1200, 800, true)).toBeCloseTo(1600 / 1200, 9);
    expect(scaleFor(1600, 900, true)).toBe(1);
    expect(scaleFor(3000, 2000, true)).toBe(1);
    expect(scaleFor(8000, 4000, true)).toBe(0.5);
    expect(scaleFor(8000, 4000, false)).toBe(0.5);
    expect(MAX_SIDE).toBe(4000);
  });

  it("does not enlarge when told not to, and copes with nothing", () => {
    expect(scaleFor(800, 400, false)).toBe(1);
    expect(scaleFor(0, 0, true)).toBe(1);
  });
});

describe("grey, contrast and threshold", () => {
  it("converts to grey with the usual weights and counts the levels", () => {
    const data = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const histogram = toGrayscale(data);
    expect(greys(data)).toEqual([76, 150, 29, 255]);
    expect(data[0]).toBe(data[1]);
    expect(data[3]).toBe(255); // alpha untouched
    expect(histogram[76]).toBe(1);
    expect(histogram[255]).toBe(1);
    expect(histogram.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("finds the range that holds all but the extreme 1% of pixels", () => {
    const histogram = new Uint32Array(256);
    histogram[100] = 50;
    histogram[150] = 50;
    histogram[0] = 1; // a stray black pixel
    histogram[255] = 1; // and a white one
    expect(percentileBounds(histogram, 0.02)).toEqual([100, 150]);
    expect(percentileBounds(new Uint32Array(256))).toEqual([0, 255]);
    const flat = new Uint32Array(256);
    flat[128] = 10;
    expect(percentileBounds(flat)).toEqual([128, 128]);
  });

  it("stretches a washed-out range to the full scale", () => {
    const data = pixels([100, 125, 150]);
    stretchContrast(data, 100, 150);
    const [low, middle, high] = greys(data);
    expect([low, high]).toEqual([0, 255]);
    expect(Math.abs(middle! - 127.5)).toBeLessThanOrEqual(0.5);
    const flat = pixels([120, 121]);
    stretchContrast(flat, 120, 121);
    expect(greys(flat)).toEqual([120, 121]); // nothing to stretch
  });

  it("clamps what falls outside the range", () => {
    const data = pixels([10, 200]);
    stretchContrast(data, 50, 150);
    expect(greys(data)).toEqual([0, 255]);
  });

  it("splits a two-peaked histogram between the peaks (Otsu)", () => {
    const histogram = new Uint32Array(256);
    histogram[40] = 1000;
    histogram[200] = 1000;
    const t = otsuThreshold(histogram);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
    expect(otsuThreshold(new Uint32Array(256))).toBe(0);
    const single = new Uint32Array(256);
    single[90] = 10;
    expect(otsuThreshold(single)).toBe(0);
  });

  it("flattens to black and white at a threshold", () => {
    const data = pixels([10, 100, 101, 250]);
    applyThreshold(data, 100);
    expect(greys(data)).toEqual([0, 0, 255, 255]);
  });
});

describe("processPixels", () => {
  const page = () => pixels(Array.from({ length: 200 }, (_, i) => (i % 5 === 0 ? 90 : 170)));

  it("does nothing when no step is chosen", () => {
    const data = page();
    const before = Array.from(data);
    processPixels(data, { contrast: false, blackWhite: false, enlarge: true });
    expect(Array.from(data)).toEqual(before);
  });

  it("stretches faint text to full contrast by default", () => {
    const data = page();
    processPixels(data, DEFAULT_PREPROCESS);
    const levels = new Set(greys(data));
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBe(255);
    expect(data[3]).toBe(255);
  });

  it("makes pure black and white when asked, with or without the stretch", () => {
    for (const contrast of [true, false]) {
      const data = page();
      processPixels(data, { contrast, blackWhite: true, enlarge: true });
      expect(new Set(greys(data))).toEqual(new Set([0, 255]));
      // The dark text pixels are black and the page is white.
      expect(data[0]).toBe(0);
      expect(data[4]).toBe(255);
    }
  });

  it("copes with a blank image", () => {
    const data = pixels(new Array(50).fill(255));
    expect(() => processPixels(data, { contrast: true, blackWhite: true, enlarge: true })).not.toThrow();
  });
});
