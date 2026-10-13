import { describe, expect, it } from "vitest";

import { MAX_INTERVAL_DAYS, firstReview, intervalDays, nextReview, retrievability } from "@/lib/flash/fsrs";

describe("fsrs", () => {
  it("starts every grade at the published initial stability and ordered difficulty", () => {
    expect(firstReview(1).stability).toBeCloseTo(0.4872, 4);
    expect(firstReview(2).stability).toBeCloseTo(1.4003, 4);
    expect(firstReview(3).stability).toBeCloseTo(3.7145, 4);
    expect(firstReview(4).stability).toBeCloseTo(13.8206, 4);
    const [again, hard, good, easy] = ([1, 2, 3, 4] as const).map((grade) => firstReview(grade).difficulty);
    expect(again! > hard! && hard! > good! && good! > easy!).toBe(true);
    expect(good).toBeCloseTo(5.1618, 4);
  });

  it("turns a first review into golden intervals", () => {
    expect(([1, 2, 3, 4] as const).map((grade) => intervalDays(firstReview(grade).stability))).toEqual([1, 1, 4, 14]);
  });

  it("recalls 90% exactly one stability after the review, and certainly right away", () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 6);
    expect(retrievability(4, 3.7145)).toBeCloseTo(0.8935, 4);
  });

  it("lengthens or shortens the interval with the retention target", () => {
    expect(intervalDays(10, 0.9)).toBe(10);
    expect(intervalDays(10, 0.8)).toBeGreaterThan(intervalDays(10, 0.9));
    expect(intervalDays(10, 0.95)).toBeLessThan(intervalDays(10, 0.9));
  });

  it("clamps intervals to 1 day … MAX_INTERVAL_DAYS", () => {
    expect(intervalDays(0.1)).toBe(1);
    expect(intervalDays(1e9)).toBe(MAX_INTERVAL_DAYS);
  });

  it("golden second review: good three-card on time", () => {
    const first = firstReview(3);
    const intervals = ([1, 2, 3, 4] as const).map((grade) => intervalDays(nextReview(first, 4, grade).stability));
    expect(intervals).toEqual([1, 6, 15, 40]);
  });

  it("a lapse never grows stability and nudges difficulty up", () => {
    const first = firstReview(3);
    const lapsed = nextReview(first, 4, 1);
    expect(lapsed.stability).toBeLessThanOrEqual(first.stability);
    expect(lapsed.difficulty).toBeGreaterThan(first.difficulty);
  });

  it("keeps difficulty within 1…10 however long the streak of one grade", () => {
    let memory = firstReview(1);
    for (let i = 0; i < 100; i += 1) memory = nextReview(memory, 1, 1);
    expect(memory.difficulty).toBeLessThanOrEqual(10);
    memory = firstReview(4);
    for (let i = 0; i < 100; i += 1) memory = nextReview(memory, 30, 4);
    expect(memory.difficulty).toBeGreaterThanOrEqual(1);
  });
});
