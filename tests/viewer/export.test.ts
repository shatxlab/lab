// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  baseFileName,
  htmlToMarkdown,
  htmlToText,
  rowsToDelimited,
  sheetDataToJson,
  standaloneHtml,
  workbookSheetToCsv,
  workbookSheetToJson,
  workbookToXlsx,
} from "@/lib/viewer/export";
import { parseWorkbook } from "@/lib/viewer/sheet";
import { xlsxBuffer } from "./fixtures/sheet";

describe("rowsToDelimited", () => {
  it("quotes cells with delimiters, quotes and newlines", () => {
    expect(rowsToDelimited([["a", "b,c", 'say "hi"', "line\nbreak", null, 5]])).toBe('a,"b,c","say ""hi""","line\nbreak",,5');
  });

  it("supports a tab delimiter", () => {
    expect(rowsToDelimited([["a", "b\tc"]], "\t")).toBe('a\t"b\tc"');
  });
});

describe("sheet exports", () => {
  it("exports a real workbook sheet to CSV and JSON", async () => {
    const buffer = xlsxBuffer({ People: [["name", "age"], ["Ann", 30], ["Bob", 25]] });
    const { workbook } = await parseWorkbook({ buffer, extension: "xlsx" });
    expect(await workbookSheetToCsv(workbook!, "People")).toContain("Ann,30");
    expect(JSON.parse(await workbookSheetToJson(workbook!, "People"))).toEqual([
      { name: "Ann", age: 30 },
      { name: "Bob", age: 25 },
    ]);
    const bytes = await workbookToXlsx(workbook!);
    expect(bytes[0]).toBe(0x50); // ZIP "PK"
  });

  it("dedupes header names for display-only sheets", () => {
    const json = sheetDataToJson({
      name: "S",
      rows: [["a", "a", ""], ["1", "2", "3"]],
      totalRows: 2,
      columnCount: 3,
      truncated: false,
    });
    expect(JSON.parse(json)).toEqual([{ a: "1", a_2: "2", column3: "3" }]);
  });
});

describe("HTML conversions", () => {
  const html = "<h1>Title</h1><p>Hello <strong>world</strong> &amp; <em>all</em></p><ul><li>one</li><li>two</li></ul><table><tr><th>A</th><th>B|C</th></tr><tr><td>1</td><td>2</td></tr></table>";

  it("converts to Markdown, tables included", () => {
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("Hello **world** & *all*");
    expect(md).toMatch(/-\s+one/);
    expect(md).toContain("| A | B\\|C |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("converts to readable plain text", () => {
    const text = htmlToText(html);
    expect(text).toContain("Title\n\nHello world & all");
    expect(text).toContain("• one\n• two");
    expect(text).toContain("A\tB|C\n1\t2");
  });

  it("keeps preformatted whitespace in plain text", () => {
    expect(htmlToText("<pre>a  b\n  c</pre>")).toBe("a  b\n  c");
  });

  it("wraps markup in a standalone document and escapes the title", () => {
    const page = standaloneHtml('A <b> "doc"', "<p>x</p>", "ru");
    expect(page).toContain("<!doctype html>");
    expect(page).toContain('<html lang="ru">');
    expect(page).toContain("<title>A &lt;b&gt; &quot;doc&quot;</title>");
    expect(page).toContain("<p>x</p>");
  });
});

describe("baseFileName", () => {
  it("strips directories and the last extension", () => {
    expect(baseFileName("a/b/report.q1.xlsx")).toBe("report.q1");
    expect(baseFileName("README")).toBe("README");
    expect(baseFileName(".gitignore")).toBe(".gitignore");
  });
});
