import { describe, expect, it } from "vitest";

import { cueFor } from "@/lib/focus/cues";
import { HEADCOUNT, abandon, createFlow, skipBreak, start, tick } from "@/lib/focus/flow";
import { focusRecipe, type FocusSound } from "@/lib/focus/sound";

const MIN = 60_000;

describe("cueFor", () => {
  const running = start(createFlow(), 0);

  it("is silent when nothing changed", () => {
    expect(cueFor(running, running)).toBeNull();
  });

  it("starts, chimes at the end of a Pomodoro, and signals the end of a break", () => {
    expect(cueFor(createFlow(), running)).toBe("start");
    const rest = tick(running, 25 * MIN);
    expect(cueFor(running, rest)).toBe("chime");
    expect(cueFor(rest, tick(rest, rest.endsAt!))).toBe("breakEnd");
    expect(cueFor(rest, skipBreak(rest, 26 * MIN))).toBe("breakEnd");
  });

  it("thuds when someone walks out, and has its own sound for the last one", () => {
    expect(cueFor(running, abandon(running))).toBe("walkout");
    let state = createFlow();
    let before = state;
    for (let i = 0; i < HEADCOUNT; i += 1) {
      before = state;
      state = abandon(start(state, i));
    }
    expect(cueFor(before, state)).toBe("emptyOffice");
  });

  it("is silent for pausing", () => {
    expect(cueFor(running, { ...running, paused: true })).toBeNull();
  });
});

describe("focusRecipe", () => {
  it("has notes for every sound, all audible and within the hearing range", () => {
    const names: FocusSound[] = ["start", "chime", "breakEnd", "walkout", "emptyOffice"];
    for (const name of names) {
      const tones = focusRecipe(name);
      expect(tones.length).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone.freq).toBeGreaterThan(80);
        expect(tone.freq).toBeLessThan(2000);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.2);
        expect(tone.duration).toBeGreaterThan(0);
      }
    }
  });
});
