import { decodeTextBytes } from "@/lib/viewer/charset";
import { htmlToText, rowsToDelimited } from "@/lib/viewer/export";
import { resolveFileKind } from "@/lib/viewer/file-kind";
import { parseJson, prettifyJson } from "@/lib/viewer/json";
import { MAX_FILE_BYTES } from "@/lib/limits";

export type CompareFailure = "unsupported" | "password" | "tooLarge";

export class CompareError extends Error {
  readonly failure: CompareFailure;
  constructor(failure: CompareFailure, message: string) {
    super(message);
    this.name = "CompareError";
    this.failure = failure;
  }
}

/**
 * Turn any file the viewer can open into text a line diff makes sense on:
 * source text as-is, JSON pretty-printed (so layout differences vanish),
 * spreadsheets as CSV per sheet, Word and PDF as extracted text.
 */
export async function extractComparableText(file: {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new CompareError("tooLarge", "File is too large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = resolveFileKind(file.name, bytes);

  switch (kind) {
    case "text":
    case "markdown":
    case "html":
      return decodeTextBytes(bytes);

    case "json": {
      const text = decodeTextBytes(bytes);
      try {
        return prettifyJson(parseJson(text).value);
      } catch {
        return text;
      }
    }

    case "sheet": {
      const { parseWorkbook } = await import("@/lib/viewer/sheet");
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const { sheets, workbook } = await parseWorkbook({ buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, extension });
      const parts: string[] = [];
      for (const sheet of sheets) {
        let csv: string;
        if (workbook) {
          const { workbookSheetToCsv } = await import("@/lib/viewer/export");
          csv = await workbookSheetToCsv(workbook, sheet.name);
        } else {
          csv = rowsToDelimited(sheet.rows);
        }
        parts.push(sheets.length > 1 ? `## ${sheet.name}\n${csv}` : csv);
      }
      return parts.join("\n\n");
    }

    case "docx": {
      const { renderDocx } = await import("@/lib/viewer/docx");
      const { html } = await renderDocx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      return htmlToText(html);
    }

    case "pdf": {
      const { openPdf, pdfToText, PdfPasswordError } = await import("@/lib/viewer/pdf");
      try {
        const doc = await openPdf(bytes);
        try {
          return await pdfToText(doc);
        } finally {
          void doc.loadingTask.destroy();
        }
      } catch (error) {
        if (error instanceof PdfPasswordError) throw new CompareError("password", error.message);
        throw error;
      }
    }

    default:
      throw new CompareError("unsupported", "This file has no text to compare.");
  }
}
