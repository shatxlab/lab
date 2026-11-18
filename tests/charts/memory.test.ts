import { describe, expect, it } from "vitest";

import { isLabKey } from "@/lib/apps/backup";
import { CHART_MEMORY_KEY, MAX_FILES, cleanMemory, cleanSpec, fileKey, readChartMemory, rememberOpenSheet, rememberSheet } from "@/lib/charts/memory";

function memory(initial?: string) {
  const map = new Map<string, string>(initial === undefined ? [] : [[CHART_MEMORY_KEY, initial]]);
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}
const blank = { spec: {}, title: "", header: null };

describe("chart memory", () => {
  it("lives under a lab: key, so the settings backup carries it", () => {
    expect(isLabKey(CHART_MEMORY_KEY)).toBe(true);
  });

  it("names a file by its name and size", () => {
    expect(fileKey("data.csv", 10)).not.toBe(fileKey("data.csv", 11));
    expect(fileKey("a.csv", 10)).not.toBe(fileKey("b.csv", 10));
  });

  it("remembers a sheet's settings and which sheet was open", () => {
    const storage = memory();
    rememberSheet("f|1", "Q1", { spec: { type: "bar", y: [2], stacked: true }, title: "Mine", header: true }, storage);
    rememberSheet("f|1", "Q2", { spec: { type: "line" }, title: "", header: null }, storage);
    const read = readChartMemory(storage)["f|1"]!;
    expect(read.sheet).toBe("Q2");
    expect(read.sheets.Q1).toEqual({ spec: { type: "bar", y: [2], stacked: true }, title: "Mine", header: true });
    expect(read.sheets.Q2!.spec).toEqual({ type: "line" });
  });

  it("only changes the open sheet when asked to, keeping what was saved", () => {
    const storage = memory();
    rememberSheet("f|1", "A", { spec: { type: "bar" }, title: "t", header: false }, storage);
    rememberOpenSheet("f|1", "B", storage);
    const read = readChartMemory(storage)["f|1"]!;
    expect(read.sheet).toBe("B");
    expect(read.sheets.A!.title).toBe("t");
    expect(read.sheets.B).toEqual(blank);
  });

  it("forgets the least recently used files first", () => {
    const storage = memory();
    for (let i = 0; i < MAX_FILES + 5; i += 1) rememberSheet(`f${i}|1`, "S", blank, storage);
    const files = Object.keys(readChartMemory(storage));
    expect(files).toHaveLength(MAX_FILES);
    expect(files).not.toContain("f0|1");
    expect(files).toContain(`f${MAX_FILES + 4}|1`);
    // Using an old file again moves it to the front.
    rememberSheet("f10|1", "S", blank, storage);
    expect(Object.keys(readChartMemory(storage)).at(-1)).toBe("f10|1");
  });

  it("drops anything a spec may not hold", () => {
    expect(
      cleanSpec({ type: "pie", x: -1, y: [1, "a", 2.5, 5000, 3], area: "yes", bins: "x", aggregate: "median", horizontal: 1, stacked: 1, splitBy: "1", extra: 1 }),
    ).toEqual({ y: [1, 3] });
    expect(cleanSpec({ type: "grouped", x: null, bins: 12, aggregate: "sum", horizontal: null, stacked: true, splitBy: 2, area: true })).toEqual({
      type: "grouped",
      x: null,
      bins: 12,
      aggregate: "sum",
      horizontal: null,
      stacked: true,
      splitBy: 2,
      area: true,
    });
    expect(cleanSpec(null)).toEqual({});
    expect(cleanSpec("x")).toEqual({});
  });

  it("copes with a corrupt or hostile store", () => {
    expect(readChartMemory(memory("{not json"))).toEqual({});
    expect(readChartMemory(memory("[1,2]"))).toEqual({});
    expect(readChartMemory(memory('"x"'))).toEqual({});
    expect(readChartMemory(undefined)).toEqual({});
    expect(cleanMemory({ a: 1, b: { sheets: 5 }, c: { sheet: 3, sheets: { S: { title: 9, header: "yes", spec: { type: "bar" } }, T: null } } })).toEqual({
      b: { sheet: "", sheets: {} },
      c: { sheet: "", sheets: { S: { spec: { type: "bar" }, title: "", header: null } } },
    });
  });

  it("survives a store that refuses to write", () => {
    const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => rememberSheet("f|1", "S", blank, full)).not.toThrow();
    expect(() => rememberOpenSheet("f|1", "S", undefined)).not.toThrow();
  });

  it("limits the title it keeps", () => {
    const storage = memory();
    rememberSheet("f|1", "S", { spec: {}, title: "x".repeat(500), header: null }, storage);
    expect(readChartMemory(storage)["f|1"]!.sheets.S!.title).toHaveLength(120);
  });
});
