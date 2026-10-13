import { describe, expect, it } from "vitest";

import { tableFromRows } from "@/lib/charts/data";
import {
  MAX_SCATTER_SERIES,
  MAX_SERIES,
  availableTypes,
  normalizeSpec,
  plottableColumns,
  slotOf,
  suggestSpec,
  type ChartSpec,
} from "@/lib/charts/spec";

const table = (rows: string[][]) => tableFromRows("S", rows, { header: true });
const spec = (over: Partial<ChartSpec>): ChartSpec => ({ type: "line", x: 0, y: [1], area: false, bins: null, aggregate: "none", horizontal: null, stacked: false, splitBy: null, ...over });

const monthly = table([
  ["Month", "Sales", "Costs", "Note"],
  ["2026-01", "10", "4", "a"],
  ["2026-02", "12", "5", "b"],
  ["2026-03", "9", "6", "c"],
]);
const categories = table([
  ["Region", "Revenue", "Orders"],
  ["North", "100", "5"],
  ["South", "80", "4"],
  ["East", "60", "3"],
]);

describe("suggestSpec — shape detection", () => {
  it("a date column first means a line over every number column", () => {
    expect(suggestSpec(monthly)).toMatchObject({ type: "line", x: 0, y: [1, 2] });
  });

  it("labels and one number mean bars; labels and several numbers mean grouped bars", () => {
    expect(suggestSpec(table([["Region", "Revenue"], ["N", "1"], ["S", "2"]]))).toMatchObject({ type: "bar", x: 0, y: [1] });
    expect(suggestSpec(categories)).toMatchObject({ type: "grouped", x: 0, y: [1, 2] });
  });

  it("repeated labels are summed by default", () => {
    const repeated = table([["Region", "Revenue"], ["N", "1"], ["S", "2"], ["N", "3"]]);
    expect(suggestSpec(repeated)).toMatchObject({ type: "bar", aggregate: "sum" });
    expect(suggestSpec(categories)!.aggregate).toBe("none");
  });

  it("two numbers mean a scatter, unless the first rises steadily, which means a line", () => {
    expect(suggestSpec(table([["Height", "Weight"], ["170", "70"], ["160", "55"], ["180", "80"]]))).toMatchObject({ type: "scatter", x: 0, y: [1] });
    expect(suggestSpec(table([["Year", "Value"], ["2020", "5"], ["2021", "6"], ["2022", "9"]]))).toMatchObject({ type: "line", x: 0, y: [1] });
  });

  it("a lone number column is a histogram", () => {
    expect(suggestSpec(table([["Score"], ["1"], ["2"], ["2"], ["3"]]))).toMatchObject({ type: "histogram", x: null, y: [0] });
  });

  it("labels with no numbers are counted", () => {
    expect(suggestSpec(table([["Team", "Role"], ["A", "dev"], ["A", "qa"], ["B", "dev"]]))).toMatchObject({ type: "bar", y: [], aggregate: "count" });
  });

  it("offers nothing for an empty table", () => {
    expect(suggestSpec(tableFromRows("S", []))).toBeNull();
  });

  it("caps the number of series it suggests", () => {
    const wide = table([["D", ...Array.from({ length: 9 }, (_, i) => `S${i}`)], ["2026-01-01", ...Array(9).fill("1")], ["2026-01-02", ...Array(9).fill("2")]]);
    expect(suggestSpec(wide)!.y).toHaveLength(MAX_SERIES);
  });
});

describe("slotOf — colour follows the column", () => {
  it("is the column's place among the numeric columns, whatever is switched on", () => {
    expect(slotOf(monthly, 1)).toBe(0);
    expect(slotOf(monthly, 2)).toBe(1);
    expect(slotOf(monthly, 0)).toBeNull();
    expect(slotOf(monthly, 3)).toBeNull();
  });

  it("never reuses a colour past the eighth numeric column", () => {
    const wide = table([Array.from({ length: 10 }, (_, i) => `N${i}`), Array.from({ length: 10 }, () => "1"), Array.from({ length: 10 }, () => "2")]);
    expect(plottableColumns(wide)).toHaveLength(8);
    expect(slotOf(wide, 7)).toBe(7);
    expect(slotOf(wide, 8)).toBeNull();
  });
});

describe("availableTypes", () => {
  it("offers what the data can draw", () => {
    expect(availableTypes(monthly)).toEqual(["line", "bar", "grouped", "histogram", "scatter"]);
    expect(availableTypes(table([["Score"], ["1"], ["2"]]))).toEqual(["histogram"]);
    expect(availableTypes(table([["Team", "Role"], ["A", "dev"], ["B", "qa"]]))).toEqual(["bar"]);
    expect(availableTypes(tableFromRows("S", []))).toEqual([]);
  });
});

describe("normalizeSpec", () => {
  it("keeps a valid spec as it is", () => {
    const s = suggestSpec(monthly)!;
    expect(normalizeSpec(monthly, s)).toEqual(s);
  });

  it("drops columns that cannot be plotted and the x column from the series", () => {
    expect(normalizeSpec(monthly, spec({ y: [0, 1, 3, 99, 1] })).y).toEqual([1]);
  });

  it("falls back to a numeric series when none is left", () => {
    expect(normalizeSpec(monthly, spec({ y: [3] })).y).toEqual([1]);
  });

  it("turns bar into grouped and back by the number of series", () => {
    expect(normalizeSpec(categories, spec({ type: "bar", x: 0, y: [1, 2] })).type).toBe("grouped");
    expect(normalizeSpec(categories, spec({ type: "grouped", x: 0, y: [1] })).type).toBe("bar");
  });

  it("a histogram has one series and no x", () => {
    expect(normalizeSpec(monthly, spec({ type: "histogram", x: 0, y: [1, 2] }))).toMatchObject({ type: "histogram", x: null, y: [1] });
  });

  it("a scatter needs a numeric x and different numeric ys", () => {
    const s = normalizeSpec(monthly, spec({ type: "scatter", x: 0, y: [1, 2] }));
    expect(s.x).toBe(1);
    expect(s.y).toEqual([2]);
    const wide = table([["a", "b", "c", "d", "e"], ["1", "2", "3", "4", "5"], ["2", "3", "4", "5", "6"]]);
    expect(normalizeSpec(wide, spec({ type: "scatter", x: 0, y: [1, 2, 3, 4] })).y).toHaveLength(MAX_SCATTER_SERIES);
  });

  it("clamps the bin count", () => {
    expect(normalizeSpec(monthly, spec({ type: "histogram", y: [1], bins: 1 })).bins).toBe(3);
    expect(normalizeSpec(monthly, spec({ type: "histogram", y: [1], bins: 500 })).bins).toBe(60);
    expect(normalizeSpec(monthly, spec({ type: "histogram", y: [1], bins: null })).bins).toBeNull();
  });

  it("counts rows when a bar chart has no series, and never counts alongside one", () => {
    const counts = table([["Team", "Role"], ["A", "dev"], ["B", "qa"]]);
    expect(normalizeSpec(counts, spec({ type: "bar", x: 0, y: [], aggregate: "none" }))).toMatchObject({ y: [], aggregate: "count" });
    expect(normalizeSpec(categories, spec({ type: "bar", x: 0, y: [1], aggregate: "count" })).aggregate).toBe("sum");
  });

  it("repairs an x column that does not exist", () => {
    expect(normalizeSpec(monthly, spec({ x: 42 })).x).toBe(0);
  });
});
