import type { PDFDocument } from "@cantoo/pdf-lib";

import { MAX_FILE_BYTES } from "@/lib/limits";

/*
 * PDF editing on top of pdf-lib (the maintained @cantoo fork, which also
 * reads password-protected files). The library is loaded on demand — it is
 * only needed once someone actually edits a PDF.
 */

type PdfLib = typeof import("@cantoo/pdf-lib");

let libPromise: Promise<PdfLib> | undefined;
function lib(): Promise<PdfLib> {
  libPromise ??= import("@cantoo/pdf-lib");
  return libPromise;
}

export type PdfErrorCode = "tooLarge" | "needsPassword" | "wrongPassword" | "invalid";

export class PdfOpError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PdfOpError";
    this.code = code;
  }
}

/** Load a PDF, translating the library's failures into the few states the UI handles. */
export async function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  if (bytes.length > MAX_FILE_BYTES) throw new PdfOpError("tooLarge");
  const { PDFDocument } = await lib();
  // `updateMetadata: false` keeps pdf-lib from stamping its own producer/dates onto the file.
  try {
    return await PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch (error) {
    const encrypted = error instanceof Error && /encrypt/i.test(error.message + error.constructor.name);
    if (encrypted && password === undefined) throw new PdfOpError("needsPassword");
    if (password !== undefined) {
      // A wrong password surfaces as an assorted parser/crypto error; the file
      // was already known to be encrypted (the caller only passes one then).
      throw new PdfOpError("wrongPassword");
    }
    throw new PdfOpError("invalid", error instanceof Error ? error.message : String(error));
  }
}

export interface PdfSource {
  bytes: Uint8Array;
  password?: string;
}

export async function countPages(source: PdfSource): Promise<number> {
  return (await loadPdf(source.bytes, source.password)).getPageCount();
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

/** Build a PDF from `pages` (1-based, in order) of one source. */
export async function extractPages(source: PdfSource, pages: readonly number[]): Promise<Uint8Array> {
  return mergePdfs([{ ...source, pages }]);
}

export interface MergePart extends PdfSource {
  /** 1-based pages to take; `null` takes every page. */
  pages: readonly number[] | null;
}

export async function mergePdfs(parts: readonly MergePart[]): Promise<Uint8Array> {
  const { PDFDocument } = await lib();
  const output = await PDFDocument.create({ updateMetadata: false });
  for (const part of parts) {
    const source = await loadPdf(part.bytes, part.password);
    const indices = part.pages ? part.pages.map((page) => page - 1) : source.getPageIndices();
    const copied = await output.copyPages(source, indices);
    for (const page of copied) output.addPage(page);
  }
  return save(output);
}

export interface PagePlan {
  /** 0-based index of the page in the source. */
  source: number;
  /** Extra clockwise rotation in degrees (multiple of 90). */
  rotate: number;
}

/** Re-order, rotate and drop pages: only the pages in `plan` are kept, in that order. */
export async function organizePdf(source: PdfSource, plan: readonly PagePlan[]): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await lib();
  const input = await loadPdf(source.bytes, source.password);
  const output = await PDFDocument.create({ updateMetadata: false });
  const copied = await output.copyPages(input, plan.map((entry) => entry.source));
  copied.forEach((page, index) => {
    const extra = plan[index]!.rotate;
    if (extra % 360 !== 0) page.setRotation(degrees((((page.getRotation().angle + extra) % 360) + 360) % 360));
    output.addPage(page);
  });
  return save(output);
}
