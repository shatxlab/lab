// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ViewerConvertOperation,
  ViewerEditOperation,
  ViewerPrintOperation,
  ViewerViewOperation,
} from "@/components/workbench/operations/ViewerOperations";
import { createAssetFromBytes, createAssetFromText } from "@/lib/workbench/asset";
import { hasOperation, loadOperation } from "@/lib/workbench/operations";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";
import { click, mount, press, type, waitFor } from "../helpers/dom";
import { xlsxBuffer } from "../viewer/fixtures/sheet";

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === text);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("workbench viewer operation", () => {
  it("renders a plain text asset", async () => {
    const view = await mount(
      <ViewerViewOperation lang="en" assets={[createAssetFromText("notes.txt", "hello viewer")]} />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("hello viewer"));
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("renders a markdown asset as markup", async () => {
    const view = await mount(
      <ViewerViewOperation lang="en" assets={[createAssetFromText("notes.md", "# Title")]} />,
    );
    await waitFor(() => expect(document.querySelector("article h1")?.textContent).toBe("Title"));
    view.unmount();
  });

  it("shows the standalone picker when there are no assets", async () => {
    const view = await mount(<ViewerViewOperation lang="en" assets={EMPTY_ASSETS} />);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    view.unmount();
  });

  it("renders a JSON asset read-only (viewer.view exposes no editor)", async () => {
    const view = await mount(
      <ViewerViewOperation lang="en" assets={[createAssetFromText("data.json", '{"a":1}')]} />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.readOnly).toBe(true);
    view.unmount();
  });

  it("registers the viewer.view capability", async () => {
    expect(hasOperation("viewer.view")).toBe(true);
    expect(await loadOperation("viewer.view")).toBeTypeOf("function");
  });
});

describe("workbench viewer convert operation", () => {
  it("offers the HTML export for a markdown asset and publishes it", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerConvertOperation
        lang="en"
        assets={[createAssetFromText("notes.md", "# Title")]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(buttonByText("HTML page (.html)")).toBeTruthy());
    // Markdown is already Markdown, so that option is deliberately absent.
    expect(buttonByText("Markdown (.md)")).toBeUndefined();

    await click(buttonByText("HTML page (.html)"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as { name: string; type: string; kind?: string };
    expect(output.name).toBe("notes.html");
    expect(output.type).toBe("text/html;charset=utf-8");
    // No `kind` is forced so reopening the `.html` output infers its real kind.
    expect(output.kind).toBeUndefined();
    view.unmount();
  });

  it("offers the sheet exports for a spreadsheet asset", async () => {
    // A tiny CSV parses through the real SheetJS path, so no mocking is needed.
    const asset = createAssetFromText("data.csv", "name,count\nA,1\nB,2\n");
    const view = await mount(<ViewerConvertOperation lang="en" assets={[asset]} />);
    await waitFor(() => expect(buttonByText("CSV \u2014 this sheet")).toBeTruthy());
    expect(buttonByText("JSON \u2014 this sheet")).toBeTruthy();
    // The source is .csv, so a real .xlsx export is offered too.
    expect(buttonByText("Excel workbook (.xlsx)")).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    view.unmount();
  });

  it("lets a multi-sheet workbook choose which sheet to export", async () => {
    const onProduce = vi.fn();
    const asset = createAssetFromBytes(
      "book.xlsx",
      new Uint8Array(xlsxBuffer({ First: [["a"], [1]], Second: [["b"], [2]] })),
    );
    const view = await mount(
      <ViewerConvertOperation lang="en" assets={[asset]} onProduce={onProduce} />,
    );
    await waitFor(() => expect(document.querySelector("select")).toBeTruthy());
    const select = document.querySelector<HTMLSelectElement>("select")!;
    // The default is the first sheet, matching ViewerApp's `activeSheet`.
    expect(select.value).toBe("First");
    expect([...select.options].map((option) => option.value)).toEqual(["First", "Second"]);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "Second");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await click(buttonByText("CSV \u2014 this sheet"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as { name: string; kind?: string; bytes: Uint8Array };
    expect(output.name).toBe("book-Second.csv");
    expect(output.kind).toBeUndefined();
    expect(new TextDecoder().decode(output.bytes)).toContain("b");
    view.unmount();
  });

  it("does not show a sheet selector for a single-sheet asset", async () => {
    const asset = createAssetFromText("data.csv", "name,count\nA,1\n");
    const view = await mount(<ViewerConvertOperation lang="en" assets={[asset]} />);
    await waitFor(() => expect(buttonByText("CSV \u2014 this sheet")).toBeTruthy());
    expect(document.querySelector("select")).toBeNull();
    view.unmount();
  });
});

describe("workbench viewer print operation", () => {
  it("renders the print button for a text asset", async () => {
    const view = await mount(
      <ViewerPrintOperation lang="en" assets={[createAssetFromText("notes.txt", "hello")]} />,
    );
    await waitFor(() => expect(buttonByText("Print / PDF")).toBeTruthy());
    expect(document.querySelector('[data-print-flow]')).toBeTruthy();
    view.unmount();
  });
});

describe("workbench viewer capability registry", () => {
  it("registers the convert and print capabilities", async () => {
    expect(hasOperation("viewer.edit")).toBe(true);
    expect(hasOperation("doc.convert")).toBe(true);
    expect(hasOperation("sheet.convert")).toBe(true);
    expect(hasOperation("viewer.print")).toBe(true);
    expect(await loadOperation("doc.convert")).toBeTypeOf("function");
  });
});

describe("workbench viewer edit operation", () => {
  it("edits a JSON asset and publishes the edited copy", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerEditOperation
        lang="en"
        assets={[createAssetFromText("data.json", '{"a":1}')]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(editor.readOnly).toBe(false);

    await type(editor, '{"a":2}');
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as {
      name: string;
      type: string;
      kind?: string;
      bytes: Uint8Array;
    };
    expect(output.name).toBe("data-edited.json");
    expect(output.type).toBe("application/json");
    expect(output.kind).toBe("json");
    expect(new TextDecoder().decode(output.bytes)).toBe('{\n  "a": 2\n}\n');
    view.unmount();
  });

  it("edits a text asset and publishes it as text", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("notes.txt", "hello")]} onProduce={onProduce} />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(editor.readOnly).toBe(false);
    expect(editor.value).toBe("hello");

    await type(editor, "hello world");
    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as {
      name: string;
      type: string;
      kind?: string;
      bytes: Uint8Array;
    };
    expect(output.name).toBe("notes.txt");
    expect(output.kind).toBe("text");
    expect(new TextDecoder().decode(output.bytes)).toBe("hello world");
    view.unmount();
  });

  it("renders the sheet editor for a csv asset", async () => {
    const view = await mount(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("data.csv", "name,count\nA,1\nB,2\n")]} />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("name"));
    expect(document.body.textContent).toContain("count");
    expect(buttonByText("Save")).toBeTruthy();
    view.unmount();
  });

  it("resets the JSON draft when the selected asset changes", async () => {
    const view = await mount(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("a.json", '{"a":1}')]} />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await type(editor, '{"a":99}');
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toContain("99"));

    // Switching to another asset of the same kind must remount the editor with
    // B's content rather than keep A's draft.
    await view.rerender(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("b.json", '{"b":2}')]} />,
    );
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toContain('"b": 2'));
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).not.toContain("99");
    view.unmount();
  });

  it("says so rather than editing a binary kind", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerEditOperation
        lang="en"
        assets={[createAssetFromText("photo.png", "not really an image")]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(document.body.textContent).toContain("Not available yet"));
    expect(buttonByText("Save")).toBeUndefined();
    view.unmount();
  });

  it("saves an edited text asset with its original name, MIME and kind", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("notes.txt", "hello")]} onProduce={onProduce} />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    await type(document.querySelector<HTMLTextAreaElement>("textarea"), "hello world");
    await waitFor(() => expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("hello world"));

    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));

    const output = onProduce.mock.calls[0]![0] as {
      name: string;
      type: string;
      kind?: string;
      bytes: Uint8Array;
    };
    expect(output.name).toBe("notes.txt");
    expect(output.type).toBe("text/plain;charset=utf-8");
    expect(output.kind).toBe("text");
    expect(new TextDecoder().decode(output.bytes)).toBe("hello world");
    view.unmount();
  });

  it("enables Undo after a text edit and reverts the textarea", async () => {
    const view = await mount(
      <ViewerEditOperation lang="en" assets={[createAssetFromText("notes.txt", "hello")]} />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(editor().value).toBe("hello");
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(true);

    await type(editor(), "hello world");
    await waitFor(() => expect(editor().value).toBe("hello world"));
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(false);

    await click(buttonByText("Undo"));
    await waitFor(() => expect(editor().value).toBe("hello"));
    view.unmount();
  });
});

describe("workbench viewer edit history", () => {
  it("undoes and redoes a JSON edit, then saves the restored draft", async () => {
    const onProduce = vi.fn();
    const view = await mount(
      <ViewerEditOperation
        lang="en"
        assets={[createAssetFromText("data.json", '{"a":1}')]}
        onProduce={onProduce}
      />,
    );
    await waitFor(() => expect(document.querySelector("textarea")).toBeTruthy());
    const editor = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(true);

    await type(editor(), '{"a":2}');
    // Typing edits the draft in place (no reformat) and marks the session dirty.
    await waitFor(() => expect(editor().value).toBe('{"a":2}'));
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(false);

    // Undo resyncs `JsonView` back to the opened document…
    await click(buttonByText("Undo"));
    await waitFor(() => expect(editor().value).toBe('{\n  "a": 1\n}'));
    expect((buttonByText("Redo") as HTMLButtonElement).disabled).toBe(false);

    // …and redo restores the edited draft.
    await click(buttonByText("Redo"));
    await waitFor(() => expect(editor().value).toBe('{\n  "a": 2\n}'));

    await click(buttonByText("Save"));
    await waitFor(() => expect(onProduce).toHaveBeenCalledTimes(1));
    const output = onProduce.mock.calls[0]![0] as { name: string; kind?: string; bytes: Uint8Array };
    expect(output.name).toBe("data-edited.json");
    expect(output.kind).toBe("json");
    expect(new TextDecoder().decode(output.bytes)).toBe('{\n  "a": 2\n}\n');
    view.unmount();
  });

  it("undoes a sheet cell edit back to the opened workbook", async () => {
    const view = await mount(
      <ViewerEditOperation
        lang="en"
        assets={[
          createAssetFromBytes(
            "book.xlsx",
            new Uint8Array(xlsxBuffer({ Data: [["city", "count"], ["Berlin", 10]] })),
          ),
        ]}
      />,
    );
    await waitFor(() =>
      expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("10"),
    );

    const cell = document.querySelector('td[data-sheet-cell="1-1"]')!;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
    expect(input).toBeTruthy();
    await type(input, "99");
    await press(input, "Enter");

    // The edit recomputes the sheet from the draft…
    await waitFor(() =>
      expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("99"),
    );
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(false);

    // …and undo re-renders the pristine workbook.
    await click(buttonByText("Undo"));
    await waitFor(() =>
      expect(document.querySelector('td[data-sheet-cell="1-1"]')?.textContent).toBe("10"),
    );
    expect((buttonByText("Undo") as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
  });
});
