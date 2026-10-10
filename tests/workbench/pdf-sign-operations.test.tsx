// @vitest-environment jsdom
import { deflateSync } from "node:zlib";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfSignOperation } from "@/components/workbench/operations/PdfSignOperations";
import { loadPdf } from "@/lib/pdf/ops";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { click, mount, type, waitFor } from "../helpers/dom";

/** A real one-page PDF. */
async function makePdf(): Promise<Uint8Array> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  return doc.save();
}

const pdfAsset = async () => createAssetFromBytes("doc.pdf", await makePdf(), "pdf");

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
  const view = await mount(<PdfSignOperation lang="en" assets={[await pdfAsset()]} onProduce={onProduce} />);
  await waitFor(() => expect(stampButton("text")).toBeTruthy());
  return view;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pdf.sign operation", () => {
  it("uses the supplied asset instead of its own picker", async () => {
    const view = await ready();
    expect(document.querySelector('input[type="file"][accept="application/pdf,.pdf"]')).toBeNull();
    view.unmount();
  });

  it("renders its own picker when standalone", async () => {
    const view = await mount(<PdfSignOperation lang="en" assets={[]} />);
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    view.unmount();
  });

  it("registers the pdf.sign capability", async () => {
    expect(hasOperation("pdf.sign")).toBe(true);
    expect(await loadOperation("pdf.sign")).toBeTypeOf("function");
  });
});

describe("pdf.sign operation — stamps", () => {
  it("adds a text stamp, enables Save and publishes the signed PDF", async () => {
    const onProduce = vi.fn();
    const bytesIn = await makePdf();
    const asset = await createAssetFromBytes("doc.pdf", bytesIn, "pdf");
    const view = await mount(<PdfSignOperation lang="en" assets={[asset]} onProduce={onProduce} />);
    await waitFor(() => expect(stampButton("text")).toBeTruthy());

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
    expect(output.name).toBe("doc-signed.pdf");
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
    const view = await mount(<PdfSignOperation lang="en" assets={[asset]} onProduce={onProduce} />);
    await waitFor(() => expect(stampButton("text")).toBeTruthy());

    expect(button("Save")?.disabled).toBe(true);
    await addSignatureImage(new File([makePng() as unknown as BlobPart], "sig.png", { type: "image/png" }));
    await waitFor(() => expect(document.body.textContent).toContain("sig.png"));

    await click(stampButton("image"));
    await waitFor(() => expect(button("Save")?.disabled).toBe(false));

    await click(button("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-signed.pdf");
    expect(output.type).toBe("application/pdf");

    const reloaded = await loadPdf(output.bytes);
    expect(reloaded.getPageCount()).toBe((await loadPdf(bytesIn)).getPageCount());
    expect(output.bytes).not.toEqual(bytesIn);

    await waitFor(() => expect(button("Save")?.disabled).toBe(true));
    view.unmount();
  });
});
