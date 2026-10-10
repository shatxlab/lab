// @vitest-environment jsdom
import { unzipSync } from "fflate";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocxEditOperation } from "@/components/workbench/operations/DocxOperations";
import { createAssetFromBytes } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { click, mount, waitFor } from "../helpers/dom";

// The real renderer needs a valid OOXML package; the operation only cares about
// the HTML it hands back, so stub it the way `tests/viewer/docx.test.ts` does.
vi.mock("@/lib/viewer/docx", () => ({
  renderDocx: async () => ({ html: "<h1>Title</h1><p>Hello world</p>", warnings: [] }),
}));

const asset = () => createAssetFromBytes("sample.docx", new Uint8Array([1, 2, 3]), "docx");

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === text);

function surface(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!node) throw new Error("contentEditable surface not found");
  return node;
}

async function edit(node: HTMLElement, html: string) {
  await act(async () => {
    node.innerHTML = html;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function ready(
  onProduce?: (output: { name: string; type: string; bytes: Uint8Array }) => void,
) {
  const view = await mount(
    <DocxEditOperation lang="en" assets={[asset()]} onProduce={onProduce} />,
  );
  await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeTruthy());
  return view;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("docx.edit operation", () => {
  it("renders the document's sanitized HTML in a contentEditable surface", async () => {
    const view = await ready();
    expect(surface().innerHTML).toContain("<h1>Title</h1>");
    expect(surface().textContent).toContain("Hello world");
    view.unmount();
  });

  it("saves the edited HTML when Save is pressed", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);
    expect(buttonByText("Save")?.disabled).toBe(true);

    await edit(surface(), "<h1>Title</h1><p>Hello edited world</p>");
    await waitFor(() => expect(buttonByText("Save")?.disabled).toBe(false));
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("sample.html");
    expect(output.type).toBe("text/html;charset=utf-8");
    const text = new TextDecoder().decode(output.bytes);
    expect(text).toContain("<!doctype html>");
    expect(text).toContain("Hello edited world");
    view.unmount();
  });

  it("writes Markdown from the Save a copy menu", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    await edit(surface(), "<h1>Title</h1><p>Hello edited world</p>");
    await click(buttonByText("Save a copy"));
    await waitFor(() => expect(document.querySelectorAll('[role="menuitem"]').length).toBe(4));
    const markdown = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent?.trim() === "Markdown (.md)",
    );
    await click(markdown);
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("sample.md");
    expect(output.type).toBe("text/markdown;charset=utf-8");
    expect(new TextDecoder().decode(output.bytes)).toContain("Hello edited world");
    view.unmount();
  });

  it("writes a Word document from the Save a copy menu", async () => {
    const onProduce = vi.fn();
    const view = await ready(onProduce);

    await edit(surface(), "<h1>Title</h1><p>Hello <strong>Word</strong></p>");
    await click(buttonByText("Save a copy"));
    await waitFor(() => expect(document.querySelectorAll('[role="menuitem"]').length).toBe(4));
    const docx = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent?.trim() === "Word (.docx)",
    );
    await click(docx);
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; bytes: Uint8Array };
    expect(output.name).toBe("sample.docx");
    expect(output.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const files = unzipSync(output.bytes);
    expect(files["word/document.xml"]).toBeTruthy();
    expect(new TextDecoder().decode(files["word/document.xml"])).toContain("Word");
    view.unmount();
  });

  it("undoes an edit back to the initial HTML through the session history", async () => {
    const view = await ready();
    const initial = surface().innerHTML;
    expect(buttonByText("Undo")?.disabled).toBe(true);

    await edit(surface(), "<h1>Title</h1><p>Hello edited world</p>");
    await waitFor(() => expect(buttonByText("Undo")?.disabled).toBe(false));

    await click(buttonByText("Undo"));
    await waitFor(() => expect(surface().innerHTML).toBe(initial));
    expect(buttonByText("Undo")?.disabled).toBe(true);
    view.unmount();
  });

  it("keeps an unsaved edit when the UI language changes", async () => {
    const sample = asset();
    const view = await mount(<DocxEditOperation lang="en" assets={[sample]} />);
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeTruthy());

    await edit(surface(), "<h1>Title</h1><p>Unsaved draft</p>");
    expect(surface().innerHTML).toContain("Unsaved draft");

    // Switching language re-renders the operation but must not reload the
    // asset (and so must not remount the editor and drop the draft).
    await view.rerender(<DocxEditOperation lang="ru" assets={[sample]} />);
    await waitFor(() => expect(surface()).toBeTruthy());
    expect(surface().innerHTML).toContain("Unsaved draft");
    view.unmount();
  });

  it("registers the docx.edit capability", async () => {
    expect(hasOperation("docx.edit")).toBe(true);
    expect(await loadOperation("docx.edit")).toBeTypeOf("function");
  });
});
