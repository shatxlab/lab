import TurndownService from "turndown";

import type { RawWorkbook, SheetData } from "@/lib/viewer/sheet";
import { serializeWorkbook, type SheetJsWriter } from "@/lib/viewer/sheet-edit";

/*
 * Conversions behind the viewer's "Export" menu. Everything is pure or lazily
 * imports SheetJS, so it runs (and is tested) without any UI.
 */

type Cell = string | number | boolean | null | undefined;

/** RFC 4180 quoting: wrap when a cell holds the delimiter, a quote or a newline. */
export function rowsToDelimited(rows: readonly (readonly Cell[])[], delimiter = ","): string {
  const escape = (cell: Cell): string => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(escape).join(delimiter)).join("\r\n");
}

/** Used only for sheets with no backing workbook (HTML tables); rows may be capped. */
export function sheetDataToCsv(sheet: SheetData): string {
  return rowsToDelimited(sheet.rows);
}

type SheetJs = typeof import("xlsx");

async function loadXlsx(): Promise<SheetJs> {
  return import("xlsx");
}

export async function workbookSheetToCsv(workbook: RawWorkbook, sheetName: string): Promise<string> {
  const XLSX = await loadXlsx();
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return "";
  return XLSX.utils.sheet_to_csv(sheet as never);
}

/** Array of objects keyed by the first row; blanks become null. */
export async function workbookSheetToJson(workbook: RawWorkbook, sheetName: string): Promise<string> {
  const XLSX = await loadXlsx();
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return "[]";
  return JSON.stringify(XLSX.utils.sheet_to_json(sheet as never, { defval: null }), null, 2);
}

export function sheetDataToJson(sheet: SheetData): string {
  const [header = [], ...body] = sheet.rows;
  const keys = uniqueKeys(header);
  return JSON.stringify(
    body.map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index] === "" ? null : (row[index] ?? null)]))),
    null,
    2,
  );
}

function uniqueKeys(header: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((raw, index) => {
    const base = raw.trim() || `column${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export async function workbookToXlsx(workbook: RawWorkbook): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  return serializeWorkbook(XLSX as unknown as SheetJsWriter, workbook, "xlsx");
}

/** Build a one-sheet workbook from displayed rows (for sheets with no workbook). */
export async function rowsToXlsx(sheets: readonly SheetData[]): Promise<Uint8Array> {
  const XLSX = await loadXlsx();
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name.slice(0, 31) || "Sheet1");
  }
  return serializeWorkbook(XLSX as unknown as SheetJsWriter, book as unknown as RawWorkbook, "xlsx");
}

/* -------------------------------------------------------------- HTML → text */

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p",
  "pre", "section", "table", "tr", "ul",
]);

/** Markup that is already sanitized (the viewer only ever passes DOMPurify output). */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function htmlToText(html: string): string {
  const doc = parseHtml(html);
  let out = "";

  const newline = (count = 1) => {
    if (out === "") return;
    out = out.replace(/[ \t]+$/, "");
    const trailing = /\n*$/.exec(out)?.[0].length ?? 0;
    if (trailing < count) out += "\n".repeat(count - trailing);
  };

  const walk = (node: Node, inPre: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      if (inPre) out += text;
      else {
        const collapsed = text.replace(/\s+/g, " ");
        // No leading space at the start of a line.
        out += out === "" || out.endsWith("\n") ? collapsed.replace(/^ /, "") : collapsed;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    if (tag === "br") {
      out += "\n";
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) newline(tag === "li" || tag === "tr" ? 1 : 2);
    if (tag === "li") out += "• ";
    const children = Array.from(element.childNodes);
    children.forEach((child, index) => {
      walk(child, inPre || tag === "pre");
      if ((tag === "tr") && index < children.length - 1 && (child as Element).tagName?.match(/^T[DH]$/i)) out += "\t";
    });
    if (block) newline(tag === "li" || tag === "tr" ? 1 : 2);
  };

  walk(doc.body, false);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/* ----------------------------------------------------------- HTML → Markdown */

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) =>
      (cell.textContent ?? "").replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim(),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill("")];
  const line = (row: string[]) => `| ${pad(row).join(" | ")} |`;
  const [head = [], ...body] = rows;
  return `\n\n${[line(head), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(line)].join("\n")}\n\n`;
}

export function htmlToMarkdown(html: string): string {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  service.addRule("table", {
    filter: "table",
    replacement: (_content, node) => tableToMarkdown(node as HTMLTableElement),
  });
  service.remove(["script", "style"]);
  return service.turndown(parseHtml(html).body.innerHTML).trim();
}

/* --------------------------------------------------------------- standalone */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STANDALONE_CSS = `body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:16px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2328}
h1,h2,h3{line-height:1.25}h2{border-bottom:1px solid #d0d7de;padding-bottom:.3em}
pre{overflow:auto;padding:1rem;background:#f6f8fa;border-radius:6px}code{font-family:ui-monospace,Menlo,Consolas,monospace}
table{border-collapse:collapse}td,th{border:1px solid #d0d7de;padding:.35rem .7rem}th{background:#f6f8fa}
blockquote{margin-left:0;padding-left:1rem;border-left:4px solid #d0d7de;color:#57606a}img{max-width:100%}`;

/** A self-contained HTML document around already-sanitized body markup. */
export function standaloneHtml(title: string, bodyHtml: string, lang = "en"): string {
  return `<!doctype html>\n<html lang="${escapeHtml(lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n<style>${STANDALONE_CSS}</style>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>\n`;
}

/** `report.q1.xlsx` → `report.q1`; a name without an extension stays whole. */
export function baseFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
