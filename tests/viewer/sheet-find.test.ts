// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { orderedSheetRows } from "@/lib/viewer/sheet";
import { findSheetMatches, splitHighlighted } from "@/lib/viewer/sheet-find";

const rows = orderedSheetRows(
  [
    ["city", "count"],
    ["Berlin", "10"],
    ["Ankara", "2"],
    ["Москва", "10"],
  ],
  null,
);

describe("findSheetMatches", () => {
  it("finds case-insensitive substring matches across cells", () => {
    expect(findSheetMatches(rows, "an")).toEqual([
      { displayIndex: 2, sourceRow: 2, column: 0 },
    ]);
  });

  it("returns every cell that contains the query", () => {
    expect(findSheetMatches(rows, "10")).toEqual([
      { displayIndex: 1, sourceRow: 1, column: 1 },
      { displayIndex: 3, sourceRow: 3, column: 1 },
    ]);
  });

  it("ignores blank queries", () => {
    expect(findSheetMatches(rows, "   ")).toEqual([]);
  });
});

describe("splitHighlighted", () => {
  it("splits out each case-insensitive match", () => {
    expect(splitHighlighted("Ankara and an apple", "AN")).toEqual([
      { text: "An", match: true },
      { text: "kara ", match: false },
      { text: "an", match: true },
      { text: "d ", match: false },
      { text: "an", match: true },
      { text: " apple", match: false },
    ]);
  });

  it("returns the original text when there is nothing to highlight", () => {
    expect(splitHighlighted("Berlin", "")).toEqual([{ text: "Berlin", match: false }]);
  });
});
