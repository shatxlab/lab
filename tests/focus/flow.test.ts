import { describe, expect, it } from "vitest";

import { FLOW, HEADCOUNT, abandon, createFlow, cycleDots, cycleResults, isRunning, pause, remainingMs, resume, segmentMinutes, skipBreak, start, tick } from "@/lib/focus/flow";

const MIN = 60_000;
const T0 = 1_000_000;

/** Play `count` whole Pomodoros with their breaks, starting a focus at `at`; returns the state and the time. */
function play(count: number, at = T0) {
  let state = start(createFlow(), at);
  let now = at;
  for (let i = 0; i < count; i += 1) {
    now = state.endsAt!;
    state = tick(state, now); // the focus ends, the break begins
    if (i < count - 1) {
      now = state.endsAt!;
      state = tick(state, now); // the break ends, the next focus begins
    }
  }
  return { state, now };
}

describe("the flow", () => {
  it("is 25 minutes of focus, 5 of rest and a long break after every fourth", () => {
    expect(FLOW).toEqual({ focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 });
    expect(HEADCOUNT).toBe(6);
  });

  it("starts ready, and Start begins a 25 minute focus", () => {
    const ready = createFlow();
    expect(ready.phase).toBe("ready");
    expect(isRunning(ready)).toBe(false);
    expect(segmentMinutes(ready)).toBe(25);
    const running = start(ready, T0);
    expect(running).toMatchObject({ phase: "focus", paused: false, endsAt: T0 + 25 * MIN });
    expect(remainingMs(running, T0 + 5 * MIN)).toBe(20 * MIN);
    expect(start(running, T0 + 1)).toBe(running);
  });

  it("does nothing before the time is up, and runs the focus into a short break", () => {
    const running = start(createFlow(), T0);
    expect(tick(running, T0 + 25 * MIN - 1)).toBe(running);
    const rest = tick(running, T0 + 25 * MIN);
    expect(rest).toMatchObject({ phase: "break", long: false, done: 1, focusedMs: 25 * MIN, results: ["done"], endsAt: T0 + 30 * MIN });
    expect(segmentMinutes(rest)).toBe(5);
  });

  it("starts the next Pomodoro by itself when a break ends", () => {
    const rest = tick(start(createFlow(), T0), T0 + 25 * MIN);
    const next = tick(rest, T0 + 30 * MIN);
    expect(next).toMatchObject({ phase: "focus", done: 1, endsAt: T0 + 55 * MIN });
    expect(isRunning(next)).toBe(true);
  });

  it("makes every fourth break the long one, then the cycle starts over", () => {
    const { state } = play(4);
    expect(state).toMatchObject({ phase: "break", long: true, done: 4 });
    expect(segmentMinutes(state)).toBe(15);
    const { state: third } = play(3);
    expect(third.long).toBe(false);
    const after = tick(state, state.endsAt!);
    expect(after.phase).toBe("focus");
    const { state: eighth } = play(8);
    expect(eighth.long).toBe(true);
  });

  it("catches up segment by segment after a long absence, from when each ended", () => {
    const running = start(createFlow(), T0);
    // 25 focus + 5 break are over; 10 minutes into the second Pomodoro.
    const caught = tick(running, T0 + 40 * MIN);
    expect(caught).toMatchObject({ phase: "focus", done: 1, endsAt: T0 + 55 * MIN });
    // A day away does not loop forever and still ends in a coherent state.
    const day = tick(running, T0 + 24 * 60 * MIN);
    expect(day.done).toBeGreaterThan(10);
    expect(["focus", "break"]).toContain(day.phase);
    expect(day.endsAt!).toBeGreaterThan(T0 + 24 * 60 * MIN - 1);
  });

  it("pauses and resumes without losing a second", () => {
    const running = start(createFlow(), T0);
    const paused = pause(running, T0 + 10 * MIN);
    expect(paused).toMatchObject({ paused: true, endsAt: null, leftMs: 15 * MIN });
    expect(isRunning(paused)).toBe(false);
    expect(tick(paused, T0 + 99 * MIN)).toBe(paused);
    expect(remainingMs(paused, T0 + 99 * MIN)).toBe(15 * MIN);
    const back = resume(paused, T0 + 50 * MIN);
    expect(back).toMatchObject({ paused: false, endsAt: T0 + 65 * MIN, leftMs: null });
    expect(pause(createFlow(), T0)).toEqual(createFlow());
    expect(resume(running, T0)).toBe(running);
  });

  it("skips a break straight into the next Pomodoro", () => {
    const rest = tick(start(createFlow(), T0), T0 + 25 * MIN);
    const skipped = skipBreak(rest, T0 + 26 * MIN);
    expect(skipped).toMatchObject({ phase: "focus", endsAt: T0 + 51 * MIN, done: 1 });
    expect(skipBreak(skipped, T0)).toBe(skipped);
  });

  it("makes someone leave when a Pomodoro is given up, and waits for Start", () => {
    const running = start(createFlow(), T0);
    const gave = abandon(running);
    expect(gave).toMatchObject({ phase: "ready", missed: 1, done: 0, results: ["missed"], endsAt: null });
    expect(isRunning(gave)).toBe(false);
    expect(start(gave, T0 + 99).phase).toBe("focus");
  });

  it("only lets a Pomodoro in progress be given up", () => {
    const ready = createFlow();
    expect(abandon(ready)).toBe(ready);
    const rest = tick(start(ready, T0), T0 + 25 * MIN);
    expect(abandon(rest)).toBe(rest);
  });

  it("empties the office when the last person leaves", () => {
    let state = createFlow();
    for (let i = 0; i < HEADCOUNT; i += 1) {
      expect(state.phase).toBe("ready");
      state = abandon(start(state, T0 + i));
    }
    expect(state).toMatchObject({ phase: "empty", missed: HEADCOUNT });
    expect(start(state, T0)).toBe(state);
    expect(remainingMs(state, T0)).toBe(0);
  });
});

describe("the row of dots", () => {
  it("shows one dot per Pomodoro of the cycle: done, given up, the one in play, and to come", () => {
    let state = start(createFlow(), T0);
    expect(cycleDots(state)).toEqual(["current", "pending", "pending", "pending"]);
    state = tick(state, T0 + 25 * MIN); // break
    expect(cycleDots(state)).toEqual(["done", "pending", "pending", "pending"]);
    state = tick(state, state.endsAt!); // second focus
    expect(cycleDots(state)).toEqual(["done", "current", "pending", "pending"]);
    state = abandon(state);
    expect(cycleDots(state)).toEqual(["done", "missed", "pending", "pending"]);
    expect(cycleResults(state)).toEqual(["done", "missed"]);
  });

  it("keeps the finished cycle on show through the long break, then starts a fresh row", () => {
    const { state } = play(4);
    expect(state.long).toBe(true);
    expect(cycleDots(state)).toEqual(["done", "done", "done", "done"]);
    const next = tick(state, state.endsAt!);
    expect(cycleDots(next)).toEqual(["current", "pending", "pending", "pending"]);
    expect(cycleResults(next)).toEqual([]);
  });
});
