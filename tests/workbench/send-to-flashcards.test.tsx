// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { takeHandoff } from "@/lib/flash/handoff";
import type { OperationProps } from "@/lib/workbench/operation";
import { MAX_FLASH_BYTES, canSendToFlashcards } from "@/lib/workbench/send";
import { wb } from "@/lib/workbench/i18n";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

const stub = ({ assets }: OperationProps) => <p>open: {assets.map((a) => a.name).join(", ")}</p>;
const operations = { "doc.open": stub, "qr.generate": stub } as never;

async function addFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const flashButton = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${wb("en", "sendFlash", { name })}"]`);

describe("canSendToFlashcards", () => {
  it("accepts text, Markdown, JSON and CSV/TSV sheets, within the size limit", () => {
    expect(canSendToFlashcards("text", "words.txt", 10)).toBe(true);
    expect(canSendToFlashcards("markdown", "w.md", 10)).toBe(true);
    expect(canSendToFlashcards("json", "w.json", 10)).toBe(true);
    expect(canSendToFlashcards("sheet", "w.csv", 10)).toBe(true);
    expect(canSendToFlashcards("sheet", "w.TSV", 10)).toBe(true);
  });

  it("refuses spreadsheets that are not delimited text, other kinds, and large files", () => {
    expect(canSendToFlashcards("sheet", "w.xlsx", 10)).toBe(false);
    expect(canSendToFlashcards("pdf", "w.pdf", 10)).toBe(false);
    expect(canSendToFlashcards("image", "w.png", 10)).toBe(false);
    expect(canSendToFlashcards("yaml", "w.yaml", 10)).toBe(false);
    expect(canSendToFlashcards("text", "big.txt", MAX_FLASH_BYTES + 1)).toBe(false);
  });
});

describe("Send to Flashcards in the workbench", () => {
  it("leaves the text for Flashcards and opens it in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File(["sun — солнце\nmoon — луна"], "words.txt", { type: "text/plain" }));
    await waitFor(() => expect(flashButton("words.txt")).toBeTruthy());
    expect(await axeViolations()).toEqual([]);
    await click(flashButton("words.txt"));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(String(open.mock.calls[0]![0])).toMatch(/\/flash\/?$/);
    expect(open.mock.calls[0]![1]).toBe("_blank");
    expect(takeHandoff()).toEqual({ name: "words.txt", text: "sun — солнце\nmoon — луна" });
    view.unmount();
  });

  it("explains it when the browser blocks the new tab, and keeps the text waiting", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File(["a — b"], "list.txt", { type: "text/plain" }));
    await waitFor(() => expect(flashButton("list.txt")).toBeTruthy());
    await click(flashButton("list.txt"));
    await waitFor(() => expect(document.body.textContent).toContain(wb("en", "flashBlocked")));
    expect(takeHandoff()).not.toBeNull();
    view.unmount();
  });

  it("is not offered for files that are not cards", async () => {
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" }));
    await waitFor(() => expect(document.body.textContent).toContain("photo.png"));
    expect(document.querySelector('button[aria-label*="Flashcards"]')).toBeNull();
    view.unmount();
  });
});
