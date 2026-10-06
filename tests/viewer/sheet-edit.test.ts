import { describe, expect, it, vi } from "vitest";

import { applyEdits, coerceSheetValue, encodeRange, serializeWorkbook } from "@/lib/viewer/sheet-edit";

import type { RawWorkbook } from "@/lib/viewer/sheet";

/** Builds the minimal workbook shape sheet.ts reads out of a real one. */
function fixtureWorkbook(): RawWorkbook {
  return {
    SheetNames: ["Data", "Empty"],
    Sheets: {
      Data: {
        "!ref": "A1:B3",
        A1: { t: "s", v: "city" },
        B1: { t: "s", v: "count" },
        A2: { t: "s", v: "Berlin" },
        B2: { t: "n", v: 10 },
        A3: { t: "s", v: "Ankara" },
        B3: { t: "n", v: 2 },
        "!cols": [{ wch: 12 }],
      },
      Empty: {},
    },
  };
}

describe("applyEdits", () => {
  it("applies a text edit and never mutates the input workbook", () => {
    const workbook = fixtureWorkbook();

    const edited = applyEdits(workbook, [{ sheetName: "Data", addr: "A2", value: "Tokyo" }]);

    // The original is byte-for-byte untouched.
    expect(workbook.Sheets.Data!.A2).toEqual({ t: "s", v: "Berlin" });
    expect(workbook.Sheets.Data!["!ref"]).toBe("A1:B3");
    // A fresh workbook object came back with the new value.
    expect(edited).not.toBe(workbook);
    expect(edited.Sheets.Data).not.toBe(workbook.Sheets.Data);
    expect(edited.Sheets.Data!.A2).toEqual({ t: "s", v: "Tokyo" });
    // Untouched cells carry over, including the sheet's own metadata keys.
    expect(edited.Sheets.Data!.B2).toEqual({ t: "n", v: 10 });
    expect(edited.Sheets.Data!["!cols"]).toBe(workbook.Sheets.Data!["!cols"]);
    expect(edited.SheetNames).toEqual(["Data", "Empty"]);
  });

  it("applies numeric edits as number cells", () => {
    const edited = applyEdits(fixtureWorkbook(), [{ sheetName: "Data", addr: "B2", value: 42 }]);

    expect(edited.Sheets.Data!.B2).toEqual({ t: "n", v: 42 });
  });

  it("clears a cell on a null edit and leaves the range alone", () => {
    const edited = applyEdits(fixtureWorkbook(), [{ sheetName: "Data", addr: "A3", value: null }]);

    expect(edited.Sheets.Data!.A3).toBeUndefined();
    expect("A3" in edited.Sheets.Data!).toBe(false);
    expect(edited.Sheets.Data!["!ref"]).toBe("A1:B3");
  });

  it("clearing a cell that does not exist is a harmless no-op", () => {
    const edited = applyEdits(fixtureWorkbook(), [{ sheetName: "Data", addr: "Z99", value: null }]);

    expect(edited.Sheets.Data!["!ref"]).toBe("A1:B3");
  });

  it("extends the range when an edit lands outside it, so the row becomes part of the sheet", () => {
    const edited = applyEdits(fixtureWorkbook(), [{ sheetName: "Data", addr: "B5", value: "new" }]);

    expect(edited.Sheets.Data!["!ref"]).toBe("A1:B5");
    expect(edited.Sheets.Data!.B5).toEqual({ t: "s", v: "new" });
  });

  it("keeps untouched sheets shared rather than copied", () => {
    const workbook = fixtureWorkbook();

    const edited = applyEdits(workbook, [{ sheetName: "Data", addr: "A1", value: "x" }]);

    expect(edited.Sheets.Empty).toBe(workbook.Sheets.Empty);
  });

  it("skips edits that name a sheet the workbook does not have", () => {
    const workbook = fixtureWorkbook();

    const edited = applyEdits(workbook, [
      { sheetName: "Nope", addr: "A1", value: "ghost" },
      { sheetName: "Data", addr: "A1", value: "kept" },
    ]);

    expect(workbook.Sheets.Nope).toBeUndefined();
    expect(edited.Sheets.Data!.A1).toEqual({ t: "s", v: "kept" });
    expect(Object.keys(edited.Sheets)).toEqual(["Data", "Empty"]);
  });

  it("applies edits in order, so a later edit to the same cell wins", () => {
    const edited = applyEdits(fixtureWorkbook(), [
      { sheetName: "Data", addr: "A1", value: "first" },
      { sheetName: "Data", addr: "A1", value: null },
      { sheetName: "Data", addr: "A1", value: "final" },
    ]);

    expect(edited.Sheets.Data!.A1).toEqual({ t: "s", v: "final" });
  });

  it("ignores malformed addresses instead of writing junk cells", () => {
    const edited = applyEdits(fixtureWorkbook(), [{ sheetName: "Data", addr: "not-an-addr", value: "x" }]);

    expect(edited.Sheets.Data!["!ref"]).toBe("A1:B3");
    expect(Object.keys(edited.Sheets.Data!).filter((key) => !key.startsWith("!"))).toHaveLength(6);
  });

  it("never mutates the input workbook, whatever the edit mix — checked by full snapshot", () => {
    const workbook = fixtureWorkbook();
    const before = JSON.stringify(workbook);

    applyEdits(workbook, [
      { sheetName: "Data", addr: "A2", value: "Tokyo" }, // text write
      { sheetName: "Data", addr: "B3", value: null }, // clear
      { sheetName: "Data", addr: "E9", value: 7 }, // range-extending write
      { sheetName: "Nope", addr: "A1", value: "ghost" }, // unknown sheet
      { sheetName: "Data", addr: "not-an-addr", value: "junk" }, // malformed address
    ]);

    expect(JSON.stringify(workbook)).toBe(before);
  });
});

describe("encodeRange", () => {
  it("round-trips single-cell and multi-cell ranges", () => {
    expect(encodeRange({ startColumn: 0, startRow: 0, endColumn: 0, endRow: 0 })).toBe("A1");
    expect(encodeRange({ startColumn: 1, startRow: 4, endColumn: 3, endRow: 9 })).toBe("B5:D10");
    expect(encodeRange({ startColumn: 26, startRow: 0, endColumn: 27, endRow: 1 })).toBe("AA1:AB2");
  });
});

describe("coerceSheetValue", () => {
  it("turns an empty draft into a clear", () => {
    expect(coerceSheetValue("")).toBeNull();
    expect(coerceSheetValue("   ")).toBeNull();
  });

  it("keeps plain decimals numeric so the saved file stays typed", () => {
    expect(coerceSheetValue("42")).toBe(42);
    expect(coerceSheetValue(" -3.5 ")).toBe(-3.5);
  });

  it("keeps everything else as the text that was typed", () => {
    expect(coerceSheetValue("QA-1")).toBe("QA-1");
    expect(coerceSheetValue("$1,234")).toBe("$1,234");
    expect(coerceSheetValue("007")).toBe("007"); // padded ids/zip codes must not lose their zeros
  });
});

describe("serializeWorkbook", () => {
  it("asks the writer for the requested book type and hands back the bytes", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const write = vi.fn(() => payload);

    const bytes = serializeWorkbook({ write } as never, fixtureWorkbook(), "xlsx");

    expect(write).toHaveBeenCalledWith(fixtureWorkbook(), { type: "array", bookType: "xlsx" });
    expect(bytes).toBe(payload);
  });

  it("passes xlsm through as its own book type", () => {
    const write = vi.fn(() => new Uint8Array([9]));
    serializeWorkbook({ write } as never, fixtureWorkbook(), "xlsm");

    expect(write).toHaveBeenCalledWith(expect.anything(), { type: "array", bookType: "xlsm" });
  });

  it("wraps an ArrayBuffer result into a Uint8Array view", () => {
    const buffer = new Uint8Array([7, 8]).buffer;
    const bytes = serializeWorkbook({ write: () => buffer } as never, fixtureWorkbook(), "xlsx");

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([7, 8]);
  });
});

