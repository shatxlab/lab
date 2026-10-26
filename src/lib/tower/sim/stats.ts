import { BASE, MIN_VOLLEY_COOLDOWN, PERK_STEP, WALL_HP } from "./balance";
import type { PerkLevels, UpgradeLevels } from "./types";

export interface TowerStats {
  maxHp: number;
  regen: number;
  damage: number;
  reload: number;
  range: number;
  arrowSpeed: number;
  /** Arrows per shot. */
  multishot: number;
  pierce: number;
  ricochet: number;
  critChance: number;
  burnDps: number;
  burnSeconds: number;
  /** Fraction of speed a frosted enemy loses. */
  frost: number;
  frostSeconds: number;
  volleyArrows: number;
  volleyRadius: number;
  volleyDamage: number;
  volleyCooldown: number;
  /** 0 when missed arrows just vanish. */
  caltropSlow: number;
  caltropLife: number;
}

/** What the tower can do with these upgrades and perks; recomputed whenever it's needed. */
export function towerStats(upgrades: UpgradeLevels, perks: PerkLevels): TowerStats {
  const damageMultiplier = (1 + 0.25 * upgrades.damage) * (1 + PERK_STEP.fletching * perks.fletching);
  return {
    maxHp: BASE.maxHp + WALL_HP * upgrades.wall + PERK_STEP.fortify * perks.fortify,
    regen: upgrades.regen,
    damage: BASE.damage * damageMultiplier,
    reload: (BASE.reload * 0.88 ** upgrades.reload) / (1 + PERK_STEP.quickDraw * perks.quickDraw),
    range: BASE.range + 40 * upgrades.range,
    arrowSpeed: BASE.arrowSpeed,
    multishot: 1 + upgrades.multishot,
    pierce: upgrades.pierce,
    ricochet: upgrades.ricochet,
    critChance: BASE.critChance + 0.1 * upgrades.crit,
    burnDps: 2 * upgrades.fire * damageMultiplier,
    burnSeconds: 3,
    frost: 0.15 * upgrades.frost,
    frostSeconds: 1.5,
    volleyArrows: BASE.volleyArrows + 5 * upgrades.volleySize,
    volleyRadius: BASE.volleyRadius + 8 * upgrades.volleySize,
    volleyDamage: BASE.volleyDamage * damageMultiplier,
    volleyCooldown: Math.max(
      MIN_VOLLEY_COOLDOWN,
      BASE.volleyCooldown - 1.2 * upgrades.volleyCooldown - PERK_STEP.tactics * perks.tactics,
    ),
    caltropSlow: upgrades.caltrops === 0 ? 0 : 0.15 + 0.1 * upgrades.caltrops,
    caltropLife: 3 + 3 * upgrades.caltrops,
  };
}
