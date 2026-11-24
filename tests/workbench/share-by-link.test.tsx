// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";
import type { CapabilityId } from "@/lib/workbench/capabilities";
import type { OperationProps } from "@/lib/workbench/operation";
import { TEXT_SEND_KIND, textToSend } from "@/lib/workbench/send";
import { decodeShare } from "@/lib/share/codec";
import { encodeFileShare } from "@/lib/workbench/send";
import { wb } from "@/lib/workbench/i18n";
import { ts } from "@/lib/send/i18n";
import { encodeShare } from "@/lib/share/codec";
import { sh } from "@/lib/share/i18n";

// IndexedDB is not in jsdom; the mirror must stay a quiet no-op on this path.
vi.mock("@/lib/apps/storage-mirror", () => ({
  bootStorageMirror: vi.fn(),
  requestPersistence: vi.fn().mockResolvedValue(false),
  mirrorSet: vi.fn(),
  mirrorDelete: vi.fn(),
  restoreFromMirror: vi.fn().mockResolvedValue([]),
}));

const text = () => document.body.textContent ?? "";
const buttonByLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const buttonWithText = (label: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const inputByPlaceholder = (placeholder: string) =>
  document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);

async function addFiles(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const note = (name: string, contents: string) => new File([contents], name, { type: "text/plain" });

const opened = (name: string) =>
  function Stub({ assets }: OperationProps) {
    return (
      <p>
        {name}: {assets.map((asset) => asset.name).join(", ")}
      </p>
    );
  };
const stubs: Partial<Record<CapabilityId, React.ComponentType<OperationProps>>> = {
  "doc.open": opened("open"),
};

const PASS = "ember-cairn-fjord-glow-quill-moss";

// A test that fails mid-way must still unmount its root: a live zombie tree
// re-attaches its modal portal to the next test's document.
let live: { unmount(): void } | null = null;

async function arrive(kind: string, name: string, body: string, passphrase = PASS) {
  const encoded = await encodeShare(kind, textToSend(name, body), passphrase);
  if (!encoded.ok) throw new Error(`fixture rejected: ${encoded.reason}`);
  window.history.replaceState(null, "", `/lab/tools/#${encoded.fragment}`);
  window.dispatchEvent(new Event("hashchange"));
}

async function arriveFile(name: string, bytes: Uint8Array, passphrase = PASS) {
  const encoded = await encodeFileShare(name, bytes, passphrase);
  if (!encoded.ok) throw new Error(`fixture rejected: ${encoded.reason}`);
  window.history.replaceState(null, "", `/lab/tools/#${encoded.fragment}`);
  window.dispatchEvent(new Event("hashchange"));
}

const shareNamed = (name: string) => sh("en", "buttonNamed", { name });

afterEach(() => {
  live?.unmount();
  live = null;
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("workbench — sharing by link", () => {
  it("offers a share button on a text file; the dialog shows a passphrase and builds a link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(note("todo.txt", "buy milk\nbuy bread"));
    await waitFor(() => expect(buttonByLabel(shareNamed("todo.txt"))).toBeTruthy());

    await click(buttonByLabel(shareNamed("todo.txt")));
    await waitFor(() => expect(text()).toContain(sh("en", "copyPassphrase")));
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    // The passphrase is a real generated key: six dash-joined words.
    const shown = document.querySelector("code")!.textContent ?? "";
    expect(shown.split("-")).toHaveLength(6);

    await click(buttonWithText(sh("en", "copyPassphrase")));
    expect(writeText.mock.calls[0]![0]).toBe(shown);
    await click(buttonWithText(sh("en", "copyLink")));
    const link = new URL(writeText.mock.calls[1]![0] as string);
    expect(link.pathname.endsWith("/tools/")).toBe(true);
    expect(link.hash.startsWith("#share=1.pbkdf2-600000.")).toBe(true);
    // The shown passphrase is the real key: it decrypts the copied link back
    // into the document.
    const decoded = await decodeShare(link.hash, shown);
    expect(decoded).toEqual({ kind: TEXT_SEND_KIND, data: { n: "todo.txt", t: "buy milk\nbuy bread" } });
    view.unmount();
  });

  it("an image gets a share button but no phone-send button", async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(png);
    await waitFor(() => expect(text()).toContain("photo.png"));
    expect(document.querySelector('button[aria-label^="Send "]')).toBeNull();
    expect(buttonByLabel(shareNamed("photo.png"))).toBeTruthy();
    view.unmount();
  });

  it("a docx travels by its bytes and imports back as a document", async () => {
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(note("keep.txt", "keep me"));
    // Real zip magic bytes; the workbench never parses the payload on this path.
    await arriveFile("report.docx", new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]));

    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), PASS);
    await click(buttonWithText(sh("en", "unlock")));

    await waitFor(() => expect(text()).toContain("report.docx"));
    await click(buttonWithText(ts("en", "import")));
    // The asset row renders name and kind back to back ("report.docxdocx · 8 B").
    await waitFor(() => expect(text()).toContain("docx · 8 B"));
    expect(window.location.hash).toBe("");
    view.unmount();
  });

  it("regenerating drops the old link before the new one is built", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(note("doc.md", "# heading"));
    await waitFor(() => expect(buttonByLabel(shareNamed("doc.md"))).toBeTruthy());
    await click(buttonByLabel(shareNamed("doc.md")));

    const firstPass = (document.querySelector("code")?.textContent) ?? "";
    await waitFor(() => expect(buttonWithText(sh("en", "copyLink"))).toBeTruthy());
    await click(buttonWithText(sh("en", "regenerate")));
    // The stale link disappears with the old passphrase…
    expect(buttonWithText(sh("en", "copyLink"))).toBeFalsy();
    // …and the rebuilt pair decrypts: the copied link matches the shown passphrase.
    await waitFor(() => expect(buttonWithText(sh("en", "copyLink"))).toBeTruthy());
    const secondPass = document.querySelector("code")?.textContent ?? "";
    expect(secondPass).not.toBe(firstPass);
    await click(buttonWithText(sh("en", "copyLink")));
    await click(buttonWithText(sh("en", "copyPassphrase")));
    const link = new URL(writeText.mock.calls.at(-2)![0] as string);
    const decoded = await decodeShare(link.hash, writeText.mock.calls.at(-1)![0] as string);
    expect(decoded?.kind).toBe(TEXT_SEND_KIND);
    view.unmount();
  });

  it("a dismissed prompt never reopens when its decode finishes late", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(note("keep.txt", "keep me"));
    arrive(TEXT_SEND_KIND, "todo.txt", "body");
    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), PASS);
    await click(buttonWithText(sh("en", "unlock"))); // decode now in flight
    await click(buttonWithText(sh("en", "close"))); // dismissed before it resolves
    await new Promise((resolve) => setTimeout(resolve, 400)); // the KDF has surely finished
    expect(text()).not.toContain(sh("en", "promptTitle"));
    expect(text()).not.toContain(ts("en", "receiveTitle"));
    view.unmount();
  });

  it("an empty text document imports instead of vanishing", async () => {
    const view = await mount(<WorkbenchApp operations={stubs} />);
    await addFiles(note("keep.txt", "keep me"));
    arrive(TEXT_SEND_KIND, "empty.txt", "");
    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), PASS);
    await click(buttonWithText(sh("en", "unlock")));
    await waitFor(() => expect(text()).toContain("empty.txt"));
    await click(buttonWithText(ts("en", "import")));
    await waitFor(() => expect(text()).toContain("empty.txt"));
    expect(window.location.hash).toBe("");
    view.unmount();
  });

  it("import arrives behind a passphrase, then behind a preview", async () => {
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(note("keep.txt", "keep me"));
    arrive(TEXT_SEND_KIND, "todo.txt", "buy milk\nbuy bread");

    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    // A wrong passphrase fails without ever showing the document.
    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), "wrong key entirely");
    await click(buttonWithText(sh("en", "unlock")));
    await waitFor(() => expect(text()).toContain(sh("en", "wrongPass")));

    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), PASS);
    await click(buttonWithText(sh("en", "unlock")));
    await waitFor(() => expect(text()).toContain("todo.txt"));

    await click(buttonWithText(ts("en", "import")));
    await waitFor(() => expect(text()).toContain("buy milk\nbuy bread"));
    // The fragment is gone from the address bar once imported.
    expect(window.location.hash).toBe("");
    view.unmount();
  });

  it("another tool's kind never imports here", async () => {
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(note("keep.txt", "keep me"));
    arrive("flashdeck", "deck.txt", "cards");
    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    await type(inputByPlaceholder(sh("en", "passphrasePlaceholder")), PASS);
    await click(buttonWithText(sh("en", "unlock")));
    // The prompt drops, the fragment is cleared, nothing is imported.
    await waitFor(() => expect(text()).not.toContain(sh("en", "promptTitle")));
    expect(window.location.hash).toBe("");
    expect(text()).not.toContain("cards");
    view.unmount();
  });

  it("dismiss drops the prompt and the fragment", async () => {
    const view = (live = await mount(<WorkbenchApp operations={stubs} />));
    await addFiles(note("keep.txt", "keep me"));
    arrive(TEXT_SEND_KIND, "todo.txt", "body");
    await waitFor(() => expect(text()).toContain(sh("en", "promptTitle")));
    await click(buttonWithText(sh("en", "close")));
    await waitFor(() => expect(text()).not.toContain(sh("en", "promptTitle")));
    expect(window.location.hash).toBe("");
    view.unmount();
  });
});
