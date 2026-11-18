import { QUIRKS } from "@/lib/roster/data";
import { kitStats, type ItemState } from "@/lib/hr/kit";
import { STATS, type Coworker } from "@/lib/roster/types";
import { HERO_BASE, PASSIVES, PASSIVE_IDS, QUIRK_NUMBER, STAT_NUMBER, STAT_STEP, STAT_STEPS } from "./balance";
import type { HeroNumbers, PassiveId } from "./types";

/**
 * What a coworker brings to a run: each stat moves its numbers by their steps (`STAT_STEPS`) a point away from 10 —
 * hustle moves two (speed and pickup radius), luck moves two (gold and the lucky find) — then each quirk moves its
 * numbers by its percent. Focus shortens the cooldown, so it divides.
 */
export function baseNumbers(coworker: Coworker, kit: readonly ItemState[] = []): HeroNumbers {
  const numbers = { ...HERO_BASE };
  // The desk's gear is a third stat source, after the level and the quirks.
  const stats = { ...coworker.stats };
  for (const [stat, points] of Object.entries(kitStats(kit)) as [typeof STATS[number], number][]) {
    stats[stat] = Math.min(99, stats[stat] + points);
  }
  for (const stat of STATS) {
    for (const [key, step] of Object.entries(STAT_STEPS[stat]) as [keyof HeroNumbers, number][]) {
      const factor = Math.max(0.2, 1 + (stats[stat] - 10) * step);
      numbers[key] = key === "cooldown" ? numbers[key] / factor : numbers[key] * factor;
    }
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
