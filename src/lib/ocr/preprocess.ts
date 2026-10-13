/**
 * Getting an image ready for OCR. Recognition is far better on plain dark text
 * on a light page, at a size where letters are 20–30 pixels tall: so convert to
 * grey, stretch the contrast, optionally flatten to black and white, and enlarge
 * small pictures. The pixel work is pure (on RGBA arrays); `prepareCanvas` applies it
 * to a real canvas in the browser.
 */

export interface PreprocessOptions {
  /** Grey and stretch the contrast between the darkest and lightest 1% of pixels. */
  contrast: boolean;
  /** Flatten to pure black and white at the best threshold (Otsu). Helps clean scans, hurts photos. */
  blackWhite: boolean;
  /** Scale small images up. */
  enlarge: boolean;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = { contrast: true, blackWhite: false, enlarge: true };

/** Longest side below which an image is scaled up, and the longest side it is brought down to. */
export const ENLARGE_BELOW = 1600;
export const MAX_SIDE = 4000;
export const MAX_ENLARGE = 3;

/** How much to scale an image of this size: up when it is small, down when it is huge, else 1. */
export function scaleFor(width: number, height: number, enlarge: boolean): number {
  const longest = Math.max(width, height);
  if (longest <= 0) return 1;
  if (longest > MAX_SIDE) return MAX_SIDE / longest;
  if (enlarge && longest < ENLARGE_BELOW) return Math.min(MAX_ENLARGE, ENLARGE_BELOW / longest);
  return 1;
}

/** Convert RGBA pixels to grey in place (Rec. 601 luma) and return the histogram of grey levels. */
export function toGrayscale(data: Uint8ClampedArray): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const grey = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    data[i] = data[i + 1] = data[i + 2] = grey;
    histogram[grey] = histogram[grey]! + 1;
  }
  return histogram;
}

/** The grey levels below and above which `tail` of the pixels lie (the ends are ignored as noise). */
export function percentileBounds(histogram: Uint32Array, tail = 0.01): [low: number, high: number] {
  let total = 0;
  for (const count of histogram) total += count;
  if (total === 0) return [0, 255];
  const cut = total * tail;
  let low = 0;
  let seen = 0;
  while (low < 255 && seen + histogram[low]! <= cut) seen += histogram[low++]!;
  let high = 255;
  seen = 0;
  while (high > 0 && seen + histogram[high]! <= cut) seen += histogram[high--]!;
  return [low, Math.max(low, high)];
}

/** Map the grey range [low, high] onto 0..255. A flat image is left alone. */
export function stretchContrast(data: Uint8ClampedArray, low: number, high: number): void {
  if (high - low < 8) return;
  const scale = 255 / (high - low);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.max(0, Math.min(255, Math.round((data[i]! - low) * scale)));
    data[i] = data[i + 1] = data[i + 2] = value;
  }
}

/** The threshold that best separates dark from light (Otsu's method). */
export function otsuThreshold(histogram: Uint32Array): number {
  let total = 0;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) {
    total += histogram[level]!;
    sum += level * histogram[level]!;
  }
  let backgroundCount = 0;
  let backgroundSum = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level += 1) {
    backgroundCount += histogram[level]!;
    if (backgroundCount === 0) continue;
    const foregroundCount = total - backgroundCount;
    if (foregroundCount === 0) break;
    backgroundSum += level * histogram[level]!;
    const meanBack = backgroundSum / backgroundCount;
    const meanFore = (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (meanBack - meanFore) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

export function applyThreshold(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i]! > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
}

/** Run the chosen steps over RGBA pixels, in place. */
export function processPixels(data: Uint8ClampedArray, options: PreprocessOptions): void {
  if (!options.contrast && !options.blackWhite) return;
  const histogram = toGrayscale(data);
  if (options.contrast) {
    const [low, high] = percentileBounds(histogram);
    stretchContrast(data, low, high);
    // The levels moved, so the histogram for thresholding is the stretched one.
    if (options.blackWhite) {
      const stretched = new Uint32Array(256);
      for (let i = 0; i < data.length; i += 4) stretched[data[i]!] = stretched[data[i]!]! + 1;
      applyThreshold(data, otsuThreshold(stretched));
    }
  } else if (options.blackWhite) {
    applyThreshold(data, otsuThreshold(histogram));
  }
}

/** Draw the source onto a new canvas at the right size and clean it up. Needs a browser. */
export function prepareCanvas(source: CanvasImageSource & { width: number; height: number }, options: PreprocessOptions): HTMLCanvasElement {
  const scale = scaleFor(source.width, source.height, options.enlarge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No canvas.");
  // Transparent pictures (screenshots, PNGs) would read as black text on black: put them on white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (options.contrast || options.blackWhite) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    processPixels(pixels.data, options);
    context.putImageData(pixels, 0, 0);
  }
  return canvas;
}
