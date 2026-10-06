/** Page-range parsing for the PDF tools ("1-3, 5, 8-" → [1,2,3,5,8,…]). */

export type RangeError = { kind: "empty" } | { kind: "syntax"; token: string } | { kind: "outOfRange"; token: string; total: number };

export type RangeResult = { ok: true; pages: number[] } | { ok: false; error: RangeError };

/**
 * Parse a 1-based page selection against a document of `total` pages.
 * Supports single pages, `a-b` spans (descending spans reverse the order),
 * open ends (`5-`, `-3`) and `all`. Pages keep the order they were typed in
 * and may repeat — that is what lets "3,1,2" reorder.
 */
export function parsePageRanges(input: string, total: number): RangeResult {
  const text = input.trim().toLowerCase();
  if (text === "") return { ok: false, error: { kind: "empty" } };
  if (text === "all" || text === "*" || text === "все") return { ok: true, pages: Array.from({ length: total }, (_, index) => index + 1) };

  const pages: number[] = [];
  for (const raw of text.split(/[,;\s]+/).filter(Boolean)) {
    const token = raw.replace(/[–—]/g, "-");
    const span = /^(\d*)-(\d*)$/.exec(token);
    const single = /^\d+$/.test(token);
    if (!span && !single) return { ok: false, error: { kind: "syntax", token: raw } };

    let from: number;
    let to: number;
    if (single) {
      from = to = Number(token);
    } else {
      const [, start = "", end = ""] = span!;
      if (start === "" && end === "") return { ok: false, error: { kind: "syntax", token: raw } };
      from = start === "" ? 1 : Number(start);
      to = end === "" ? total : Number(end);
    }
    if (from < 1 || to < 1 || from > total || to > total) return { ok: false, error: { kind: "outOfRange", token: raw, total } };
    const step = from <= to ? 1 : -1;
    for (let page = from; page !== to + step; page += step) pages.push(page);
  }
  return { ok: true, pages };
}

export type SplitMode = "extract" | "single" | "every" | "ranges";

/** Turn a split request into one page list per output file. */
export function planSplit(total: number, mode: SplitMode, options: { ranges: string; every: number }): { ok: true; parts: number[][] } | { ok: false; error: RangeError } {
  if (mode === "single") return { ok: true, parts: Array.from({ length: total }, (_, index) => [index + 1]) };

  if (mode === "every") {
    const size = Math.max(1, Math.floor(options.every) || 1);
    const parts: number[][] = [];
    for (let start = 1; start <= total; start += size) {
      parts.push(Array.from({ length: Math.min(size, total - start + 1) }, (_, offset) => start + offset));
    }
    return { ok: true, parts };
  }

  if (mode === "extract") {
    const result = parsePageRanges(options.ranges, total);
    return result.ok ? { ok: true, parts: [result.pages] } : result;
  }

  // "ranges": groups separated by "|" or new lines, each group becomes a file.
  const groups = options.ranges.split(/[|\n]+/).filter((group) => group.trim() !== "");
  if (groups.length === 0) return { ok: false, error: { kind: "empty" } };
  const parts: number[][] = [];
  for (const group of groups) {
    const result = parsePageRanges(group, total);
    if (!result.ok) return result;
    parts.push(result.pages);
  }
  return { ok: true, parts };
}

/** "1–3" style label for a part (used in file names). */
export function partLabel(pages: readonly number[]): string {
  if (pages.length === 0) return "empty";
  const first = pages[0]!;
  const last = pages[pages.length - 1]!;
  const contiguous = pages.every((page, index) => index === 0 || page === pages[index - 1]! + 1);
  if (pages.length === 1) return `${first}`;
  return contiguous ? `${first}-${last}` : `${first}-${last}+`;
}
