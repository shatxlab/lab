// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildDocx } from "./fixtures/docx";
import { textBuffer, xlsxBuffer } from "./fixtures/sheet";
import { DocxView } from "@/components/viewer/viewers/DocxView";
import { MarkdownView } from "@/components/viewer/viewers/MarkdownView";
import { SheetView } from "@/components/viewer/viewers/SheetView";
import { TextView } from "@/components/viewer/viewers/TextView";
import { renderDocx } from "@/lib/viewer/docx";
import { renderMarkdown } from "@/lib/viewer/markdown";
import { MAX_RENDERED_ROWS, parseWorkbook, type SheetData } from "@/lib/viewer/sheet";

/*
 * These go the whole way a real file does: bytes in, rendered markup out. The
 * parser tests already cover the models, so what is checked here is that the
 * views put those models on screen without dropping content.
 */

describe("MarkdownView", () => {
  it("renders a parsed document into the shared prose scope", () => {
    const html = renderMarkdown("# Release notes\n\n| Fix | Ticket |\n| --- | --- |\n| Login | QA-1 |");

    const markup = renderToStaticMarkup(<MarkdownView html={html} />);

    expect(markup).toContain('class="doc-prose');
    expect(markup).toContain("Release notes");
    expect(markup).toContain("<td>QA-1</td>");
  });
});

describe("DocxView", () => {
  it("renders a converted Word document, image and all", async () => {
    const { html, warnings } = await renderDocx(await buildDocx());

    const markup = renderToStaticMarkup(<DocxView lang="en" html={html} warnings={warnings} />);

    expect(markup).toContain("Quarterly Report");
    expect(markup).toContain("data:image/png;base64,");
    expect(markup).toContain("<td><p>Defects</p></td>");
  });

  it("offers the formatting notes when mammoth reported any", () => {
    const markup = renderToStaticMarkup(
      <DocxView lang="en" html="<p>Body</p>" warnings={["Unrecognised paragraph style: Quote"]} />,
    );

    expect(markup).toContain("1 formatting note");
    // Collapsed until asked for, so a note never pushes the document down the page.
    expect(markup).not.toContain("Unrecognised paragraph style");
  });

  it("shows no notes panel for a cleanly converted document", () => {
    const markup = renderToStaticMarkup(<DocxView lang="en" html="<p>Body</p>" warnings={[]} />);

    expect(markup).not.toContain("formatting note");
  });
});

describe("TextView", () => {
  it("renders the file as preformatted text rather than HTML", () => {
    const markup = renderToStaticMarkup(<TextView text={"line 1\n<script>alert(1)</script>"} />);

    expect(markup).toContain("line 1");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });
});

describe("SheetView", () => {
  it("renders spreadsheet coordinates alongside the values", async () => {
    const { sheets } = await parseWorkbook({
      buffer: xlsxBuffer({ Summary: [["metric", "value"], ["defects", 12]] }),
      extension: "xlsx",
    });

    const markup = renderToStaticMarkup(<SheetView lang="en" sheets={sheets} />);

    // Column letters and row numbers, so a reader can match a cell to the source.
    expect(markup).toContain(">A<");
    expect(markup).toContain(">B<");
    expect(markup).toContain(">1<");
    expect(markup).toContain("metric");
    expect(markup).toContain("defects");
    expect(markup).toContain("2 rows");
    expect(markup).toContain("2 columns");
    expect(markup).toContain("whitespace-pre-wrap");
    expect(markup).not.toContain("truncate");
  });

  it("shows a tab per sheet only when there is more than one", async () => {
    const single = await parseWorkbook({
      buffer: xlsxBuffer({ Only: [["a"]] }),
      extension: "xlsx",
    });
    const multiple = await parseWorkbook({
      buffer: xlsxBuffer({ First: [["a"]], Second: [["b"]] }),
      extension: "xlsx",
    });

    const singleMarkup = renderToStaticMarkup(<SheetView lang="en" sheets={single.sheets} />);
    const multipleMarkup = renderToStaticMarkup(<SheetView lang="en" sheets={multiple.sheets} />);

    expect(singleMarkup).not.toContain(">Only</button>");
    expect(multipleMarkup).toContain(">First</button>");
    expect(multipleMarkup).toContain(">Second</button>");
  });

  it("renders a CSV the same way as a workbook", async () => {
    const { sheets } = await parseWorkbook({
      buffer: textBuffer("city,count\nМосква,3\n"),
      extension: "csv",
    });

    const markup = renderToStaticMarkup(<SheetView lang="en" sheets={sheets} />);

    expect(markup).toContain("Москва");
    expect(markup).toContain("count");
  });

  it("mounts only the first chunk of rows but reports the real total", () => {
    const sheet: SheetData = {
      name: "Big",
      rows: Array.from({ length: MAX_RENDERED_ROWS }, (_, index) => [`row-${index}`]),
      totalRows: 12_000,
      columnCount: 1,
      truncated: true,
    };

    const markup = renderToStaticMarkup(<SheetView lang="en" sheets={[sheet]} />);

    expect(markup).toContain("row-0");
    expect(markup).toContain("row-200");
    // Header row is frozen, then the first body chunk; later rows arrive on scroll.
    expect(markup).not.toContain("row-201");
    expect(markup).toContain("12,000 rows");
    expect(markup).toContain("showing the first 5,000 rows");
  });

  it("says so instead of rendering an empty grid", () => {
    const markup = renderToStaticMarkup(
      <SheetView
      lang="en"
        sheets={[{ name: "Blank", rows: [], totalRows: 0, columnCount: 0, truncated: false }]}
      />,
    );

    expect(markup).toContain("This sheet is empty.");
  });

  it("sorts by a column when its letter is clicked, keeping the header and source row numbers", async () => {
    const sheet: SheetData = {
      name: "Cities",
      rows: [
        ["city", "count"],
        ["Berlin", "10"],
        ["Ankara", "2"],
        ["Москва", "10"],
      ],
      totalRows: 4,
      columnCount: 2,
      truncated: false,
    };

    const { container, unmount } = await mount(<SheetView lang="en" sheets={[sheet]} />);

    try {
      const sortA = container.querySelector('button[aria-label="Sort column A"]');
      expect(sortA).toBeTruthy();

      await act(async () => {
        sortA!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect([...container.querySelectorAll("tbody tr td:first-of-type")].map((cell) => cell.textContent)).toEqual([
        "Ankara",
        "Berlin",
        "Москва",
      ]);
      expect(container.querySelector("thead tr:last-child td")?.textContent).toBe("city");
      expect([...container.querySelectorAll("tbody tr th")].map((cell) => cell.textContent)).toEqual(["3", "2", "4"]);
      expect(container.textContent).toContain("sorted by A, ascending");
      expect(container.querySelector("th[aria-sort='ascending']")?.textContent).toContain("A");

      await act(async () => {
        sortA!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect([...container.querySelectorAll("tbody tr td:first-of-type")].map((cell) => cell.textContent)).toEqual([
        "Москва",
        "Berlin",
        "Ankara",
      ]);
      expect(container.textContent).toContain("sorted by A, descending");

      await act(async () => {
        sortA!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect([...container.querySelectorAll("tbody tr td:first-of-type")].map((cell) => cell.textContent)).toEqual([
        "Berlin",
        "Ankara",
        "Москва",
      ]);
      expect(container.textContent).not.toContain("sorted by");
    } finally {
      unmount();
    }
  });

  it("keeps the scrolled column in view when that column is sorted", async () => {
    const sheet: SheetData = {
      name: "Wide",
      rows: [
        Array.from({ length: 20 }, (_, index) => `h${index}`),
        Array.from({ length: 20 }, (_, index) => `v${index}`),
      ],
      totalRows: 2,
      columnCount: 20,
      truncated: false,
    };

    const { container, unmount } = await mount(<SheetView lang="en" sheets={[sheet]} />);

    try {
      const scroller = container.querySelector("[data-sheet-scroller]");
      expect(scroller).toBeTruthy();

      let scrollLeft = 0;
      let scrollTop = 0;
      Object.defineProperty(scroller, "scrollLeft", {
        configurable: true,
        get: () => scrollLeft,
        set: (value: number) => {
          scrollLeft = value;
        },
      });
      Object.defineProperty(scroller, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      });
      scroller!.scrollLeft = 640;
      scroller!.scrollTop = 80;

      const sortM = container.querySelector('button[aria-label="Sort column M"]');
      expect(sortM).toBeTruthy();

      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => {
        sortM!.dispatchEvent(down);
        sortM!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });

      expect(down.defaultPrevented).toBe(true);
      expect(scroller!.scrollLeft).toBe(640);
      expect(scroller!.scrollTop).toBe(80);
      expect(container.textContent).toContain("sorted by M, ascending");
    } finally {
      unmount();
    }
  });

  it("finds cells that are not yet mounted and jumps to them", async () => {
    const sheet: SheetData = {
      name: "Big",
      rows: Array.from({ length: 300 }, (_, index) => [`row-${index}`]),
      totalRows: 300,
      columnCount: 1,
      truncated: false,
    };

    const { container, unmount } = await mount(<SheetView lang="en" sheets={[sheet]} />);

    try {
      expect(container.textContent).not.toContain("row-250");

      const input = container.querySelector('input[aria-label="Find in sheet"]');
      expect(input).toBeTruthy();

      await act(async () => {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        native?.set?.call(input, "row-250");
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(container.textContent).toContain("row-250");
      expect(container.textContent).toContain("1 of 1");
      expect(container.querySelector("mark")?.textContent).toBe("row-250");
    } finally {
      unmount();
    }
  });
});

describe("SheetView editing", () => {
  const editableSheet: SheetData = {
    name: "Cities",
    rows: [
      ["city", "count"],
      ["Berlin", "10"],
      ["Ankara", "2"],
      ["Москва", "10"],
    ],
    totalRows: 4,
    columnCount: 2,
    truncated: false,
    range: { startColumn: 0, startRow: 0, endColumn: 1, endRow: 3 },
  };

  function bodyFirstCell(container: HTMLElement): HTMLElement {
    return container.querySelector("tbody tr td")!;
  }

  async function typeInto(input: HTMLElement, text: string) {
    await act(async () => {
      const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      native?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("edits a cell on double-click and reports it by sheet and address", async () => {
    const onEditCell = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[editableSheet]} resetKey="f1" onEditCell={onEditCell} />,
    );

    try {
      const cell = bodyFirstCell(container);
      expect(cell.textContent).toBe("Berlin");

      await act(async () => {
        cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });

      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]');
      expect(input).toBeTruthy();
      expect(input!.value).toBe("Berlin"); // prefilled with the displayed value

      await typeInto(input!, "Tokyo");
      await act(async () => {
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });

      // sourceRow 1 + column A -> A2, exactly the cell the reader double-clicked.
      expect(onEditCell).toHaveBeenCalledWith("Cities", "A2", "Tokyo");
      expect(container.querySelector('input[aria-label="Edit cell"]')).toBeNull();
      // Focus returns to the edited cell, not left on <body>.
      expect(document.activeElement).toBe(cell);
    } finally {
      unmount();
    }
  });

  it("commits on blur and clears the cell when the draft is empty", async () => {
    const onEditCell = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[editableSheet]} resetKey="f1" onEditCell={onEditCell} />,
    );

    try {
      await act(async () => {
        bodyFirstCell(container).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;

      await typeInto(input, "");
      await act(async () => {
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });

      expect(onEditCell).toHaveBeenCalledWith("Cities", "A2", null);
    } finally {
      unmount();
    }
  });

  it("cancels an edit with Escape without committing", async () => {
    const onEditCell = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[editableSheet]} resetKey="f1" onEditCell={onEditCell} />,
    );

    try {
      await act(async () => {
        bodyFirstCell(container).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;

      await typeInto(input, "never saved");
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });

      expect(onEditCell).not.toHaveBeenCalled();
      expect(container.querySelector('input[aria-label="Edit cell"]')).toBeNull();
      expect(bodyFirstCell(container).textContent).toBe("Berlin");
      expect(document.activeElement).toBe(bodyFirstCell(container));
    } finally {
      unmount();
    }
  });

  it("records no edit when the committed draft equals the displayed value, so typing survives", async () => {
    const sheet: SheetData = {
      name: "Events",
      rows: [
        ["event", "date", "count"],
        ["deploy", "2026-01-05", "10"],
        ["audit", "2026-02-01", "3"],
      ],
      totalRows: 3,
      columnCount: 3,
      truncated: false,
      range: { startColumn: 0, startRow: 0, endColumn: 2, endRow: 2 },
    };
    const onEditCell = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[sheet]} resetKey="f1" onEditCell={onEditCell} />,
    );

    try {
      // The editor is prefilled with the formatted display string ("w"), not
      // the raw value; committing it unchanged must not re-type the cell.
      const dateCell = container.querySelectorAll("tbody tr td")[1]!;
      expect(dateCell.textContent).toBe("2026-01-05");
      await act(async () => {
        dateCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      let input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      expect(onEditCell).not.toHaveBeenCalled();

      const countCell = container.querySelectorAll("tbody tr td")[2]!;
      await act(async () => {
        countCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
      await typeInto(input, "10"); // the numeric display string, retyped verbatim
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      expect(onEditCell).not.toHaveBeenCalled();

      // A real change still records, and as the coerced value.
      await act(async () => {
        countCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
      await typeInto(input, "11");
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      expect(onEditCell).toHaveBeenCalledWith("Events", "C2", 11);
    } finally {
      unmount();
    }
  });

  it("keeps addressing by cell when the sheet is sorted", async () => {
    const onEditCell = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[editableSheet]} resetKey="f1" onEditCell={onEditCell} />,
    );

    try {
      await act(async () => {
        container.querySelector('button[aria-label="Sort column A"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      // Ankara (sourceRow 2) now sorts to the top of the body.
      expect(bodyFirstCell(container).textContent).toBe("Ankara");

      await act(async () => {
        bodyFirstCell(container).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit cell"]')!;
      expect(input.value).toBe("Ankara");

      await typeInto(input, "Izmir");
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });

      // Still row 3, column A of the sheet, regardless of the display order.
      expect(onEditCell).toHaveBeenCalledWith("Cities", "A3", "Izmir");
    } finally {
      unmount();
    }
  });

  it("offers an add-row button that asks for the row to be appended", async () => {
    const onAddRow = vi.fn();
    const { container, unmount } = await mount(
      <SheetView lang="en" sheets={[editableSheet]} resetKey="f1" onAddRow={onAddRow} />,
    );

    try {
      const button = container.querySelector('button[title^="Append an empty row"]');
      expect(button).toBeTruthy();

      await act(async () => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onAddRow).toHaveBeenCalledWith("Cities");
    } finally {
      unmount();
    }
  });

  it("stays read-only (no add-row, no editor) when no edit handler is given", () => {
    const { markup } = { markup: renderToStaticMarkup(<SheetView lang="en" sheets={[editableSheet]} />) };

    expect(markup).not.toContain("Add row");
    expect(markup).not.toContain("Double-click to edit");
  });
});

async function mount(ui: ReactElement) {
  // createRoot + act need this flag; jsdom does not set it on its own.
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
