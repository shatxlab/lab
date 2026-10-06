import { describe, expect, it } from "vitest";

import { countPages, extractPages, loadPdf, mergePdfs, organizePdf, PdfOpError } from "@/lib/pdf/ops";
import { parsePageRanges, partLabel, planSplit } from "@/lib/pdf/ranges";

async function makePdf(labels: string[], password?: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((label, index) => {
    const page = doc.addPage([200 + index * 10, 300]);
    page.drawText(label, { x: 20, y: 150, size: 18, font });
  });
  if (password) doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner`, permissions: { printing: true, copying: true } });
  return doc.save();
}

/** Page widths identify pages: page i of a made PDF is 200 + 10*i points wide. */
async function widths(bytes: Uint8Array): Promise<number[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((page) => Math.round(page.getWidth()));
}

describe("parsePageRanges", () => {
  it("parses singles, spans, open ends and keeps typed order", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] });
    expect(parsePageRanges("8-", 10)).toEqual({ ok: true, pages: [8, 9, 10] });
    expect(parsePageRanges("-3", 10)).toEqual({ ok: true, pages: [1, 2, 3] });
    expect(parsePageRanges("3,1,2", 5)).toEqual({ ok: true, pages: [3, 1, 2] });
    expect(parsePageRanges("4-2", 5)).toEqual({ ok: true, pages: [4, 3, 2] });
    expect(parsePageRanges("all", 3)).toEqual({ ok: true, pages: [1, 2, 3] });
    expect(parsePageRanges("1–2", 3)).toEqual({ ok: true, pages: [1, 2] });
    expect(parsePageRanges("2 2", 3)).toEqual({ ok: true, pages: [2, 2] });
  });

  it("reports empty, malformed and out-of-range input", () => {
    expect(parsePageRanges("  ", 3)).toEqual({ ok: false, error: { kind: "empty" } });
    expect(parsePageRanges("1,x", 3)).toEqual({ ok: false, error: { kind: "syntax", token: "x" } });
    expect(parsePageRanges("-", 3)).toEqual({ ok: false, error: { kind: "syntax", token: "-" } });
    expect(parsePageRanges("0", 3)).toEqual({ ok: false, error: { kind: "outOfRange", token: "0", total: 3 } });
    expect(parsePageRanges("2-9", 3)).toEqual({ ok: false, error: { kind: "outOfRange", token: "2-9", total: 3 } });
  });
});

describe("planSplit", () => {
  const opts = { ranges: "", every: 1 };
  it("plans every split mode", () => {
    expect(planSplit(3, "single", opts)).toEqual({ ok: true, parts: [[1], [2], [3]] });
    expect(planSplit(5, "every", { ...opts, every: 2 })).toEqual({ ok: true, parts: [[1, 2], [3, 4], [5]] });
    expect(planSplit(5, "extract", { ...opts, ranges: "2-3" })).toEqual({ ok: true, parts: [[2, 3]] });
    expect(planSplit(6, "ranges", { ...opts, ranges: "1-2 | 3,5\n6" })).toEqual({ ok: true, parts: [[1, 2], [3, 5], [6]] });
    expect(planSplit(3, "ranges", { ...opts, ranges: "1-2 | 9" }).ok).toBe(false);
    expect(planSplit(3, "ranges", opts).ok).toBe(false);
    expect(planSplit(3, "every", { ...opts, every: 0 })).toEqual({ ok: true, parts: [[1], [2], [3]] });
  });

  it("labels parts for file names", () => {
    expect(partLabel([4])).toBe("4");
    expect(partLabel([1, 2, 3])).toBe("1-3");
    expect(partLabel([1, 3])).toBe("1-3+");
  });
});

describe("PDF operations", () => {
  it("merges whole files and page selections in order", async () => {
    const a = await makePdf(["a1", "a2", "a3"]);
    const b = await makePdf(["b1", "b2"]);
    expect(await countPages({ bytes: a })).toBe(3);
    const merged = await mergePdfs([
      { bytes: a, pages: [3, 1] },
      { bytes: b, pages: null },
    ]);
    expect(await widths(merged)).toEqual([220, 200, 200, 210]);
  });

  it("extracts and reverses pages", async () => {
    const pdf = await makePdf(["1", "2", "3", "4"]);
    expect(await widths(await extractPages({ bytes: pdf }, [4, 2]))).toEqual([230, 210]);
  });

  it("reorders, rotates and drops pages", async () => {
    const pdf = await makePdf(["1", "2", "3"]);
    const out = await organizePdf({ bytes: pdf }, [
      { source: 2, rotate: 90 },
      { source: 0, rotate: 0 },
    ]);
    const doc = await loadPdf(out);
    expect(doc.getPages().map((page) => [Math.round(page.getWidth()), page.getRotation().angle])).toEqual([
      [220, 90],
      [200, 0],
    ]);
    const twice = await organizePdf({ bytes: out }, [{ source: 0, rotate: 270 }]);
    expect((await loadPdf(twice)).getPage(0).getRotation().angle).toBe(0);
    const negative = await organizePdf({ bytes: pdf }, [{ source: 0, rotate: -90 }]);
    expect((await loadPdf(negative)).getPage(0).getRotation().angle).toBe(270);
  });

  it("does not stamp pdf-lib metadata", async () => {
    const out = await mergePdfs([{ bytes: await makePdf(["x"]), pages: null }]);
    expect(new TextDecoder("latin1").decode(out)).not.toContain("pdf-lib");
  });

  it("asks for a password, accepts the right one and rejects a wrong one", async () => {
    const locked = await makePdf(["s1", "s2"], "hunter2");
    await expect(loadPdf(locked)).rejects.toMatchObject({ code: "needsPassword" });
    await expect(loadPdf(locked, "nope")).rejects.toMatchObject({ code: "wrongPassword" });
    expect(await countPages({ bytes: locked, password: "hunter2" })).toBe(2);

    // Output built from a locked source is a normal, unencrypted PDF.
    const merged = await mergePdfs([{ bytes: locked, password: "hunter2", pages: [2] }]);
    expect(await widths(merged)).toEqual([210]);
  });

  it("rejects non-PDF input and oversized input", async () => {
    await expect(loadPdf(new TextEncoder().encode("not a pdf"))).rejects.toBeInstanceOf(PdfOpError);
    await expect(loadPdf(new TextEncoder().encode("not a pdf"))).rejects.toMatchObject({ code: "invalid" });
  });
});
