import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { withBase } from "@/lib/apps/paths";

/*
 * PDF.js loader. The library and its worker are big (≈1.8 MB), so they are
 * only fetched once a PDF is actually opened. The worker, CMaps, fonts and
 * WASM decoders are same-origin files (copied into assets/pdfjs by
 * scripts/copy-pdfjs-assets.mjs), so the strict CSP needs no relaxing.
 */

export type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

export class PdfPasswordError extends Error {
  /** "needed" for a first prompt, "incorrect" after a wrong attempt. */
  readonly reason: "needed" | "incorrect";
  constructor(reason: "needed" | "incorrect") {
    super(reason === "needed" ? "This PDF is password protected." : "Incorrect PDF password.");
    this.name = "PdfPasswordError";
    this.reason = reason;
  }
}

let pdfjsPromise: Promise<PdfJs> | undefined;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })().catch((error) => {
    pdfjsPromise = undefined;
    throw error;
  });
  return pdfjsPromise;
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    // PDF.js transfers the buffer to its worker; hand it a copy.
    data: bytes.slice(),
    password,
    wasmUrl: withBase("/pdfjs/wasm/"),
    cMapUrl: withBase("/pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: withBase("/pdfjs/standard_fonts/"),
    iccUrl: withBase("/pdfjs/iccs/"),
  });
  try {
    return await task.promise;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      // pdf.js code 1 = password required, 2 = incorrect password.
      throw new PdfPasswordError((error as { code?: number }).code === 2 ? "incorrect" : "needed");
    }
    throw error;
  }
}

/** Plain text of every page, pages separated by a blank line. */
export async function pdfToText(doc: PDFDocumentProxy): Promise<string> {
  const pages: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      text += item.hasEOL ? "\n" : "";
    }
    pages.push(text.trim());
    page.cleanup();
  }
  return pages.join("\n\n");
}
