import { createTwoFilesPatch, diffArrays, diffWordsWithSpace } from "diff";

/*
 * Text diff shared by the document viewer ("compare two files") and the text
 * tools. jsdiff does the hard part; this module turns its chunks into rows a
 * UI can draw: side-by-side cells with line numbers, word-level highlights
 * inside modified lines, and the positions of the change blocks.
 */

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

export interface Segment {
  text: string;
  changed: boolean;
}

export interface DiffCell {
  /** 1-based line number in its own file. */
  no: number;
  segments: Segment[];
}

export type DiffRowKind = "equal" | "change" | "add" | "remove";

export interface DiffRow {
  kind: DiffRowKind;
  left: DiffCell | null;
  right: DiffCell | null;
}

export interface DiffResult {
  rows: DiffRow[];
  /** Lines present only on the right / only on the left (modified lines count in both). */
  added: number;
  removed: number;
  /** Index into `rows` of the first row of every run of changes. */
  blocks: number[];
  identical: boolean;
}

/** Bounds that keep a pathological pair of files from freezing the tab. */
export const MAX_DIFF_CHARS = 2_000_000;
export const DIFF_TIMEOUT_MS = 4000;
/** Longer lines skip the word-level pass and are marked changed as a whole. */
const MAX_WORD_DIFF_LINE = 2000;
/** Below this share of unchanged text, a modified line is shown as wholly changed. */
const MIN_SIMILARITY = 0.2;

export class DiffTooLargeError extends Error {
  constructor() {
    super("The files are too large or too different to compare.");
    this.name = "DiffTooLargeError";
  }
}

/** Normalise newlines and make sure a non-empty text ends with one. */
function prepare(text: string): string {
  const unified = text.replace(/\r\n?/g, "\n");
  return unified === "" || unified.endsWith("\n") ? unified : `${unified}\n`;
}

function lineKey(options: DiffOptions): (line: string) => string {
  return (line) => {
    let value = line;
    if (options.ignoreWhitespace) value = value.replace(/\s+/g, " ").trim();
    if (options.ignoreCase) value = value.toLowerCase();
    return value;
  };
}

/** Split into lines without the phantom empty last line a trailing newline makes. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function whole(text: string, changed: boolean): Segment[] {
  return [{ text, changed }];
}

function wordSegments(left: string, right: string, options: DiffOptions): [Segment[], Segment[]] {
  if (left.length > MAX_WORD_DIFF_LINE || right.length > MAX_WORD_DIFF_LINE) {
    return [whole(left, true), whole(right, true)];
  }
  const parts = diffWordsWithSpace(left, right, { ignoreCase: options.ignoreCase });
  const leftSegments: Segment[] = [];
  const rightSegments: Segment[] = [];
  let unchanged = 0;
  for (const part of parts) {
    if (!part.added && !part.removed) {
      unchanged += part.value.length;
      leftSegments.push({ text: part.value, changed: false });
      rightSegments.push({ text: part.value, changed: false });
    } else if (part.removed) {
      leftSegments.push({ text: part.value, changed: true });
    } else {
      rightSegments.push({ text: part.value, changed: true });
    }
  }
  const longest = Math.max(left.length, right.length, 1);
  if (unchanged / longest < MIN_SIMILARITY) return [whole(left, true), whole(right, true)];
  // Equal chunks come from the new text; show each side's own wording.
  if (options.ignoreCase) return [mergeOwn(leftSegments, left), mergeOwn(rightSegments, right)];
  return [leftSegments, rightSegments];
}

/** Re-cut segments over the side's real text so case differences survive. */
function mergeOwn(segments: Segment[], own: string): Segment[] {
  const result: Segment[] = [];
  let at = 0;
  for (const segment of segments) {
    const text = own.slice(at, at + segment.text.length);
    at += segment.text.length;
    result.push({ text, changed: segment.changed });
  }
  return result;
}

export function computeDiff(oldText: string, newText: string, options: DiffOptions = {}): DiffResult {
  if (oldText.length > MAX_DIFF_CHARS || newText.length > MAX_DIFF_CHARS) throw new DiffTooLargeError();

  const a = prepare(oldText);
  const b = prepare(newText);
  const oldLines = splitLines(a);
  const newLines = splitLines(b);

  // Diff the line arrays with our own equality, so "ignore whitespace" means
  // what `git diff -w` means (every run of spaces is equivalent) and not just
  // trimmed line ends.
  const key = lineKey(options);
  const chunks = diffArrays(oldLines, newLines, {
    comparator: (left, right) => left === right || key(left) === key(right),
    timeout: DIFF_TIMEOUT_MS,
  });
  if (!chunks) throw new DiffTooLargeError();

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;

  const leftCell = (index: number, segments?: Segment[]): DiffCell => ({
    no: index + 1,
    segments: segments ?? whole(oldLines[index] ?? "", false),
  });
  const rightCell = (index: number, segments?: Segment[]): DiffCell => ({
    no: index + 1,
    segments: segments ?? whole(newLines[index] ?? "", false),
  });

  for (let c = 0; c < chunks.length; c += 1) {
    const chunk = chunks[c]!;
    const count = chunk.value.length;

    if (!chunk.added && !chunk.removed) {
      for (let k = 0; k < count; k += 1) {
        rows.push({ kind: "equal", left: leftCell(i), right: rightCell(j) });
        i += 1;
        j += 1;
      }
      continue;
    }

    // jsdiff emits removed before added; pair them line by line.
    const next = chunks[c + 1];
    if (chunk.removed && next?.added) {
      const addCount = next.value.length;
      const paired = Math.min(count, addCount);
      for (let k = 0; k < paired; k += 1) {
        const [ls, rs] = wordSegments(oldLines[i] ?? "", newLines[j] ?? "", options);
        rows.push({ kind: "change", left: leftCell(i, ls), right: rightCell(j, rs) });
        i += 1;
        j += 1;
      }
      for (let k = paired; k < count; k += 1) {
        rows.push({ kind: "remove", left: leftCell(i, whole(oldLines[i] ?? "", true)), right: null });
        i += 1;
      }
      for (let k = paired; k < addCount; k += 1) {
        rows.push({ kind: "add", left: null, right: rightCell(j, whole(newLines[j] ?? "", true)) });
        j += 1;
      }
      removed += count;
      added += addCount;
      c += 1;
      continue;
    }

    if (chunk.removed) {
      for (let k = 0; k < count; k += 1) {
        rows.push({ kind: "remove", left: leftCell(i, whole(oldLines[i] ?? "", true)), right: null });
        i += 1;
      }
      removed += count;
    } else {
      for (let k = 0; k < count; k += 1) {
        rows.push({ kind: "add", left: null, right: rightCell(j, whole(newLines[j] ?? "", true)) });
        j += 1;
      }
      added += count;
    }
  }

  const blocks: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind !== "equal" && (index === 0 || rows[index - 1]!.kind === "equal")) blocks.push(index);
  });

  return { rows, added, removed, blocks, identical: blocks.length === 0 };
}

/** Classic unified patch text, for "copy as patch". */
export function unifiedPatch(oldText: string, newText: string, oldName = "a", newName = "b", options: DiffOptions = {}): string {
  return createTwoFilesPatch(oldName, newName, prepare(oldText), prepare(newText), "", "", {
    context: 3,
    ignoreWhitespace: options.ignoreWhitespace,
  });
}

/** A run of rows to draw: either visible rows or a collapsed stretch of equal ones. */
export type DiffChunk =
  | { type: "rows"; start: number; rows: DiffRow[] }
  | { type: "gap"; start: number; length: number };

/**
 * Collapse long runs of unchanged rows, keeping `context` lines around each
 * change. `expanded` holds gap start indexes the reader has opened.
 */
export function collapseRows(rows: readonly DiffRow[], context = 3, expanded: ReadonlySet<number> = new Set()): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index]!.kind !== "equal") {
      let end = index;
      while (end < rows.length && rows[end]!.kind !== "equal") end += 1;
      chunks.push({ type: "rows", start: index, rows: rows.slice(index, end) });
      index = end;
      continue;
    }
    let end = index;
    while (end < rows.length && rows[end]!.kind === "equal") end += 1;
    const length = end - index;
    const atStart = index === 0;
    const atEnd = end === rows.length;
    const head = atStart ? 0 : context;
    const tail = atEnd ? 0 : context;
    // Collapse only when it actually hides something worth a placeholder row.
    if (expanded.has(index) || length <= head + tail + 1) {
      chunks.push({ type: "rows", start: index, rows: rows.slice(index, end) });
    } else {
      if (head > 0) chunks.push({ type: "rows", start: index, rows: rows.slice(index, index + head) });
      chunks.push({ type: "gap", start: index, length: length - head - tail });
      if (tail > 0) chunks.push({ type: "rows", start: end - tail, rows: rows.slice(end - tail, end) });
    }
    index = end;
  }
  return chunks;
}
