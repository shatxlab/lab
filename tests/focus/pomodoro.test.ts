import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN, MAX_QUOTA, normalizePlan, planDay, quotaOf, totalMinutes } from "@/lib/focus/pomodoro";

const kinds = (plan = DEFAULT_PLAN) => planDay(plan).map((segment) => segment.kind[0]).join("");

describe("planDay", () => {
  it("fills four hours with seven 25-minute Pomodoros and a long break after the fourth", () => {
    const segments = planDay(DEFAULT_PLAN);
    expect(quotaOf(segments)).toBe(7);
    // focus, short ×3, then the long break, then short ×2 — never ending on a break.
    expect(kinds()).toBe("fsfsfsflfsfsf");
    expect(totalMinutes(segments)).toBe(7 * 25 + 5 * 5 + 15);
    expect(totalMinutes(segments)).toBeLessThanOrEqual(240);
  });

  it("never ends on a break and never overshoots the hours", () => {
    for (const hours of [1, 1.5, 2, 3.5, 5, 8]) {
      const segments = planDay({ ...DEFAULT_PLAN, hours });
      expect(segments.at(-1)?.kind).toBe("focus");
      expect(totalMinutes(segments)).toBeLessThanOrEqual(hours * 60);
    }
  });

  it("fits one Pomodoro into an hour and two into ninety minutes", () => {
    expect(quotaOf(planDay({ ...DEFAULT_PLAN, hours: 1 }))).toBe(2);
    expect(quotaOf(planDay({ ...DEFAULT_PLAN, hours: 1.5 }))).toBe(3);
  });

  it("honours custom lengths, and only adds a break when another focus still fits", () => {
    const plan = { hours: 3, focusMin: 50, shortMin: 10, longMin: 30, longEvery: 2 };
    const segments = planDay(plan);
    // The long break after the second focus would leave no room for a third, so the day just ends.
    expect(planDay({ ...plan, hours: 3.5 }).map((s) => `${s.kind[0]}${s.minutes}`).join(" ")).toBe("f50 s10 f50 l30 f50");
    expect(segments.map((s) => `${s.kind[0]}${s.minutes}`).join(" ")).toBe("f50 s10 f50");
  });

  it("returns no segments when a single focus does not fit", () => {
    expect(planDay({ hours: 1, focusMin: 90, shortMin: 5, longMin: 15, longEvery: 4 })).toEqual([]);
  });

  it("caps the day at the office's twelve desks", () => {
    expect(quotaOf(planDay({ ...DEFAULT_PLAN, hours: 10, focusMin: 10, shortMin: 1 }))).toBe(MAX_QUOTA);
  });
});

describe("normalizePlan", () => {
  it("clamps and rounds every field", () => {
    expect(normalizePlan({ hours: 99, focusMin: 1, shortMin: 100, longMin: 0, longEvery: 50 })).toEqual({
      hours: 10,
      focusMin: 10,
      shortMin: 30,
      longMin: 5,
      longEvery: 8,
    });
    expect(normalizePlan({ hours: 2.3, focusMin: 24.6 })).toMatchObject({ hours: 2.5, focusMin: 25 });
  });

  it("fills defaults for missing or non-numeric fields", () => {
    expect(normalizePlan({})).toEqual(DEFAULT_PLAN);
    expect(normalizePlan({ hours: "x" as unknown as number, focusMin: NaN })).toEqual(DEFAULT_PLAN);
  });
});
