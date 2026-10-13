import type { TimerState } from "@/lib/focus/timer";
import { quota } from "@/lib/focus/timer";

/** One finished day, as the history log shows it. */
export interface DayRecord {
  /** Local calendar day number. */
  day: number;
  quota: number;
  done: number;
  missed: number;
  focusedMin: number;
  /** Who walked out that day, in the order they left. */
  left: string[];
}

export const MAX_HISTORY = 400;

export function recordOf(timer: TimerState, day: number, left: string[] = []): DayRecord {
  return { day, quota: quota(timer), done: timer.done, missed: timer.missed, focusedMin: Math.round(timer.focusedMs / 60_000), left };
}

/** A day counts as a success when everyone kept their job. */
export const metQuota = (record: DayRecord): boolean => record.done > 0 && record.missed === 0;

/** Consecutive calendar days with a successful day, ending today or, if today has none yet, yesterday. */
export function streak(history: readonly DayRecord[], today: number): number {
  const good = new Set(history.filter(metQuota).map((record) => record.day));
  let cursor = good.has(today) ? today : today - 1;
  let count = 0;
  while (good.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

export interface Totals {
  days: number;
  focusedMin: number;
  /** People who walked out over all days. */
  fired: number;
  /** Days where everyone stayed. */
  fullDays: number;
}

export function totals(history: readonly DayRecord[]): Totals {
  return history.reduce<Totals>(
    (sum, record) => ({
      days: sum.days + 1,
      focusedMin: sum.focusedMin + record.focusedMin,
      fired: sum.fired + record.missed,
      fullDays: sum.fullDays + (metQuota(record) ? 1 : 0),
    }),
    { days: 0, focusedMin: 0, fired: 0, fullDays: 0 },
  );
}
