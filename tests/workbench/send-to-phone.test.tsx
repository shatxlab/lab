// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { decodeSend, encodeSend } from "@/lib/send/codec";
import { ts } from "@/lib/send/i18n";
import type { CapabilityId } from "@/lib/workbench/capabilities";
import { wb } from "@/lib/workbench/i18n";
import type { OperationProps } from "@/lib/workbench/operation";
import { TEXT_SEND_KIND, cleanSendName, parseTextSend, textToSend } from "@/lib/workbench/send";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const text = () => document.body.textContent ?? "";
const buttonByLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const buttonWithText = (label: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function addFiles(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const note = (name: string, contents: string) => new File([contents], name, { type: "text/plain" });
const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });

const opened = (name: string) =>
  function Stub({ assets }: OperationProps) {
    return (
      <p>
        {name}: {assets.map((asset) => asset.name).join(", ")}
      </p>
    );
  };
function ProduceStub({ onProduce }: OperationProps) {
  return (
    <button
      type="button"
      onClick={() => onProduce?.({ name: "result.txt", type: "text/plain;charset=utf-8", bytes: new TextEncoder().encode("the output"), kind: "text" })}
    >
      Produce output
    </button>
  );
}
const stubs: Partial<Record<CapabilityId, React.ComponentType<OperationProps>>> = {
  "doc.open": opened("open"),
  "pdf.merge": opened("merge"),
  "pdf.sign": opened("sign"),
  "pdf.split": opened("split"),
  "image.edit": opened("image"),
  "book.read": opened("read"),
  "text.diff": opened("compare"),
  "qr.generate": opened("qr"),
};

function arrive(name: string, body: string) {
  const encoded = encodeSend(TEXT_SEND_KIND, textToSend(name, body));
  if (!encoded.ok) throw new Error("fixture too large");
  window.history.replaceState(null, "", `/lab/tools/#${encoded.fragment}`);
}

describe("workbench send mapping", () => {
  it("cleans file names", () => {
    expect(cleanSendName("notes.md")).toBe("notes.md");
    expect(cleanSendName("../../etc/passwd")).toBe("passwd");
    expect(cleanSendName("C:\\Users\\me\\todo.txt")).toBe("todo.txt");
    expect(cleanSendName("bad\u0000na\u001fme.txt")).toBe("badname.txt");
    expect(cleanSendName("x".repeat(300))).toHaveLength(80);
    for (const bad of ["", "..", ".", "   ", 5, null, undefined]) expect(cleanSendName(bad)).toBe("received.txt");
  });

  it("parses what arrives, rejecting anything without text", () => {
    expect(parseTextSend({ n: "a.txt", t: "hello" })).toEqual({ name: "a.txt", text: "hello" });
    expect(parseTextSend({ t: "hello" })?.name).toBe("received.txt");
    for (const bad of [null, "x", {}, { t: "" }, { t: 5 }, []]) expect(parseTextSend(bad)).toBeNull();
  });
});

describe("workbench — sending text to a phone", () => {
  it("offers a send button on a text file, and the link carries its name and text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(note("todo.txt", "buy milk\nbuy bread"));
    await waitFor(() => expect(buttonByLabel(wb("en", "sendNamed", { name: "todo.txt" }))).toBeTruthy());

    await click(buttonByLabel(wb("en", "sendNamed", { name: "todo.txt" })));
    await waitFor(() => expect(document.querySelector('[role="img"] svg')).toBeTruthy());
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    await click(buttonWithText(ts("en", "copyLink")));
    const link = new URL(writeText.mock.calls[0]![0] as string);
    expect(link.pathname.endsWith("/tools/")).toBe(true);
    expect(parseTextSend(decodeSend(link.hash)!.data)).toEqual({ name: "todo.txt", text: "buy milk\nbuy bread" });
    view.unmount();
  });

  it("offers no send button for an image", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(png("photo.png"));
    await waitFor(() => expect(text()).toContain("photo.png"));
    expect(document.querySelector('button[aria-label^="Send "]')).toBeNull();
    view.unmount();
  });

  it("explains when a text is too big for a code", async () => {
    let state = 5;
    const big = Array.from({ length: 6000 }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return "abcdefghijklmnopqrstuvwxyz0123456789"[state % 36];
    }).join("");
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(note("big.txt", big));
    await waitFor(() => expect(buttonByLabel(wb("en", "sendNamed", { name: "big.txt" }))).toBeTruthy());
    await click(buttonByLabel(wb("en", "sendNamed", { name: "big.txt" })));
    await waitFor(() => expect(text()).toContain(ts("en", "tooLargeTitle")));
    expect(document.querySelector('[role="img"] svg')).toBeNull();
    view.unmount();
  });

  it("also offers it on a text output", async () => {
    const view = await mount(<WorkbenchApp operations={{ ...stubs, "doc.open": ProduceStub }} />);
    await addFiles(note("a.txt", "x"));
    await waitFor(() => expect(buttonWithText("Produce output")).toBeTruthy());
    await click(buttonWithText("Produce output"));
    await waitFor(() => expect(buttonByLabel(wb("en", "sendNamed", { name: "result.txt" }))).toBeTruthy());
    await click(buttonByLabel(wb("en", "sendNamed", { name: "result.txt" })));
    await waitFor(() => expect(document.querySelector('[role="img"] svg')).toBeTruthy());
    view.unmount();
  });
});

describe("workbench — receiving text from another device", () => {
  it("previews it, adds nothing until imported, then opens it as a file and clears the link", async () => {
    arrive("shared.md", "# From my laptop\n\nHello");
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await waitFor(() => expect(text()).toContain(wb("en", "receiveText", { name: "shared.md", n: "# From my laptop\n\nHello".length })));
    expect(document.querySelector("pre")?.textContent).toContain("From my laptop");
    // Nothing is in the tray yet.
    expect(buttonByLabel(wb("en", "remove", { name: "shared.md" }))).toBeNull();
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    await click(buttonWithText(ts("en", "import")));
    await waitFor(() => expect(buttonByLabel(wb("en", "remove", { name: "shared.md" }))).toBeTruthy());
    expect(text()).toContain("open: shared.md");
    expect(window.location.hash).toBe("");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  it("adds nothing on dismiss", async () => {
    arrive("shared.txt", "hello");
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await waitFor(() => expect(buttonWithText(ts("en", "dismiss"))).toBeTruthy());
    await click(buttonWithText(ts("en", "dismiss")));
    expect(text()).toContain(wb("en", "empty"));
    expect(window.location.hash).toBe("");
    view.unmount();
  });

  it("ignores a deck meant for Flashcards and drops an unreadable link", async () => {
    const deck = encodeSend("flashdeck", { n: "x", c: [["a", "b"]] });
    if (!deck.ok) throw new Error("fixture");
    window.history.replaceState(null, "", `/lab/tools/#${deck.fragment}`);
    const first = await mount(<WorkbenchApp operations={stubs} />);
    await waitFor(() => expect(text()).toContain(wb("en", "empty")));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.hash).toBe(`#${deck.fragment}`);
    first.unmount();

    window.history.replaceState(null, "", "/lab/tools/#send=1.text.@@@");
    const second = await mount(<WorkbenchApp operations={stubs} />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    second.unmount();
  });
});
