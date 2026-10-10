import { decodeMarkupBytes, decodeTextBytes } from "@/lib/viewer/charset";
import type { FileKind } from "@/lib/viewer/file-kind";
import { parseJson } from "@/lib/viewer/json";
import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";
import { parseWorkbook, type RawWorkbook, type SheetData } from "@/lib/viewer/sheet";

/** Everything between <body> tags (or the whole markup when there are none). */
function htmlBodyMarkup(source: string): string {
  const body = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(source)?.[1] ?? source;
  return body
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, "")
    .replace(/<title[\s>][\s\S]*?<\/title>/gi, "");
}

export type LoadedDocument =
  | { kind: "markdown"; html: string; source: string }
  | { kind: "html"; html: string; source: string }
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; extension: string }
  | { kind: "docx"; html: string; warnings: string[] }
  | { kind: "sheet"; sheets: SheetData[]; workbook: RawWorkbook | null }
  | { kind: "text"; text: string }
  | { kind: "json"; value: unknown; warnings: string[] };

export async function loadDocument(
  buffer: ArrayBuffer,
  kind: Exclude<FileKind, "legacy-doc" | "unsupported">,
  extension: string,
): Promise<LoadedDocument> {
  const bytes = new Uint8Array(buffer);

  if (kind === "markdown") {
    const { renderMarkdown } = await import("@/lib/viewer/markdown");
    const source = decodeTextBytes(bytes);
    return { kind: "markdown", html: renderMarkdown(source), source };
  }

  if (kind === "html") {
    const source = decodeMarkupBytes(bytes);
    return { kind: "html", html: sanitizeDocumentHtml(htmlBodyMarkup(source)), source };
  }

  if (kind === "pdf") {
    return { kind: "pdf", bytes };
  }

  if (kind === "image") {
    return { kind: "image", bytes, extension };
  }

  if (kind === "text") {
    return { kind: "text", text: decodeTextBytes(bytes) };
  }

  if (kind === "json") {
    // decodeTextBytes first: a JSON export saved as UTF-16 must still open.
    const { value, warnings } = parseJson(decodeTextBytes(bytes));
    return { kind: "json", value, warnings };
  }

  if (kind === "sheet") {
    const workbook = await parseWorkbook({ buffer, extension });
    return { kind: "sheet", sheets: workbook.sheets, workbook: workbook.workbook };
  }

  const { renderDocx } = await import("@/lib/viewer/docx");
  const { html, warnings } = await renderDocx(buffer);
  return { kind: "docx", html, warnings };
}
