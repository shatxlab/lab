import { describe, expect, it } from "vitest";

import { applyTimer, dismissDay, rollover, startDay } from "@/lib/focus/day";
import { DEFAULT_PLAN } from "@/lib/focus/pomodoro";
import { emptyStore } from "@/lib/focus/storage";
import { abandon, endDay, start, tick } from "@/lib/focus/timer";

const DAY = 20_000;
const MIN = 60_000;
const store0 = () => emptyStore(42);

describe("day operations", () => {
  it("opens a day with a normalized plan and a seeded office key", () => {
    const store = startDay(store0(), { ...DEFAULT_PLAN, hours: 99 }, DAY);
    expect(store.plan.hours).toBe(10);
    expect(store.today).toMatchObject({ day: DAY, recorded: false });
    expect(store.today!.timer.phase).toBe("ready");
    // The same seed and day open the same office; another run the same day does not.
    expect(startDay(store0(), DEFAULT_PLAN, DAY).today!.key).toBe(startDay(store0(), DEFAULT_PLAN, DAY).today!.key);
    const second = startDay({ ...store0(), history: [{ day: DAY, quota: 7, done: 7, missed: 0, focusedMin: 175 }] }, DEFAULT_PLAN, DAY);
    expect(second.today!.key).not.toBe(startDay(store0(), DEFAULT_PLAN, DAY).today!.key);
  });

  it("records a day in the history exactly once, when it completes", () => {
    let store = startDay(store0(), DEFAULT_PLAN, DAY);
    store = applyTimer(store, start(store.today!.timer, 1));
    expect(store.history).toEqual([]);
    const ended = endDay(store.today!.timer);
    store = applyTimer(store, ended);
    expect(store.history).toEqual([{ day: DAY, quota: 7, done: 0, missed: 7, focusedMin: 0 }]);
    expect(store.today!.recorded).toBe(true);
    // Applying a completed timer again must not duplicate it.
    expect(applyTimer(store, ended)).toBe(store);
    expect(applyTimer(store, { ...ended }).history).toHaveLength(1);
  });

  it("keeps a full record of a mixed day", () => {
    let store = startDay(store0(), DEFAULT_PLAN, DAY);
    let timer = start(store.today!.timer, 0);
    timer = tick(timer, 25 * MIN); // one done
    timer = tick(timer, 30 * MIN);
    timer = abandon(start(timer, 31 * MIN), 32 * MIN); // one missed
    timer = endDay(timer); // the other five
    store = applyTimer(store, timer);
    expect(store.history[0]).toEqual({ day: DAY, quota: 7, done: 1, missed: 6, focusedMin: 25 });
  });

  it("dismisses only a finished day", () => {
    const open = startDay(store0(), DEFAULT_PLAN, DAY);
    expect(dismissDay(open)).toBe(open);
    const done = applyTimer(open, endDay(open.today!.timer));
    expect(dismissDay(done).today).toBeNull();
  });

  it("closes a day left open past midnight, counting what was not played as missed", () => {
    let store = startDay(store0(), DEFAULT_PLAN, DAY);
    store = applyTimer(store, tick(start(store.today!.timer, 0), 25 * MIN));
    const next = rollover(store, DAY + 1);
    expect(next.today).toBeNull();
    expect(next.history).toEqual([{ day: DAY, quota: 7, done: 1, missed: 6, focusedMin: 25 }]);
  });

  it("leaves today alone on the same day, and drops an already-recorded day on rollover without duplicating it", () => {
    const open = startDay(store0(), DEFAULT_PLAN, DAY);
    expect(rollover(open, DAY)).toBe(open);
    const recorded = applyTimer(open, endDay(open.today!.timer));
    const rolled = rollover(recorded, DAY + 3);
    expect(rolled.today).toBeNull();
    expect(rolled.history).toHaveLength(1);
    expect(rollover(store0(), DAY)).toEqual(store0());
  });
});
