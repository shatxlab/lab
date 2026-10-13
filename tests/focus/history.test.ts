import { describe, expect, it } from "vitest";

import { metQuota, recordOf, streak, totals, type DayRecord } from "@/lib/focus/history";
import { DEFAULT_PLAN, planDay } from "@/lib/focus/pomodoro";
import { createTimer, endDay } from "@/lib/focus/timer";

const day = (d: number, done: number, missed: number, focusedMin = done * 25): DayRecord => ({ day: d, quota: done + missed, done, missed, focusedMin, left: [] });

describe("history", () => {
  it("records a finished day from its timer", () => {
    const timer = endDay(createTimer(planDay(DEFAULT_PLAN)));
    expect(recordOf(timer, 500)).toEqual({ day: 500, quota: 7, done: 0, missed: 7, focusedMin: 0, left: [] });
    expect(recordOf(timer, 500, ["Dana Smith"]).left).toEqual(["Dana Smith"]);
  });

  it("calls a day a success only when everyone stayed and something was done", () => {
    expect(metQuota(day(1, 7, 0))).toBe(true);
    expect(metQuota(day(1, 6, 1))).toBe(false);
    expect(metQuota(day(1, 0, 0))).toBe(false);
  });

  it("counts consecutive successful days, surviving a today with no record yet", () => {
    const history = [day(10, 7, 0), day(11, 7, 0), day(12, 6, 1), day(13, 7, 0), day(14, 7, 0)];
    expect(streak(history, 14)).toBe(2);
    expect(streak(history, 15)).toBe(2);
    expect(streak(history, 16)).toBe(0);
    expect(streak([], 14)).toBe(0);
  });

  it("a bad day breaks the streak even if another run the same day was fine", () => {
    // Two runs on day 20: one clean, one not — the clean one still counts for the day.
    expect(streak([day(19, 7, 0), day(20, 7, 0), day(20, 3, 4)], 20)).toBe(2);
  });

  it("adds up the totals", () => {
    expect(totals([day(1, 7, 0, 175), day(2, 5, 2, 125), day(3, 0, 7, 0)])).toEqual({ days: 3, focusedMin: 300, fired: 9, fullDays: 1 });
    expect(totals([])).toEqual({ days: 0, focusedMin: 0, fired: 0, fullDays: 0 });
  });
});
