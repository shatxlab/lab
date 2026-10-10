import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { RedactionMark, RedactionRenderer, RenderedPage } from "@/lib/pdf/edit";

/*
 * Browser renderer for true redaction. Each affected page is drawn into an
 * offscreen canvas and the marks are filled in as opaque black, so the raster
 * that replaces the page no longer contains the covered glyphs. Kept separate
 * from `edit.ts` so the orchestration there can be tested without a DOM.
 */

export type RedactionRenderErrorCode = "noDocument" | "noContext" | "encodeFailed";

/** Typed failure so callers can tell a missing canvas from a render failure. */
export class RedactionRenderError extends Error {
  readonly code: RedactionRenderErrorCode;
  constructor(code: RedactionRenderErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RedactionRenderError";
    this.code = code;
  }
}

/** Rasterise at 2× so the surviving page stays legible. */
const RENDER_SCALE = 2;

interface PointViewport {
  convertToViewportPoint(x: number, y: number): number[];
}

/**
 * Map a PDF-coordinate rectangle to its canvas rectangle. pdfjs 6 removed
 * `convertToViewportRectangle`, so map two opposite corners through
 * `convertToViewportPoint` and take their bounding box (rotation is always a
 * multiple of 90°, so the result stays axis-aligned).
 */
function toCanvasRect(viewport: PointViewport, mark: RedactionMark) {
  const [ax, ay] = viewport.convertToViewportPoint(mark.x, mark.y + mark.height);
  const [bx, by] = viewport.convertToViewportPoint(mark.x + mark.width, mark.y);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new RedactionRenderError("encodeFailed", "This browser cannot encode canvas images."));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new RedactionRenderError("encodeFailed", "The canvas produced no PNG data."));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png");
  });
}

/** Render affected pages of an opened pdf.js document with the marks baked in. */
export function canvasRedactionRenderer(pdf: PDFDocumentProxy): RedactionRenderer {
  return async (pageIndex, marks) => {
    if (typeof document === "undefined") {
      throw new RedactionRenderError("noDocument", "No DOM available to rasterise the page.");
    }
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const unscaled = page.getViewport({ scale: 1 });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new RedactionRenderError("noContext", "Could not get a 2D canvas context.");

    await page.render({ canvasContext: context, canvas, viewport }).promise;

    context.fillStyle = "#000000";
    for (const mark of marks) {
      const rect = toCanvasRect(viewport, mark);
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    const png = await encodePng(canvas);
    page.cleanup();
    return { png, width: unscaled.width, height: unscaled.height } satisfies RenderedPage;
  };
}
