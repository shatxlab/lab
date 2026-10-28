import { QUIRKS } from "@/lib/roster/data";
import { STATS, type Coworker } from "@/lib/roster/types";
import { HERO_BASE, PASSIVES, PASSIVE_IDS, QUIRK_NUMBER, STAT_NUMBER, STAT_STEP } from "./balance";
import type { HeroNumbers, PassiveId } from "./types";

/**
 * What a coworker brings to a run: each stat moves its number by `STAT_STEP` a point away from 10, then each quirk
 * moves its numbers by its percent. Focus shortens the cooldown, so it divides.
 */
export function baseNumbers(coworker: Coworker): HeroNumbers {
  const numbers = { ...HERO_BASE };
  for (const stat of STATS) {
    const key = STAT_NUMBER[stat];
    const factor = Math.max(0.2, 1 + (coworker.stats[stat] - 10) * STAT_STEP);
    numbers[key] = key === "cooldown" ? numbers[key] / factor : numbers[key] * factor;
  }
  for (const quirk of coworker.quirks) {
    for (const [effect, percent] of Object.entries(QUIRKS[quirk]) as [keyof typeof QUIRK_NUMBER, number][]) {
      const key = QUIRK_NUMBER[effect];
      if (!key) continue;
      const factor = Math.max(0.2, 1 + percent / 100);
      numbers[key] = key === "cooldown" ? numbers[key] / factor : numbers[key] * factor;
    }
  }
  return numbers;
}

/** `base` with every passive's levels on. */
export function withPassives(base: HeroNumbers, passives: Partial<Record<PassiveId, number>>): HeroNumbers {
  const numbers = { ...base };
  for (const id of PASSIVE_IDS) {
    const level = passives[id] ?? 0;
    if (level > 0) numbers[PASSIVES[id].number] *= Math.max(0.2, 1 + PASSIVES[id].per * level);
  }
  return numbers;
}
