// @vitest-environment jsdom
import * as XLSX from "xlsx";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import ViewerApp from "@/components/viewer/ViewerApp";
import { xlsxBuffer } from "./fixtures/sheet";

describe("ViewerApp", () => {
  it("opens a dropped Markdown file and can close it with Escape", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      expect(container.textContent).toContain("Drop a file here");

      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(["# Hello"], "notes.md")));
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Hello");
        expect(container.textContent).toContain("notes.md");
      });
      expect(container.querySelector('[aria-label="Open file"]')).toBeTruthy();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(container.textContent).toContain("Drop a file here");
      expect(container.textContent).not.toContain("notes.md");
    } finally {
      unmount();
    }
  });

  it("opens a .txt file as plain text", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(["hello from a log"], "build.log")));
      });

      await waitFor(() => {
        expect(container.textContent).toContain("hello from a log");
        expect(container.textContent).toContain("Text");
      });
    } finally {
      unmount();
    }
  });
  it("edits a spreadsheet cell and downloads the edited copy, all in-browser", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    // jsdom has no object URL support; capture the blob and the download name.
    const blobs: Blob[] = [];
    const objectURL = URL.createObjectURL as unknown;
    URL.createObjectURL = ((blob: Blob) => {
      blobs.push(blob);
      return "blob:fake";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    const downloads: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    try {
      await act(async () => {
        window.dispatchEvent(
          fileDropEvent(new File([xlsxBuffer({ Data: [["city", "count"], ["Berlin", 10]] })], "sample.xlsx")),
        );
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Berlin");
      });

      // Double-click the count cell (row 2, column B) and change it.
      const cell = container.querySelector('td[data-sheet-cell="1-1"]');
      expect(cell?.textContent).toBe("10");
      await act(async () => {
        cell!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });

      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]');
      expect(input).toBeTruthy();
      await act(async () => {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        native?.set?.call(input, "99");
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Edited");
        expect(container.textContent).toContain("Download edited");
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("Download edited"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await waitFor(() => {
        expect(downloads).toEqual(["sample-edited.xlsx"]);
      });
      // The saved copy really contains the edit, typed as a number.
      const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
      const workbook = XLSX.read(bytes, { type: "array" });
      expect(workbook.SheetNames).toEqual(["Data"]);
      expect(workbook.Sheets.Data!.B2!.v).toBe(99);
      expect(workbook.Sheets.Data!.A2!.v).toBe("Berlin"); // untouched cell carried through
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = objectURL as typeof URL.createObjectURL;
      unmount();
    }
  });

  it("appends a row through the add-row button and the download really gains it", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    const { blobs, downloads, restore } = captureDownload();
    try {
      await act(async () => {
        window.dispatchEvent(
          fileDropEvent(new File([xlsxBuffer({ Data: [["city", "count"], ["Berlin", 10]] })], "sample.xlsx")),
        );
      });
      await waitFor(() => {
        expect(container.textContent).toContain("Berlin");
      });
      expect(container.textContent).toContain("2 rows");

      await act(async () => {
        container.querySelector('button[title^="Append an empty row"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // The '' cell extends `!ref`, so the re-read shows the appended row.
      await waitFor(() => {
        expect(container.textContent).toContain("3 rows");
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("Download edited"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitFor(() => {
        expect(downloads).toEqual(["sample-edited.xlsx"]);
      });

      const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
      const workbook = XLSX.read(bytes, { type: "array" });
      // The saved sheet's range now covers the new row (A1:B2 -> A1:B3).
      expect(XLSX.utils.decode_range(workbook.Sheets.Data!["!ref"]!).e.r).toBe(2);
      expect(workbook.Sheets.Data!.A3!.v).toBe("");
      expect(workbook.Sheets.Data!.B2!.v).toBe(10); // untouched cells carried through
    } finally {
      restore();
      unmount();
    }
  });

  it("discards sheet edits and goes back to the file as opened", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      await act(async () => {
        window.dispatchEvent(
          fileDropEvent(new File([xlsxBuffer({ Data: [["city", "count"], ["Berlin", 10]] })], "sample.xlsx")),
        );
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Berlin");
      });

      await act(async () => {
        container.querySelector('td[data-sheet-cell="1-1"]')!.dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true }),
        );
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
      await act(async () => {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        native?.set?.call(input, "99");
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      await waitFor(() => {
        expect(container.textContent).toContain("99");
      });

      await act(async () => {
        container.querySelector('button[aria-label="Discard edits"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      await waitFor(() => {
        expect(container.textContent).not.toContain("Edited");
        expect(container.textContent).toContain("10");
      });
    } finally {
      unmount();
    }
  });
  it("Escape inside the JSON editor reverts the draft and keeps the file open", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(['{"city":"Berlin"}'], "sample.json")));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Berlin"');
      });

      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      await setTextarea(editor, '{"city":"Tokyo"}');
      await waitFor(() => {
        // A valid draft applies live, so the file counts as edited…
        expect(container.textContent).toContain("Edited");
      });
      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });

      await waitFor(() => {
        // …and Escape reverts the draft, leaving the file open and unedited.
        expect(editor.value).toBe('{\n  "city": "Berlin"\n}');
        expect(container.textContent).toContain('"city": "Berlin"');
        expect(container.textContent).not.toContain("Edited");
        expect(container.textContent).toContain("sample.json");
      });
    } finally {
      unmount();
    }
  });

  it("FileBar discard restores the opened document in the always-editable view", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(['{"city":"Berlin"}'], "sample.json")));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Berlin"');
      });

      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      await setTextarea(editor, '{"city":"Tokyo"}');
      await waitFor(() => {
        expect(container.textContent).toContain("Edited");
      });

      await setTextarea(editor, '{"city":"Osaka"}');
      await act(async () => {
        container.querySelector('button[aria-label="Discard edits"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });

      await waitFor(() => {
        expect(editor.value).toBe('{\n  "city": "Berlin"\n}');
        expect(container.textContent).toContain('"city": "Berlin"');
        expect(container.textContent).not.toContain("Edited");
      });
    } finally {
      unmount();
    }
  });

  it("clears JSON edits when another file opens or the viewer closes", async () => {
    const { container, unmount } = await mount(<ViewerApp />);
    const first = new File(['{"city":"Berlin"}'], "sample.json");

    try {
      await act(async () => {
        window.dispatchEvent(fileDropEvent(first));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Berlin"');
      });
      await setTextarea(
        container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!,
        '{"city":"Tokyo"}',
      );
      await waitFor(() => {
        expect(container.textContent).toContain("Edited");
      });

      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(['{"city":"Paris"}'], "sample.json")));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Paris"');
        expect(container.textContent).not.toContain("Edited");
      });

      await act(async () => {
        container.querySelector('button[aria-label="Close file"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      expect(container.textContent).toContain("Drop a file here");

      await act(async () => {
        window.dispatchEvent(fileDropEvent(first));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Berlin"');
        expect(container.textContent).not.toContain("Edited");
      });
    } finally {
      unmount();
    }
  });

  it("does not mark or alter a JSON document when the draft is invalid", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    try {
      await act(async () => {
        window.dispatchEvent(fileDropEvent(new File(['{"city":"Berlin"}'], "sample.json")));
      });
      await waitFor(() => {
        expect(container.textContent).toContain('"city": "Berlin"');
      });

      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      await setTextarea(editor, '{\n  "city":\n}');

      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid JSON");
      expect(container.textContent).not.toContain("Edited");
      expect(container.textContent).not.toContain("Download edited");
      expect(editor.value).toBe('{\n  "city":\n}');

      await act(async () => {
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      expect(editor.value).toBe('{\n  "city": "Berlin"\n}');
      expect(container.textContent).toContain('"city": "Berlin"');
    } finally {
      unmount();
    }
  });

  it("replaces a JSON document, downloads the whole edit, and discards to the opened value", async () => {
    const { container, unmount } = await mount(<ViewerApp />);

    const { blobs, downloads, restore } = captureDownload();

    try {
      await act(async () => {
        window.dispatchEvent(
          fileDropEvent(new File(['{"city":"Berlin","count":10}'], "sample.json")),
        );
      });

      await waitFor(() => {
        expect(container.textContent).toContain("Berlin");
        expect(container.textContent).toContain("JSON");
      });
      // Minified in, pretty-printed out.
      expect(container.textContent).toContain('"city": "Berlin"');

      // The document is editable in place: no edit button exists.
      expect(container.querySelector("button.json-value")).toBeNull();
      const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON document"]')!;
      expect(editor.value).toBe('{\n  "city": "Berlin",\n  "count": 10\n}');
      await act(async () => {
        const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        native?.set?.call(editor, '{\n  "city": "Tokyo",\n  "items": [\n    1,\n    2\n  ]\n}');
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      });
      // A valid draft applies live — there is no Apply button to click.

      await waitFor(() => {
        expect(container.textContent).toContain("Edited");
        expect(container.textContent).toContain('"city": "Tokyo"');
        expect(container.textContent).toContain('"items": [');
        expect(container.textContent).not.toContain('"count": 10');
      });

      await act(async () => {
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent?.includes("Download edited"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await waitFor(() => {
        expect(downloads).toEqual(["sample-edited.json"]);
      });
      // The saved copy is the pretty-printed edited tree, with a trailing newline.
      const text = await blobs[0]!.text();
      expect(text).toBe('{\n  "city": "Tokyo",\n  "items": [\n    1,\n    2\n  ]\n}\n');

      // Discard drops the edit list and the view goes back to the original.
      await act(async () => {
        container.querySelector('button[aria-label="Discard edits"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      await waitFor(() => {
        expect(container.textContent).not.toContain("Edited");
        expect(container.textContent).toContain('"city": "Berlin"');
      });
    } finally {
      restore();
      unmount();
    }
  });
});

async function setTextarea(textarea: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    native?.set?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fileDropEvent(file: File): Event {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["Files"],
      files: {
        item: (index: number) => (index === 0 ? file : null),
      },
    },
  });
  return event;
}

/** jsdom has no object URL support; capture the blobs and download names instead. */
function captureDownload() {
  const blobs: Blob[] = [];
  const objectURL = URL.createObjectURL as unknown;
  URL.createObjectURL = ((blob: Blob) => {
    blobs.push(blob);
    return "blob:fake";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  const downloads: string[] = [];
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  return {
    blobs,
    downloads,
    restore() {
      clickSpy.mockRestore();
      URL.createObjectURL = objectURL as typeof URL.createObjectURL;
    },
  };
}

async function waitFor(assert: () => void) {
  const deadline = Date.now() + 3000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assert();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }
  }

  throw lastError;
}

async function mount(ui: ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
