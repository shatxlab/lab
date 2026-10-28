import { describe, expect, it } from "vitest";

import { BASE_STAT, DEPARTMENTS, FAVOURED_BONUS, MAX_QUIRKS, QUIRKS, RARITY, STAT_JITTER } from "@/lib/roster/data";
import { generateCoworker, rollRarity, starters, STARTERS } from "@/lib/roster/generate";
import { DEPARTMENT_IDS, QUIRK_IDS, RARITIES, STATS } from "@/lib/roster/types";

describe("generateCoworker", () => {
  it("replays from the same seed and hands out ids in order", () => {
    const a = { rng: 42, nextId: 7 };
    const b = { rng: 42, nextId: 7 };
    const first = [generateCoworker(a), generateCoworker(a)];
    expect([generateCoworker(b), generateCoworker(b)]).toEqual(first);
    expect(first.map((coworker) => coworker.id)).toEqual([7, 8]);
    expect(a.nextId).toBe(9);
  });

  it("keeps the given department and rarity", () => {
    const coworker = generateCoworker({ rng: 1, nextId: 1 }, { department: "legal", rarity: "legend" });
    expect(coworker.department).toBe("legal");
    expect(coworker.rarity).toBe("legend");
  });

  it("rolls stats and quirks by the rarity's rules", () => {
    const source = { rng: 9, nextId: 1 };
    for (let index = 0; index < 500; index += 1) {
      const coworker = generateCoworker(source);
      const rule = RARITY[coworker.rarity];
      expect(coworker.quirks).toHaveLength(rule.quirks);
      expect(new Set(coworker.quirks).size).toBe(coworker.quirks.length);
      const total = STATS.reduce((sum, stat) => sum + coworker.stats[stat], 0);
      const expected = BASE_STAT * STATS.length + FAVOURED_BONUS + rule.bonus;
      expect(Math.abs(total - expected)).toBeLessThanOrEqual(STAT_JITTER * STATS.length);
      expect(coworker).toMatchObject({ level: 1, xp: 0, status: { kind: "active" } });
    }
  });

  it("rolls rarities close to their weights", () => {
    const source = { rng: 123 };
    const counts = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0]));
    const rolls = 20_000;
    for (let index = 0; index < rolls; index += 1) counts[rollRarity(source)] += 1;
    const total = RARITIES.reduce((sum, rarity) => sum + RARITY[rarity].weight, 0);
    for (const rarity of RARITIES) expect(counts[rarity] / rolls).toBeCloseTo(RARITY[rarity].weight / total, 1);
  });
});

describe("starters", () => {
  it("are the same three commons with ids 1 to 3", () => {
    const team = starters();
    expect(team).toEqual(starters());
    expect(team.map((coworker) => coworker.id)).toEqual([1, 2, 3]);
    expect(team.map((coworker) => coworker.department)).toEqual(STARTERS.map((starter) => starter.department));
    expect(team.every((coworker) => coworker.rarity === "common")).toBe(true);
  });
});

describe("data", () => {
  it("covers every department and quirk", () => {
    expect(Object.keys(DEPARTMENTS).sort()).toEqual([...DEPARTMENT_IDS].sort());
    expect(Object.keys(QUIRKS).sort()).toEqual([...QUIRK_IDS].sort());
    for (const rarity of RARITIES) expect(RARITY[rarity].quirks).toBeLessThanOrEqual(MAX_QUIRKS);
  });

  it("gives every quirk an upside", () => {
    // Positive is good except for damage taken, quit chances and salary, where lower is better.
    const costs = new Set(["damageTaken", "quitChance", "teamQuitChance", "salary"]);
    for (const effects of Object.values(QUIRKS)) {
      expect(Object.entries(effects).some(([effect, value]) => (costs.has(effect) ? value < 0 : value > 0))).toBe(true);
    }
  });
});
