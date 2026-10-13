import { describe, expect, it } from "vitest";

import { detectHeader, parseDate, parseNumber, tableFromRows } from "@/lib/charts/data";

describe("parseNumber", () => {
  it.each([
    ["42", 42],
    ["-3.5", -3.5],
    ["+7", 7],
    ["−5", -5],
    ["1,234", 1234],
    ["1,234,567.89", 1234567.89],
    ["1.234.567,89", 1234567.89],
    ["1 234,5", 1234.5],
    ["1 234", 1234],
    ["12,5", 12.5],
    ["1.234.567", 1234567],
    ["$1,200", 1200],
    ["12%", 12],
    ["€ 3,50", 3.5],
    ["(300)", -300],
    ["(1,000.50)", -1000.5],
    ["1e3", 1000],
    [".5", 0.5],
  ])("reads %s as %s", (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each(["", "abc", "12abc", "1,2,3", "1.2.3", "--5", "-", ".", "NaN", "Infinity", "1,23,456", "2026-10-13", "n/a", "12 apples"])("rejects %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe("parseDate", () => {
  const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

  it("reads ISO dates, with or without a time, and year-month", () => {
    expect(parseDate("2026-10-13")).toBe(day(2026, 10, 13));
    expect(parseDate("2026/10/13")).toBe(day(2026, 10, 13));
    expect(parseDate("2026-10-13T08:30:00Z")).toBe(day(2026, 10, 13));
    expect(parseDate("2026-10-13 08:30")).toBe(day(2026, 10, 13));
    expect(parseDate("2026-03")).toBe(day(2026, 3, 1));
  });

  it("reads dotted and slashed dates, resolving the unambiguous ones", () => {
    expect(parseDate("13.10.2026")).toBe(day(2026, 10, 13));
    expect(parseDate("13/10/2026")).toBe(day(2026, 10, 13));
    expect(parseDate("10/13/2026")).toBe(day(2026, 10, 13));
  });

  it("uses the reader's convention only for the ambiguous ones", () => {
    expect(parseDate("05/06/2026", false)).toBe(day(2026, 5, 6));
    expect(parseDate("05/06/2026", true)).toBe(day(2026, 6, 5));
  });

  it.each(["", "2026", "13", "2026-13-01", "2026-02-30", "31.02.2026", "tomorrow", "10/10/26"])("rejects %j", (text) => {
    expect(parseDate(text)).toBeNull();
  });
});

describe("detectHeader", () => {
  it("sees a text row above numbers as a header", () => {
    expect(detectHeader([["Month", "Sales"], ["Jan", "10"], ["Feb", "12"]])).toBe(true);
  });

  it("does not take a row of numbers or dates for a header", () => {
    expect(detectHeader([["1", "2"], ["3", "4"]])).toBe(false);
    expect(detectHeader([["2026-01-01", "5"], ["2026-01-02", "6"]])).toBe(false);
    expect(detectHeader([["Jan", "10"], ["Feb", "12"]])).toBe(false);
  });

  it("takes the first row of an all-text table as its header only with two columns", () => {
    expect(detectHeader([["Name", "Team"], ["Ann", "A"], ["Bo", "B"]])).toBe(true);
    expect(detectHeader([["Name"], ["Ann"], ["Bo"]])).toBe(false);
  });

  it("needs a body", () => {
    expect(detectHeader([["Month", "Sales"]])).toBe(false);
    expect(detectHeader([])).toBe(false);
  });
});

describe("tableFromRows", () => {
  const rows = [
    ["Month", "Sales", "Share", "Note"],
    ["2026-01", "1,200", "12%", "good"],
    ["2026-02", "1,500", "15%", ""],
    ["2026-03", "900", "9%", "slow"],
  ];

  it("types the columns and names them from the header", () => {
    const table = tableFromRows("Sheet1", rows);
    expect(table.header).toBe(true);
    expect(table.rowCount).toBe(3);
    expect(table.columns.map((c) => [c.name, c.kind])).toEqual([
      ["Month", "date"],
      ["Sales", "number"],
      ["Share", "number"],
      ["Note", "text"],
    ]);
    expect(table.columns[1]!.numbers).toEqual([1200, 1500, 900]);
    expect(table.columns[0]!.times[0]).toBe(Date.UTC(2026, 0, 1));
  });

  it("names columns by letter when there is no header", () => {
    const table = tableFromRows("S", [["1", "2"], ["3", "4"]]);
    expect(table.header).toBe(false);
    expect(table.columns.map((c) => c.name)).toEqual(["Column A", "Column B"]);
    expect(table.rowCount).toBe(2);
  });

  it("honours a forced header setting", () => {
    expect(tableFromRows("S", [["1", "2"], ["3", "4"]], { header: true }).rowCount).toBe(1);
    expect(tableFromRows("S", rows, { header: false }).rowCount).toBe(4);
  });

  it("keeps a column's kind when a few cells are off, and nulls those cells", () => {
    const table = tableFromRows("S", [["N"], ["1"], ["2"], ["3"], ["4"], ["n/a"]], { header: true });
    expect(table.columns[0]).toMatchObject({ kind: "number", numbers: [1, 2, 3, 4, null] });
  });

  it("calls a mostly-text column text", () => {
    const table = tableFromRows("S", [["X"], ["a"], ["b"], ["1"]], { header: true });
    expect(table.columns[0]!.kind).toBe("text");
  });

  it("drops empty rows and columns", () => {
    const table = tableFromRows("S", [["A", "", "C"], ["1", "", "2"], ["", "", ""], ["3", "", "4"]]);
    expect(table.rowCount).toBe(2);
    expect(table.columns.map((c) => c.name)).toEqual(["A", "C"]);
  });

  it("pads short rows", () => {
    const table = tableFromRows("S", [["A", "B"], ["1"], ["2", "3"]], { header: true });
    expect(table.columns[1]!.labels).toEqual(["", "3"]);
  });

  it("reads at most MAX_ROWS rows and says so", () => {
    const big = [["N"], ...Array.from({ length: 5100 }, (_, i) => [String(i)])];
    const table = tableFromRows("S", big, { header: true });
    expect(table.rowCount).toBe(5000);
    expect(table.truncated).toBe(true);
  });

  it("passes the day-first convention through", () => {
    const rows2 = [["D", "V"], ["05/06/2026", "1"], ["06/06/2026", "2"]];
    expect(tableFromRows("S", rows2, { dayFirst: true }).columns[0]!.times[0]).toBe(Date.UTC(2026, 5, 5));
    expect(tableFromRows("S", rows2).columns[0]!.times[0]).toBe(Date.UTC(2026, 4, 6));
  });

  it("handles an empty sheet", () => {
    expect(tableFromRows("S", [])).toMatchObject({ columns: [], rowCount: 0 });
  });
});
