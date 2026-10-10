// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { capabilityById } from "@/lib/workbench/capabilities";
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

async function addFile(name: string, contents = "hello world") {
  const input = fileInput();
  const file = new File([contents], name, { type: "text/plain" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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

const section = (id: string) => document.querySelector<HTMLElement>(`[aria-labelledby="${id}"]`)!;

describe("WorkbenchApp shell", () => {
  it("shows the empty state before anything is opened", async () => {
    const view = await mount(<WorkbenchApp />);
    expect(document.body.textContent).toContain(wb("en", "empty"));
    expect(section("wb-outputs").textContent).toContain(wb("en", "noOutputs"));
    view.unmount();
  });

  it("lists a newly added text file in the assets tray", async () => {
    const view = await mount(<WorkbenchApp />);
    await addFile("note.txt");
    await waitFor(() => expect(section("wb-assets").textContent).toContain("note.txt"));
    view.unmount();
  });

  it("promotes the first renderable capabilities as suggested buttons", async () => {
    const view = await mount(<WorkbenchApp />);
    await addFile("note.txt");
    await waitFor(() => {
      const suggested = section("wb-suggested");
      // viewer.view (800) and viewer.edit (780) are the top renderable pair.
      expect(buttonWithText(suggested, capabilityById("viewer.view")!.label.en)).toBeTruthy();
      expect(buttonWithText(suggested, capabilityById("viewer.edit")!.label.en)).toBeTruthy();
    });
    // Only PRIMARY_COUNT (2) are promoted: viewer.print is next but not shown.
    const suggested = section("wb-suggested");
    expect(buttonWithText(suggested, capabilityById("viewer.print")!.label.en)).toBeUndefined();
    view.unmount();
  });

  it("shows enabled-but-unregistered capabilities as disabled in the rail", async () => {
    const view = await mount(<WorkbenchApp />);
    const input = fileInput();
    const file = new File([new Uint8Array([37, 80, 68, 70])], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const rail = document.querySelector<HTMLElement>(`[aria-label="${wb("en", "actions")}"]`)!;
    // pdf.unlock applies to a PDF but has no registered operation yet.
    await waitFor(() =>
      expect([...rail.querySelectorAll("button")].some((b) => b.textContent?.includes(capabilityById("pdf.unlock")!.label.en))).toBe(true),
    );
    const unlock = [...rail.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(capabilityById("pdf.unlock")!.label.en),
    )!;
    expect(unlock.disabled).toBe(true);
    expect(unlock.textContent).toContain(wb("en", "unavailable"));
    view.unmount();
  });

  it("mounts the regex operation when chosen from the action rail", async () => {
    const view = await mount(<WorkbenchApp />);
    await addFile("note.txt");
    const rail = document.querySelector<HTMLElement>(`[aria-label="${wb("en", "actions")}"]`)!;
    await waitFor(() => expect(buttonWithText(rail, capabilityById("text.regex")!.label.en)).toBeTruthy());
    await click(buttonWithText(rail, capabilityById("text.regex")!.label.en));
    await waitFor(() => expect(document.querySelector('input[placeholder^="("]')).toBeTruthy());
    view.unmount();
  });

  it("turns a scanned code into a new text selection for the generator", async () => {
    const view = await mount(
      <WorkbenchApp operations={{ "qr.scan": QrScanStub, "qr.generate": QrGenerateStub }} />,
    );
    const input = fileInput();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "code.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const rail = document.querySelector<HTMLElement>(`[aria-label="${wb("en", "actions")}"]`)!;
    await waitFor(() => expect(buttonWithText(rail, capabilityById("qr.scan")!.label.en)).toBeTruthy());
    await click(buttonWithText(rail, capabilityById("qr.scan")!.label.en));
    await click(buttonWithText(document.body, "Use scan"));

    // The scan result becomes the selection, so the generator is a valid target.
    await waitFor(() => expect(document.body.textContent).toContain("generator open"));
    expect(section("wb-assets").textContent).toContain("scanned.txt");
    view.unmount();
  });

  it("publishes operation outputs and reopens them as assets", async () => {
    const view = await mount(<WorkbenchApp operations={{ "text.count": ProduceStub }} />);
    await addFile("note.txt");

    const rail = document.querySelector<HTMLElement>(`[aria-label="${wb("en", "actions")}"]`)!;
    await waitFor(() => expect(buttonWithText(rail, capabilityById("text.count")!.label.en)).toBeTruthy());
    await click(buttonWithText(rail, capabilityById("text.count")!.label.en));

    await click(buttonWithText(document.body, "Produce output"));
    await waitFor(() => expect(section("wb-outputs").textContent).toContain("count.txt"));

    await click(buttonWithText(section("wb-outputs"), wb("en", "openAsAsset")));
    await waitFor(() => {
      expect(section("wb-assets").textContent).toContain("count.txt");
      expect(section("wb-outputs").textContent).not.toContain("count.txt");
      expect(section("wb-outputs").textContent).toContain(wb("en", "noOutputs"));
    });
    view.unmount();
  });
});
