/** Store-level day operations, as pure functions the UI feeds to its commit. */

import { officeKey } from "@/lib/focus/office";
import { MAX_HISTORY, recordOf } from "@/lib/focus/history";
import { normalizePlan, planDay, type Plan } from "@/lib/focus/pomodoro";
import type { FocusStore } from "@/lib/focus/storage";
import { createTimer, endDay, type TimerState } from "@/lib/focus/timer";

/** Open a new day with the given plan (remembered for next time). */
export function startDay(store: FocusStore, plan: Plan, day: number): FocusStore {
  const normalized = normalizePlan(plan);
  const segments = planDay(normalized);
  const run = store.history.filter((record) => record.day === day).length;
  return {
    ...store,
    plan: normalized,
    today: { day, key: officeKey(store.seed, day, run), timer: createTimer(segments), recorded: false },
  };
}

/**
 * Replace today's timer. The moment it completes, the day is written to the
 * history exactly once.
 */
export function applyTimer(store: FocusStore, timer: TimerState): FocusStore {
  const today = store.today;
  if (!today) return store;
  if (timer.phase !== "complete" || today.recorded) return today.timer === timer ? store : { ...store, today: { ...today, timer } };
  const history = [...store.history, recordOf(timer, today.day)].slice(-MAX_HISTORY);
  return { ...store, history, today: { ...today, timer, recorded: true } };
}

/** Leave the finished day's summary and return to the setup screen. */
export function dismissDay(store: FocusStore): FocusStore {
  return store.today?.timer.phase === "complete" ? { ...store, today: null } : store;
}

/**
 * Call on load: a day left open past its calendar day is closed, with whatever
 * was not played counted as missed, and moves into the history.
 */
export function rollover(store: FocusStore, day: number): FocusStore {
  const today = store.today;
  if (!today || today.day >= day) return store;
  const closed = applyTimer(store, endDay(today.timer));
  return { ...closed, today: null };
}
