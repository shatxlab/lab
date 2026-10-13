/**
 * Understanding a page before and after it is read: how much it is tilted, where
 * its columns are, which recognised words are doubtful, and how to rebuild a
 * table from word positions. All of it works on plain arrays (a downscaled grey
 * image, or word boxes), so none of it needs a browser or the engine.
 */

import { otsuThreshold } from "@/lib/ocr/preprocess";

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Word {
  text: string;
  /** 0–100. */
  confidence: number;
  bbox: Box;
  /** Which line of the page it was read on, so words of a line stay together. */
  line: number;
}

/** A page's ink: true where a pixel is dark enough to be text, by Otsu's threshold. */
export function inkMask(image: GrayImage): Uint8Array {
  const histogram = new Uint32Array(256);
  for (const value of image.data) histogram[value] = histogram[value]! + 1;
  const threshold = otsuThreshold(histogram);
  const mask = new Uint8Array(image.data.length);
  // A page that is all one tone has no text; do not call half of it ink.
  let dark = 0;
  for (let i = 0; i < image.data.length; i += 1) {
    if (image.data[i]! <= threshold) {
      mask[i] = 1;
      dark += 1;
    }
  }
  // Text is the minority: if "dark" is most of the page, the page is dark-on-light inverted.
  if (dark > image.data.length * 0.5) for (let i = 0; i < mask.length; i += 1) mask[i] = mask[i] ? 0 : 1;
  return mask;
}

/* ---------------------------------------------------------------------- skew */

export const MAX_SKEW = 10;

export interface Skew {
  /** How far the lines slope, in degrees: positive when they run downhill to the right. Rotate the page by minus this to straighten it. */
  angle: number;
  /** How much sharper the text lines are at that angle than as the page is, 0 for no gain. */
  gain: number;
}

/** Sharpness of the horizontal ink profile when the page is tilted by `angle` degrees: lines align into tall, narrow peaks. */
function sharpness(points: readonly number[], angle: number, bins: number): number {
  const tan = Math.tan((angle * Math.PI) / 180);
  const counts = new Float64Array(bins * 3);
  for (let i = 0; i < points.length; i += 2) {
    const y = points[i + 1]! - points[i]! * tan;
    const at = Math.floor(y) + bins;
    if (at >= 0 && at < counts.length) counts[at] = counts[at]! + 1;
  }
  let sum = 0;
  for (const count of counts) sum += count * count;
  return sum;
}

/**
 * How tilted the text lines are. The ink is projected onto the vertical axis at
 * each trial angle; the angle at which the lines are sharpest is the page's tilt.
 * Searched coarsely, then finely, within ±MAX_SKEW degrees.
 */
export function estimateSkew(image: GrayImage, maxPoints = 40_000): Skew {
  const mask = inkMask(image);
  const { width, height } = image;
  const total = mask.reduce((sum, value) => sum + value, 0);
  if (total < 50) return { angle: 0, gain: 0 };
  const every = Math.max(1, Math.floor(total / maxPoints));
  const points: number[] = [];
  let seen = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        if (seen % every === 0) points.push(x, y);
        seen += 1;
      }
    }
  }
  const bins = height;
  const at = (angle: number) => sharpness(points, angle, bins);
  const base = at(0);
  let best = 0;
  let bestScore = base;
  for (let angle = -MAX_SKEW; angle <= MAX_SKEW; angle += 0.5) {
    const score = at(angle);
    if (score > bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  const centre = best;
  for (let angle = centre - 0.5; angle <= centre + 0.5; angle += 0.1) {
    const score = at(angle);
    if (score > bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  return { angle: Math.round(best * 10) / 10, gain: base > 0 ? (bestScore - base) / base : 0 };
}

/** The smallest tilt worth correcting, and how much sharper the lines must become for it to be real. */
export const MIN_SKEW = 0.4;
export const MIN_GAIN = 0.05;

/** The angle to straighten by, or 0 when the page is straight enough or the estimate is not convincing. */
export function straightenAngle(skew: Skew): number {
  return Math.abs(skew.angle) >= MIN_SKEW && skew.gain >= MIN_GAIN ? skew.angle : 0;
}

/** The page size after rotating a w×h page by `degrees`, so no corner is cut off. */
export function rotatedSize(width: number, height: number, degrees: number): { width: number; height: number } {
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { width: Math.ceil(width * cos + height * sin), height: Math.ceil(width * sin + height * cos) };
}

/* ------------------------------------------------------------------- columns */

/**
 * Vertical gutters between columns of text: x positions (in the image's own
 * pixels) to cut at. A gutter is a run of ink-free columns at least 1.5% of the
 * width, inside the page, with a real amount of text on both sides. Headings that
 * span the columns, or a photo, hide a gutter; then the page is read as one.
 */
export function findColumnCuts(image: GrayImage, maxColumns = 3): number[] {
  const { width, height } = image;
  if (width < 40 || height < 40) return [];
  const mask = inkMask(image);
  const ink = new Uint32Array(width);
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        ink[x] = ink[x]! + 1;
        total += 1;
      }
    }
  }
  if (total === 0) return [];
  const quiet = Math.max(1, Math.round(height * 0.004));
  const minGutter = Math.max(3, Math.round(width * 0.015));
  const margin = Math.round(width * 0.08);

  const gutters: { from: number; to: number }[] = [];
  let runStart = -1;
  for (let x = margin; x <= width - margin; x += 1) {
    const empty = x < width - margin && ink[x]! <= quiet;
    if (empty && runStart < 0) runStart = x;
    if (!empty && runStart >= 0) {
      if (x - runStart >= minGutter) gutters.push({ from: runStart, to: x });
      runStart = -1;
    }
  }
  // Each side of a cut must hold at least a tenth of the ink, or it is only a margin.
  const massBefore = (x: number) => ink.slice(0, x).reduce((sum, value) => sum + value, 0);
  const real = gutters.filter((gutter) => {
    const before = massBefore(gutter.from);
    return before >= total * 0.1 && total - massBefore(gutter.to) >= total * 0.1;
  });
  return real
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, maxColumns - 1)
    .map((gutter) => Math.round((gutter.from + gutter.to) / 2))
    .sort((a, b) => a - b);
}

/* --------------------------------------------------------------------- words */

/** Words below a confidence: the ones worth a second look. */
export const DOUBTFUL = 75;
export const VERY_DOUBTFUL = 50;

export const doubtfulWords = (words: readonly Word[], threshold = DOUBTFUL): Word[] =>
  words.filter((word) => word.text.trim() !== "" && word.confidence < threshold);

/** Move words by (dx, dy): for words read from a crop of a bigger page. */
export const shiftWords = (words: readonly Word[], dx: number, dy: number): Word[] =>
  words.map((word) => ({ ...word, bbox: { x0: word.bbox.x0 + dx, y0: word.bbox.y0 + dy, x1: word.bbox.x1 + dx, y1: word.bbox.y1 + dy } }));

/* --------------------------------------------------------------------- tables */

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

interface Cell {
  text: string;
  x0: number;
  x1: number;
  y: number;
}

/** Group words into lines (by the engine's line, or by overlapping heights when lines are not given). */
function linesOf(words: readonly Word[]): Word[][] {
  const lines = new Map<number, Word[]>();
  for (const word of words) {
    if (!word.text.trim()) continue;
    const list = lines.get(word.line);
    if (list) list.push(word);
    else lines.set(word.line, [word]);
  }
  return [...lines.values()]
    .map((line) => line.sort((a, b) => a.bbox.x0 - b.bbox.x0))
    .sort((a, b) => median(a.map((w) => (w.bbox.y0 + w.bbox.y1) / 2)) - median(b.map((w) => (w.bbox.y0 + w.bbox.y1) / 2)));
}

/**
 * Rebuild a table from word boxes. Each line is cut into cells wherever the gap
 * between neighbouring words is wider than a space within a cell (about the height
 * of the text); the cells of all rows are then lined up into columns by the
 * horizontal bands they cover, so a row with an empty cell still lines up.
 * Returns rows of equal length, or an empty array when nothing was read.
 */
export function buildTable(words: readonly Word[], gap = 0.9): string[][] {
  const lines = linesOf(words);
  if (lines.length === 0) return [];
  const rows: Cell[][] = lines.map((line) => {
    const height = median(line.map((word) => word.bbox.y1 - word.bbox.y0)) || 10;
    const cells: Cell[] = [];
    let current: Cell | null = null;
    let lastEnd = 0;
    for (const word of line) {
      const y = (word.bbox.y0 + word.bbox.y1) / 2;
      if (current && word.bbox.x0 - lastEnd <= height * gap) {
        current.text += ` ${word.text}`;
        current.x1 = word.bbox.x1;
      } else {
        current = { text: word.text, x0: word.bbox.x0, x1: word.bbox.x1, y };
        cells.push(current);
      }
      lastEnd = word.bbox.x1;
    }
    return cells;
  });

  // Columns: merge the horizontal extents of every cell that overlap into bands.
  const extents = rows.flat().map((cell) => [cell.x0, cell.x1] as const).sort((a, b) => a[0] - b[0]);
  const bands: [number, number][] = [];
  for (const [from, to] of extents) {
    const last = bands[bands.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else bands.push([from, to]);
  }
  const columnOf = (cell: Cell): number => {
    const centre = (cell.x0 + cell.x1) / 2;
    const at = bands.findIndex(([from, to]) => centre >= from && centre <= to);
    return at >= 0 ? at : 0;
  };

  const table = rows.map((cells) => {
    const row: string[] = Array.from({ length: bands.length }, () => "");
    for (const cell of cells) {
      const at = columnOf(cell);
      row[at] = row[at] ? `${row[at]} ${cell.text}` : cell.text;
    }
    return row;
  });
  // A column with nothing in it (it cannot happen by construction, but a hostile box can) is dropped.
  const keep = bands.map((_, index) => table.some((row) => row[index] !== ""));
  return table.map((row) => row.filter((_, index) => keep[index]));
}

const csvCell = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export const tableToCsv = (rows: readonly (readonly string[])[]): string => `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
