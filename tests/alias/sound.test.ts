import { describe, expect, it } from "vitest";

import { createSoundEngine, soundRecipe, type SoundName } from "@/lib/alias/sound";

const SOUNDS: SoundName[] = ["select", "start", "correct", "skip", "tick", "urgent", "timeUp", "win"];

describe("sound engine", () => {
  it("has a non-empty tone recipe for every effect", () => {
    for (const name of SOUNDS) {
      const recipe = soundRecipe(name);
      expect(recipe.length, name).toBeGreaterThan(0);
      for (const tone of recipe) {
        expect(tone.duration, name).toBeGreaterThan(0);
        expect(tone.freq, name).toBeGreaterThan(0);
        expect(tone.start, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("plays without throwing when Web Audio is unavailable", () => {
    const engine = createSoundEngine(true);
    expect(() => {
      for (const name of SOUNDS) engine.play(name);
    }).not.toThrow();
    expect(engine.isEnabled()).toBe(true);
  });

  it("respects the enabled flag", () => {
    const engine = createSoundEngine(true);
    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);
    expect(() => engine.play("correct")).not.toThrow();
  });
});
