// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { capabilityById, type CapabilityId } from "@/lib/workbench/capabilities";
import { wb } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
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
};

describe("WorkbenchApp — empty screen", () => {
  it("shows the drop zone and the no-file starters, with nothing open", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    expect(document.body.textContent).toContain(wb("en", "empty"));
    const starters = section("wb-starters")!;
    expect(buttonWithText(starters, label("text.diff"))).toBeTruthy();
    expect(buttonWithText(starters, label("qr.generate"))).toBeTruthy();
    expect(tabs()).toHaveLength(0);
    expect(section("wb-outputs")).toBeNull();
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
    await waitFor(() => expect(tabLabels()).toEqual([label("doc.open"), label("pdf.sign"), label("pdf.split")]));
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
    expect(tabLabels()).toEqual([label("image.edit")]);

    await click(fileRow("data.csv"));
    await waitFor(() => expect(document.body.textContent).toContain("open: data.csv"));
    expect(tabLabels()).toEqual([label("doc.open")]);
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

  it("asks before leaving unsaved work, and stays when the user says no", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": DirtyStub }} />);
    await addFiles(text("a.txt"));
    await waitFor(() => expect(document.body.textContent).toContain("dirty editor"));

    await click(tab("qr.generate"));
    expect(confirm).toHaveBeenCalledWith(wb("en", "discardChanges"));
    expect(document.body.textContent).toContain("dirty editor");

    confirm.mockReturnValue(true);
    await click(tab("qr.generate"));
    await waitFor(() => expect(document.body.textContent).toContain("qr: a.txt"));
    view.unmount();
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

describe("WorkbenchApp — results", () => {
  it("publishes outputs and opens one as the selected file", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": ProduceStub }} />);
    await addFiles(text("note.txt"));
    await waitFor(() => expect(buttonWithText(document.body, "Produce output")).toBeTruthy());
    await click(buttonWithText(document.body, "Produce output"));
    await waitFor(() => expect(section("wb-outputs")!.textContent).toContain("result.txt"));

    await click(buttonWithText(section("wb-outputs")!, wb("en", "openAsAsset")));
    await waitFor(() => {
      expect(fileRow("result.txt")?.getAttribute("aria-pressed")).toBe("true");
      // The tray disappears again once it is empty.
      expect(section("wb-outputs")).toBeNull();
    });
    view.unmount();
  });
});
