import { decodeMarkupBytes, decodeTextBytes } from "@/lib/viewer/charset";
import { TEXT_SHEET_EXTENSIONS } from "@/lib/viewer/file-kind";
import { assertFileSizeWithinLimit, assertZipWithinLimits, isZipArchive } from "@/lib/limits";
import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";

/**
 * A 100k-row export would freeze the tab if every cell became a DOM node, so
 * only the first slice of each sheet is rendered and the view says so.
 */
export const MAX_RENDERED_ROWS = 5000;

export type SheetData = {
  name: string;
  /** Padded to `columnCount`, so every row lines up with the header. */
  rows: string[][];
  totalRows: number;
  columnCount: number;
  truncated: boolean;
  /**
   * Where this sheet's cells actually live in the source workbook. Editing
   * maps a displayed row back to its cell address through this; absent for
   * hand-built sheets (HTML tables) that have no backing worksheet.
   */
  range?: SheetRange | null;
};

export type Workbook = {
  sheets: SheetData[];
  /**
   * The untouched SheetJS workbook, kept so edits can be applied to it and
   * the file written back out. Null when the sheets were rebuilt from markup
   * rather than parsed, in which case the viewer is read-only.
   */
  workbook: RawWorkbook | null;
};

/** The slice of SheetJS's shape this module reads, kept local so nothing here needs the library at runtime. */
export type RawCell = { w?: string; v?: string | number | boolean | Date };
export type RawWorksheet = Record<string, unknown> & { "!ref"?: string };
export type RawWorkbook = { SheetNames: string[]; Sheets: Record<string, RawWorksheet> };

type SheetJs = typeof import("xlsx");

let legacyCodepages: Promise<void> | undefined;

export async function parseWorkbook(input: {
  buffer: ArrayBuffer;
  extension: string;
}): Promise<Workbook> {
  const bytes = new Uint8Array(input.buffer);
  // Raw-size and (for ZIP packages) decompression caps run before SheetJS loads.
  assertFileSizeWithinLimit(bytes.byteLength, "This spreadsheet");
  if (isZipArchive(bytes)) assertZipWithinLimits(bytes, "This spreadsheet");

  // Deferred so SheetJS (~1 MB) only downloads once a spreadsheet is opened.
  const XLSX = await import("xlsx");

  if (TEXT_SHEET_EXTENSIONS.has(input.extension)) {
    const workbook = XLSX.read(decodeTextBytes(bytes), { type: "string" });
    const raw = workbook as unknown as RawWorkbook;
    return { sheets: workbookToSheets(raw), workbook: raw };
  }

  /*
   * A lot of "Excel" files, especially older Cyrillic exports, are HTML (or
   * SpreadsheetML) saved with a `.xls` extension. SheetJS then either treats
   * the markup as delimited text — so `<html>`, `<body>` and `<meta>` show up
   * as cells — or UTF-8-decodes windows-1251 and garbles the letters. Detect
   * that markup, honour the charset in the header, and read tables ourselves.
   */
  if (looksLikeMarkup(bytes)) {
    return readMarkupWorkbook(XLSX, bytes);
  }

  await ensureLegacyCodepages(XLSX);
  const workbook = XLSX.read(input.buffer, { type: "array" });
  const raw = workbook as unknown as RawWorkbook;
  return { sheets: workbookToSheets(raw), workbook: raw };
}

async function ensureLegacyCodepages(XLSX: SheetJs): Promise<void> {
  // BIFF5 `.xls` and some `.dbf` files store text in a codepage. SheetJS only
  // applies those tables if they are loaded explicitly; without them, cp1251
  // becomes Latin-1 garbage.
  legacyCodepages ??= import("xlsx/dist/cpexcel.full.mjs").then((table) => {
    XLSX.set_cptable(table);
  });
  await legacyCodepages;
}

function readMarkupWorkbook(XLSX: SheetJs, bytes: Uint8Array): Workbook {
  const text = decodeMarkupBytes(bytes);
  if (isHtmlSpreadsheet(text)) {
    // The sheets were rebuilt from sanitized table markup, so there is no
    // worksheet to edit and write back — the viewer stays read-only here.
    return { sheets: htmlToSheets(text), workbook: null };
  }

  const workbook = XLSX.read(text, { type: "string" });
  const raw = workbook as unknown as RawWorkbook;
  return { sheets: workbookToSheets(raw), workbook: raw };
}

function looksLikeMarkup(bytes: Uint8Array): boolean {
  const index = skipBomAndWhitespace(bytes);
  if (index >= bytes.length) return false;
  if (bytes[index] === 0x3c) return true;
  // UTF-16 BE `<`
  return bytes[index] === 0x00 && bytes[index + 1] === 0x3c;
}

function skipBomAndWhitespace(bytes: Uint8Array): number {
  let index = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) index = 3;
  else if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) index = 2;

  while (index < bytes.length) {
    const byte = bytes[index]!;
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      index += 1;
      continue;
    }
    if (
      bytes[index + 1] === 0x00 &&
      (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d)
    ) {
      index += 2;
      continue;
    }
    if (byte === 0x00 && bytes[index + 1] !== undefined) {
      const next = bytes[index + 1]!;
      if (next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d) {
        index += 2;
        continue;
      }
    }
    break;
  }

  return index;
}

function isSpreadsheetMl(text: string): boolean {
  const head = text.slice(0, 8192);
  return (
    /urn:schemas-microsoft-com:office:spreadsheet/i.test(head) || /<Workbook[\s>]/i.test(head)
  );
}

function isHtmlSpreadsheet(text: string): boolean {
  if (isSpreadsheetMl(text)) return false;
  return /<(?:html|body|head|meta|table)[\s>]/i.test(text.slice(0, 8192));
}

function htmlToSheets(html: string): SheetData[] {
  // Even detached DOMParser documents can fetch resources. Only parse the
  // resource-free result, not raw spreadsheet markup.
  const doc = new DOMParser().parseFromString(sanitizeDocumentHtml(html), "text/html");
  const tables = [...doc.querySelectorAll("table")].filter(
    (table) => !table.parentElement?.closest("table"),
  );

  if (tables.length === 0) {
    return [{ name: "Sheet1", rows: [], totalRows: 0, columnCount: 0, truncated: false }];
  }

  const usedNames = new Set<string>();
  return tables.map((table, index) =>
    sheetFromRows(uniqueSheetName(usedNames, sheetNameFromTable(table, index)), htmlTableToRows(table)),
  );
}

function sheetNameFromTable(table: HTMLTableElement, index: number): string {
  const caption = table.caption?.textContent?.replace(/\s+/g, " ").trim();
  return caption || `Sheet${index + 1}`;
}

function uniqueSheetName(used: Set<string>, base: string): string {
  const trimmed = base.trim() || "Sheet1";
  if (!used.has(trimmed)) {
    used.add(trimmed);
    return trimmed;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${trimmed} (${suffix})`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  return trimmed;
}

function htmlTableToRows(table: HTMLTableElement): string[][] {
  const grid: string[][] = [];
  const taken: boolean[][] = [];

  const occupies = (row: number, column: number) => Boolean(taken[row]?.[column]);

  const write = (row: number, column: number, value: string, occupy: boolean) => {
    if (!grid[row]) {
      grid[row] = [];
      taken[row] = [];
    }
    while (grid[row]!.length <= column) {
      grid[row]!.push("");
      taken[row]!.push(false);
    }
    taken[row]![column] = true;
    if (occupy) grid[row]![column] = value;
  };

  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const tr = table.rows[rowIndex]!;
    let column = 0;
    for (const cell of tr.cells) {
      while (occupies(rowIndex, column)) column += 1;
      const text = (cell.textContent ?? "").replace(/\u00a0/g, " ").trim();
      const colspan = Math.max(1, cell.colSpan || 1);
      const rowspan = Math.max(1, cell.rowSpan || 1);
      for (let rowSpanOffset = 0; rowSpanOffset < rowspan; rowSpanOffset += 1) {
        for (let colSpanOffset = 0; colSpanOffset < colspan; colSpanOffset += 1) {
          write(rowIndex + rowSpanOffset, column + colSpanOffset, text, rowSpanOffset === 0 && colSpanOffset === 0);
        }
      }
      column += colspan;
    }
  }

  return grid;
}

function sheetFromRows(name: string, rawRows: string[][]): SheetData {
  const columnCount = rawRows.reduce((max, row) => Math.max(max, row.length), 0);
  const totalRows = rawRows.length;
  if (columnCount === 0 || totalRows === 0) {
    return { name, rows: [], totalRows: 0, columnCount: 0, truncated: false, range: null };
  }

  const renderedRows = Math.min(totalRows, MAX_RENDERED_ROWS);
  const rows = rawRows.slice(0, renderedRows).map((row) => {
    const padded = row.slice();
    while (padded.length < columnCount) padded.push("");
    return padded;
  });

  return {
    name,
    rows,
    totalRows,
    columnCount,
    truncated: totalRows > renderedRows,
    // Hand-built sheets read from A1 even though nothing backs the addresses.
    range: { startColumn: 0, startRow: 0, endColumn: columnCount - 1, endRow: totalRows - 1 },
  };
}

export function workbookToSheets(workbook: RawWorkbook): SheetData[] {
  return workbook.SheetNames.map((name) => readSheet(name, workbook.Sheets[name]));
}

function readSheet(name: string, worksheet: RawWorksheet | undefined): SheetData {
  const range = worksheet?.["!ref"] ? decodeRange(worksheet["!ref"]) : null;

  if (!worksheet || !range) {
    return { name, rows: [], totalRows: 0, columnCount: 0, truncated: false, range: null };
  }

  const totalRows = range.endRow - range.startRow + 1;
  const columnCount = range.endColumn - range.startColumn + 1;
  const renderedRows = Math.min(totalRows, MAX_RENDERED_ROWS);
  const rows: string[][] = [];

  for (let rowOffset = 0; rowOffset < renderedRows; rowOffset += 1) {
    const row = new Array<string>(columnCount);
    for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
      const address = `${columnLabel(range.startColumn + columnOffset)}${range.startRow + rowOffset + 1}`;
      row[columnOffset] = cellText(worksheet[address] as RawCell | undefined);
    }
    rows.push(row);
  }

  return {
    name,
    rows,
    totalRows,
    columnCount,
    truncated: totalRows > renderedRows,
    range,
  };
}

/*
 * `w` is the text SheetJS renders from the cell's own number format, so a date
 * or a currency amount reads the way the author saw it rather than as the raw
 * serial underneath. `v` is the fallback for cells that carry no format.
 */
function cellText(cell: RawCell | undefined): string {
  if (!cell) return "";
  if (typeof cell.w === "string") return cell.w;
  if (cell.v === null || cell.v === undefined) return "";
  return cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v);
}

export type SheetRange = {
  startColumn: number;
  startRow: number;
  endColumn: number;
  endRow: number;
};

/** Parses an A1-style range such as `B2:D57`. Rows come back zero-based. */
export function decodeRange(ref: string): SheetRange | null {
  const [start, end] = ref.split(":");
  const first = decodeAddress(start ?? "");
  if (!first) return null;

  const last = end ? decodeAddress(end) : first;
  if (!last) return null;

  return {
    startColumn: Math.min(first.column, last.column),
    startRow: Math.min(first.row, last.row),
    endColumn: Math.max(first.column, last.column),
    endRow: Math.max(first.row, last.row),
  };
}

function decodeAddress(address: string): { column: number; row: number } | null {
  const match = /^([A-Za-z]+)(\d+)$/.exec(address.trim());
  if (!match) return null;

  const letters = match[1]!.toUpperCase();
  let column = 0;
  for (const letter of letters) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }

  return { column: column - 1, row: Number(match[2]) - 1 };
}

/** Spreadsheet column label for a zero-based index: 0 -> A, 26 -> AA. */
export function columnLabel(index: number): string {
  let label = "";
  let remaining = index;

  while (remaining >= 0) {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return label;
}

export type SheetSortDirection = "asc" | "desc";

export type SheetSort = {
  column: number;
  direction: SheetSortDirection;
};

export type DisplayRow = {
  cells: string[];
  /** Zero-based index in the parsed sheet, so row numbers still match the file. */
  sourceRow: number;
};

/**
 * Optional currency, thousands commas, then a plain decimal. Tight on purpose:
 * ticket ids like `QA-1` must stay text, not `-1`.
 */
const NUMBER_RE = /^(?:[$€£¥]\s*)?(-?\d{1,3}(?:,\d{3})+|-?\d+)(?:\.\d+)?$/;

export function compareSheetCells(left: string, right: string): number {
  const a = left.trim();
  const b = right.trim();
  if (a === "" && b === "") return 0;
  if (a === "") return 1;
  if (b === "") return -1;

  const aNum = parseSheetNumber(a);
  const bNum = parseSheetNumber(b);
  if (aNum !== null && bNum !== null) {
    return aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
  }

  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function parseSheetNumber(text: string): number | null {
  if (!NUMBER_RE.test(text)) return null;
  const value = Number(text.replace(/[$€£¥]/g, "").replaceAll(",", "").trim());
  return Number.isFinite(value) ? value : null;
}

/**
 * Reorders the sheet for display. Row 1 stays put (the usual header) and empty
 * cells stay at the bottom in both directions, so a sparse column does not bury
 * the values under blanks.
 */
export function orderedSheetRows(rows: string[][], sort: SheetSort | null): DisplayRow[] {
  if (rows.length === 0) return [];

  const indexed = rows.map((cells, sourceRow) => ({ cells, sourceRow }));
  if (!sort || rows.length === 1) return indexed;

  const [header, ...body] = indexed;
  const direction = sort.direction === "desc" ? -1 : 1;

  body.sort((left, right) => {
    const leftValue = left.cells[sort.column] ?? "";
    const rightValue = right.cells[sort.column] ?? "";
    const leftBlank = leftValue.trim() === "";
    const rightBlank = rightValue.trim() === "";
    if (leftBlank || rightBlank) {
      if (leftBlank && rightBlank) return left.sourceRow - right.sourceRow;
      return leftBlank ? 1 : -1;
    }

    const cmp = compareSheetCells(leftValue, rightValue);
    if (cmp !== 0) return cmp * direction;
    return left.sourceRow - right.sourceRow;
  });

  return [header!, ...body];
}
