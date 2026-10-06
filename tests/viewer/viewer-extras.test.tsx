// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ViewerApp from "@/components/viewer/ViewerApp";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

const pdfPage = {
  getViewport: () => ({ width: 200, height: 300, scale: 1 }),
  render: () => ({ promise: Promise.resolve(), cancel() {} }),
  streamTextContent: () => ({}),
  getTextContent: async () => ({ items: [{ str: "Hello PDF", hasEOL: true }] }),
  cleanup() {},
};

vi.mock("@/lib/viewer/pdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/viewer/pdf")>("@/lib/viewer/pdf");
  const doc = {
    numPages: 2,
    getPage: async () => pdfPage,
    loadingTask: { destroy: vi.fn() },
  };
  return {
    ...actual,
    openPdf: vi.fn(async (_bytes: Uint8Array, password?: string) => {
      if (_bytes[5] === 0x53 && password !== "secret") throw new actual.PdfPasswordError(password ? "incorrect" : "needed");
      return doc;
    }),
    loadPdfJs: async () => ({
      TextLayer: class {
        async render() {}
        cancel() {}
      },
    }),
  };
});

function dropFile(file: File) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files: { item: (index: number) => (index === 0 ? file : null) } },
  });
  window.dispatchEvent(event);
}

async function open(file: File) {
  await act(async () => {
    dropFile(file);
  });
}

async function chooseCompareFile(file: File) {
  const input = document.querySelector<HTMLInputElement>("#docviewer-compare")!;
  Object.defineProperty(input, "files", { value: { item: (i: number) => (i === 0 ? file : null), length: 1 }, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button, [role=menuitem]")].find((node) => node.textContent?.trim() === text || node.getAttribute("aria-label") === text || node.textContent?.trim().startsWith(text) && node.querySelector(".sr-only")) as HTMLElement | undefined;

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  const blobs = new Map<string, Blob>();
  let counter = 0;
  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:fake-${(counter += 1)}`;
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

describe("HTML files", () => {
  const source = '<!doctype html><html><head><title>Hidden title</title><style>p{color:red}</style></head><body><h1>Hello</h1><p onclick="alert(1)">Body <script>alert(2)</script>text</p></body></html>';

  it("renders a sanitized preview and offers the source on another tab", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File([source], "page.html", { type: "text/html" }));
    await waitFor(() => expect(document.querySelector(".doc-prose")?.textContent).toContain("Hello"));

    const article = document.querySelector(".doc-prose")!;
    expect(article.innerHTML).not.toContain("script");
    expect(article.innerHTML).not.toContain("onclick");
    expect(article.textContent).not.toContain("Hidden title");

    await click(buttonByText("Source"));
    expect(document.querySelector("pre")?.textContent).toContain("<title>Hidden title</title>");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("exports Markdown and plain text, and can print", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const view = await mount(<ViewerApp />);
    await open(new File(["<h1>Hello</h1><p>World <b>bold</b></p>"], "doc.html"));
    await waitFor(() => expect(document.querySelector(".doc-prose")).toBeTruthy());

    await click(buttonByText("Export"));
    expect(document.querySelectorAll('[role="menuitem"]').length).toBe(3);
    await click(buttonByText("Markdown (.md)"));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(["doc.md"]));
    expect(await downloads[0]!.blob.text()).toContain("# Hello");

    await click(buttonByText("Print / PDF"));
    expect(print).toHaveBeenCalled();
    view.unmount();
  });
});

describe("Markdown export", () => {
  it("downloads a standalone HTML page", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File(["# Title\n\ntext"], "notes.md"));
    await waitFor(() => expect(document.querySelector(".doc-prose")).toBeTruthy());
    await click(buttonByText("Export"));
    await click(buttonByText("HTML page (.html)"));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(["notes.html"]));
    const html = await downloads[0]!.blob.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<h1>Title</h1>");
    view.unmount();
  });
});

describe("JSON export", () => {
  it("offers CSV for tabular JSON and not for objects", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File([JSON.stringify([{ a: 1 }, { a: 2 }])], "rows.json"));
    await waitFor(() => expect(document.body.textContent).toContain("rows.json"));
    await click(buttonByText("Export"));
    expect(buttonByText("CSV (.csv)")).toBeTruthy();
    await click(buttonByText("CSV (.csv)"));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(["rows.csv"]));
    expect(await downloads[0]!.blob.text()).toBe("a\r\n1\r\n2");
    view.unmount();

    const second = await mount(<ViewerApp />);
    await open(new File([JSON.stringify({ a: 1 })], "obj.json"));
    await waitFor(() => expect(document.body.textContent).toContain("obj.json"));
    await click(document.querySelectorAll('[aria-haspopup="menu"]')[0]);
    expect(buttonByText("CSV (.csv)")).toBeUndefined();
    second.unmount();
  });
});

describe("images", () => {
  it("shows an image with zoom controls and its size", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "pic.png", { type: "image/png" }));
    await waitFor(() => expect(document.querySelector("img[alt='pic.png']")).toBeTruthy());
    const img = document.querySelector<HTMLImageElement>("img[alt='pic.png']")!;
    Object.defineProperty(img, "naturalWidth", { value: 640 });
    Object.defineProperty(img, "naturalHeight", { value: 480 });
    await act(async () => {
      img.dispatchEvent(new Event("load"));
    });
    expect(document.body.textContent).toContain("640 × 480 px");
    await click(document.querySelector('[aria-label="Actual size"]'));
    expect(img.style.width).toBe("640px");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("PDF files", () => {
  const pdfBytes = (marker = 0x2d) => new Uint8Array([0x25, 0x50, 0x44, 0x46, marker, marker === 0x53 ? 0x53 : 0x31, 0x2e]);

  it("opens a PDF, lays out its pages and exports the text", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File([pdfBytes()], "paper.pdf"));
    await waitFor(() => expect(document.querySelectorAll("[data-page]").length).toBe(2));
    expect(document.body.textContent).toContain("Page 1 of 2");

    await click(buttonByText("Export"));
    await click(buttonByText("Extracted text (.txt)"));
    await waitFor(() => expect(downloads.map((d) => d.name)).toEqual(["paper.txt"]));
    expect(await downloads[0]!.blob.text()).toContain("Hello PDF");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("asks for a password and retries", async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x53, 0x2e])], "locked.pdf");
    const view = await mount(<ViewerApp />);
    await open(file);
    await waitFor(() => expect(document.body.textContent).toContain("password protected"));

    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "nope");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("Unlock"));
    await waitFor(() => expect(document.body.textContent).toContain("incorrect"));

    const again = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(again, "secret");
      again.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("Unlock"));
    await waitFor(() => expect(document.querySelectorAll("[data-page]").length).toBe(2));
    view.unmount();
  });
});

describe("compare", () => {
  it("diffs two files and goes back to the document", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File(["one\ntwo\nthree\n"], "a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("three"));

    await click(buttonByText("Compare"));
    await chooseCompareFile(new File(["one\n2\nthree\n"], "b.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("1 added, 1 removed"));
    expect(document.body.textContent).toContain("a.txt");
    expect(document.body.textContent).toContain("b.txt");
    expect(await axeViolations()).toEqual([]);

    await click(buttonByText("Next change"));
    expect(document.body.textContent).toContain("Change 1 of 1");

    await click(buttonByText("Back to document"));
    expect(document.querySelector(".diff-table")).toBeNull();
    expect(document.body.textContent).toContain("three");
    view.unmount();
  });

  it("compares JSON by content, not layout", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File(['{"a":1,"b":[1,2]}'], "one.json"));
    await waitFor(() => expect(document.body.textContent).toContain("one.json"));
    await click(buttonByText("Compare"));
    await chooseCompareFile(new File(['{\n  "a": 1,\n  "b": [1, 2]\n}'], "two.json"));
    await waitFor(() => expect(document.body.textContent).toContain("identical"));
    view.unmount();
  });

  it("explains that images cannot be compared", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File(["hello"], "a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("hello"));
    await click(buttonByText("Compare"));
    await chooseCompareFile(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "x.png"));
    await waitFor(() => expect(document.body.textContent).toContain("cannot be compared"));
    view.unmount();
  });

  it("Escape leaves compare first, then closes the file", async () => {
    const view = await mount(<ViewerApp />);
    await open(new File(["a\n"], "a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("a.txt"));
    await click(buttonByText("Compare"));
    await chooseCompareFile(new File(["b\n"], "b.txt"));
    await waitFor(() => expect(document.querySelector(".diff-table")).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".diff-table")).toBeNull();
    expect(document.body.textContent).toContain("a.txt");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.body.textContent).toContain("Drop a file here");
    view.unmount();
  });
});
