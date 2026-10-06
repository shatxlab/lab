import { columnLabel, decodeRange, type RawWorkbook, type RawWorksheet, type SheetRange } from "@/lib/viewer/sheet";

/**
 * One cell change, addressed the way spreadsheets address cells so edits
 * survive find/sort re-ordering: a `sourceRow` index would point somewhere
 * else after a sort, but `Sheet!B3` always means the same cell.
 */
export type SheetEdit = {
  sheetName: string;
  /** A1-style cell address, e.g. `B3`. */
  addr: string;
  /** `null` clears the cell. */
  value: string | number | null;
};

/** The slice of SheetJS's writer surface this module drives, injectable for tests. */
export type SheetJsWriter = {
  write(data: unknown, options: { type: "array"; bookType: string }): unknown;
};

/**
 * Returns a NEW workbook with the edits applied. The input workbook and its
 * worksheets are never mutated — the caller's copy stays the pristine
 * original, which is what makes "discard edits" a no-op. Untouched sheets are
 * shared by reference rather than deep-copied; only sheets that receive an
 * edit get a fresh worksheet object.
 */
export function applyEdits(workbook: RawWorkbook, edits: readonly SheetEdit[]): RawWorkbook {
  const sheets: Record<string, RawWorksheet> = { ...workbook.Sheets };
  const edited = new Set<string>();

  for (const edit of edits) {
    const worksheet = workbook.Sheets[edit.sheetName];
    if (!worksheet) continue; // The sheet may have been renamed or removed upstream; skip, don't throw.

    if (!edited.has(edit.sheetName)) {
      sheets[edit.sheetName] = { ...worksheet };
      edited.add(edit.sheetName);
    }

    applyOne(sheets[edit.sheetName]!, edit);
  }

  return { SheetNames: [...workbook.SheetNames], Sheets: sheets };
}

function applyOne(worksheet: RawWorksheet, edit: SheetEdit): void {
  // A multi-cell or malformed address is not a single cell edit; ignore it
  // rather than writing a junk key into the worksheet.
  const cellRange = decodeRange(edit.addr);
  if (
    !cellRange ||
    cellRange.startRow !== cellRange.endRow ||
    cellRange.startColumn !== cellRange.endColumn
  ) {
    return;
  }

  if (edit.value === null) {
    delete worksheet[edit.addr];
    return;
  }

  worksheet[edit.addr] = {
    t: typeof edit.value === "number" && Number.isFinite(edit.value) ? "n" : "s",
    v: edit.value,
  };

  extendRange(worksheet, cellRange);
}

/**
 * Grows `!ref` just enough to cover the freshly written cell. Without this a
 * write past the old range would be invisible to SheetJS's writer (it
 * serializes exactly the declared range) and to the re-read that refreshes
 * the viewer.
 */
function extendRange(worksheet: RawWorksheet, cell: SheetRange): void {
  const current = worksheet["!ref"] ? decodeRange(worksheet["!ref"]) : null;
  const merged: SheetRange = current
    ? {
        startColumn: Math.min(current.startColumn, cell.startColumn),
        startRow: Math.min(current.startRow, cell.startRow),
        endColumn: Math.max(current.endColumn, cell.endColumn),
        endRow: Math.max(current.endRow, cell.endRow),
      }
    : cell;

  worksheet["!ref"] = encodeRange(merged);
}

/** Inverse of sheet.ts's decodeRange: zero-based bounds back to an A1-style ref. */
export function encodeRange(range: SheetRange): string {
  const start = `${columnLabel(range.startColumn)}${range.startRow + 1}`;
  const isSingleCell = range.startColumn === range.endColumn && range.startRow === range.endRow;
  return isSingleCell
    ? start
    : `${start}:${columnLabel(range.endColumn)}${range.endRow + 1}`;
}

/**
 * What the user typed becomes what the cell stores. Empty drafts clear the
 * cell; plain decimals are stored as numbers so the saved file keeps its
 * typing (a CSV full of counts should not become text on the way out).
 * Anything else — currency, ticket ids, padded zeros — stays exactly as typed.
 */
export function coerceSheetValue(text: string): string | number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isFinite(value)) return value;
  }

  return text;
}

/**
 * Serializes an (edited) workbook to bytes with SheetJS. `format` is the
 * bookType, e.g. `xlsx`; v1 only ever asks for that.
 */
export function serializeWorkbook(
  xlsx: SheetJsWriter,
  workbook: RawWorkbook,
  format: string,
): Uint8Array {
  const result = xlsx.write(workbook, { type: "array", bookType: format });

  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  throw new Error("sheet-edit: the workbook writer did not return bytes");
}
