import { describe, expect, it } from "vitest";

import { cueFor } from "@/lib/focus/cues";
import { DEFAULT_PLAN, planDay } from "@/lib/focus/pomodoro";
import { abandon, createTimer, endDay, pause, skipBreak, start, tick } from "@/lib/focus/timer";

const MIN = 60_000;
const fresh = () => createTimer(planDay(DEFAULT_PLAN));

describe("cueFor", () => {
  it("is silent when nothing changed, or only a pause did", () => {
    const running = start(fresh(), 0);
    expect(cueFor(running, running)).toBeNull();
    expect(cueFor(running, pause(running, MIN))).toBeNull();
  });

  it("starts, chimes when a focus completes, and signals the end of a break", () => {
    const ready = fresh();
    const running = start(ready, 0);
    expect(cueFor(ready, running)).toBe("start");
    const inBreak = tick(running, 25 * MIN);
    expect(cueFor(running, inBreak)).toBe("chime");
    expect(cueFor(inBreak, tick(inBreak, 30 * MIN))).toBe("breakEnd");
    expect(cueFor(inBreak, skipBreak(inBreak, 26 * MIN))).toBe("breakEnd");
  });

  it("thuds when someone walks out", () => {
    const running = start(fresh(), 0);
    expect(cueFor(running, abandon(running, MIN))).toBe("walkout");
  });

  it("plays the day's verdict instead of the per-Pomodoro cue", () => {
    const running = start(fresh(), 0);
    expect(cueFor(running, endDay(running))).toBe("dayLose");
    // A one-Pomodoro day finished cleanly is a win, not just a chime.
    const single = start(createTimer([{ kind: "focus", minutes: 25 }]), 0);
    expect(cueFor(single, tick(single, 25 * MIN))).toBe("dayWin");
    expect(cueFor(single, abandon(single, MIN))).toBe("dayLose");
  });
});
