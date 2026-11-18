// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { buildChart, type ChartText, type Scene } from "@/lib/charts/build";
import { tableFromRows } from "@/lib/charts/data";
import { DARK, LIGHT } from "@/lib/charts/palette";
import { prepare } from "@/lib/charts/prepare";
import { normalizeSpec, suggestSpec, type ChartSpec } from "@/lib/charts/spec";

const TEXT: ChartText = { title: "Sales by month", frequency: "Count", noValue: "—", total: "Total", points: (n) => `${n} points` };

const table = (rows: string[][]) => tableFromRows("S", rows, { header: true });
function scene(rows: string[][], over: Partial<ChartSpec> = {}, options: Partial<Parameters<typeof buildChart>[1]> = {}): Scene {
  const t = table(rows);
  const base = suggestSpec(t)!;
  const spec = normalizeSpec(t, { ...base, ...over });
  return buildChart(prepare(t, spec), { palette: LIGHT, lang: "en", text: TEXT, area: spec.area, ...options });
}

const parse = (svg: string) => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
};

const monthly = [
  ["Month", "Sales", "Costs"],
  ["2026-01-01", "10", "4"],
  ["2026-02-01", "12", "5"],
  ["2026-03-01", "9", "6"],
  ["2026-04-01", "15", "7"],
];
const regions = [
  ["Region", "Revenue"],
  ["North", "100"],
  ["South", "80"],
  ["East", "60"],
];

describe("every chart", () => {
  const cases: [string, Scene][] = [
    ["line", scene(monthly)],
    ["bar", scene(regions)],
    ["grouped", scene([["Region", "Revenue", "Orders"], ["North", "100", "5"], ["South", "80", "4"]])],
    ["histogram", scene([["Score"], ["1"], ["2"], ["2"], ["3"], ["9"]])],
    ["scatter", scene([["H", "W"], ["170", "70"], ["160", "55"], ["180", "80"]], { type: "scatter" })],
  ];

  it.each(cases)("%s is well-formed SVG with a title, a description and a role", (_name, s) => {
    const doc = parse(s.svg);
    const root = doc.documentElement;
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("viewBox")).toBe(`0 0 ${s.width} ${s.height}`);
    expect(doc.querySelector("title")?.textContent).toBeTruthy();
    expect(doc.querySelector("desc")?.textContent).toBeTruthy();
    expect(s.hits.length).toBeGreaterThan(0);
    expect(s.table.headers.length).toBeGreaterThan(0);
    expect(s.table.rows.length).toBeGreaterThan(0);
  });

  it.each(cases)("%s never writes text in a series colour", (_name, s) => {
    const inks: string[] = [LIGHT.ink, LIGHT.secondary, LIGHT.muted];
    for (const node of parse(s.svg).querySelectorAll("text")) expect(inks).toContain(node.getAttribute("fill"));
  });

  it.each(cases)("%s stays inside its own canvas", (_name, s) => {
    for (const hit of s.hits) {
      expect(hit.x).toBeGreaterThanOrEqual(0);
      expect(hit.x).toBeLessThanOrEqual(s.width);
    }
    expect(s.plot.left).toBeLessThan(s.plot.right);
    expect(s.plot.top).toBeLessThan(s.plot.bottom);
    expect(s.plot.bottom).toBeLessThan(s.height);
  });

  it("is deterministic", () => {
    expect(scene(monthly).svg).toBe(scene(monthly).svg);
  });

  it("escapes anything that came from a sheet", () => {
    const evil = `</text><script>alert(1)</script>"&`;
    const s = scene([[evil, "V"], [evil, "1"], ["b", "2"]], { type: "bar", aggregate: "none" });
    expect(s.svg).not.toContain("<script");
    parse(s.svg);
    expect(s.svg).toContain("&lt;script&gt;");
  });
});

describe("line chart", () => {
  it("draws one 2px round-joined line per series, dots with a surface ring, and a legend", () => {
    const s = scene(monthly);
    const doc = parse(s.svg);
    const lines = [...doc.querySelectorAll("path")].filter((node) => node.getAttribute("stroke-width") === "2" && node.getAttribute("fill") === "none");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.getAttribute("stroke-linejoin")).toBe("round");
    expect(lines[0]!.getAttribute("stroke")).toBe(LIGHT.series[0]);
    expect(lines[1]!.getAttribute("stroke")).toBe(LIGHT.series[1]);
    const dots = [...doc.querySelectorAll("circle")];
    expect(dots).toHaveLength(8);
    expect(dots[0]!.getAttribute("r")).toBe("4");
    expect(dots[0]!.getAttribute("stroke")).toBe(LIGHT.surface);
    expect(dots[0]!.getAttribute("stroke-width")).toBe("2");
    // A legend names both series.
    const labels = [...doc.querySelectorAll("text")].map((node) => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Sales", "Costs"]));
  });

  it("shows no legend for one series", () => {
    const s = scene([["Month", "Sales"], ["2026-01-01", "10"], ["2026-02-01", "12"]]);
    expect([...parse(s.svg).querySelectorAll("line")].filter((n) => n.getAttribute("stroke") === LIGHT.series[0])).toHaveLength(0);
  });

  it("makes one crosshair hit per x, listing every series with the value first", () => {
    const s = scene(monthly);
    expect(s.hitMode).toBe("x");
    expect(s.hits).toHaveLength(4);
    expect(s.hits[0]!.title).toBe("1 Jan 2026");
    expect(s.hits[0]!.rows).toEqual([
      { label: "Sales", value: "10", slot: 0 },
      { label: "Costs", value: "4", slot: 1 },
    ]);
    expect(s.hits[0]!.marks).toHaveLength(2);
    // The hits run left to right.
    const xs = s.hits.map((h) => h.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("breaks the line where a value is missing and says so in the tooltip", () => {
    const s = scene([["D", "A"], ["2026-01-01", "1"], ["2026-01-02", ""], ["2026-01-03", "3"], ["2026-01-04", "4"], ["2026-01-05", "5"]]);
    const path = [...parse(s.svg).querySelectorAll("path")].find((n) => n.getAttribute("fill") === "none")!;
    expect((path.getAttribute("d")!.match(/M/g) ?? []).length).toBe(2);
    expect(s.hits[1]!.rows[0]!.value).toBe("—");
    expect(s.hits[1]!.marks).toHaveLength(0);
  });

  it("adds an area wash at about 10% opacity", () => {
    const s = scene(monthly, { area: true });
    const washes = [...parse(s.svg).querySelectorAll("path")].filter((n) => n.getAttribute("fill-opacity") === "0.1");
    expect(washes).toHaveLength(2);
    expect(scene(monthly).svg).not.toContain('fill-opacity="0.1"');
  });

  it("labels the end of each line, unless two would collide", () => {
    const apart = scene([["D", "A", "B"], ["2026-01-01", "1", "100"], ["2026-01-02", "2", "200"]]);
    expect([...parse(apart.svg).querySelectorAll("text")].map((n) => n.textContent)).toEqual(expect.arrayContaining(["2", "200"]));
    // 71 and 72 sit about a pixel apart and are not on an axis tick, so only one label can fit.
    const together = scene([["D", "A", "B"], ["2026-01-01", "1", "1"], ["2026-01-02", "71", "72"]]);
    const labels = [...parse(together.svg).querySelectorAll("text")].map((n) => n.textContent);
    expect(labels.filter((l) => l === "71" || l === "72")).toHaveLength(1);
  });

  it("omits dots when there are many points", () => {
    const rows = [["N", "V"], ...Array.from({ length: 100 }, (_, i) => [String(i), String(i % 7)])];
    expect(parse(scene(rows, { type: "line" }).svg).querySelectorAll("circle")).toHaveLength(0);
  });

  it("copes with a single point", () => {
    const s = scene([["D", "V"], ["2026-01-01", "5"]], { type: "line", x: 0, y: [1] });
    expect(parse(s.svg).querySelectorAll("circle")).toHaveLength(1);
    expect(s.hits).toHaveLength(1);
  });
});

describe("bar chart", () => {
  const barPaths = (s: Scene) => [...parse(s.svg).querySelectorAll("path")].filter((n) => n.getAttribute("fill")?.startsWith("#") || n.getAttribute("fill")?.startsWith("url"));
  /** The x extent of a vertical bar's path. */
  const widthOf = (d: string) => {
    const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    return Math.max(...xs) - Math.min(...xs);
  };

  it("draws one bar per value in one colour, never thicker than 24px", () => {
    const s = scene(regions);
    const bars = barPaths(s);
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.getAttribute("fill")).toBe(LIGHT.series[0]);
      expect(widthOf(bar.getAttribute("d")!)).toBeLessThanOrEqual(24);
    }
  });

  it("gives every bar the same width, with a 2px gap inside a group", () => {
    const s = scene([["Region", "Revenue", "Orders"], ["North", "100", "5"], ["South", "80", "4"]]);
    const bars = barPaths(s);
    expect(bars).toHaveLength(4);
    const widths = new Set(bars.map((b) => widthOf(b.getAttribute("d")!)));
    expect(widths.size).toBe(1);
    // A bar's path starts at its left edge: "M<x> <y>…".
    const left = (bar: Element) => Number(/^M(-?\d+(?:\.\d+)?)/.exec(bar.getAttribute("d")!)![1]);
    const width = widthOf(bars[0]!.getAttribute("d")!);
    expect(Number((left(bars[1]!) - left(bars[0]!) - width).toFixed(1))).toBe(2);
  });

  it("colours grouped series by column and adds a legend", () => {
    const s = scene([["Region", "Revenue", "Orders"], ["North", "100", "5"], ["South", "80", "4"]]);
    const colours = barPaths(s).map((b) => b.getAttribute("fill"));
    expect(new Set(colours)).toEqual(new Set([LIGHT.series[0], LIGHT.series[1]]));
    expect([...parse(s.svg).querySelectorAll("text")].map((n) => n.textContent)).toEqual(expect.arrayContaining(["Revenue", "Orders"]));
  });

  it("draws negative values downward from the same baseline", () => {
    const s = scene([["K", "V"], ["a", "5"], ["b", "-3"]], { type: "bar", x: 0, y: [1] });
    expect(barPaths(s)).toHaveLength(2);
    const [up, down] = barPaths(s).map((b) => b.getAttribute("d")!);
    // The data end is rounded (a curve), the baseline end is square.
    expect(up).toContain("Q");
    expect(down).toContain("Q");
    expect(up).not.toBe(down);
  });

  it("labels the bar tips of a short chart, and only the largest of a long one", () => {
    const labels = (s: Scene) => [...parse(s.svg).querySelectorAll("text")].map((n) => n.textContent);
    expect(labels(scene(regions))).toEqual(expect.arrayContaining(["100", "80", "60"]));
    const rows = [["K", "V"], ...Array.from({ length: 12 }, (_, i) => [`c${i}`, String((i + 1) * 10)])];
    const long = labels(scene(rows, { type: "bar", x: 0, y: [1], horizontal: false }));
    expect(long).toContain("120");
    expect(long).not.toContain("110");
  });

  it("lays long or many categories down, growing taller instead of crowding", () => {
    const few = scene(regions);
    const rows = [["K", "V"], ...Array.from({ length: 20 }, (_, i) => [`category ${i}`, String(i + 1)])];
    const many = scene(rows, { type: "bar", x: 0, y: [1] });
    expect(many.height).toBeGreaterThan(few.height);
    expect(many.hits[0]!.w).toBeGreaterThan(many.hits[0]!.h!);
    expect(few.hits[0]!.h).toBeGreaterThan(few.hits[0]!.w!);
  });

  it("makes each category a hover band", () => {
    const s = scene(regions);
    expect(s.hitMode).toBe("band");
    expect(s.hits.map((h) => h.title)).toEqual(["North", "South", "East"]);
    expect(s.hits[0]!.rows).toEqual([{ label: "Revenue", value: "100", slot: 0 }]);
    // Bands tile the plot without overlap.
    const edges = s.hits.map((h) => [h.x, h.x + h.w!]);
    expect(edges[0]![1]).toBeCloseTo(edges[1]![0], 5);
  });

  it("counts rows when there is no number", () => {
    const s = scene([["Team", "Role"], ["A", "dev"], ["A", "qa"], ["B", "dev"]]);
    expect(s.hits.map((h) => [h.title, h.rows[0]!.value])).toEqual([["A", "2"], ["B", "1"]]);
  });

  it("reports omitted categories as a note", () => {
    const rows = [["K", "V"], ...Array.from({ length: 50 }, (_, i) => [`c${i}`, "1"])];
    expect(scene(rows, { type: "bar", x: 0, y: [1] }).notes).toEqual(["10"]);
  });
});

describe("histogram", () => {
  it("draws one bar per non-empty bin and a table that adds up", () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 8, 9];
    const s = scene([["Score"], ...values.map((v) => [String(v)])]);
    const bars = [...parse(s.svg).querySelectorAll("path")].filter((n) => n.getAttribute("fill") === LIGHT.series[0]);
    const nonEmpty = s.table.rows.filter((row) => row[1] !== "0").length;
    expect(bars).toHaveLength(nonEmpty);
    expect(s.table.rows.reduce((n, row) => n + Number(row[1]), 0)).toBe(values.length);
    expect(s.hitMode).toBe("band");
    expect(s.hits.every((h) => h.rows[0]!.label === "Count")).toBe(true);
  });

  it("labels only the tallest bin", () => {
    const s = scene([["Score"], ["1"], ["1"], ["1"], ["5"], ["9"]]);
    const numeric = [...parse(s.svg).querySelectorAll("text")].map((n) => n.textContent).filter((t) => t === "3");
    expect(numeric.length).toBeGreaterThanOrEqual(1);
  });
});

describe("scatter", () => {
  it("draws a dot per point with a ring and targets the nearest", () => {
    const s = scene([["H", "W"], ["170", "70"], ["160", "55"], ["180", "80"]], { type: "scatter" });
    const dots = [...parse(s.svg).querySelectorAll("circle")];
    expect(dots).toHaveLength(3);
    expect(dots.every((d) => d.getAttribute("r") === "4" && d.getAttribute("stroke") === LIGHT.surface)).toBe(true);
    expect(s.hitMode).toBe("point");
    expect(s.hits).toHaveLength(3);
    expect(s.hits[0]!.rows[0]).toMatchObject({ label: "W", value: "70" });
    expect(s.hits[0]!.title).toBe("H: 170");
  });

  it("thins the ring on dense plots", () => {
    const rows = [["X", "Y"], ...Array.from({ length: 400 }, (_, i) => [String(i), String((i * 7) % 50)])];
    const s = scene(rows, { type: "scatter" });
    expect(parse(s.svg).querySelector("circle")!.getAttribute("stroke-width")).toBe("1");
  });
});

describe("patterns and themes", () => {
  it("fills bars with a hatch when asked, at 45° and its mirror only", () => {
    const s = scene([["Region", "Revenue", "Orders"], ["North", "100", "5"], ["South", "80", "4"]], {}, { patterns: true, uid: "x" });
    const doc = parse(s.svg);
    const patterns = [...doc.querySelectorAll("pattern")];
    expect(patterns.map((p) => p.getAttribute("patternTransform"))).toEqual(["rotate(45)", "rotate(135)"]);
    expect(patterns.map((p) => p.getAttribute("id"))).toEqual(["x-p0", "x-p1"]);
    const fills = [...doc.querySelectorAll("path")].map((n) => n.getAttribute("fill")).filter((f) => f?.startsWith("url"));
    expect(new Set(fills)).toEqual(new Set(["url(#x-p0)", "url(#x-p1)"]));
  });

  it("defines no patterns by default", () => {
    expect(scene(regions).svg).not.toContain("<pattern");
  });

  it("uses the dark palette's own steps on its own surface", () => {
    const s = scene(monthly, {}, { palette: DARK });
    const doc = parse(s.svg);
    expect(doc.querySelector("rect")!.getAttribute("fill")).toBe(DARK.surface);
    const strokes = [...doc.querySelectorAll("path")].map((n) => n.getAttribute("stroke")).filter(Boolean);
    expect(strokes).toEqual(expect.arrayContaining([DARK.series[0], DARK.series[1]]));
    expect(s.svg).not.toContain(LIGHT.series[0]!);
  });

  it("keeps ids unique across charts by uid", () => {
    const a = scene(regions, {}, { patterns: true, uid: "a" }).svg;
    const b = scene(regions, {}, { patterns: true, uid: "b" }).svg;
    expect(a).toContain('id="a-p0"');
    expect(b).toContain('id="b-p0"');
  });
});

describe("language", () => {
  it("formats numbers and dates for the reader", () => {
    const rows = [["Month", "Sales"], ["2026-01-01", "1500"], ["2026-02-01", "2500"], ["2026-03-01", "2000"]];
    const t = table(rows);
    const spec = suggestSpec(t)!;
    const s = buildChart(prepare(t, spec), { palette: LIGHT, lang: "ru", text: TEXT });
    expect(s.hits[0]!.rows[0]!.value.replace(/\s/g, " ")).toBe("1 500");
    expect(s.hits[0]!.title).toMatch(/янв/);
  });
});

describe("width", () => {
  it("draws at the width it is given, with the same text size, adapting rather than shrinking", () => {
    const wide = scene(monthly, {}, { width: 720 });
    const narrow = scene(monthly, {}, { width: 360 });
    expect(narrow.width).toBe(360);
    expect(narrow.height).toBeLessThan(wide.height);
    const sizes = (s: Scene) => new Set([...parse(s.svg).querySelectorAll("text")].map((n) => n.getAttribute("font-size")));
    expect([...sizes(narrow)].sort()).toEqual([...sizes(wide)].sort());
    // Everything stays inside the canvas.
    for (const node of parse(narrow.svg).querySelectorAll("text")) {
      expect(Number(node.getAttribute("x"))).toBeGreaterThanOrEqual(0);
      expect(Number(node.getAttribute("x"))).toBeLessThanOrEqual(360);
    }
    expect(narrow.hits.every((h) => h.x <= 360)).toBe(true);
  });

  it("wraps the legend onto more rows when there is less room", () => {
    const rows = [["D", ...Array.from({ length: 6 }, (_, i) => `Series number ${i}`)], ["2026-01-01", ...Array(6).fill("1")], ["2026-01-02", ...Array(6).fill("2")]];
    const wide = scene(rows, {}, { width: 960 });
    const narrow = scene(rows, {}, { width: 320 });
    const keyRows = (s: Scene) => new Set([...parse(s.svg).querySelectorAll("line")].filter((n) => n.getAttribute("stroke-width") === "2").map((n) => n.getAttribute("y1"))).size;
    expect(keyRows(narrow)).toBeGreaterThan(keyRows(wide));
  });

  it("lets a caller choose the height", () => {
    expect(scene(monthly, {}, { height: 500 }).height).toBe(500);
  });
});
