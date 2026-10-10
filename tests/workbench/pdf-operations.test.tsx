// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PdfMergeOperation,
  PdfSplitOperation,
} from "@/components/workbench/operations/PdfOperations";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { click, mount, type, waitFor } from "../helpers/dom";

vi.mock("@/lib/viewer/pdf", () => ({
  openPdf: vi.fn(async () => ({
    numPages: 3,
    getPage: async () => ({
      getViewport: () => ({ width: 100, height: 140, scale: 1 }),
      render: () => ({ promise: Promise.resolve(), cancel() {} }),
      cleanup() {},
    }),
    loadingTask: { destroy: vi.fn() },
  })),
}));

async function makePdf(labels: string[], password?: string): Promise<Uint8Array> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  labels.forEach((_, index) => doc.addPage([200 + index * 10, 300]));
  if (password) doc.encrypt({ userPassword: password, ownerPassword: `${password}-o`, permissions: {} });
  return doc.save();
}

/** A workbench PDF asset backed by real bytes so pdf-lib can read it. */
const pdfAsset = async (name: string, labels: string[]) =>
  createAssetFromBytes(name, await makePdf(labels), "pdf");

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("workbench PDF operations", () => {
  it("lists the supplied PDF assets and hides its own picker", async () => {
    const view = await mount(
      <PdfMergeOperation lang="en" assets={[await pdfAsset("a.pdf", ["1", "2"]), await pdfAsset("b.pdf", ["1"])]} />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("a.pdf"));
    expect(document.body.textContent).toContain("b.pdf");
    expect(document.body.textContent).toContain("2 pages");
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeNull());
    view.unmount();
  });

  it("publishes the merged PDF through onProduce", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <PdfMergeOperation
        lang="en"
        assets={[await pdfAsset("a.pdf", ["1", "2"]), await pdfAsset("b.pdf", ["1"])]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("2 pages"));
    await click(button("Merge"));
    await waitFor(() => expect(onProduce).toHaveBeenCalled());
    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("merged.pdf");
    expect(output.type).toBe("application/pdf");
    expect(output.bytes.length).toBeGreaterThan(0);
    view.unmount();
  });

  it("accepts a supplied single PDF asset in split without a picker", async () => {
    const view = await mount(
      <PdfSplitOperation lang="en" assets={[await pdfAsset("doc.pdf", ["1", "2", "3", "4"])]} />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("4 pages"));
    expect(document.body.textContent).toContain("doc.pdf");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("publishes a split file through onProduce", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <PdfSplitOperation
        lang="en"
        assets={[await pdfAsset("doc.pdf", ["1", "2", "3"])]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("3 pages"));
    await type(document.querySelector('input[placeholder="1-3, 7"]'), "1");
    await click(button("Split"));
    await waitFor(() => expect(onProduce).toHaveBeenCalled());
    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("doc-1.pdf");
    expect(output.type).toBe("application/pdf");
    expect(output.bytes.length).toBeGreaterThan(0);
    view.unmount();
  });

  it("registers the PDF capabilities", async () => {
    expect(hasOperation("pdf.merge")).toBe(true);
    expect(hasOperation("pdf.split")).toBe(true);
    expect(await loadOperation("pdf.merge")).toBeTypeOf("function");
  });
});
