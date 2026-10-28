import { describe, expect, it } from "vitest";

import { HERO_BASE, MAX_PASSIVES, MAX_WEAPON_LEVEL, MAX_WEAPONS, PASSIVES, WEAPON_IDS, weaponNumbers } from "@/lib/hr/sim/balance";
import { Grid } from "@/lib/hr/sim/grid";
import { baseNumbers, withPassives } from "@/lib/hr/sim/hero";
import { applyPick, possiblePicks, rollPicks } from "@/lib/hr/sim/picks";
import { createRun } from "@/lib/hr/sim/run";
import { starters } from "@/lib/roster/generate";
import type { Coworker } from "@/lib/roster/types";

const plain: Coworker = { ...starters()[0], quirks: [], stats: { grit: 10, output: 10, hustle: 10, focus: 10, luck: 10 } };

describe("Grid", () => {
  it("finds exactly the circles that overlap the query", () => {
    const items = Array.from({ length: 400 }, (_, index) => ({ x: (index * 97) % 1000, y: (index * 61) % 1000, radius: 4 + (index % 20) }));
    const grid = new Grid(1000, 1000, 64);
    grid.rebuild(items);
    for (const [x, y, radius] of [[500, 500, 40], [0, 0, 100], [990, 10, 5], [300, 700, 0]]) {
      const found: typeof items = [];
      grid.near(x, y, radius, 24, (item) => found.push(item));
      const expected = items.filter((item) => Math.hypot(item.x - x, item.y - y) <= radius + item.radius);
      expect(new Set(found)).toEqual(new Set(expected));
    }
  });
});

describe("baseNumbers", () => {
  it("is the base for a plain coworker", () => {
    expect(baseNumbers(plain)).toEqual(HERO_BASE);
  });

  it("moves each number by its stat, and focus shortens the cooldown", () => {
    const numbers = baseNumbers({ ...plain, stats: { grit: 14, output: 10, hustle: 6, focus: 20, luck: 10 } });
    expect(numbers.maxHp).toBeCloseTo(120);
    expect(numbers.speed).toBeCloseTo(96);
    expect(numbers.cooldown).toBeCloseTo(1 / 1.5);
  });

  it("applies quirks in percent", () => {
    const numbers = baseNumbers({ ...plain, quirks: ["caffeinated", "nightOwl"] });
    expect(numbers.speed).toBeCloseTo(HERO_BASE.speed * 1.2);
    expect(numbers.taken).toBeCloseTo(1.15);
    expect(numbers.cooldown).toBeCloseTo(1 / 1.2);
    expect(numbers.maxHp).toBeCloseTo(90);
  });

  it("stacks passives by level", () => {
    expect(withPassives(HERO_BASE, { gym: 2, coffee: 1 })).toMatchObject({ maxHp: HERO_BASE.maxHp * (1 + PASSIVES.gym.per * 2), cooldown: 1 + PASSIVES.coffee.per });
  });
});

describe("weaponNumbers", () => {
  it("grows by level and floors counts", () => {
    for (const id of WEAPON_IDS) {
      const first = weaponNumbers(id, 1);
      const last = weaponNumbers(id, MAX_WEAPON_LEVEL);
      expect(last.damage).toBeGreaterThan(first.damage);
      expect(Number.isInteger(last.count) && Number.isInteger(last.pierce)).toBe(true);
      expect(last.cooldown).toBeGreaterThan(0);
    }
  });
});

describe("picks", () => {
  it("offers three different picks", () => {
    const run = createRun(plain, 1);
    const offer = rollPicks(run);
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((pick) => JSON.stringify(pick))).size).toBe(3);
  });

  it("offers no new weapon or passive once the slots are full, and nothing past the max level", () => {
    const run = createRun(plain, 1);
    run.weapons = WEAPON_IDS.slice(0, MAX_WEAPONS).map((id) => ({ id, level: MAX_WEAPON_LEVEL, cooldownLeft: 0, spin: 0 }));
    run.passives = { gym: 5, coffee: 5, sneakers: 5, lanyard: 5 };
    expect(Object.keys(run.passives)).toHaveLength(MAX_PASSIVES);
    expect(possiblePicks(run)).toEqual([]);
    expect(rollPicks(run)).toEqual([{ kind: "heal" }, { kind: "gold" }]);
  });

  it("applies a passive with the hp that comes with it, and a weapon level", () => {
    const run = createRun(plain, 1);
    run.hero.hp = 50;
    applyPick(run, { kind: "passive", id: "gym", level: 1 });
    expect(run.numbers.maxHp).toBeCloseTo(115);
    expect(run.hero.hp).toBeCloseTo(65);
    applyPick(run, { kind: "weapon", id: "stickyNotes", level: 2 });
    applyPick(run, { kind: "weapon", id: "contract", level: 1 });
    expect(run.weapons.map((weapon) => [weapon.id, weapon.level])).toEqual([["stickyNotes", 2], ["contract", 1]]);
  });
});
