// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { capabilityById, type CapabilityId } from "@/lib/workbench/capabilities";
import { wb } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

const saved = vi.hoisted(() => ({ files: [] as { blob: Blob; name: string }[] }));
vi.mock("@/lib/apps/file-open", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/apps/file-open")>()),
  saveBlob: (blob: Blob, name: string) => void saved.files.push({ blob, name }),
}));

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  saved.files = [];
});

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

const buttonWithText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === text) as HTMLButtonElement | undefined;

async function addFiles(...files: File[]) {
  const input = fileInput();
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const text = (name: string, contents = "hello world") => new File([contents], name, { type: "text/plain" });
const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: "application/pdf" });
const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
const epub = (name: string) => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, { type: "application/epub+zip" });

const label = (id: CapabilityId) => capabilityById(id)!.label.en;
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tabLabels = () => tabs().map((tab) => tab.textContent?.trim());
const tab = (id: CapabilityId) => tabs().find((node) => node.textContent?.trim() === label(id));
const section = (id: string) => document.querySelector<HTMLElement>(`[aria-labelledby="${id}"]`);
/** The tray row button that selects a file (only present with 2+ files). */
const fileRow = (name: string) =>
  [...(section("wb-assets")?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])].find((button) =>
    button.textContent?.includes(name),
  );

/** Stand-in for an operation: shows its name and the files it was given. */
const opened = (name: string) =>
  function OpenedStub({ assets }: OperationProps) {
    return (
      <p>
        {name}: {assets.map((asset) => asset.name).join(", ")}
      </p>
    );
  };

/** An operation that holds unsaved work from the moment it mounts. */
function DirtyStub({ onDirtyChange }: OperationProps) {
  React.useEffect(() => onDirtyChange?.(true), [onDirtyChange]);
  return <p>dirty editor</p>;
}

/** A minimal operation that publishes a fixed output on demand. */
function ProduceStub({ onProduce }: OperationProps) {
  return (
    <button
      type="button"
      onClick={() =>
        onProduce?.({ name: "result.txt", type: "text/plain;charset=utf-8", bytes: new TextEncoder().encode("done"), kind: "text" })
      }
    >
      Produce output
    </button>
  );
}

const stubs = {
  "doc.open": opened("open"),
  "pdf.merge": opened("merge"),
  "pdf.sign": opened("sign"),
  "pdf.split": opened("split"),
  "image.edit": opened("image"),
  "book.read": opened("read"),
  "text.diff": opened("compare"),
  "qr.generate": opened("qr"),
  "chart.make": opened("chart"),
  "ocr.recognize": opened("ocr"),
};

describe("WorkbenchApp — empty screen", () => {
  it("shows the drop zone and the no-file starters, with nothing open", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    expect(document.body.textContent).toContain(wb("en", "empty"));
    const starters = section("wb-starters")!;
    expect(buttonWithText(starters, label("text.diff"))).toBeTruthy();
    expect(buttonWithText(starters, label("qr.generate"))).toBeTruthy();
    expect(tabs()).toHaveLength(0);
    expect(document.body.textContent).not.toContain("compare:");
    view.unmount();
  });

  it("opens a starter on demand and leaves it once a file arrives", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await click(buttonWithText(section("wb-starters")!, label("qr.generate")));
    await waitFor(() => expect(document.body.textContent).toContain("qr:"));

    await addFiles(text("note.txt"));
    await waitFor(() => expect(section("wb-starters")).toBeNull());
    expect(document.body.textContent).toContain("open: note.txt");
    view.unmount();
  });
});

describe("WorkbenchApp — one file", () => {
  it("opens a text file straight into Open, with a one-line tray", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("note.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("open: note.txt"));
    expect(tabLabels()).toEqual([label("doc.open"), label("qr.generate")]);
    expect(tab("doc.open")?.getAttribute("aria-selected")).toBe("true");
    expect(buttonWithText(section("wb-assets")!, wb("en", "clear"))).toBeUndefined();
    expect(document.body.textContent).toContain(wb("en", "addMoreHint", { actions: label("text.diff") }));
    view.unmount();
  });

  it("offers open, sign and split for a PDF and hints at merge", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(pdf("doc.pdf"));
    await waitFor(() => expect(tabLabels()).toEqual([label("doc.open"), label("pdf.sign"), label("ocr.recognize"), label("pdf.split")]));
    expect(document.body.textContent).toContain(wb("en", "addMoreHint", { actions: label("pdf.merge") }));
    view.unmount();
  });

  it("opens an EPUB in the reader", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(epub("novel.epub"));
    await waitFor(() => expect(document.body.textContent).toContain("read: novel.epub"));
    expect(tabLabels()).toEqual([label("book.read")]);
    view.unmount();
  });

  it("says so when no tool fits the file", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(new File([new Uint8Array([0, 1, 2])], "archive.zip", { type: "application/zip" }));
    await waitFor(() => expect(document.body.textContent).toContain(wb("en", "noActions")));
    expect(tabs()).toHaveLength(0);
    view.unmount();
  });
});

describe("WorkbenchApp — several files", () => {
  it("selects a newly added file and offers set actions over the matching files", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(pdf("a.pdf"));
    await waitFor(() => expect(document.body.textContent).toContain("open: a.pdf"));
    await addFiles(pdf("b.pdf"));
    await waitFor(() => expect(document.body.textContent).toContain("merge: a.pdf, b.pdf"));
    expect(tab("pdf.merge")?.getAttribute("aria-selected")).toBe("true");
    expect(fileRow("b.pdf")?.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });

  it("keeps a spreadsheet and an image each with their own tools", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(new File(["a,b\n1,2\n"], "data.csv", { type: "text/csv" }));
    await waitFor(() => expect(document.body.textContent).toContain("open: data.csv"));
    await addFiles(png("photo.png"));
    await waitFor(() => expect(document.body.textContent).toContain("image: photo.png"));
    expect(tabLabels()).toEqual([label("image.edit"), label("ocr.recognize")]);

    await click(fileRow("data.csv"));
    await waitFor(() => expect(document.body.textContent).toContain("open: data.csv"));
    expect(tabLabels()).toEqual([label("doc.open"), label("chart.make")]);
    view.unmount();
  });

  it("keeps the chosen tab when another file of the same kind is selected", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(pdf("a.pdf"), pdf("b.pdf"));
    await waitFor(() => expect(tab("pdf.sign")).toBeTruthy());
    await click(tab("pdf.sign"));
    await waitFor(() => expect(document.body.textContent).toContain("sign: a.pdf"));
    await click(fileRow("b.pdf"));
    await waitFor(() => expect(document.body.textContent).toContain("sign: b.pdf"));
    view.unmount();
  });

  it("selects the neighbour when the selected file is removed", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"), new File(["# b"], "b.md", { type: "text/markdown" }), text("c.txt"));
    await waitFor(() => expect(fileRow("a.txt")).toBeTruthy());
    await click(fileRow("b.md"));
    await click(document.querySelector<HTMLButtonElement>(`button[aria-label="${wb("en", "remove", { name: "b.md" })}"]`));
    await waitFor(() => expect(fileRow("c.txt")?.getAttribute("aria-pressed")).toBe("true"));
    view.unmount();
  });
});

/** The set-membership badge in a tray row, or null when the row has none. */
const badgeOf = (name: string) => fileRow(name)?.querySelector("[data-member-badge]")?.textContent ?? null;

describe("WorkbenchApp — set membership badges", () => {
  it("labels the two compared texts A and B in tray order", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"), text("b.txt"));
    await waitFor(() => expect(tab("text.diff")?.getAttribute("aria-selected")).toBe("true"));
    expect(badgeOf("a.txt")).toBe("A");
    expect(badgeOf("b.txt")).toBe("B");
    view.unmount();
  });

  it("keeps A and B on the texts when an unrelated image joins", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"), text("b.txt"));
    await waitFor(() => expect(tab("text.diff")).toBeTruthy());
    await addFiles(png("photo.png"));
    await click(fileRow("a.txt"));
    await waitFor(() => expect(tab("text.diff")?.getAttribute("aria-selected")).toBe("true"));
    expect(badgeOf("a.txt")).toBe("A");
    expect(badgeOf("b.txt")).toBe("B");
    expect(badgeOf("photo.png")).toBeNull();
    view.unmount();
  });

  it("numbers PDFs for Merge and gives a text no badge", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(pdf("one.pdf"), text("note.txt"), pdf("two.pdf"));
    await click(fileRow("one.pdf"));
    await waitFor(() => expect(tab("pdf.merge")?.getAttribute("aria-selected")).toBe("true"));
    expect(badgeOf("one.pdf")).toBe("1");
    expect(badgeOf("two.pdf")).toBe("2");
    expect(badgeOf("note.txt")).toBeNull();
    view.unmount();
  });

  it("marks every image in an Edit image batch", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(png("a.png"), png("b.png"));
    await waitFor(() => expect(tab("image.edit")?.getAttribute("aria-selected")).toBe("true"));
    expect(badgeOf("a.png")).toBe(wb("en", "inBatch"));
    expect(badgeOf("b.png")).toBe(wb("en", "inBatch"));
    view.unmount();
  });

  it("shows no badge on a pdf next to compared texts", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"), text("b.txt"), pdf("doc.pdf"));
    await click(fileRow("a.txt"));
    await waitFor(() => expect(tab("text.diff")?.getAttribute("aria-selected")).toBe("true"));
    expect(badgeOf("doc.pdf")).toBeNull();
    view.unmount();
  });
});

describe("WorkbenchApp — tray thumbnails", () => {
  it("draws a small canvas for pictures and a kind glyph for other files, without making an object URL", async () => {
    const created: string[] = [];
    (URL as unknown as Record<string, unknown>).createObjectURL = (blob: Blob) => {
      void blob;
      created.push("blob:test");
      return "blob:test";
    };

    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(png("photo.png"), text("note.txt"));
    const thumb = (name: string) => fileRow(name)!.closest("li")!.querySelector("[data-asset-thumb]")!;
    await waitFor(() => expect(thumb("photo.png").querySelector("canvas")).toBeTruthy());
    expect(thumb("photo.png").getAttribute("data-asset-thumb")).toBe("image");
    expect(thumb("note.txt").getAttribute("data-asset-thumb")).toBe("text");
    expect(thumb("note.txt").querySelector("svg")).toBeTruthy();
    // A full-size photo is never put in an <img>: nothing may hold an object URL for it.
    expect(created).toEqual([]);
    expect(document.querySelector("[data-asset-thumb] img")).toBeNull();
    view.unmount();
  });
});

describe("WorkbenchApp — image batch row", () => {
  const photos = (n: number) => Array.from({ length: n }, (_, i) => png(`IMG_${String(i + 1).padStart(3, "0")}.png`));
  const rows = () => [...(section("wb-assets")?.querySelectorAll("li") ?? [])];
  const removeBatchButton = (count: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${wb("en", "removeBatch", { count })}"]`);

  it("lists up to nine images one by one", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(9));
    await waitFor(() => expect(rows()).toHaveLength(9));
    expect(section("wb-assets")!.querySelector("[data-asset-batch]")).toBeNull();
    view.unmount();
  });

  it("folds ten or more images into one row with their count and total size", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(10));
    await waitFor(() => expect(section("wb-assets")!.querySelector("[data-asset-batch]")).toBeTruthy());
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain(wb("en", "imageBatch"));
    expect(rows()[0]!.textContent).toContain("10 images");
    expect(rows()[0]!.textContent).toContain("40 B");
    expect(rows()[0]!.textContent).not.toContain("IMG_001.png");
    view.unmount();
  });

  it("keeps other files on their own rows beside the batch, in order", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("before.txt"), ...photos(12), text("after.txt"));
    await waitFor(() => expect(rows()).toHaveLength(3));
    const names = rows().map((row) => row.textContent ?? "");
    expect(names[0]).toContain("before.txt");
    expect(names[1]).toContain("12 images");
    expect(names[2]).toContain("after.txt");
    view.unmount();
  });

  it("hands every image to the image tool, and the batch row is the selected one", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(11));
    await waitFor(() => expect(document.body.textContent).toContain("image: IMG_001.png, IMG_002.png"));
    expect(document.body.textContent).toContain("IMG_011.png");
    expect(section("wb-assets")!.querySelector("[data-asset-batch] button[aria-pressed]")?.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });

  it("removes the whole batch with one button and drops back to the empty screen", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(10));
    await waitFor(() => expect(removeBatchButton("10 images")).toBeTruthy());
    await click(removeBatchButton("10 images"));
    await waitFor(() => expect(section("wb-assets")).toBeNull());
    view.unmount();
  });

  it("selects the file that is left when the selected batch is removed", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("keep.txt"), ...photos(10));
    await waitFor(() => expect(removeBatchButton("10 images")).toBeTruthy());
    await click(removeBatchButton("10 images"));
    await waitFor(() => expect(section("wb-assets")!.querySelector("[data-asset-batch]")).toBeNull());
    expect(document.body.textContent).toContain("open: keep.txt");
    view.unmount();
  });

  it("counts a thousand images without listing them", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(1000));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]!.textContent).toContain("1,000 images");
    expect(document.querySelectorAll("[data-asset-thumb] canvas")).toHaveLength(0);
    view.unmount();
  });

  it("badges every picture of an OCR batch, as it does for the image tool", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(...photos(3));
    await waitFor(() => expect(tab("ocr.recognize")).toBeTruthy());
    await click(tab("ocr.recognize"));
    await waitFor(() => expect(document.body.textContent).toContain("ocr: IMG_001.png, IMG_002.png, IMG_003.png"));
    expect(document.querySelectorAll("[data-member-badge]")).toHaveLength(3);
    view.unmount();
  });
});

describe("WorkbenchApp — unsaved work", () => {
  it("does not switch away when a file is added during unsaved work", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));

    await addFiles(text("b.txt"));
    await waitFor(() => expect(fileRow("b.txt")).toBeTruthy());
    expect(document.body.textContent).toContain("dirty editor");
    expect(fileRow("a.txt")?.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });

  const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');

  it("asks in a dialog before leaving unsaved work, and keeps the work on cancel", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));

    await click(tab("qr.generate"));
    expect(confirm).not.toHaveBeenCalled();
    expect(sheet()?.getAttribute("aria-modal")).toBe("true");
    expect(sheet()!.textContent).toContain(wb("en", "unsavedTitle", { name: label("doc.open") }));
    // Keeping is the primary, focused choice.
    const keep = buttonWithText(sheet()!, wb("en", "keepEditing"))!;
    expect(document.activeElement).toBe(keep);
    expect(await axeViolations(sheet()!)).toEqual([]);

    await click(keep);
    expect(sheet()).toBeNull();
    expect(document.body.textContent).toContain("dirty editor");
    expect(tab("doc.open")?.getAttribute("aria-selected")).toBe("true");
    view.unmount();
  });

  it("switches tabs once the user discards", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));

    await click(tab("qr.generate"));
    await click(buttonWithText(sheet()!, wb("en", "discardAndContinue")));
    await waitFor(() => expect(document.body.textContent).toContain("qr: a.txt"));
    expect(sheet()).toBeNull();
    view.unmount();
  });

  it("treats Escape and a backdrop click as keep editing", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));

    await click(tab("qr.generate"));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(sheet()).toBeNull();

    await click(tab("qr.generate"));
    await click(sheet()!.parentElement);
    expect(sheet()).toBeNull();
    expect(document.body.textContent).toContain("dirty editor");
    view.unmount();
  });

  it("asks the browser before unload while unsaved, but not when clean", async () => {
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true }) as Event & { returnValue?: unknown };
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));
    expect(unload()).toBe(true);
    view.unmount();

    const clean = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("open: a.txt"));
    expect(unload()).toBe(false);
    clean.unmount();
  });

  it("does not ask when nothing is unsaved", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(tab("qr.generate")).toBeTruthy());
    await click(tab("qr.generate"));
    await waitFor(() => expect(document.body.textContent).toContain("qr: a.txt"));
    expect(confirm).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("WorkbenchApp — produced files", () => {
  it("downloads a file an operation produces straight away, with no second list of results", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": ProduceStub }} />);
    await addFiles(text("note.txt"));
    await waitFor(() => expect(buttonWithText(document.body, "Produce output")).toBeTruthy());
    await click(buttonWithText(document.body, "Produce output"));
    expect(saved.files).toHaveLength(1);
    expect(saved.files[0]!.name).toBe("result.txt");
    expect(saved.files[0]!.blob.type).toBe("text/plain;charset=utf-8");
    expect(await saved.files[0]!.blob.text()).toBe("done");
    // Nothing lists it again under the operation.
    expect(section("wb-outputs")).toBeNull();
    expect(document.body.textContent).not.toContain("result.txt");
    view.unmount();
  });
});
