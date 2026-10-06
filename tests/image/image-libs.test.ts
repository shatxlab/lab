import { describe, expect, it } from "vitest";

import { isAnimatedGif, readJpegMetadata, readPngMetadata, stripJpeg, stripPng } from "@/lib/image/exif";
import { ascii, buildJpeg, buildPng } from "./fixtures";
import { extensionForMime, outputName, resolveMime, savedPercent, targetSize, uniqueNames, type ResizeSettings } from "@/lib/image/plan";

const chunkTypes = (bytes: Uint8Array): string[] => {
  const types: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 8; at + 12 <= bytes.length; at += 12 + view.getUint32(at)) {
    types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
  }
  return types;
};

/* --------------------------------------------------------------- tests */

describe("JPEG metadata", () => {
  it("reads camera, orientation and GPS", () => {
    const meta = readJpegMetadata(buildJpeg({ orientation: 6, withGps: true }));
    expect(meta).toMatchObject({ hasExif: true, make: "Canon", orientation: 6, hasXmp: true, hasIptc: true, hasIcc: true });
    expect(meta.gps!.latitude).toBeCloseTo(55.758333, 5);
    expect(meta.gps!.longitude).toBeCloseTo(-37.6, 5);
  });

  it("reports nothing for non-JPEG or empty input", () => {
    expect(readJpegMetadata(new Uint8Array([1, 2, 3, 4, 5]))).toMatchObject({ hasExif: false });
    expect(readJpegMetadata(new Uint8Array())).toMatchObject({ hasExif: false });
  });

  it("survives truncated and corrupted files", () => {
    const jpeg = buildJpeg({ orientation: 3, withGps: true });
    for (let cut = 2; cut < jpeg.length; cut += 7) {
      expect(() => readJpegMetadata(jpeg.subarray(0, cut))).not.toThrow();
    }
    const corrupt = jpeg.slice();
    for (let index = 20; index < 120; index += 3) corrupt[index] = 0xff;
    expect(() => readJpegMetadata(corrupt)).not.toThrow();
    expect(() => stripJpeg(corrupt)).not.toThrow();
  });
});

describe("stripJpeg", () => {
  it("removes EXIF, GPS, XMP, IPTC and comments but keeps ICC and the image data", () => {
    const original = buildJpeg({ orientation: 1, withGps: true });
    const stripped = stripJpeg(original)!;
    const meta = readJpegMetadata(stripped);
    expect(meta).toMatchObject({ hasExif: false, hasXmp: false, hasIptc: false, hasIcc: true });
    expect(meta.gps).toBeUndefined();
    // Entropy-coded data (with its stuffed FF00) and EOI are byte-identical.
    expect(Array.from(stripped.slice(-6))).toEqual(Array.from(original.slice(-6)));
    expect(stripped.length).toBeLessThan(original.length);
    expect(String.fromCharCode(...stripped)).not.toContain("secret comment");
    expect(String.fromCharCode(...stripped)).not.toContain("Canon");
  });

  it("keeps only the orientation when the photo is rotated", () => {
    const stripped = stripJpeg(buildJpeg({ orientation: 6, withGps: true }))!;
    const meta = readJpegMetadata(stripped);
    expect(meta.orientation).toBe(6);
    expect(meta.make).toBeUndefined();
    expect(meta.gps).toBeUndefined();
    // The Exif block directly follows JFIF.
    expect(stripped[2]).toBe(0xff);
    expect(stripped[3]).toBe(0xe0);
  });

  it("returns null for non-JPEG data", () => {
    expect(stripJpeg(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("PNG metadata", () => {
  it("detects and strips text/exif/time chunks only", () => {
    const png = buildPng();
    expect(readPngMetadata(png)).toEqual({ hasText: true, hasExif: true, hasTime: true, hasIcc: true });
    const stripped = stripPng(png)!;
    expect(chunkTypes(stripped)).toEqual(["IHDR", "iCCP", "IDAT", "IEND"]);
    expect(readPngMetadata(stripped)).toEqual({ hasText: false, hasExif: false, hasTime: false, hasIcc: true });
    expect(stripPng(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("detects animated GIFs", () => {
    const frame = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0];
    expect(isAnimatedGif(Uint8Array.from([...ascii("GIF89a"), ...frame, ...frame]))).toBe(true);
    expect(isAnimatedGif(Uint8Array.from([...ascii("GIF89a"), ...frame]))).toBe(false);
    expect(isAnimatedGif(buildPng())).toBe(false);
  });
});

describe("plan", () => {
  const fit = (extra: Partial<ResizeSettings>): ResizeSettings => ({ mode: "fit", maxWidth: null, maxHeight: null, percent: 100, allowUpscale: false, ...extra });

  it("fits within a box keeping the aspect ratio and never upscales by default", () => {
    expect(targetSize(4000, 3000, fit({ maxWidth: 1000 }))).toEqual({ width: 1000, height: 750 });
    expect(targetSize(4000, 3000, fit({ maxWidth: 1000, maxHeight: 500 }))).toEqual({ width: 667, height: 500 });
    expect(targetSize(800, 600, fit({ maxWidth: 1000 }))).toEqual({ width: 800, height: 600 });
    expect(targetSize(800, 600, fit({ maxWidth: 1600, allowUpscale: true }))).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(800, 600, fit({}))).toEqual({ width: 800, height: 600 });
  });

  it("scales by percentage and clamps to at least one pixel", () => {
    expect(targetSize(1000, 500, fit({ mode: "percent", percent: 50 }))).toEqual({ width: 500, height: 250 });
    expect(targetSize(10, 10, fit({ mode: "percent", percent: 1 }))).toEqual({ width: 1, height: 1 });
    expect(targetSize(1000, 500, fit({ mode: "none", maxWidth: 10 }))).toEqual({ width: 1000, height: 500 });
  });

  it("resolves output types against what the browser can encode", () => {
    const supported = new Set(["image/png", "image/jpeg", "image/webp"]);
    expect(resolveMime("image/jpeg", "keep", supported)).toBe("image/jpeg");
    expect(resolveMime("image/gif", "keep", supported)).toBe("image/png");
    expect(resolveMime("image/avif", "keep", supported)).toBe("image/png");
    expect(resolveMime("image/png", "webp", supported)).toBe("image/webp");
    expect(resolveMime("image/png", "avif", supported)).toBe("image/png");
    expect(resolveMime("image/jpg", "keep", supported)).toBe("image/jpeg");
  });

  it("names outputs and keeps batch names unique", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(outputName("Holiday photo.HEIC.png", "image/webp", "-min")).toBe("Holiday photo.HEIC-min.webp");
    expect(uniqueNames(["a.png", "b.png", "A.png", "a.png"])).toEqual(["a.png", "b.png", "A-2.png", "a-3.png"]);
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1200)).toBe(-20);
  });
});
