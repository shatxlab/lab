import type { DisplayRow } from "@/lib/viewer/sheet";

export type SheetMatch = {
  /** Index in the displayed (possibly sorted) row list, header included. */
  displayIndex: number;
  sourceRow: number;
  column: number;
};

export function findSheetMatches(rows: DisplayRow[], query: string): SheetMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const matches: SheetMatch[] = [];
  rows.forEach((row, displayIndex) => {
    row.cells.forEach((cell, column) => {
      if (cell.toLocaleLowerCase().includes(needle)) {
        matches.push({ displayIndex, sourceRow: row.sourceRow, column });
      }
    });
  });
  return matches;
}

export type HighlightPart = {
  text: string;
  match: boolean;
};

export function splitHighlighted(text: string, query: string): HighlightPart[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "gi");
  const parts: HighlightPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ text: text.slice(lastIndex, start), match: false });
    }
    parts.push({ text: match[0]!, match: true });
    lastIndex = start + match[0]!.length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), match: false });
  }

  return parts.length > 0 ? parts : [{ text, match: false }];
}
