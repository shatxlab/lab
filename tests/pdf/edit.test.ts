// @vitest-environment jsdom
import { deflateSync } from "node:zlib";
import { PDFDict, PDFName, type PDFPage } from "@cantoo/pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { redactPdf, type RedactionMark, type RenderedPage } from "@/lib/pdf/edit";
import { loadPdf } from "@/lib/pdf/ops";

/*
 * True redaction: the page is replaced by a raster with the marks burned in, so
 * the covered content is gone from the file rather than merely painted over.
 * `redactPdf` is deliberately renderer-agnostic, so the tests drive it with a
 * stub that returns a real (decodable) PNG — no canvas required under jsdom.
 */

/** A real PDF where each page carries a label, so page identity is checkable. */
async function makePdf(labels: string[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((label) => {
    doc.addPage([200, 300]).drawText(label, { x: 20, y: 150, size: 18, font });
  });
  return doc.save();
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A genuinely valid 1×1 RGBA PNG. `tests/image/fixtures.buildPng` documents PNG
 * metadata but its IDAT payload is not a decodable zlib stream, so pdf-lib's
 * `embedPng` rejects it; this builds a real one.
 */
function makePng(): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(type);
    const body = new Uint8Array(typeBytes.length + data.length);
    body.set(typeBytes);
    body.set(data, typeBytes.length);
    const out = new Uint8Array(8 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(4 + body.length, crc32(body));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(new Uint8Array([0, 0, 0, 0, 0]))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const mark = (over: Partial<RedactionMark> = {}): RedactionMark => ({
  id: "m1",
  page: 2,
  x: 10,
  y: 20,
  width: 60,
  height: 30,
  ...over,
});

const stubRenderer = () =>
  vi.fn(async (_pageIndex: number, _marks: readonly RedactionMark[]): Promise<RenderedPage> => ({
    png: makePng(),
    width: 200,
    height: 300,
  }));

/** Number of image XObjects a page draws; a replaced page has exactly one. */
function imageXObjects(page: PDFPage): number {
  const xobj = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
  return xobj ? xobj.keys().length : 0;
}

describe("redactPdf", () => {
  it("rasterises the affected page and replaces it with the rendered image", async () => {
    const bytes = await makePdf(["one", "two"]);
    const render = stubRenderer();

    const out = await redactPdf(bytes, [mark()], render);

    expect(render).toHaveBeenCalledTimes(1);
    const [pageIndex, marks] = render.mock.calls[0]!;
    expect(pageIndex).toBe(1);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ page: 2, x: 10, y: 20, width: 60, height: 30 });

    const doc = await loadPdf(out);
    expect(doc.getPageCount()).toBe(2);
    // The affected page now draws an image XObject; the untouched page does not.
    expect(imageXObjects(doc.getPage(1))).toBe(1);
    expect(imageXObjects(doc.getPage(0))).toBe(0);
    expect(out).not.toEqual(bytes);
  });

  it("groups several marks on the same page into one render call", async () => {
    const render = stubRenderer();

    await redactPdf(
      await makePdf(["one", "two"]),
      [mark(), mark({ id: "m2", x: 1, y: 2, width: 3, height: 4 })],
      render,
    );

    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![1]).toHaveLength(2);
  });

  it("replaces each affected page in place, keeping the page count", async () => {
    const render = stubRenderer();

    const out = await redactPdf(await makePdf(["a", "b", "c"]), [mark({ page: 1 }), mark({ id: "m3", page: 3 })], render);

    expect(render).toHaveBeenCalledTimes(2);
    const doc = await loadPdf(out);
    expect(doc.getPageCount()).toBe(3);
    expect(imageXObjects(doc.getPage(0))).toBe(1);
    expect(imageXObjects(doc.getPage(1))).toBe(0);
    expect(imageXObjects(doc.getPage(2))).toBe(1);
  });

  it("refuses out-of-range marks instead of silently publishing an unredacted page", async () => {
    const bytes = await makePdf(["one", "two"]);
    const render = stubRenderer();

    await expect(redactPdf(bytes, [mark({ page: 9 }), mark({ id: "m0", page: 0 })], render)).rejects.toThrow(
      /outside the document/,
    );
    expect(render).not.toHaveBeenCalled();
  });

  it("returns the input without invoking the renderer when there are no marks", async () => {
    const bytes = await makePdf(["one", "two"]);
    const render = stubRenderer();

    expect(await redactPdf(bytes, [], render)).toBe(bytes);
    expect(render).not.toHaveBeenCalled();
  });
});
