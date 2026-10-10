// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenOperation } from "@/components/workbench/operations/OpenOperations";
import { createAssetFromBytes, createAssetFromText } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import type { Asset } from "@/lib/workbench/asset";
import { click, mount, press, type, waitFor } from "../helpers/dom";
import { xlsxBuffer } from "../viewer/fixtures/sheet";

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === text);

const menuItem = (text: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent?.trim() === text);

type Output = { name: string; type: string; kind?: string; bytes: Uint8Array };

afterEach(() => {
  document.body.innerHTML = "";
});

/** Open an asset in Preview mode. */
async function open(asset: Asset, onProduce?: (output: Output) => void) {
  return mount(<OpenOperation lang="en" assets={[asset]} onProduce={onProduce} />);
}

/** Open an asset and switch to Edit mode. */
async function openInEdit(asset: Asset, onProduce?: (output: Output) => void) {
  const view = await open(asset, onProduce);
  await waitFor(() => expect(buttonByText("Edit")).toBeTruthy());
  await click(buttonByText("Edit"));
  return view;
}

/** Pick a Save as ▾ entry. */
async function saveAs(label: string) {
  await click(buttonByText("Save as"));
  await waitFor(() => expect(menuItem(label)).toBeTruthy());
  await click(menuItem(label));
}

describe("Open — preview", () => {
  it("renders a plain text asset", async () => {
    const view = await open(createAssetFromText("notes.txt", "hello viewer"));
    await waitFor(() => expect(document.body.textContent).toContain("hello viewer"));
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("renders a markdown asset as markup, with no second Preview/Source switch", async () => {
    const view = await open(createAssetFromText("notes.md", "# Title"));
    await waitFor(() => expect(document.querySelector("article h1")?.textContent).toBe("Title"));
    expect(buttonByText("Source")).toBeUndefined();
    view.unmount();
  });

  it("previews JSON read-only until Edit is chosen", async () => {
    const view = await open(createAssetFromText("data.json", '{"a":1}'));
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.readOnly).toBe(true);
    expect(buttonByText("Preview")?.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });

  it("prints page-like documents from Preview", async () => {
    const view = await open(createAssetFromText("notes.txt", "hello"));
    await waitFor(() => expect(buttonByText("Print / PDF")).toBeTruthy());
    expect(document.querySelector("[data-print-flow]")).toBeTruthy();
    view.unmount();
  });

  it("registers the doc.open capability", async () => {
    expect(hasOperation("doc.open")).toBe(true);
    expect(await loadOperation("doc.open")).toBeTypeOf("function");
  });
});

describe("Open — Save as", () => {
  it("exports markdown as HTML (and does not offer Markdown → Markdown)", async () => {
    const onProduce = vi.fn();
    const view = await open(createAssetFromText("notes.md", "# Title"), onProduce);
    await waitFor(() => expect(buttonByText("Save as")).toBeTruthy());
    await click(buttonByText("Save as"));
    await waitFor(() => expect(menuItem("HTML page (.html)")).toBeTruthy());
    expect(menuItem("Markdown (.md)")).toBeUndefined();

    await click(menuItem("HTML page (.html)"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("notes.html");
    expect(output.type).toBe("text/html;charset=utf-8");
    // No `kind` is forced so reopening the `.html` output infers its real kind.
    expect(output.kind).toBeUndefined();
    view.unmount();
  });

  it("offers the sheet exports for a spreadsheet asset", async () => {
    const view = await open(createAssetFromText("data.csv", "name,count\nA,1\nB,2\n"));
    await waitFor(() => expect(buttonByText("Save as")).toBeTruthy());
    await click(buttonByText("Save as"));
    await waitFor(() => expect(menuItem("CSV — this sheet")).toBeTruthy());
    expect(menuItem("JSON — this sheet")).toBeTruthy();
    // The source is .csv, so a real .xlsx export is offered too.
    expect(menuItem("Excel workbook (.xlsx)")).toBeTruthy();
    view.unmount();
  });

  it("exports the sheet that is showing in a multi-sheet workbook", async () => {
    const onProduce = vi.fn();
    const asset = createAssetFromBytes("book.xlsx", new Uint8Array(xlsxBuffer({ First: [["a"], [1]], Second: [["b"], [2]] })));
    const view = await open(asset, onProduce);
    await waitFor(() => expect(buttonByText("Second")).toBeTruthy());
    await click(buttonByText("Second"));

    await saveAs("CSV — this sheet");
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("book-Second.csv");
    expect(new TextDecoder().decode(output.bytes)).toContain("b");
    view.unmount();
  });

  it("converts between JSON, YAML and TOML", async () => {
    const onProduce = vi.fn();
    const view = await open(createAssetFromText("config.json", '{"name":"lab","port":8080}'), onProduce);
    await waitFor(() => expect(buttonByText("Save as")).toBeTruthy());
    await click(buttonByText("Save as"));
    await waitFor(() => expect(menuItem("YAML (.yaml)")).toBeTruthy());
    expect(menuItem("JSON (.json)")).toBeUndefined();

    await click(menuItem("YAML (.yaml)"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("config.yaml");
    expect(output.kind).toBe("yaml");
    expect(new TextDecoder().decode(output.bytes)).toContain("name: lab");
    view.unmount();
  });

  it("says why a conversion failed instead of producing a broken file", async () => {
    const onProduce = vi.fn();
    // TOML has no top-level arrays.
    const view = await open(createAssetFromText("list.json", "[1,2,3]"), onProduce);
    await waitFor(() => expect(buttonByText("Save as")).toBeTruthy());
    await saveAs("TOML (.toml)");
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toBeTruthy());
    expect(onProduce).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("Open — edit", () => {
  it("edits a JSON asset and publishes the edited copy", async () => {
    const onProduce = vi.fn();
    const view = await openInEdit(createAssetFromText("data.json", '{"a":1}'), onProduce);
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(false));

    await type(document.querySelector("textarea"), '{"a":2}');
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("data-edited.json");
    expect(output.type).toBe("application/json");
    expect(output.kind).toBe("json");
    expect(new TextDecoder().decode(output.bytes)).toBe('{\n  "a": 2\n}\n');
    view.unmount();
  });

  it("saves an edited text asset as a clearly named copy, keeping MIME and kind", async () => {
    const onProduce = vi.fn();
    const view = await openInEdit(createAssetFromText("notes.txt", "hello"), onProduce);
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("hello"));
    await type(document.querySelector("textarea"), "hello world");
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("notes-edited.txt");
    expect(output.type).toBe("text/plain;charset=utf-8");
    expect(output.kind).toBe("text");
    expect(new TextDecoder().decode(output.bytes)).toBe("hello world");
    view.unmount();
  });

  it("refuses to save YAML that does not parse, and says why", async () => {
    const onProduce = vi.fn();
    const view = await openInEdit(createAssetFromText("config.yaml", "name: lab\n"), onProduce);
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    await waitFor(() => expect(editor().value).toBe("name: lab\n"));

    await type(editor(), "name: [unclosed\n");
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toBeTruthy());
    expect(buttonByText("Save")?.disabled).toBe(true);

    await type(editor(), "name: fixed\n");
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toBeNull());
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as Output;
    expect(output.name).toBe("config-edited.yaml");
    expect(new TextDecoder().decode(output.bytes)).toBe("name: fixed\n");
    view.unmount();
  });

  it("refuses to save TOML that does not parse", async () => {
    const view = await openInEdit(createAssetFromText("Cargo.toml", 'name = "lab"\n'));
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    await waitFor(() => expect(editor().value).toBe('name = "lab"\n'));
    await type(editor(), "name = \n");
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toBeTruthy());
    expect(buttonByText("Save")?.disabled).toBe(true);
    view.unmount();
  });

  it("refuses to save JSON while the draft is invalid", async () => {
    const view = await openInEdit(createAssetFromText("data.json", '{"a":1}'));
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(false));
    await type(document.querySelector("textarea"), '{"a":2}');
    await waitFor(() => expect(buttonByText("Save")?.disabled).toBe(false));
    await type(document.querySelector("textarea"), '{"a":');
    await waitFor(() => expect(buttonByText("Save")?.disabled).toBe(true));
    view.unmount();
  });

  it("locks Preview while an edit is unsaved and reports it", async () => {
    const onDirtyChange = vi.fn();
    const view = await mount(
      <OpenOperation lang="en" assets={[createAssetFromText("notes.txt", "hello")]} onDirtyChange={onDirtyChange} />,
    );
    await waitFor(() => expect(buttonByText("Edit")).toBeTruthy());
    await click(buttonByText("Edit"));
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());

    await type(document.querySelector("textarea"), "changed");
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(buttonByText("Preview")?.disabled).toBe(true);

    await click(buttonByText("Revert"));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(buttonByText("Preview")?.disabled).toBe(false);
    view.unmount();
  });

  it("enables Undo after a text edit and reverts the textarea", async () => {
    const view = await openInEdit(createAssetFromText("notes.txt", "hello"));
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    await waitFor(() => expect(editor().value).toBe("hello"));
    expect(buttonByText("Undo")?.disabled).toBe(true);

    await type(editor(), "hello world");
    await waitFor(() => expect(buttonByText("Undo")?.disabled).toBe(false));
    await click(buttonByText("Undo"));
    await waitFor(() => expect(editor().value).toBe("hello"));
    view.unmount();
  });

  it("starts a new asset from its own content, not the previous draft", async () => {
    const view = await openInEdit(createAssetFromText("a.json", '{"a":1}'));
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    await type(document.querySelector("textarea"), '{"a":99}');
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toContain("99"));

    await view.rerender(<OpenOperation lang="en" assets={[createAssetFromText("b.json", '{"b":2}')]} />);
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toContain('"b": 2'));
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).not.toContain("99");
    view.unmount();
  });

  it("undoes and redoes a JSON edit, then saves the restored draft", async () => {
    const onProduce = vi.fn();
    const view = await openInEdit(createAssetFromText("data.json", '{"a":1}'), onProduce);
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    await waitFor(() => expect(editor().readOnly).toBe(false));

    await type(editor(), '{"a":2}');
    await waitFor(() => expect(editor().value).toBe('{"a":2}'));
    await click(buttonByText("Undo"));
    await waitFor(() => expect(editor().value).toBe('{\n  "a": 1\n}'));
    await click(buttonByText("Redo"));
    await waitFor(() => expect(editor().value).toBe('{\n  "a": 2\n}'));

    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    expect(new TextDecoder().decode((onProduce.mock.calls[0]![0] as Output).bytes)).toBe('{\n  "a": 2\n}\n');
    view.unmount();
  });

  it("edits a sheet cell and undoes it back to the opened workbook", async () => {
    const asset = createAssetFromBytes("book.xlsx", new Uint8Array(xlsxBuffer({ Data: [["city", "count"], ["Berlin", 10]] })));
    const view = await openInEdit(asset);
    await waitFor(() => expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("10"));

    await act(async () => {
      document.querySelector('td[data-sheet-cell="1-1"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
    await type(input, "99");
    await press(input, "Enter");
    await waitFor(() => expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("99"));

    await click(buttonByText("Undo"));
    await waitFor(() => expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("10"));
    expect(buttonByText("Undo")?.disabled).toBe(true);
    view.unmount();
  });
});
