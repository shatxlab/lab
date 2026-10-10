// @vitest-environment jsdom
import { deflateSync } from "node:zlib";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfEditOperation } from "@/components/workbench/operations/PdfEditOperations";
import { loadPdf } from "@/lib/pdf/ops";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { click, mount, type, waitFor } from "../helpers/dom";

// True redaction needs a canvas (absent under jsdom) and a pdf.js document (its
// fake worker cannot resolve here), so the operation's two browser edges are
// stubbed: `openPdf` returns a stand-in proxy and the renderer is a plain spy.
// `redactPdf` itself stays real, exercising the whole save pipeline.
const { openPdfMock, rendererStub } = vi.hoisted(() => ({
  openPdfMock: vi.fn(async () => ({ loadingTask: { destroy: vi.fn(async () => undefined) } })),
  rendererStub: vi.fn(),
}));

vi.mock("@/lib/viewer/pdf", () => ({ openPdf: openPdfMock }));
vi.mock("@/lib/pdf/redact-render", () => ({ canvasRedactionRenderer: () => rendererStub }));

/** A real PDF with a known title, so pdf-lib can read the metadata back. */
async function makePdf(): Promise<Uint8Array> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.setTitle("Old");
  return doc.save();
}

/** A real PDF with a text field and a checkbox, so form filling can be read back. */
async function makeFormPdf(): Promise<Uint8Array> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const form = doc.getForm();
  const tf = form.createTextField("name");
  tf.setText("Old");
  tf.addToPage(page, { x: 50, y: 300, width: 200, height: 24 });
  const cb = form.createCheckBox("agree");
  cb.addToPage(page, { x: 50, y: 250, width: 20, height: 20 });
  return doc.save();
}

const pdfAsset = async () => createAssetFromBytes("doc.pdf", await makePdf(), "pdf");
const formAsset = async () => createAssetFromBytes("form.pdf", await makeFormPdf(), "pdf");

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
 * `embedPng` rejects it; this builds a real one so the stamp can be embedded.
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
  view.setUint32(0, 1); // width
  view.setUint32(4, 1); // height
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

const stampButton = (kind: "text" | "image") =>
  document.querySelector<HTMLButtonElement>(`button[data-stamp-kind="${kind}"]`) ?? undefined;

async function addSignatureImage(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
  if (!input) throw new Error("signature image input not found");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;

const field = (label: string) =>
  [...document.querySelectorAll("label")]
    .find((node) => node.textContent?.trim().startsWith(label))
    ?.querySelector("input") as HTMLInputElement;

async function ready(onProduce?: (output: { name: string; type: string; bytes: Uint8Array }) => void) {
  const view = await mount(<PdfEditOperation lang="en" assets={[await pdfAsset()]} onProduce={onProduce} />);
  await waitFor(() => expect(field("Title")?.value).toBe("Old"));
  return view;
}

afterEach(() => {
  document.body.innerHTML = "";
});

beforeEach(() => {
  rendererStub.mockReset();
  rendererStub.mockResolvedValue({ png: makePng(), width: 200, height: 300 });
  openPdfMock.mockClear();
});

describe("pdf.edit operation — document properties", () => {
  it("disables Save until the metadata changes, then publishes the edited PDF", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    expect(document.querySelector('input[type="file"][accept="application/pdf,.pdf"]')).toBeNull();
    expect(button("Save")?.disabled).toBe(true);

    await type(field("Title"), "New");
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-edited.pdf");
    expect(output.type).toBe("application/pdf");
    expect((await loadPdf(output.bytes)).getTitle()).toBe("New");

    // The saved properties become the new clean baseline.
    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });

  it("reverts the draft without publishing", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    await type(field("Title"), "Changed");
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Revert"));
    await waitFor(() => expect(field("Title").value).toBe("Old"));
    expect(button("Save")?.disabled).toBe(true);
    expect(onProduce).not.toHaveBeenCalled();
    view.unmount();
  });

  it("renders its own picker when standalone", async () => {
    const view = await mount(<PdfEditOperation lang="en" assets={[]} />);
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    view.unmount();
  });

  it("registers the pdf.edit capability", async () => {
    expect(hasOperation("pdf.edit")).toBe(true);
    expect(await loadOperation("pdf.edit")).toBeTypeOf("function");
  });
});

describe("pdf.edit operation — form fields", () => {
  it("keeps Save disabled for an unmodified form, then fills and publishes it", async () => {
    const onProduce = vi.fn();
    const view = await mount(<PdfEditOperation lang="en" assets={[await formAsset()]} onProduce={onProduce} />);
    await waitFor(() => expect(field("name")?.value).toBe("Old"));

    // A form with no edits is clean: Save stays disabled.
    expect(button("Save")?.disabled).toBe(true);

    await type(field("name"), "New");
    await click(field("agree"));
    await waitFor(() => expect(field("agree")?.checked).toBe(true));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("form-edited.pdf");
    expect(output.type).toBe("application/pdf");

    const out = await loadPdf(output.bytes);
    const f = out.getForm();
    expect(f.getTextField("name").getText()).toBe("New");
    expect(f.getCheckBox("agree").isChecked()).toBe(true);

    // The applied values become the new clean baseline.
    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });

  it("flattens form fields on demand", async () => {
    const onProduce = vi.fn();
    const view = await mount(<PdfEditOperation lang="en" assets={[await formAsset()]} onProduce={onProduce} />);
    await waitFor(() => expect(field("name")?.value).toBe("Old"));

    await click(field("Flatten"));
    await waitFor(() => expect(field("Flatten")?.checked).toBe(true));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { type: string; bytes: Uint8Array };
    expect(output.type).toBe("application/pdf");
    expect((await loadPdf(output.bytes)).getForm().getFields()).toHaveLength(0);

    // The flattened form is gone from the editor too.
    await waitFor(() => expect(field("name")).toBeUndefined());
    expect(button("Save")?.disabled).toBe(true);
    view.unmount();
  });
});

describe("pdf.edit operation — stamps", () => {
  it("adds a text stamp, enables Save and publishes the edited PDF", async () => {
    const onProduce = vi.fn();
    const bytesIn = await makePdf();
    const asset = await createAssetFromBytes("doc.pdf", bytesIn, "pdf");
    const view = await mount(<PdfEditOperation lang="en" assets={[asset]} onProduce={onProduce} />);
    await waitFor(() => expect(field("Title")?.value).toBe("Old"));

    // A fresh document is clean: Save stays disabled until a stamp is queued.
    expect(button("Save")?.disabled).toBe(true);

    expect(field("Text")).toBeTruthy();
    expect(stampButton("text")).toBeTruthy();
    await type(field("Text"), "SIGNED");
    await click(stampButton("text"));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-edited.pdf");
    expect(output.type).toBe("application/pdf");

    // `pdfToText` cannot run here: pdf.js cannot resolve its fake worker under
    // jsdom (`Cannot find module .../pdf.worker.min.mjs`). Assert the weaker but
    // reliable contract instead: the output re-loads with the same page count
    // and its bytes differ from the input (the stamp was actually written).
    const reloaded = await loadPdf(output.bytes);
    expect(reloaded.getPageCount()).toBe((await loadPdf(bytesIn)).getPageCount());
    expect(output.bytes).not.toEqual(bytesIn);

    // The queue is consumed, so the document is clean again.
    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });

  it("combines several stamps and removes one from the queue", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    await type(field("Text"), "FIRST");
    await click(stampButton("text"));
    await type(field("Text"), "SECOND");
    await click(stampButton("text"));
    await waitFor(() => expect(document.querySelectorAll("button").length).toBeGreaterThan(0));
    expect(document.body.textContent).toContain("FIRST");
    expect(document.body.textContent).toContain("SECOND");

    // Removing the first stamp keeps the queue dirty through the second one.
    const remove = button("Remove stamp");
    await click(remove);
    await waitFor(() => expect(document.body.textContent).not.toContain("FIRST"));
    expect(button("Save")?.disabled).toBe(false);
    view.unmount();
  });

  it("stages a signature image and publishes a reloadable PDF", async () => {
    const onProduce = vi.fn();
    const bytesIn = await makePdf();
    const asset = await createAssetFromBytes("doc.pdf", bytesIn, "pdf");
    const view = await mount(<PdfEditOperation lang="en" assets={[asset]} onProduce={onProduce} />);
    await waitFor(() => expect(field("Title")?.value).toBe("Old"));

    expect(button("Save")?.disabled).toBe(true);
    await addSignatureImage(new File([makePng() as unknown as BlobPart], "sig.png", { type: "image/png" }));
    await waitFor(() => expect(document.body.textContent).toContain("sig.png"));

    await click(stampButton("image"));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-edited.pdf");
    expect(output.type).toBe("application/pdf");

    const reloaded = await loadPdf(output.bytes);
    expect(reloaded.getPageCount()).toBe((await loadPdf(bytesIn)).getPageCount());
    expect(output.bytes).not.toEqual(bytesIn);

    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });
});

describe("pdf.edit operation — redaction", () => {
  it("rasterises pending redactions and publishes the redacted PDF", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    expect(button("Save")?.disabled).toBe(true);
    await click(button("Add redaction"));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    // The real `redactPdf` ran through the stubbed browser edges exactly once.
    expect(openPdfMock).toHaveBeenCalledTimes(1);
    expect(rendererStub).toHaveBeenCalledTimes(1);
    expect(rendererStub.mock.calls[0]![0]).toBe(0);

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-edited.pdf");
    expect(output.type).toBe("application/pdf");
    expect((await loadPdf(output.bytes)).getPageCount()).toBe(1);

    // The queue is consumed, so the document is clean again.
    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });

  it("does not publish and surfaces an error when the renderer fails", async () => {
    rendererStub.mockRejectedValueOnce(new Error("no canvas"));
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    await click(button("Add redaction"));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(document.body.textContent).toContain("no canvas"));

    // The safety guarantee: a failed redaction never produces an output.
    expect(onProduce).not.toHaveBeenCalled();
    expect(openPdfMock).toHaveBeenCalledTimes(1);
    // Save stays available so the user can retry.
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));
    view.unmount();
  });
});
