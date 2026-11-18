// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { textBuffer, windows1251Buffer, xlsBuffer, xlsxBuffer } from "./fixtures/sheet";
import {
  columnLabel,
  compareSheetCells,
  decodeRange,
  MAX_RENDERED_ROWS,
  orderedSheetRows,
  parseWorkbook,
  workbookToSheets,
} from "@/lib/viewer/sheet";

describe("columnLabel", () => {
  it("maps the single-letter columns", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
  });

  it("rolls over into two letters the way a spreadsheet does", () => {
    expect(columnLabel(26)).toBe("AA");
    expect(columnLabel(27)).toBe("AB");
    expect(columnLabel(51)).toBe("AZ");
    expect(columnLabel(52)).toBe("BA");
    expect(columnLabel(701)).toBe("ZZ");
    expect(columnLabel(702)).toBe("AAA");
  });
});

describe("compareSheetCells", () => {
  it("orders numbers by value rather than as text", () => {
    expect(compareSheetCells("2", "10")).toBeLessThan(0);
    expect(compareSheetCells("10", "2")).toBeGreaterThan(0);
    expect(compareSheetCells("$1,234.50", "$2")).toBeGreaterThan(0);
  });

  it("does not treat ticket-style text as a number", () => {
    expect(compareSheetCells("QA-1", "QA-2")).toBeLessThan(0);
    expect(compareSheetCells("item2", "item10")).toBeLessThan(0);
  });

  it("puts blank cells after values", () => {
    expect(compareSheetCells("", "apple")).toBeGreaterThan(0);
    expect(compareSheetCells("apple", "")).toBeLessThan(0);
    expect(compareSheetCells("  ", "")).toBe(0);
  });
});

describe("orderedSheetRows", () => {
  const rows = [
    ["city", "count"],
    ["Berlin", "10"],
    ["Ankara", "2"],
    ["Москва", "10"],
  ];

  it("leaves the header row in place and sorts the rest", () => {
    const ordered = orderedSheetRows(rows, { column: 0, direction: "asc" });

    expect(ordered.map((row) => row.cells[0])).toEqual(["city", "Ankara", "Berlin", "Москва"]);
    expect(ordered.map((row) => row.sourceRow)).toEqual([0, 2, 1, 3]);
  });

  it("sorts numbers in the chosen column", () => {
    const ascending = orderedSheetRows(rows, { column: 1, direction: "asc" });
    expect(ascending.map((row) => row.cells[1])).toEqual(["count", "2", "10", "10"]);
    // Equal counts keep their original relative order.
    expect(ascending.map((row) => row.sourceRow)).toEqual([0, 2, 1, 3]);

    const descending = orderedSheetRows(rows, { column: 1, direction: "desc" });
    expect(descending.map((row) => row.cells[1])).toEqual(["count", "10", "10", "2"]);
    expect(descending.map((row) => row.sourceRow)).toEqual([0, 1, 3, 2]);
  });

  it("keeps blank cells at the bottom in both directions", () => {
    const sparse = [["name"], ["b"], [""], ["a"]];

    expect(orderedSheetRows(sparse, { column: 0, direction: "asc" }).map((row) => row.cells[0])).toEqual([
      "name",
      "a",
      "b",
      "",
    ]);
    expect(orderedSheetRows(sparse, { column: 0, direction: "desc" }).map((row) => row.cells[0])).toEqual([
      "name",
      "b",
      "a",
      "",
    ]);
  });

  it("returns the original order when no sort is set", () => {
    expect(orderedSheetRows(rows, null).map((row) => row.sourceRow)).toEqual([0, 1, 2, 3]);
  });
});

describe("decodeRange", () => {
  it("returns zero-based bounds for a rectangular range", () => {
    expect(decodeRange("A1:C10")).toEqual({
      startColumn: 0,
      startRow: 0,
      endColumn: 2,
      endRow: 9,
    });
  });

  it("handles a range that does not start at A1", () => {
    expect(decodeRange("B2:D57")).toEqual({
      startColumn: 1,
      startRow: 1,
      endColumn: 3,
      endRow: 56,
    });
  });

  it("treats a bare address as a single cell", () => {
    expect(decodeRange("AA5")).toEqual({
      startColumn: 26,
      startRow: 4,
      endColumn: 26,
      endRow: 4,
    });
  });

  it("returns null for something that is not a range", () => {
    expect(decodeRange("")).toBeNull();
    expect(decodeRange("nonsense")).toBeNull();
  });
});

describe("workbookToSheets", () => {
  it("pads short rows so every row lines up with the header", () => {
    const sheets = workbookToSheets({
      SheetNames: ["Sheet1"],
      Sheets: {
        Sheet1: {
          "!ref": "A1:C2",
          A1: { v: "name" },
          B1: { v: "qty" },
          C1: { v: "note" },
          A2: { v: "widget" },
        },
      },
    });

    expect(sheets[0]!.rows).toEqual([
      ["name", "qty", "note"],
      ["widget", "", ""],
    ]);
    expect(sheets[0]!.columnCount).toBe(3);
  });

  it("prefers the cell's formatted text over the raw value", () => {
    const sheets = workbookToSheets({
      SheetNames: ["Sheet1"],
      Sheets: {
        Sheet1: {
          "!ref": "A1:A2",
          // What a date and a currency cell look like after SheetJS reads them.
          A1: { v: 45292, w: "01/01/24" },
          A2: { v: 1234.5, w: "$1,234.50" },
        },
      },
    });

    expect(sheets[0]!.rows).toEqual([["01/01/24"], ["$1,234.50"]]);
  });

  it("reports an empty sheet without inventing rows", () => {
    const sheets = workbookToSheets({
      SheetNames: ["Blank"],
      Sheets: { Blank: {} },
    });

    expect(sheets[0]).toEqual({
      name: "Blank",
      rows: [],
      totalRows: 0,
      columnCount: 0,
      truncated: false,
      range: null,
    });
  });
});

describe("parseWorkbook", () => {
  it("keeps every sheet of a multi-sheet workbook, in order", async () => {
    const buffer = xlsxBuffer({
      Summary: [["metric", "value"], ["defects", 12]],
      Details: [["id", "title"], ["BUG-1", "Login fails"]],
    });

    const { sheets } = await parseWorkbook({ buffer, extension: "xlsx" });

    expect(sheets.map((sheet) => sheet.name)).toEqual(["Summary", "Details"]);
    expect(sheets[0]!.rows).toEqual([
      ["metric", "value"],
      ["defects", "12"],
    ]);
    expect(sheets[1]!.rows[1]).toEqual(["BUG-1", "Login fails"]);
  });

  it("caps the rendered rows but still reports the real total", async () => {
    const overCap = MAX_RENDERED_ROWS + 1000;
    const rows = Array.from({ length: overCap }, (_, index) => [`row-${index}`]);

    const { sheets } = await parseWorkbook({
      buffer: xlsxBuffer({ Big: rows }),
      extension: "xlsx",
    });

    expect(sheets[0]!.totalRows).toBe(overCap);
    expect(sheets[0]!.rows).toHaveLength(MAX_RENDERED_ROWS);
    expect(sheets[0]!.truncated).toBe(true);
    expect(sheets[0]!.rows[0]).toEqual(["row-0"]);
  });

  it("does not flag a workbook under the cap as truncated", async () => {
    const { sheets } = await parseWorkbook({
      buffer: xlsxBuffer({ Small: [["a"], ["b"]] }),
      extension: "xlsx",
    });

    expect(sheets[0]!.truncated).toBe(false);
    expect(sheets[0]!.totalRows).toBe(2);
  });

  it("reads a UTF-8 CSV without mangling non-ASCII text", async () => {
    const buffer = textBuffer("name,city\nАнна,Москва\nBjörn,Malmö\n");

    const { sheets } = await parseWorkbook({ buffer, extension: "csv" });

    expect(sheets[0]!.rows).toEqual([
      ["name", "city"],
      ["Анна", "Москва"],
      ["Björn", "Malmö"],
    ]);
  });

  it("reads a windows-1251 CSV that is not valid UTF-8", async () => {
    const { sheets } = await parseWorkbook({
      buffer: windows1251Buffer("name,city\nАнна,Москва\n"),
      extension: "csv",
    });

    expect(sheets[0]!.rows).toEqual([
      ["name", "city"],
      ["Анна", "Москва"],
    ]);
  });

  it("splits a TSV on tabs", async () => {
    const buffer = textBuffer("a\tb\n1\t2\n");

    const { sheets } = await parseWorkbook({ buffer, extension: "tsv" });

    expect(sheets[0]!.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads an HTML .xls with windows-1251 and unquoted charset", async () => {
    // Generators often omit quotes around charset=windows-1251. SheetJS then
    // treats the file as delimited text, so the tags become cells.
    const html = `<meta http-equiv=Content-Type content=text/html; charset=windows-1251>
<html>
<head></head>
<body>
<table>
<tr><td>Имя</td><td>Город</td></tr>
<tr><td>Анна</td><td>Москва</td></tr>
</table>
</body>
</html>`;

    const { sheets } = await parseWorkbook({
      buffer: windows1251Buffer(html),
      extension: "xls",
    });

    expect(sheets[0]!.rows).toEqual([
      ["Имя", "Город"],
      ["Анна", "Москва"],
    ]);
    expect(sheets[0]!.rows.flat().join(" ")).not.toMatch(/html|body|meta/i);
  });

  it("reads a quoted-charset HTML .xls without mangling Cyrillic", async () => {
    const html = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">
</head>
<body>
<table>
<tr><td>Анна</td><td>Москва</td></tr>
</table>
</body>
</html>`;

    const { sheets } = await parseWorkbook({
      buffer: windows1251Buffer(html),
      extension: "xls",
    });

    expect(sheets[0]!.rows).toEqual([["Анна", "Москва"]]);
  });

  it("reads an HTML .xls that starts with an XML declaration", async () => {
    const html = `<?xml version="1.0" encoding="windows-1251"?>
<html>
<body>
<table>
<tr><td>Анна</td><td>Москва</td></tr>
</table>
</body>
</html>`;

    const { sheets } = await parseWorkbook({
      buffer: windows1251Buffer(html),
      extension: "xls",
    });

    expect(sheets[0]!.rows).toEqual([["Анна", "Москва"]]);
  });

  it("removes HTML resources before DOMParser while preserving captions and merged cells", async () => {
    const html = `<html><head><link rel="stylesheet" href="https://tracker.example/style"></head><body>
      <img src="https://tracker.example/pixel" srcset="//tracker.example/retina 2x">
      <iframe src="https://tracker.example/frame"></iframe>
      <svg><image href="https://tracker.example/svg"></image></svg>
      <video poster="https://tracker.example/poster"><source src="https://tracker.example/media"></video>
      <table background="https://tracker.example/background"><caption>Report <strong>2026</strong></caption>
        <thead><tr><th colspan="2">People</th></tr></thead>
        <tbody><tr><td rowspan="2">Анна<img src="https://tracker.example/cell"></td><td>Москва</td></tr>
        <tr><td><a href="https://example.com" ping="https://tracker.example/ping">Berlin</a></td></tr></tbody>
      </table></body></html>`;
    // jsdom does not load images. Inspect the real parser boundary instead of
    // treating the absence of jsdom network requests as a browser guarantee.
    const parser = vi.spyOn(DOMParser.prototype, "parseFromString");
    try {
      const { sheets } = await parseWorkbook({ buffer: textBuffer(html), extension: "xls" });
      expect(parser).toHaveBeenCalled();
      for (const [input] of parser.mock.calls) {
        expect(String(input)).not.toContain("tracker.example");
      }
      expect(sheets[0]!.name).toBe("Report 2026");
      expect(sheets[0]!.rows).toEqual([["People", ""], ["Анна", "Москва"], ["", "Berlin"]]);
      expect(sheets[0]!.columnCount).toBe(2);
    } finally {
      parser.mockRestore();
    }
  });

  it("turns each HTML table into its own sheet", async () => {
    const html = `<html><body>
<table><caption>People</caption><tr><td>Анна</td></tr></table>
<table><caption>Cities</caption><tr><td>Москва</td></tr></table>
</body></html>`;

    const { sheets } = await parseWorkbook({ buffer: textBuffer(html), extension: "xls" });

    expect(sheets.map((sheet) => sheet.name)).toEqual(["People", "Cities"]);
    expect(sheets[0]!.rows).toEqual([["Анна"]]);
    expect(sheets[1]!.rows).toEqual([["Москва"]]);
  });

  it("reads a real .xls workbook with Cyrillic text", async () => {
    const { sheets } = await parseWorkbook({
      buffer: xlsBuffer({ Лист1: [["Имя", "Город"], ["Анна", "Москва"]] }),
      extension: "xls",
    });

    expect(sheets[0]!.name).toBe("Лист1");
    expect(sheets[0]!.rows).toEqual([
      ["Имя", "Город"],
      ["Анна", "Москва"],
    ]);
  });

  it("reads SpreadsheetML encoded as windows-1251", async () => {
    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Лист1">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Анна</Data></Cell>
    <Cell><Data ss:Type="String">Москва</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const { sheets } = await parseWorkbook({
      buffer: windows1251Buffer(xml),
      extension: "xls",
    });

    expect(sheets[0]!.name).toBe("Лист1");
    expect(sheets[0]!.rows).toEqual([["Анна", "Москва"]]);
  });
});
