import { loadPdf } from "@/lib/pdf/ops";

/*
 * True redaction. Covering text with a black box leaves the original glyphs in
 * the content stream, so everything underneath stays extractable. Instead we
 * rasterise each affected page through an injected renderer and swap the page
 * for its image: the marks are burned into the pixels, so the hidden content is
 * gone from the file rather than merely painted over.
 *
 * The renderer is dependency-injected so the orchestration below is testable
 * without a canvas; the browser renderer lives in `redact-render.ts`.
 */

/** A rectangle to remove, in PDF points, with a 1-based page number. */
export interface RedactionMark {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rasterised page: PNG bytes plus its unscaled size in PDF points. */
export interface RenderedPage {
  png: Uint8Array;
  width: number;
  height: number;
}

/** Rasterise one 0-based page with `marks` burned in as opaque black. */
export type RedactionRenderer = (pageIndex: number, marks: readonly RedactionMark[]) => Promise<RenderedPage>;

/**
 * A mark asked for a page that does not exist. Redaction must never silently
 * skip such a mark: publishing the unreplaced page would leak the content the
 * caller asked to remove, so the whole operation fails instead.
 */
export class RedactionRangeError extends Error {
  readonly page: number;
  readonly pageCount: number;
  constructor(page: number, pageCount: number) {
    super(`Redaction page ${page} is outside the document (1\u2013${pageCount}).`);
    this.name = "RedactionRangeError";
    this.page = page;
    this.pageCount = pageCount;
  }
}

/**
 * Replace every affected page with a rendered image and return the saved PDF.
 *
 * Marks whose page is outside the document are rejected with a
 * {@link RedactionRangeError} rather than dropped: a silently skipped mark would
 * publish a page that still contains the hidden content.
 */
export async function redactPdf(
  bytes: Uint8Array,
  marks: readonly RedactionMark[],
  render: RedactionRenderer,
): Promise<Uint8Array> {
  if (marks.length === 0) return bytes;

  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();

  const byPage = new Map<number, RedactionMark[]>();
  for (const mark of marks) {
    const index = Math.round(mark.page) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= pageCount) {
      throw new RedactionRangeError(mark.page, pageCount);
    }
    const group = byPage.get(index);
    if (group) group.push(mark);
    else byPage.set(index, [mark]);
  }

  // Defensive: with a non-empty, in-range mark set this is never reached.
  if (byPage.size === 0) return bytes;

  // Net-neutral per page (removePage then insertPage at the same index), so the
  // order does not matter; ascending keeps the output deterministic.
  const indices = [...byPage.keys()].sort((a, b) => a - b);
  for (const index of indices) {
    const rendered = await render(index, byPage.get(index)!);
    if (rendered.png.length === 0) throw new Error("redaction renderer returned an empty image");
    doc.removePage(index);
    const page = doc.insertPage(index, [rendered.width, rendered.height]);
    const image = await doc.embedPng(rendered.png);
    page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
  }

  return doc.save();
}
