import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN, planDay } from "@/lib/focus/pomodoro";
import {
  abandon,
  createTimer,
  endDay,
  isRunning,
  pause,
  pomodoroStatuses,
  quota,
  remainingMs,
  resume,
  skipBreak,
  start,
  tick,
  type TimerState,
} from "@/lib/focus/timer";

const MIN = 60_000;
const T0 = 1_000_000;
const fresh = () => createTimer(planDay(DEFAULT_PLAN));
const finish = (state: TimerState, now: number) => tick(state, now);

describe("timer flow", () => {
  it("starts ready, and Start begins the first focus", () => {
    const state = fresh();
    expect(state).toMatchObject({ phase: "ready", index: 0, done: 0, missed: 0 });
    expect(quota(state)).toBe(7);
    const running = start(state, T0);
    expect(running.phase).toBe("focus");
    expect(remainingMs(running, T0)).toBe(25 * MIN);
    expect(remainingMs(running, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it("ignores Start unless ready", () => {
    const running = start(fresh(), T0);
    expect(start(running, T0 + 1)).toBe(running);
  });

  it("does nothing before the time is up, and credits focus when it is", () => {
    const running = start(fresh(), T0);
    expect(tick(running, T0 + 25 * MIN - 1)).toBe(running);
    const after = finish(running, T0 + 25 * MIN);
    expect(after).toMatchObject({ done: 1, focusedMs: 25 * MIN, phase: "break", index: 1 });
    expect(after.results).toEqual(["done"]);
    // The break starts at once.
    expect(remainingMs(after, T0 + 25 * MIN)).toBe(5 * MIN);
  });

  it("waits for the user after a break instead of starting the next focus", () => {
    let state = finish(start(fresh(), T0), T0 + 25 * MIN);
    state = finish(state, T0 + 30 * MIN);
    expect(state).toMatchObject({ phase: "ready", index: 2, done: 1 });
    expect(isRunning(state)).toBe(false);
    expect(remainingMs(state, T0 + 99 * MIN)).toBe(0);
  });

  it("can skip a break", () => {
    const inBreak = finish(start(fresh(), T0), T0 + 25 * MIN);
    expect(skipBreak(inBreak, T0 + 26 * MIN)).toMatchObject({ phase: "ready", index: 2 });
    expect(skipBreak(fresh(), T0).phase).toBe("ready");
  });

  it("plays a whole day and completes with everyone staffed", () => {
    let state = fresh();
    let now = T0;
    while (state.phase !== "complete") {
      if (state.phase === "ready") state = start(state, now);
      now += (remainingMs(state, now) || 0) + 1;
      state = tick(state, now);
    }
    expect(state).toMatchObject({ done: 7, missed: 0, phase: "complete" });
    expect(state.focusedMs).toBe(7 * 25 * MIN);
    expect(pomodoroStatuses(state)).toEqual(Array(7).fill("done"));
  });
});

describe("pause and resume", () => {
  it("freezes the remaining time and carries on from it", () => {
    const running = start(fresh(), T0);
    const paused = pause(running, T0 + 10 * MIN);
    expect(paused).toMatchObject({ paused: true, endsAt: null });
    expect(remainingMs(paused, T0 + 500 * MIN)).toBe(15 * MIN);
    // Ticking while paused never finishes the segment.
    expect(tick(paused, T0 + 500 * MIN)).toBe(paused);
    const again = resume(paused, T0 + 60 * MIN);
    expect(remainingMs(again, T0 + 60 * MIN)).toBe(15 * MIN);
    expect(finish(again, T0 + 75 * MIN).done).toBe(1);
  });

  it("ignores pause when idle and resume when running", () => {
    const ready = fresh();
    expect(pause(ready, T0)).toBe(ready);
    const running = start(ready, T0);
    expect(resume(running, T0)).toBe(running);
  });
});

describe("abandoning and ending the day", () => {
  it("counts an abandoned focus as missed and skips the break after it", () => {
    const state = abandon(start(fresh(), T0), T0 + 5 * MIN);
    expect(state).toMatchObject({ missed: 1, done: 0, phase: "ready", index: 2 });
    expect(state.results).toEqual(["missed"]);
    expect(state.focusedMs).toBe(0);
  });

  it("can abandon while paused, but not during a break", () => {
    const paused = pause(start(fresh(), T0), T0 + MIN);
    expect(abandon(paused, T0 + 2 * MIN).missed).toBe(1);
    const inBreak = finish(start(fresh(), T0), T0 + 25 * MIN);
    expect(abandon(inBreak, T0 + 26 * MIN)).toBe(inBreak);
  });

  it("abandoning the last focus completes the day", () => {
    let state = fresh();
    let now = T0;
    for (let i = 0; i < 6; i += 1) {
      state = start(state, now);
      now += remainingMs(state, now) + 1;
      state = tick(state, now); // focus done, the break begins
      now += remainingMs(state, now) + 1;
      state = tick(state, now); // break done
    }
    expect(state.phase).toBe("ready");
    const last = abandon(start(state, now), now + MIN);
    expect(last).toMatchObject({ phase: "complete", done: 6, missed: 1 });
  });

  it("ending the day counts every unplayed focus as missed", () => {
    const afterOne = finish(start(fresh(), T0), T0 + 25 * MIN + 1);
    // In the break after the first Pomodoro: six remain.
    const ended = endDay(afterOne);
    expect(ended).toMatchObject({ phase: "complete", done: 1, missed: 6 });
    expect(ended.results).toEqual(["done", ...Array(6).fill("missed")]);
    expect(ended.done + ended.missed).toBe(quota(ended));
  });

  it("ending during a focus counts the one in progress too", () => {
    const ended = endDay(start(fresh(), T0));
    expect(ended).toMatchObject({ done: 0, missed: 7 });
    expect(endDay(ended)).toBe(ended);
  });

  it("ending before starting loses everyone", () => {
    expect(endDay(fresh())).toMatchObject({ done: 0, missed: 7, phase: "complete" });
  });
});

describe("pomodoroStatuses", () => {
  it("shows done, missed, the current one and what is still to come", () => {
    let state = fresh();
    state = finish(start(state, T0), T0 + 25 * MIN);
    state = finish(state, T0 + 30 * MIN);
    state = abandon(start(state, T0 + 31 * MIN), T0 + 32 * MIN);
    expect(pomodoroStatuses(state)).toEqual(["done", "missed", "current", "pending", "pending", "pending", "pending"]);
  });
});

describe("degenerate days", () => {
  it("a day with no segments is already complete", () => {
    expect(createTimer([])).toMatchObject({ phase: "complete", done: 0, missed: 0 });
  });
});
