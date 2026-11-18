import { describe, expect, it } from "vitest";

import { tableFromRows } from "@/lib/charts/data";
import { MAX_LINE_POINTS, histogramBins, prepare, type PreparedBars, type PreparedHistogram, type PreparedLine, type PreparedScatter } from "@/lib/charts/prepare";
import type { ChartSpec } from "@/lib/charts/spec";

const table = (rows: string[][]) => tableFromRows("S", rows, { header: true });
const spec = (over: Partial<ChartSpec>): ChartSpec => ({ type: "line", x: 0, y: [1], area: false, bins: null, aggregate: "none", horizontal: null, stacked: false, splitBy: null, ...over });

describe("line", () => {
  it("sorts a time axis and keeps every series aligned with it", () => {
    const t = table([["D", "A", "B"], ["2026-03-01", "3", "30"], ["2026-01-01", "1", "10"], ["2026-02-01", "2", ""]]);
    const p = prepare(t, spec({ x: 0, y: [1, 2] })) as PreparedLine;
    expect(p.xKind).toBe("time");
    expect(p.xs).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1)]);
    expect(p.series[0]!.values).toEqual([1, 2, 3]);
    expect(p.series[1]!.values).toEqual([10, null, 30]);
    expect(p.xLabels).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("treats labels as an ordinal axis, in sheet order", () => {
    const t = table([["Stage", "Users"], ["Visit", "100"], ["Signup", "40"], ["Pay", "10"]]);
    const p = prepare(t, spec({ x: 0, y: [1] })) as PreparedLine;
    expect(p.xKind).toBe("category");
    expect(p.xs).toEqual([0, 1, 2]);
    expect(p.xLabels).toEqual(["Visit", "Signup", "Pay"]);
  });

  it("uses a numeric column as a number axis, sorted", () => {
    const t = table([["X", "Y"], ["3", "9"], ["1", "1"], ["2", "4"]]);
    const p = prepare(t, spec({ x: 0, y: [1] })) as PreparedLine;
    expect(p.xKind).toBe("number");
    expect(p.xs).toEqual([1, 2, 3]);
    expect(p.series[0]!.values).toEqual([1, 4, 9]);
  });

  it("drops rows with no x, and thins very long series while keeping the last point", () => {
    const rows = [["N", "V"], ...Array.from({ length: 4000 }, (_, i) => [String(i), String(i * 2)])];
    const p = prepare(table(rows), spec({ x: 0, y: [1] })) as PreparedLine;
    expect(p.xs.length).toBeLessThanOrEqual(MAX_LINE_POINTS + 1);
    expect(p.xs[0]).toBe(0);
    expect(p.xs.at(-1)).toBe(3999);
    expect(p.thinned).toBe(4000 - p.xs.length);
  });

  it("gives each series the colour of its column, not of its position among the chosen ones", () => {
    const t = table([["D", "A", "B", "C"], ["2026-01-01", "1", "2", "3"], ["2026-01-02", "1", "2", "3"]]);
    const only = prepare(t, spec({ x: 0, y: [3] })) as PreparedLine;
    expect(only.series[0]!.slot).toBe(2);
    const all = prepare(t, spec({ x: 0, y: [1, 2, 3] })) as PreparedLine;
    expect(all.series.map((s) => s.slot)).toEqual([0, 1, 2]);
  });
});

describe("bars", () => {
  const t = table([["Region", "Revenue", "Orders"], ["North", "100", "5"], ["South", "80", "4"], ["North", "50", "2"], ["East", "", "1"]]);

  it("keeps rows as they are with no aggregation", () => {
    const p = prepare(t, spec({ type: "grouped", x: 0, y: [1, 2], aggregate: "none" })) as PreparedBars;
    expect(p.categories).toEqual(["North", "South", "North", "East"]);
    expect(p.series[0]!.values).toEqual([100, 80, 50, null]);
  });

  it("sums or averages rows that share a label, in first-seen order", () => {
    const sum = prepare(t, spec({ type: "grouped", x: 0, y: [1, 2], aggregate: "sum" })) as PreparedBars;
    expect(sum.categories).toEqual(["North", "South", "East"]);
    expect(sum.series[0]!.values).toEqual([150, 80, null]);
    expect(sum.series[1]!.values).toEqual([7, 4, 1]);
    const mean = prepare(t, spec({ type: "bar", x: 0, y: [1], aggregate: "mean" })) as PreparedBars;
    expect(mean.series[0]!.values).toEqual([75, 80, null]);
  });

  it("counts rows per label when no series is chosen", () => {
    const p = prepare(t, spec({ type: "bar", x: 0, y: [], aggregate: "count" }), "Rows") as PreparedBars;
    expect(p.categories).toEqual(["North", "South", "East"]);
    expect(p.series).toHaveLength(1);
    expect(p.series[0]).toMatchObject({ name: "Rows", slot: 0, values: [2, 1, 1] });
  });

  it("labels blank cells and limits the categories", () => {
    const rows = [["K", "V"], ["", "1"], ...Array.from({ length: 60 }, (_, i) => [`c${i}`, "1"])];
    const p = prepare(table(rows), spec({ type: "bar", x: 0, y: [1] })) as PreparedBars;
    expect(p.categories).toHaveLength(40);
    expect(p.categories[0]).toBe("");
    expect(p.omitted).toBe(21);
  });

  it("lies bars down when there are many or long labels", () => {
    expect(prepare(t, spec({ type: "bar", x: 0, y: [1] })).type).toBe("bar");
    expect((prepare(t, spec({ type: "bar", x: 0, y: [1] })) as PreparedBars).horizontal).toBe(false);
    const long = table([["K", "V"], ["A very long category name", "1"], ["B", "2"]]);
    expect((prepare(long, spec({ type: "bar", x: 0, y: [1] })) as PreparedBars).horizontal).toBe(true);
    expect((prepare(long, spec({ type: "bar", x: 0, y: [1], horizontal: false })) as PreparedBars).horizontal).toBe(false);
    const many = table([["K", "V"], ...Array.from({ length: 9 }, (_, i) => [`${i}`, "1"])]);
    expect((prepare(many, spec({ type: "bar", x: 0, y: [1] })) as PreparedBars).horizontal).toBe(true);
  });
});

describe("histogram", () => {
  it("counts every value exactly once, in round-width bins", () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9, 10];
    const bins = histogramBins(values, null);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(values.length);
    const widths = new Set(bins.map((b) => Number((b.to - b.from).toFixed(8))));
    expect(widths.size).toBe(1);
    expect([1, 2, 5, 10, 0.1, 0.2, 0.5].includes([...widths][0]!)).toBe(true);
    expect(bins[0]!.from).toBeLessThanOrEqual(1);
    expect(bins.at(-1)!.to).toBeGreaterThan(10);
  });

  it("puts a value on an edge in the bin that starts there", () => {
    const bins = histogramBins([0, 5, 10], 2);
    expect(bins).toEqual([
      { from: 0, to: 5, count: 1 },
      { from: 5, to: 10, count: 2 },
    ]);
  });

  it("honours a chosen bin count exactly", () => {
    expect(histogramBins([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toHaveLength(5);
    expect(histogramBins([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3).map((b) => b.count)).toEqual([3, 3, 4]);
  });

  it("copes with one value, no values, negatives and floats", () => {
    expect(histogramBins([7, 7, 7], null)).toEqual([{ from: 6.5, to: 7.5, count: 3 }]);
    expect(histogramBins([], null)).toEqual([]);
    const bins = histogramBins([-5, -1, 0, 3, 8], null);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(5);
    const floats = histogramBins([0.1, 0.25, 0.3, 0.31, 0.9], null);
    expect(floats.reduce((n, b) => n + b.count, 0)).toBe(5);
  });

  it("prepares from a column, skipping empty cells", () => {
    const t = table([["Score"], ["1"], [""], ["2"], ["2"], ["3"]]);
    const p = prepare(t, spec({ type: "histogram", x: null, y: [0] })) as PreparedHistogram;
    expect(p.total).toBe(4);
    expect(p.bins.reduce((n, b) => n + b.count, 0)).toBe(4);
    expect(p.name).toBe("Score");
  });
});

describe("scatter", () => {
  it("keeps the rows that have an x and aligns the series", () => {
    const t = table([["X", "Y", "Z"], ["1", "10", "100"], ["", "20", "200"], ["3", "", "300"]]);
    const p = prepare(t, spec({ type: "scatter", x: 0, y: [1, 2] })) as PreparedScatter;
    expect(p.xs).toEqual([1, 3]);
    expect(p.series[0]!.values).toEqual([10, null]);
    expect(p.series[1]!.values).toEqual([100, 300]);
    expect(p.series.map((s) => s.slot)).toEqual([1, 2]);
  });
});
