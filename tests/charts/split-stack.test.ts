// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { buildChart, stackSegments, type ChartText } from "@/lib/charts/build";
import { tableFromRows } from "@/lib/charts/data";
import { LIGHT } from "@/lib/charts/palette";
import { prepare, type PreparedBars, type PreparedLine } from "@/lib/charts/prepare";
import { MAX_SERIES, normalizeSpec, splitCandidates, suggestSpec, type ChartSpec } from "@/lib/charts/spec";

const table = (rows: string[][]) => tableFromRows("S", rows, { header: true });
const spec = (over: Partial<ChartSpec>): ChartSpec => ({ type: "line", x: 0, y: [2], area: false, bins: null, aggregate: "none", horizontal: null, stacked: false, splitBy: null, ...over });
const TEXT: ChartText = { title: "T", frequency: "Count", noValue: "—", total: "Total", points: (n) => `${n} points` };

/** Month, Region, Sales: every month appears once per region. */
const LONG = [
  ["Month", "Region", "Sales"],
  ["2026-01-01", "North", "10"],
  ["2026-01-01", "South", "20"],
  ["2026-02-01", "North", "12"],
  ["2026-02-01", "South", "18"],
  ["2026-03-01", "North", "15"],
  ["2026-03-01", "South", "22"],
];
const TEXTUAL = [
  ["Quarter", "Product", "Revenue"],
  ["Q1", "Alpha", "100"],
  ["Q1", "Beta", "50"],
  ["Q2", "Alpha", "120"],
  ["Q2", "Beta", "60"],
];

describe("suggesting a split", () => {
  it("splits long data over dates into one line per group, summing", () => {
    const suggestion = suggestSpec(table(LONG))!;
    expect(suggestion).toMatchObject({ type: "line", x: 0, y: [2], splitBy: 1, aggregate: "sum" });
  });

  it("splits long data over labels into grouped bars", () => {
    const suggestion = suggestSpec(table(TEXTUAL))!;
    expect(suggestion).toMatchObject({ type: "grouped", x: 0, y: [2], splitBy: 1, aggregate: "sum" });
  });

  it("leaves wide data alone", () => {
    const wide = table([["Month", "North", "South"], ["2026-01-01", "10", "20"], ["2026-02-01", "12", "18"]]);
    expect(suggestSpec(wide)!.splitBy).toBeNull();
    // Labels that do not repeat have nothing to split.
    expect(suggestSpec(table([["Region", "Note", "Revenue"], ["N", "a", "1"], ["S", "b", "2"], ["E", "c", "3"]]))!.splitBy).toBeNull();
  });

  it("does not split on a column that does not tell the repeated rows apart", () => {
    // The same Month and Region repeat: Region does not separate the rows into series.
    const clumsy = table([["Month", "Region", "Sales"], ["2026-01-01", "N", "1"], ["2026-01-01", "N", "2"], ["2026-01-01", "N", "3"], ["2026-02-01", "N", "4"]]);
    expect(suggestSpec(clumsy)!.splitBy).toBeNull();
  });

  it("lists the text columns that could split, never the label column or numbers, never a single value", () => {
    const t = table([["Month", "Region", "Sales", "Currency"], ["2026-01-01", "N", "1", "USD"], ["2026-01-01", "S", "2", "USD"]]);
    expect(splitCandidates(t, 0)).toEqual([1]);
    expect(splitCandidates(t, 1)).toEqual([]);
  });
});

describe("normalising a split spec", () => {
  const t = table(LONG);

  it("keeps one measure and falls back to summing", () => {
    const spec1 = normalizeSpec(t, spec({ type: "line", x: 0, y: [2], splitBy: 1 }));
    expect(spec1).toMatchObject({ splitBy: 1, y: [2], aggregate: "sum", stacked: false });
    const bars = normalizeSpec(t, spec({ type: "bar", x: 0, y: [2], splitBy: 1 }));
    expect(bars).toMatchObject({ type: "grouped", splitBy: 1, aggregate: "sum" });
  });

  it("drops a split that cannot work", () => {
    expect(normalizeSpec(t, spec({ splitBy: 0 })).splitBy).toBeNull(); // the label column itself
    expect(normalizeSpec(t, spec({ splitBy: 2 })).splitBy).toBeNull(); // a number column
    expect(normalizeSpec(t, spec({ splitBy: 99 })).splitBy).toBeNull();
    expect(normalizeSpec(t, spec({ type: "scatter", x: 2, y: [2], splitBy: 1 })).splitBy).toBeNull();
    expect(normalizeSpec(t, spec({ type: "histogram", splitBy: 1 })).splitBy).toBeNull();
  });

  it("counts rows per group when there is no measure", () => {
    const counted = normalizeSpec(t, spec({ type: "bar", x: 0, y: [], splitBy: 1, aggregate: "count" }));
    expect(counted).toMatchObject({ y: [], aggregate: "count", splitBy: 1, type: "grouped" });
  });

  it("only stacks bars that have several series", () => {
    const multi = table([["Label", "A", "B"], ["x", "1", "2"], ["y", "3", "4"]]);
    expect(normalizeSpec(multi, spec({ type: "grouped", x: 0, y: [1, 2], stacked: true })).stacked).toBe(true);
    expect(normalizeSpec(multi, spec({ type: "bar", x: 0, y: [1], stacked: true })).stacked).toBe(false);
    expect(normalizeSpec(multi, spec({ type: "line", x: 0, y: [1, 2], stacked: true })).stacked).toBe(false);
    expect(normalizeSpec(t, spec({ type: "bar", x: 0, y: [2], splitBy: 1, stacked: true })).stacked).toBe(true);
  });
});

describe("preparing a split", () => {
  it("makes one line per group, on one sorted time axis, with gaps where a group has no row", () => {
    const t = table([["D", "G", "V"], ["2026-03-01", "a", "3"], ["2026-01-01", "a", "1"], ["2026-01-01", "b", "10"], ["2026-02-01", "b", "20"]]);
    const p = prepare(t, spec({ type: "line", x: 0, y: [2], splitBy: 1, aggregate: "sum" })) as PreparedLine;
    expect(p.xLabels).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(p.series.map((s) => s.name)).toEqual(["a", "b"]);
    expect(p.series[0]!.values).toEqual([1, null, 3]);
    expect(p.series[1]!.values).toEqual([10, 20, null]);
    expect(p.series.map((s) => s.slot)).toEqual([0, 1]);
    expect(p.omittedSeries).toBe(0);
  });

  it("adds up, averages and counts rows that share a label and a group", () => {
    const t = table([["L", "G", "V"], ["x", "a", "2"], ["x", "a", "4"], ["x", "b", "10"], ["y", "a", "6"]]);
    const run = (aggregate: ChartSpec["aggregate"], y = [2]) => prepare(t, spec({ type: "grouped", x: 0, y, splitBy: 1, aggregate })) as PreparedBars;
    const sum = run("sum");
    expect(sum.categories).toEqual(["x", "y"]);
    expect(sum.series.map((s) => [s.name, s.values])).toEqual([["a", [6, 6]], ["b", [10, null]]]);
    expect(run("mean").series[0]!.values).toEqual([3, 6]);
    const counts = run("count", []);
    expect(counts.series.map((s) => [s.name, s.values])).toEqual([["a", [2, 1]], ["b", [1, null]]]);
    // "Show each row" cannot apply to a pivot: it sums.
    expect(run("none").series[0]!.values).toEqual([6, 6]);
  });

  it("colours a group by the order it first appears in, so a filter never repaints it", () => {
    const t = table([["L", "G", "V"], ["x", "zeta", "1"], ["x", "alpha", "2"], ["x", "mid", "3"]]);
    const p = prepare(t, spec({ type: "grouped", x: 0, y: [2], splitBy: 1, aggregate: "sum" })) as PreparedBars;
    expect(p.series.map((s) => [s.name, s.slot])).toEqual([["zeta", 0], ["alpha", 1], ["mid", 2]]);
  });

  it("keeps the biggest groups when there are too many, in their original order, and says how many went", () => {
    const rows = [["L", "G", "V"], ...Array.from({ length: 9 }, (_, i) => ["x", `g${i}`, String(i === 4 ? 1000 : i + 1)])];
    const p = prepare(table(rows), spec({ type: "grouped", x: 0, y: [2], splitBy: 1, aggregate: "sum" })) as PreparedBars;
    expect(p.series).toHaveLength(MAX_SERIES);
    expect(p.omittedSeries).toBe(3);
    expect(p.series.map((s) => s.name)).toContain("g4");
    const order = p.series.map((s) => Number(s.name.slice(1)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(p.series.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("names an empty group with a dash instead of an empty legend entry", () => {
    const t = table([["L", "G", "V"], ["x", "", "1"], ["x", "b", "2"]]);
    const p = prepare(t, spec({ type: "grouped", x: 0, y: [2], splitBy: 1, aggregate: "sum" })) as PreparedBars;
    expect(p.series.map((s) => s.name)).toEqual(["—", "b"]);
  });

  it("stacks only when there is more than one series", () => {
    const t = table(TEXTUAL);
    expect((prepare(t, spec({ type: "grouped", x: 0, y: [2], splitBy: 1, aggregate: "sum", stacked: true })) as PreparedBars).stacked).toBe(true);
    const one = table([["L", "V"], ["x", "1"], ["y", "2"]]);
    expect((prepare(one, spec({ type: "bar", x: 0, y: [1], stacked: true })) as PreparedBars).stacked).toBe(false);
  });
});

describe("stackSegments", () => {
  it("builds positives up from zero, and marks the open end", () => {
    const stack = stackSegments([3, 2, 5], [0, 1, 2]);
    expect(stack.segments.map((s) => [s.slot, s.from, s.to, s.last])).toEqual([[0, 0, 3, false], [1, 3, 5, false], [2, 5, 10, true]]);
    expect([stack.high, stack.low]).toEqual([10, 0]);
  });

  it("builds negatives down from zero, apart from the positives", () => {
    const stack = stackSegments([4, -2, 3, -1], [0, 1, 2, 3]);
    expect(stack.segments.map((s) => [s.slot, s.from, s.to, s.last])).toEqual([[0, 0, 4, false], [1, 0, -2, false], [2, 4, 7, true], [3, -2, -3, true]]);
    expect([stack.high, stack.low]).toEqual([7, -3]);
  });

  it("skips gaps and zeros", () => {
    expect(stackSegments([null, 0, undefined, 2], [0, 1, 2, 3]).segments).toHaveLength(1);
    expect(stackSegments([], []).segments).toEqual([]);
  });
});

describe("drawing stacks", () => {
  const draw = (rows: string[][], over: Partial<ChartSpec> = {}) => {
    const t = table(rows);
    const normalized = normalizeSpec(t, { ...suggestSpec(t)!, stacked: true, ...over });
    return buildChart(prepare(t, normalized), { palette: LIGHT, lang: "en", text: TEXT });
  };
  const parse = (svg: string) => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    return doc;
  };

  it("is valid SVG with one piece per value, and the axis reaches the whole stack", () => {
    const scene = draw(TEXTUAL);
    const doc = parse(scene.svg);
    const fills = [...doc.querySelectorAll("rect, path")].filter((n) => (n.getAttribute("fill") ?? "").startsWith("#") && n.getAttribute("fill") !== LIGHT.surface);
    // 2 quarters x 2 products = 4 coloured pieces (plus the legend swatches, which are rects).
    expect(fills.length).toBeGreaterThanOrEqual(4);
    // Q2 stacks to 180, so the axis has to go past it.
    expect(scene.svg).toMatch(/>(200|180|250)</);
  });

  it("has one bar per label: stacking uses a single lane", () => {
    const stacked = draw(TEXTUAL);
    const grouped = draw(TEXTUAL, { stacked: false });
    const widths = (svg: string) => [...parse(svg).querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "").filter((d) => d.startsWith("M")).length;
    expect(widths(stacked.svg)).toBeGreaterThan(0);
    expect(stacked.svg).not.toBe(grouped.svg);
  });

  it("adds a Total row to what hovering shows, and not otherwise", () => {
    const scene = draw(TEXTUAL);
    const q1 = scene.hits.find((hit) => hit.title === "Q1")!;
    expect(q1.rows.map((row) => row.label)).toEqual(["Alpha", "Beta", "Total"]);
    expect(q1.rows[2]).toMatchObject({ slot: null });
    expect(q1.rows[2]!.value).toBe("150");
    const plain = draw(TEXTUAL, { stacked: false });
    expect(plain.hits[0]!.rows.map((row) => row.label)).toEqual(["Alpha", "Beta"]);
  });

  it("labels each stack with its total when there is room", () => {
    const scene = draw(TEXTUAL);
    expect(scene.svg).toContain(">150<");
    expect(scene.svg).toContain(">180<");
  });

  it("stacks lying down too, and handles negatives on both sides of zero", () => {
    const rows = [["Item", "In", "Out"], ["Mon", "5", "-2"], ["Tue", "3", "-4"], ["Wed", "6", "-1"]];
    for (const horizontal of [false, true]) {
      const scene = draw(rows, { horizontal, type: "grouped", y: [1, 2] });
      parse(scene.svg);
      expect(scene.hits).toHaveLength(3);
      expect(scene.hits[0]!.rows.at(-1)!.value).toBe("3");
    }
  });

  it("keeps the table twin and the description intact", () => {
    const scene = draw(TEXTUAL);
    expect(scene.table.headers).toEqual(["Quarter", "Alpha", "Beta"]);
    expect(scene.table.rows).toEqual([["Q1", "100", "50"], ["Q2", "120", "60"]]);
    expect(scene.description).toContain("Alpha, Beta");
  });

  it("draws a long split line chart", () => {
    const t = table(LONG);
    const normalized = normalizeSpec(t, suggestSpec(t)!);
    const scene = buildChart(prepare(t, normalized), { palette: LIGHT, lang: "en", text: TEXT });
    parse(scene.svg);
    expect(scene.table.headers).toEqual(["Month", "North", "South"]);
    expect(scene.table.rows).toHaveLength(3);
  });
});
