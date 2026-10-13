/**
 * Turns a spreadsheet's cells (all strings) into typed columns a chart can
 * use. Parsing is forgiving about how people write numbers and dates — thousands
 * separators in either style, decimal commas, currency and percent signs,
 * accounting negatives — and strict about everything else: a cell that is not
 * clearly a number or a date stays text.
 */

import { columnLabel } from "@/lib/viewer/sheet";

export type ColumnKind = "number" | "date" | "text";

export interface Column {
  /** Index in the source sheet. */
  index: number;
  name: string;
  kind: ColumnKind;
  /** Parsed values; null where the cell is empty or not of the column's kind. */
  numbers: (number | null)[];
  /** Day timestamps in UTC milliseconds, for date columns. */
  times: (number | null)[];
  /** The cells as written, trimmed. */
  labels: string[];
}

export interface Table {
  name: string;
  columns: Column[];
  rowCount: number;
  /** Whether the first row was taken as the header. */
  header: boolean;
  /** The sheet had more rows than a chart reads. */
  truncated: boolean;
}

/** Rows read from a sheet; charts of more than this many points are no use to the eye anyway. */
export const MAX_ROWS = 5000;
/** At most this share of non-empty cells may be of another kind for a column to keep its kind. */
const KIND_SHARE = 0.8;

const NUMBER_CHARS = /[\s  ]/g;

/** Parse a number as people write it; null when the text is not clearly one. */
export function parseNumber(input: string): number | null {
  let text = input.replace(NUMBER_CHARS, "").replace(/−/g, "-");
  if (text === "") return null;
  let negative = false;
  // Accounting negatives: (300).
  const bracket = /^\((.*)\)$/.exec(text);
  if (bracket) {
    negative = true;
    text = bracket[1]!;
  }
  text = text.replace(/^[+]/, "").replace(/[%$€£¥₽]/g, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^[0-9.,]+(?:e[+-]?[0-9]+)?$/i.test(text) || !/[0-9]/.test(text)) return null;

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) {
    // Both present: the one that comes last is the decimal mark.
    const decimalIsComma = text.lastIndexOf(",") > text.lastIndexOf(".");
    text = decimalIsComma ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (commas > 0) {
    // 1,234 or 1,234,567 are thousands; 12,5 is a decimal comma.
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : commas === 1 ? text.replace(",", ".") : "";
  } else if (dots > 1) {
    // 1.234.567: European thousands.
    text = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : "";
  }
  if (text === "" || !/^\d*\.?\d*(?:e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const utc = (year: number, month: number, day: number): number | null => {
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  // Date.UTC rolls 31 February over to March; refuse that.
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? ms : null;
};

/**
 * Parse a calendar date to UTC midnight. Understands 2026-10-13 (and with a
 * time), 2026/10/13, 2026-10, 13.10.2026 and 13/10/2026; an ambiguous
 * 05/06/2026 is day-first when `dayFirst`, month-first otherwise.
 */
export function parseDate(input: string, dayFirst = false): number | null {
  const text = input.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/.exec(text);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (m) return utc(Number(m[1]), Number(m[2]), 1);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (m) return utc(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    if (a > 12) return utc(year, b, a);
    if (b > 12) return utc(year, a, b);
    return dayFirst ? utc(year, b, a) : utc(year, a, b);
  }
  return null;
}

function classify(cells: string[], dayFirst: boolean): { kind: ColumnKind; numbers: (number | null)[]; times: (number | null)[] } {
  const filled = cells.filter((cell) => cell !== "");
  const numbers = cells.map((cell) => (cell === "" ? null : parseNumber(cell)));
  const times = cells.map((cell) => (cell === "" ? null : parseDate(cell, dayFirst)));
  if (filled.length > 0) {
    const dateShare = times.filter((t) => t !== null).length / filled.length;
    const numberShare = numbers.filter((n) => n !== null).length / filled.length;
    // A date wins over a number: "2026-10" is not the number 2026 minus 10.
    if (dateShare >= KIND_SHARE) return { kind: "date", numbers: cells.map(() => null), times };
    if (numberShare >= KIND_SHARE) return { kind: "number", numbers, times: cells.map(() => null) };
  }
  return { kind: "text", numbers: cells.map(() => null), times: cells.map(() => null) };
}

/**
 * The first row is a header when none of its cells is a number or a date and
 * the rows below hold at least one number or date column (or, with nothing
 * numeric at all, when there are at least two columns to name).
 */
export function detectHeader(rows: string[][], dayFirst = false): boolean {
  if (rows.length < 2) return false;
  const first = rows[0]!;
  if (first.every((cell) => cell === "")) return false;
  if (first.some((cell) => cell !== "" && (parseNumber(cell) !== null || parseDate(cell, dayFirst) !== null))) return false;
  const body = rows.slice(1);
  const width = Math.max(...rows.map((row) => row.length));
  for (let c = 0; c < width; c += 1) {
    if (classify(body.map((row) => (row[c] ?? "").trim()), dayFirst).kind !== "text") return true;
  }
  return width >= 2;
}

export interface TableOptions {
  /** Force the first row to be (or not be) the header; detected when omitted. */
  header?: boolean;
  dayFirst?: boolean;
}

export function tableFromRows(name: string, rawRows: string[][], options: TableOptions = {}): Table {
  const dayFirst = options.dayFirst ?? false;
  const trimmed = rawRows.map((row) => row.map((cell) => (cell ?? "").trim()));
  // Rows with nothing in them carry no point.
  const rows = trimmed.filter((row) => row.some((cell) => cell !== ""));
  const header = options.header ?? detectHeader(rows, dayFirst);
  const names = header ? rows[0] ?? [] : [];
  const body = header ? rows.slice(1) : rows;
  const truncated = body.length > MAX_ROWS;
  const data = truncated ? body.slice(0, MAX_ROWS) : body;
  const width = Math.max(0, ...rows.map((row) => row.length));

  const columns: Column[] = [];
  for (let c = 0; c < width; c += 1) {
    const labels = data.map((row) => row[c] ?? "");
    // A column with no data at all is not offered.
    if (labels.every((label) => label === "")) continue;
    const typed = classify(labels, dayFirst);
    columns.push({ index: c, name: (names[c] ?? "") || `Column ${columnLabel(c)}`, labels, ...typed });
  }
  return { name, columns, rowCount: data.length, header, truncated };
}
