import { UPGRADE_IDS, UPGRADE_MAX } from "./balance";
import { shuffle } from "./random";
import type { PerkLevels, UpgradeId, UpgradeLevels } from "./types";

export const CHOICE_COUNT = 3;

export function emptyUpgrades(): UpgradeLevels {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as UpgradeLevels;
}

export function emptyPerks(): PerkLevels {
  return { fortify: 0, fletching: 0, tactics: 0, headStart: 0 };
}

export function isMaxed(upgrades: UpgradeLevels, id: UpgradeId): boolean {
  return upgrades[id] >= UPGRADE_MAX[id];
}

/** Up to three different upgrades that can still level up; fewer once most are maxed. */
export function rollChoices(upgrades: UpgradeLevels, source: { rng: number }): UpgradeId[] {
  const open = UPGRADE_IDS.filter((id) => !isMaxed(upgrades, id));
  return shuffle(source, open).slice(0, CHOICE_COUNT);
}
