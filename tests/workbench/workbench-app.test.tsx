// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { capabilityById, type CapabilityId } from "@/lib/workbench/capabilities";
import { wb } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

const buttonWithText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === text) as HTMLButtonElement | undefined;

async function addFile(name: string, contents: BlobPart = "hello world", type = "text/plain") {
  const input = fileInput();
  const file = new File([contents], name, { type });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const addPdf = (name: string) => addFile(name, new Uint8Array([37, 80, 68, 70]), "application/pdf");
const addPng = (name: string) => addFile(name, new Uint8Array([137, 80, 78, 71]), "image/png");

const label = (id: CapabilityId) => capabilityById(id)!.label.en;
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tabLabels = () => tabs().map((tab) => tab.textContent?.trim());
const tab = (id: CapabilityId) => tabs().find((node) => node.textContent?.trim() === label(id));
const moreMenu = () => document.querySelector<HTMLDetailsElement>("details");

/** Stand-in for an operation that only proves it mounted. */
const opened = (text: string) =>
  function OpenedStub() {
    return <p>{text}</p>;
  };

/** A minimal operation that publishes a fixed output on demand. */
function ProduceStub({ onProduce }: OperationProps) {
  return (
    <button
      type="button"
      onClick={() =>
        onProduce?.({
          name: "count.txt",
          type: "text/plain;charset=utf-8",
          bytes: new TextEncoder().encode("counted"),
          kind: "text",
        })
      }
    >
      Produce output
    </button>
  );
}

/** A minimal image scanner that reveals its `onUse` handoff on click. */
function QrScanStub({ onUse }: OperationProps & { onUse?: (text: string) => void }) {
  return (
    <button type="button" onClick={() => onUse?.("scanned text")}>
      Use scan
    </button>
  );
}

/** A minimal generator that just proves it mounted. */
function QrGenerateStub() {
  return <p>generator open</p>;
}

const section = (id: string) => document.querySelector<HTMLElement>(`[aria-labelledby="${id}"]`);

describe("WorkbenchApp shell", () => {
  it("shows the empty state before anything is opened", async () => {
    const view = await mount(<WorkbenchApp />);
    expect(document.body.textContent).toContain(wb("en", "empty"));
    expect(tabs()).toHaveLength(0);
    expect(section("wb-outputs")).toBeNull();
    view.unmount();
  });

  it("offers no-file starters on the empty screen and opens one on demand", async () => {
    const view = await mount(<WorkbenchApp operations={{ "data.uuid": opened("uuid open") }} />);
    const starters = section("wb-starters")!;
    for (const id of ["text.diff", "qr.scan", "qr.generate", "data.uuid"] as const) {
      expect(buttonWithText(starters, label(id))).toBeTruthy();
    }
    // Nothing opens until the user picks one.
    expect(document.body.textContent).not.toContain("uuid open");
    await click(buttonWithText(starters, label("data.uuid")));
    await waitFor(() => expect(document.body.textContent).toContain("uuid open"));
    expect(buttonWithText(starters, label("data.uuid"))?.getAttribute("aria-pressed")).toBe("true");

    // Adding a file leaves the starters for the file's own actions.
    await addFile("note.txt");
    await waitFor(() => expect(section("wb-starters")).toBeNull());
    expect(document.body.textContent).not.toContain("uuid open");
    view.unmount();
  });

  it("opens an EPUB straight into the reader", async () => {
    const view = await mount(<WorkbenchApp operations={{ "book.read": opened("reader open") }} />);
    await addFile("novel.epub", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/epub+zip");
    await waitFor(() => expect(document.body.textContent).toContain("reader open"));
    expect(tab("book.read")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("viewer.view")).toBeUndefined();
    view.unmount();
  });

  it("lists a newly added text file in the assets tray", async () => {
    const view = await mount(<WorkbenchApp />);
    await addFile("note.txt");
    await waitFor(() => expect(section("wb-assets")!.textContent).toContain("note.txt"));
    // A single file has nothing to bulk-manage.
    expect(buttonWithText(section("wb-assets")!, wb("en", "clear"))).toBeUndefined();
    view.unmount();
  });

  it("opens the suggested action straight away, with the top actions as tabs", async () => {
    const view = await mount(<WorkbenchApp operations={{ "viewer.view": opened("viewer open") }} />);
    await addFile("note.txt");
    await waitFor(() => expect(document.body.textContent).toContain("viewer open"));
    expect(tab("viewer.view")?.getAttribute("aria-selected")).toBe("true");
    expect(tabLabels()).toEqual([label("viewer.view"), label("viewer.edit"), label("viewer.print"), label("text.count")]);
    // Everything else waits in the overflow menu rather than on screen.
    expect(tab("text.regex")).toBeUndefined();
    expect(buttonWithText(moreMenu()!, label("text.regex"))).toBeTruthy();
    view.unmount();
  });

  it("offers only view, sign and split for a PDF, and hints at merge", async () => {
    const view = await mount(<WorkbenchApp operations={{ "viewer.view": opened("viewer open") }} />);
    await addPdf("doc.pdf");
    await waitFor(() => expect(tabLabels()).toEqual([label("viewer.view"), label("pdf.sign"), label("pdf.split")]));
    expect(moreMenu()).toBeNull();
    expect(document.body.textContent).toContain(wb("en", "addMoreHint", { actions: label("pdf.merge") }));
    view.unmount();
  });

  it("switches to merge once a second PDF is added", async () => {
    const view = await mount(
      <WorkbenchApp operations={{ "viewer.view": opened("viewer open"), "pdf.merge": opened("merge open") }} />,
    );
    await addPdf("a.pdf");
    await waitFor(() => expect(document.body.textContent).toContain("viewer open"));
    await addPdf("b.pdf");
    await waitFor(() => expect(document.body.textContent).toContain("merge open"));
    expect(tab("pdf.merge")?.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).not.toContain(wb("en", "addMoreHint", { actions: label("pdf.merge") }));
    view.unmount();
  });

  it("mounts the regex operation when chosen from the More menu", async () => {
    const view = await mount(<WorkbenchApp />);
    await addFile("note.txt");
    await waitFor(() => expect(moreMenu()).toBeTruthy());
    await click(buttonWithText(moreMenu()!, label("text.regex")));
    // The chosen action joins the tabs while it is active.
    await waitFor(() => expect(tab("text.regex")?.getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(document.querySelector('input[placeholder^="("]')).toBeTruthy());
    view.unmount();
  });

  it("turns a scanned code into a new text selection for the generator", async () => {
    const view = await mount(
      <WorkbenchApp operations={{ "qr.scan": QrScanStub, "qr.generate": QrGenerateStub }} />,
    );
    await addPng("code.png");

    await waitFor(() => expect(tab("qr.scan")).toBeTruthy());
    await click(tab("qr.scan"));
    await click(buttonWithText(document.body, "Use scan"));

    // The scan result becomes the selection, so the generator is a valid target.
    await waitFor(() => expect(document.body.textContent).toContain("generator open"));
    expect(section("wb-assets")!.textContent).toContain("scanned.txt");
    view.unmount();
  });

  it("publishes operation outputs and reopens them as assets", async () => {
    const view = await mount(<WorkbenchApp operations={{ "text.count": ProduceStub }} />);
    await addFile("note.txt");

    await waitFor(() => expect(tab("text.count")).toBeTruthy());
    await click(tab("text.count"));

    await click(buttonWithText(document.body, "Produce output"));
    await waitFor(() => expect(section("wb-outputs")!.textContent).toContain("count.txt"));

    await click(buttonWithText(section("wb-outputs")!, wb("en", "openAsAsset")));
    await waitFor(() => {
      expect(section("wb-assets")!.textContent).toContain("count.txt");
      // The tray disappears again once it is empty.
      expect(section("wb-outputs")).toBeNull();
    });
    view.unmount();
  });
});
