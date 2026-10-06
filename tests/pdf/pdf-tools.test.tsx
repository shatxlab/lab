// @vitest-environment jsdom
import { unzipSync } from "fflate";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PdfTools from "@/components/tools/PdfTools";
import { loadPdf } from "@/lib/pdf/ops";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

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

const widths = async (blob: Blob) => (await loadPdf(new Uint8Array(await blob.arrayBuffer()))).getPages().map((page) => Math.round(page.getWidth()));

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  const blobs = new Map<string, Blob>();
  let counter = 0;
  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:pdf-${(counter += 1)}`;
    blobs.set(url, blob);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
});

const pdfFile = async (name: string, labels: string[], password?: string) => new File([(await makePdf(labels, password)) as unknown as BlobPart], name, { type: "application/pdf" });
const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name) as HTMLElement;
const button = (text: string) => [...document.querySelectorAll("button:not([role=tab])")].find((b) => b.textContent?.trim() === text) as HTMLElement;
const byLabel = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const field = (label: string) => [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector("input, textarea, select") as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;

async function addFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("PdfTools — merge", () => {
  it("merges in the chosen order with a page selection", async () => {
    const view = await mount(<PdfTools />);
    await addFiles([await pdfFile("a.pdf", ["1", "2", "3"]), await pdfFile("b.pdf", ["1", "2"])]);
    await waitFor(() => expect(document.body.textContent).toContain("3 pages"));
    expect(document.body.textContent).toContain("2 pages");
    expect(await axeViolations()).toEqual([]);

    await click(byLabel("Move b.pdf up"));
    await type(document.querySelectorAll<HTMLInputElement>('input[placeholder^="All pages"]')[1]!, "3,1");
    await click(button("Merge"));
    await waitFor(() => expect(document.body.textContent).toContain("Merged 4 pages"));
    await click(button("Download"));
    expect(downloads.map((d) => d.name)).toEqual(["merged.pdf"]);
    expect(await widths(downloads[0]!.blob)).toEqual([200, 210, 220, 200]);
    view.unmount();
  });

  it("validates page ranges before merging", async () => {
    const view = await mount(<PdfTools />);
    await addFiles([await pdfFile("a.pdf", ["1", "2"]), await pdfFile("b.pdf", ["1"])]);
    await waitFor(() => expect(document.body.textContent).toContain("2 pages"));
    await type(document.querySelector<HTMLInputElement>('input[placeholder^="All pages"]'), "9");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("outside this document (2 pages)");
    expect((button("Merge") as HTMLButtonElement).disabled).toBe(true);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("rejects non-PDF files and broken PDFs, and unlocks protected ones", async () => {
    const view = await mount(<PdfTools />);
    await addFiles([new File(["x"], "notes.txt"), new File(["not really a pdf"], "bad.pdf", { type: "application/pdf" })]);
    await waitFor(() => expect(document.body.textContent).toContain("bad.pdf could not be read as a PDF"));
    expect(document.body.textContent).toContain("Only PDF files can be added here");

    await addFiles([await pdfFile("secret.pdf", ["1", "2"], "pw123")]);
    await waitFor(() => expect(document.body.textContent).toContain("secret.pdf is password protected"));
    await type(field("Password"), "wrong");
    await click(button("Unlock"));
    await waitFor(() => expect(document.body.textContent).toContain("That password is incorrect"));
    await type(field("Password"), "pw123");
    await click(button("Unlock"));
    await waitFor(() => expect(document.body.textContent).toContain("2 pages"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("PdfTools — split", () => {
  it("extracts a page range into one file", async () => {
    const view = await mount(<PdfTools />);
    await click(tab("Split"));
    await addFiles([await pdfFile("doc.pdf", ["1", "2", "3", "4"])]);
    await waitFor(() => expect(document.body.textContent).toContain("4 pages"));
    await type(field("Pages to extract"), "4,2");
    await click(button("Split"));
    await waitFor(() => expect(document.body.textContent).toContain("Created 1 file"));
    await click(button("Download"));
    expect(downloads[0]!.name).toBe("doc-4-2+.pdf");
    expect(await widths(downloads[0]!.blob)).toEqual([230, 210]);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("splits into a zip with one file per part", async () => {
    const view = await mount(<PdfTools />);
    await click(tab("Split"));
    await addFiles([await pdfFile("doc.pdf", ["1", "2", "3", "4", "5"])]);
    await waitFor(() => expect(document.body.textContent).toContain("5 pages"));
    await act(async () => {
      const select = field("Split method");
      select.value = "every";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type(field("Pages per file"), "2");
    expect(document.body.textContent).toContain("Will create 3 files");
    await click(button("Split"));
    await waitFor(() => expect(document.body.textContent).toContain("Created 3 files"));
    await click(button("Download .zip"));
    expect(downloads[0]!.name).toBe("doc-split.zip");
    const zip = unzipSync(new Uint8Array(await downloads[0]!.blob.arrayBuffer()));
    expect(Object.keys(zip).sort()).toEqual(["doc-1-p1-2.pdf", "doc-2-p3-4.pdf", "doc-3-p5.pdf"]);
    view.unmount();
  });
});

describe("PdfTools — reorder", () => {
  it("reorders, rotates and deletes pages, then saves", async () => {
    const view = await mount(<PdfTools />);
    await click(tab("Reorder pages"));
    await addFiles([await pdfFile("doc.pdf", ["1", "2", "3"])]);
    await waitFor(() => expect(document.querySelectorAll("ol li").length).toBe(3));
    expect(await axeViolations()).toEqual([]);

    await click(byLabel("Move page 3 earlier"));
    await click(byLabel("Rotate page 1 right"));
    await click(byLabel("Delete page 2"));
    expect(document.body.textContent).toContain("2 of 3 pages kept");

    await click(button("Save PDF"));
    await waitFor(() => expect(document.body.textContent).toContain("Saved 2 pages"));
    await click(button("Download"));
    expect(downloads[0]!.name).toBe("doc-edited.pdf");
    const doc = await loadPdf(new Uint8Array(await downloads[0]!.blob.arrayBuffer()));
    expect(doc.getPages().map((page) => [Math.round(page.getWidth()), page.getRotation().angle])).toEqual([
      [200, 90],
      [220, 0],
    ]);

    await click(button("Reset"));
    expect(document.body.textContent).toContain("3 of 3 pages kept");
    view.unmount();
  });

  it("reorders with drag and drop and can reverse the order", async () => {
    const view = await mount(<PdfTools />);
    await click(tab("Reorder pages"));
    await addFiles([await pdfFile("doc.pdf", ["1", "2", "3"])]);
    await waitFor(() => expect(document.querySelectorAll("ol li").length).toBe(3));

    const items = () => [...document.querySelectorAll<HTMLElement>("ol li")];
    const order = () => items().map((item) => item.textContent?.match(/Page (\d)/)?.[1]);
    expect(order()).toEqual(["1", "2", "3"]);
    await act(async () => {
      const dataTransfer = { effectAllowed: "", setData() {} };
      const start = new Event("dragstart", { bubbles: true });
      Object.defineProperty(start, "dataTransfer", { value: dataTransfer });
      items()[0]!.dispatchEvent(start);
    });
    await act(async () => {
      const drop = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", { value: {} });
      items()[2]!.dispatchEvent(drop);
    });
    expect(order()).toEqual(["2", "3", "1"]);
    await click(button("Reverse order"));
    expect(order()).toEqual(["1", "3", "2"]);
    view.unmount();
  });
});
