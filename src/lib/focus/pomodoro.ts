/**
 * Pomodoro math: a day is a list of focus and break segments that fit the
 * hours the user set aside. The number of focus segments is the day's quota.
 */

export interface Plan {
  /** Hours set aside for the day. */
  hours: number;
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Every Nth break is the long one. */
  longEvery: number;
}

export const DEFAULT_PLAN: Plan = { hours: 4, focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 };

export const LIMITS = {
  hours: [1, 10],
  focusMin: [10, 90],
  shortMin: [1, 30],
  longMin: [5, 60],
  longEvery: [2, 8],
} as const satisfies Record<keyof Plan, readonly [number, number]>;

/** The office has twelve desks, so a day holds at most twelve Pomodoros. */
export const MAX_QUOTA = 12;

export type SegmentKind = "focus" | "short" | "long";

export interface Segment {
  kind: SegmentKind;
  minutes: number;
}

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));

/** Clamp every field into its range; hours move in half-hour steps, the rest in whole minutes. */
export function normalizePlan(input: Partial<Plan>): Plan {
  const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return {
    hours: clamp(Math.round(number(input.hours, DEFAULT_PLAN.hours) * 2) / 2, LIMITS.hours),
    focusMin: clamp(Math.round(number(input.focusMin, DEFAULT_PLAN.focusMin)), LIMITS.focusMin),
    shortMin: clamp(Math.round(number(input.shortMin, DEFAULT_PLAN.shortMin)), LIMITS.shortMin),
    longMin: clamp(Math.round(number(input.longMin, DEFAULT_PLAN.longMin)), LIMITS.longMin),
    longEvery: clamp(Math.round(number(input.longEvery, DEFAULT_PLAN.longEvery)), LIMITS.longEvery),
  };
}

/**
 * Fill the day: focus, break, focus, … with a long break on every Nth. A break
 * is only added when another focus segment still fits after it, so a day never
 * ends on a break.
 */
export function planDay(plan: Plan): Segment[] {
  const budget = plan.hours * 60;
  const segments: Segment[] = [];
  let used = 0;
  let focusCount = 0;
  while (focusCount < MAX_QUOTA && used + plan.focusMin <= budget) {
    segments.push({ kind: "focus", minutes: plan.focusMin });
    used += plan.focusMin;
    focusCount += 1;
    const long = focusCount % plan.longEvery === 0;
    const breakMin = long ? plan.longMin : plan.shortMin;
    if (focusCount >= MAX_QUOTA || used + breakMin + plan.focusMin > budget) break;
    segments.push({ kind: long ? "long" : "short", minutes: breakMin });
    used += breakMin;
  }
  return segments;
}

export const quotaOf = (segments: readonly Segment[]): number => segments.filter((segment) => segment.kind === "focus").length;

/** Total minutes the segments take, breaks included. */
export const totalMinutes = (segments: readonly Segment[]): number => segments.reduce((sum, segment) => sum + segment.minutes, 0);
