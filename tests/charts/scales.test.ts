import { describe, expect, it } from "vitest";

import { formatCompact, formatDate, formatTick, formatTickNumber, formatValue, niceAxis, niceStep, timeTicks } from "@/lib/charts/scales";

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe("niceStep", () => {
  it.each([
    [0.9, 1],
    [1.4, 1],
    [1.5, 2],
    [2.9, 2],
    [3, 5],
    [6.9, 5],
    [7, 10],
    [18, 20],
    [0.03, 0.05],
    [0.07, 0.1],
    [4500, 5000],
  ])("rounds %s to %s", (raw, step) => {
    expect(niceStep(raw)).toBeCloseTo(step, 10);
  });

  it("falls back to 1 for nonsense", () => {
    for (const bad of [0, -3, NaN, Infinity]) expect(niceStep(bad)).toBe(1);
  });
});

describe("niceAxis golden cases", () => {
  it("rounds the range out to round numbers", () => {
    expect(niceAxis(0, 97)).toMatchObject({ min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] });
    expect(niceAxis(3, 17)).toMatchObject({ min: 2, max: 18, step: 2 });
    expect(niceAxis(1200, 1530, { count: 4 })).toMatchObject({ min: 1200, max: 1600, step: 100 });
  });

  it("includes zero when asked, whichever side the data is on", () => {
    expect(niceAxis(40, 90, { includeZero: true }).min).toBe(0);
    expect(niceAxis(-90, -40, { includeZero: true }).max).toBe(0);
    expect(niceAxis(40, 90).min).toBeGreaterThan(0);
  });

  it("spans negative and positive values with ticks through zero", () => {
    const axis = niceAxis(-35, 80);
    expect(axis.ticks).toContain(0);
    expect(axis.min).toBeLessThanOrEqual(-35);
    expect(axis.max).toBeGreaterThanOrEqual(80);
  });

  it("keeps fractions free of float noise", () => {
    const axis = niceAxis(0, 0.7, { count: 7 });
    expect(axis.ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  });

  it("gives a flat series room", () => {
    expect(niceAxis(5, 5).min).toBeLessThan(5);
    expect(niceAxis(5, 5).max).toBeGreaterThan(5);
    expect(niceAxis(0, 0)).toMatchObject({ min: 0, max: 1 });
  });

  it("always covers the data and its ticks are evenly spaced", () => {
    for (const [lo, hi] of [[0, 1], [3.2, 9.9], [-1e6, 4e6], [12, 12.5], [0.001, 0.009], [100, 100000]] as const) {
      const axis = niceAxis(lo, hi);
      expect(axis.min).toBeLessThanOrEqual(lo);
      expect(axis.max).toBeGreaterThanOrEqual(hi);
      expect(axis.ticks[0]).toBe(axis.min);
      expect(axis.ticks.at(-1)).toBe(axis.max);
      expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
      expect(axis.ticks.length).toBeLessThanOrEqual(12);
    }
  });
});

describe("timeTicks", () => {
  it("ticks the first of each month across a year", () => {
    const axis = timeTicks(day(2026, 1, 1), day(2026, 12, 31), 6);
    expect(axis.unit).toBe("month");
    expect(axis.ticks.every((t) => new Date(t).getUTCDate() === 1)).toBe(true);
    expect(axis.every).toBe(3); // quarterly: 1 Jan, 1 Apr, 1 Jul, 1 Oct
    expect(axis.ticks).toEqual([day(2026, 1, 1), day(2026, 4, 1), day(2026, 7, 1), day(2026, 10, 1)]);
  });

  it("ticks January 1st across a decade", () => {
    const axis = timeTicks(day(2014, 6, 1), day(2024, 6, 1), 6);
    expect(axis.unit).toBe("year");
    expect(axis.ticks.every((t) => new Date(t).getUTCMonth() === 0 && new Date(t).getUTCDate() === 1)).toBe(true);
    expect(axis.ticks.map((t) => new Date(t).getUTCFullYear())).toEqual([2016, 2018, 2020, 2022, 2024]);
  });

  it("ticks days across a fortnight", () => {
    const axis = timeTicks(day(2026, 10, 1), day(2026, 10, 14), 7);
    expect(axis.unit).toBe("day");
    expect(axis.ticks.length).toBeGreaterThanOrEqual(5);
    expect(axis.ticks.every((t) => t >= day(2026, 10, 1) && t <= day(2026, 10, 14))).toBe(true);
  });

  it("handles a single day and a reversed or tiny range", () => {
    expect(timeTicks(day(2026, 1, 1), day(2026, 1, 1)).ticks.length).toBeGreaterThanOrEqual(1);
    expect(timeTicks(day(2026, 1, 1), day(2026, 1, 2)).ticks.length).toBeGreaterThanOrEqual(1);
  });

  it("never returns ticks outside the range", () => {
    for (const [a, b] of [[day(2020, 3, 5), day(2021, 9, 17)], [day(1999, 12, 1), day(2030, 1, 1)], [day(2026, 2, 27), day(2026, 3, 4)]] as const) {
      const { ticks } = timeTicks(a, b, 6);
      expect(ticks.every((t) => t >= a && t <= b)).toBe(true);
    }
  });
});

describe("formatting", () => {
  it("labels date ticks, adding the year only when it matters", () => {
    const monthly = timeTicks(day(2026, 1, 1), day(2026, 12, 31), 12);
    expect(formatTick(day(2026, 3, 1), monthly, "en", false)).toBe("Mar");
    expect(formatTick(day(2026, 3, 1), monthly, "en", true)).toBe("Mar 2026");
    const yearly = timeTicks(day(2010, 1, 1), day(2024, 1, 1), 6);
    expect(formatTick(day(2020, 1, 1), yearly, "en", true)).toBe("2020");
    expect(formatTick(day(2026, 3, 1), monthly, "ru", false)).toMatch(/мар/i);
    expect(formatDate(day(2026, 10, 13), "en")).toBe("13 Oct 2026");
  });

  it("groups digits per language and shortens big ticks", () => {
    expect(formatTickNumber(1500, 500, "en")).toBe("1,500");
    expect(formatTickNumber(2.5, 0.5, "en")).toBe("2.5");
    expect(formatTickNumber(1500, 500, "ru").replace(/\s/g, " ")).toBe("1 500");
    expect(formatTickNumber(2.5, 0.5, "ru")).toBe("2,5");
    expect(formatTickNumber(250000, 50000, "en")).toBe("250K");
    expect(formatTickNumber(0, 1, "en")).toBe("0");
  });

  it("formats tooltip values with sensible precision", () => {
    expect(formatValue(1234.567, "en")).toBe("1,234.57");
    expect(formatValue(0.1234, "en")).toBe("0.123");
    expect(formatValue(0.00001234, "en")).toBe("0.000012");
    expect(formatValue(-5, "en")).toBe("-5");
    expect(formatCompact(12_900, "en")).toBe("12.9K");
    expect(formatCompact(4_200_000, "en")).toBe("4.2M");
  });
});
