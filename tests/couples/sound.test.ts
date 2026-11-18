import { describe, expect, it, vi } from "vitest";

import { couplesRecipe, createCouplesSoundEngine } from "@/lib/couples/sound";

describe("couples sound", () => {
  it("maps every cue to a non-empty recipe", () => {
    for (const cue of ["tap", "pass", "match", "miss", "finish"] as const) {
      const recipe = couplesRecipe(cue);
      expect(recipe.length).toBeGreaterThan(0);
      for (const tone of recipe) {
        expect(tone.freq).toBeGreaterThan(0);
        expect(tone.duration).toBeGreaterThan(0);
      }
    }
  });

  it("gives the match cue more notes than a tap", () => {
    expect(couplesRecipe("match").length).toBeGreaterThan(couplesRecipe("tap").length);
  });

  it("tracks enabled state and never throws without Web Audio", () => {
    const engine = createCouplesSoundEngine(true);
    expect(engine.isEnabled()).toBe(true);
    expect(() => engine.play("tap")).not.toThrow();
    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);

    vi.stubGlobal("window", undefined);
    expect(() => engine.resume()).not.toThrow();
    vi.unstubAllGlobals();
  });
});