import { describe, expect, it } from "vitest";

import { BATCH_MIN, formatCount, imagesLabel, isBatch } from "@/lib/workbench/batch";
import { createLimiter, defaultConcurrency, runPool } from "@/lib/workbench/pool";
import { archiveNames, zipBlobs } from "@/lib/workbench/zip";
import { unzipSync } from "fflate";

describe("batch rules", () => {
  it("starts being a batch at ten images", () => {
    expect(BATCH_MIN).toBe(10);
    expect(isBatch(9)).toBe(false);
    expect(isBatch(10)).toBe(true);
    expect(isBatch(1000)).toBe(true);
  });

  it("counts images in both languages with the right plural", () => {
    expect(imagesLabel("en", 1)).toBe("1 image");
    expect(imagesLabel("en", 10)).toBe("10 images");
    expect(imagesLabel("en", 1000)).toBe("1,000 images");
    expect(imagesLabel("ru", 1)).toBe("1 изображение");
    expect(imagesLabel("ru", 2)).toBe("2 изображения");
    expect(imagesLabel("ru", 5)).toBe("5 изображений");
    expect(imagesLabel("ru", 11)).toBe("11 изображений");
    expect(imagesLabel("ru", 21)).toBe("21 изображение");
    expect(imagesLabel("ru", 22)).toBe("22 изображения");
    expect(imagesLabel("ru", 1000).replace(/\s/g, " ")).toBe("1 000 изображений");
    expect(formatCount("en", 12345)).toBe("12,345");
  });
});

describe("runPool", () => {
  it("never runs more than the limit at once, and runs every item", async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool(Array.from({ length: 40 }, (_, i) => i), 3, async (i) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(i);
      active -= 1;
    });
    expect(peak).toBe(3);
    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(40);
  });

  it("takes no new item once asked to stop", async () => {
    let stop = false;
    const seen: number[] = [];
    await runPool(
      Array.from({ length: 50 }, (_, i) => i),
      2,
      async (i) => {
        seen.push(i);
        if (i === 5) stop = true;
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
      () => stop,
    );
    expect(seen.length).toBeGreaterThanOrEqual(6);
    expect(seen.length).toBeLessThan(10);
  });

  it("copes with no items", async () => {
    await runPool([], 3, async () => {
      throw new Error("never");
    });
  });

  it("picks a small default concurrency", () => {
    const n = defaultConcurrency();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });
});

describe("createLimiter", () => {
  it("lets only `max` tasks run at a time and returns each task's value", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        limit(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active -= 1;
          return i * 2;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it("keeps going when a task throws", async () => {
    const limit = createLimiter(1);
    await expect(limit(async () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(limit(async () => "fine")).resolves.toBe("fine");
  });
});

describe("zipBlobs", () => {
  const entry = (name: string, text: string) => ({ name, blob: new Blob([text]) });

  it("packs the files into one archive that unzips to the originals", async () => {
    const [archive, ...rest] = await zipBlobs([entry("a.txt", "alpha"), entry("b.txt", "bravo")]);
    expect(rest).toHaveLength(0);
    expect(archive!.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await archive!.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["a.txt", "b.txt"]);
    expect(new TextDecoder().decode(files["a.txt"])).toBe("alpha");
    expect(new TextDecoder().decode(files["b.txt"])).toBe("bravo");
  });

  it("gives files with the same name distinct names", async () => {
    const [archive] = await zipBlobs([entry("p.png", "1"), entry("p.png", "2"), entry("P.png", "3")]);
    const files = unzipSync(new Uint8Array(await archive!.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["P-3.png", "p-2.png", "p.png"]);
  });

  it("handles a thousand files", async () => {
    const entries = Array.from({ length: 1000 }, (_, i) => entry(`IMG_${i}.jpg`, `photo ${i}`));
    const progress: number[] = [];
    const archives = await zipBlobs(entries, { onProgress: (done) => progress.push(done) });
    expect(archives).toHaveLength(1);
    expect(progress.at(-1)).toBe(1000);
    const files = unzipSync(new Uint8Array(await archives[0]!.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(1000);
    expect(new TextDecoder().decode(files["IMG_999.jpg"])).toBe("photo 999");
  });

  it("starts another archive when one would grow past the size limit", async () => {
    const archives = await zipBlobs([entry("a", "x".repeat(60)), entry("b", "y".repeat(60)), entry("c", "z".repeat(60))], { maxBytes: 100 });
    expect(archives).toHaveLength(3);
    for (const [i, name] of ["a", "b", "c"].entries()) {
      const files = unzipSync(new Uint8Array(await archives[i]!.arrayBuffer()));
      expect(Object.keys(files)).toEqual([name]);
    }
  });

  it("starts another archive after too many files", async () => {
    const archives = await zipBlobs(Array.from({ length: 5 }, (_, i) => entry(`f${i}`, "x")), { maxEntries: 2 });
    expect(archives).toHaveLength(3);
  });

  it("keeps a file bigger than the limit by itself instead of dropping it", async () => {
    const archives = await zipBlobs([entry("big", "x".repeat(500))], { maxBytes: 100 });
    expect(archives).toHaveLength(1);
    expect(Object.keys(unzipSync(new Uint8Array(await archives[0]!.arrayBuffer())))).toEqual(["big"]);
  });

  it("returns nothing for nothing, and stops when asked", async () => {
    expect(await zipBlobs([])).toEqual([]);
    let calls = 0;
    const archives = await zipBlobs(Array.from({ length: 10 }, (_, i) => entry(`f${i}`, "x")), { shouldStop: () => ++calls > 3 });
    const files = unzipSync(new Uint8Array(await archives[0]!.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(3);
  });

  it("names archives", () => {
    expect(archiveNames("images", 1)).toEqual(["images.zip"]);
    expect(archiveNames("images", 3)).toEqual(["images-1.zip", "images-2.zip", "images-3.zip"]);
  });
});
