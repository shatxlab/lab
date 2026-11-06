import { describe, expect, it } from "vitest";

import { clock, HR_TEXT, quirkLine } from "@/lib/hr/i18n";
import { cameraFor, fitView, STICK_RADIUS, stickInput } from "@/lib/hr/render/draw";
import { heroPixels } from "@/lib/hr/render/heroes";
import { ARENA, QUIRK_NUMBER, SPAWN_DISTANCE } from "@/lib/hr/sim/balance";
import { createRun } from "@/lib/hr/sim/run";
import { QUIRKS } from "@/lib/roster/data";
import { QUIRK_IDS, type Effect } from "@/lib/roster/types";
import { starters } from "@/lib/roster/generate";
import { CHARACTER_FRAMES } from "@/lib/tycoon/render-support/characters";
import { POSE_PAD } from "@/lib/tycoon/render-support/poses";

describe("fitView", () => {
  it("never shows as far as foes spawn, on a phone or a wide screen", () => {
    for (const [width, height] of [[390, 700], [360, 640], [1280, 720], [1920, 1080], [768, 1024]]) {
      const view = fitView(width, height);
      const halfAcross = width / view.scale / 2;
      const halfDown = height / view.scale / 2;
      expect(Math.max(halfAcross, halfDown)).toBeLessThan(SPAWN_DISTANCE.min);
    }
  });
});

describe("cameraFor", () => {
  it("centres on the hero on a wide view and stops at the walls", () => {
    const run = createRun(starters()[0], 1);
    const view = fitView(1280, 720);
    run.hero.x = ARENA.width / 2;
    run.hero.y = ARENA.height / 2;
    expect(cameraFor(run, view).x).toBeCloseTo(ARENA.width / 2 - view.width / view.scale / 2);
    expect(cameraFor(run, view).y).toBeCloseTo(ARENA.height / 2 - view.height / view.scale / 2);
    run.hero.x = 5;
    run.hero.y = ARENA.height - 5;
    expect(cameraFor(run, view)).toEqual({ x: 0, y: ARENA.height - view.height / view.scale });
  });

  it("keeps the hero above the thumb on a tall view, even at the bottom wall", () => {
    const run = createRun(starters()[0], 1);
    const view = fitView(390, 700);
    const down = view.height / view.scale;
    run.hero.x = ARENA.width / 2;
    run.hero.y = ARENA.height / 2;
    expect((run.hero.y - cameraFor(run, view).y) / down).toBeCloseTo(0.4);
    run.hero.y = ARENA.height - 5;
    expect((run.hero.y - cameraFor(run, view).y) / down).toBeCloseTo(0.4);
    run.hero.x = 5;
    run.hero.y = 5;
    expect(cameraFor(run, view)).toEqual({ x: 0, y: 0 });
  });
});

describe("stickInput", () => {
  it("is the knob's share of the ring, capped at 1, with a small dead zone", () => {
    expect(stickInput(null)).toEqual({ dx: 0, dy: 0 });
    expect(stickInput({ originX: 100, originY: 100, x: 103, y: 100 })).toEqual({ dx: 0, dy: 0 });
    expect(stickInput({ originX: 100, originY: 100, x: 100 + STICK_RADIUS / 2, y: 100 })).toEqual({ dx: 0.5, dy: 0 });
    const far = stickInput({ originX: 0, originY: 0, x: 300, y: 400 });
    expect(far.dx).toBeCloseTo(0.6);
    expect(far.dy).toBeCloseTo(0.8);
  });
});

describe("heroPixels", () => {
  it("cuts the coworker's character out of the sheet, poses it, and whitens a copy for the flash", () => {
    // A fake sheet: every pixel opaque mid-grey, big enough to hold every character frame.
    const width = 80;
    const height = 180;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const [coworker] = starters();
    const hero = heroPixels({ data, width }, coworker.id, coworker.department);
    const frames = [hero.stand, ...hero.walk];
    const character = CHARACTER_FRAMES.find(([, , w, h]) => hero.stand.width === POSE_PAD.left + w + POSE_PAD.right && hero.stand.height === h + POSE_PAD.bottom);
    expect(character).toBeDefined();
    expect(hero.walk).toHaveLength(4);
    for (const frame of frames) expect([frame.width, frame.height]).toEqual([hero.stand.width, hero.stand.height]);
    for (let index = 0; index < hero.flash.data.length; index += 4) {
      if (hero.flash.data[index + 3] > 0) expect([...hero.flash.data.subarray(index, index + 3)]).toEqual([255, 255, 255]);
    }
    expect(hero.flash.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });
});

describe("copy", () => {
  it("has the same keys in both languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) => (inner && typeof inner === "object" && !Array.isArray(inner) ? keys(inner).map((sub) => `${key}.${sub}`) : [key]));
    expect(keys(HR_TEXT.ru).sort()).toEqual(keys(HR_TEXT.en).sort());
    expect(HR_TEXT.ru.howTo).toHaveLength(HR_TEXT.en.howTo.length);
  });

  it("spells out a quirk's effects", () => {
    expect(quirkLine(HR_TEXT.en, "caffeinated")).toBe("+20% speed, +15% damage taken");
    expect(quirkLine(HR_TEXT.en, "clockWatcher")).toBe("−15% XP Inactive in HR: salary.");
    expect(quirkLine(HR_TEXT.ru, "loyal")).toBe("−10% скорости Не действует в HR: шанс уволиться.");
  });

  it.each(["en", "ru"] as const)("labels every dormant effect and retains each active modifier in %s", (lang) => {
    const text = HR_TEXT[lang];
    for (const quirk of QUIRK_IDS) {
      const line = quirkLine(text, quirk);
      const effects = Object.entries(QUIRKS[quirk]) as [Effect, number][];
      const inactive = effects.filter(([effect]) => QUIRK_NUMBER[effect] === undefined);
      const active = effects.filter(([effect]) => QUIRK_NUMBER[effect] !== undefined);
      for (const [effect, percent] of active) {
        expect(line).toContain(`${percent > 0 ? "+" : "−"}${Math.abs(percent)}% ${text.effects[effect]}`);
      }
      if (inactive.length) {
        expect(line).toContain(text.inactiveEffects(inactive.map(([effect]) => text.effects[effect]).join(", ")));
        // No dormant probability/cost numbers can masquerade as functioning HR rules.
        for (const [effect, percent] of inactive) expect(line).not.toContain(`${Math.abs(percent)}% ${text.effects[effect]}`);
      }
      if (!active.length) expect(line).toContain(text.noActiveQuirk);
    }
  });

  it("describes duck contact rather than knockback or area protection in both languages", () => {
    expect(HR_TEXT.en.weapons.rubberDuck.description).toContain("contact damage on their orbit, without knockback");
    expect(HR_TEXT.ru.weapons.rubberDuck.description).toContain("урон при касании на орбите, без отталкивания");
    expect(HR_TEXT.en.traitHelp).toContain("no resignation rolls");
    expect(HR_TEXT.ru.traitHelp).toContain("случайных увольнений нет");
  });

  it("shows time as m:ss and counts gold in Russian", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(150.9)).toBe("2:30");
    expect(clock(-3)).toBe("0:00");
    expect([1, 3, 5, 21].map(HR_TEXT.ru.goldAmount)).toEqual(["1 золотой", "3 золотых", "5 золотых", "21 золотой"]);
  });
});
