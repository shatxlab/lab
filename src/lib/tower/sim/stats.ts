import { BASE, MIN_SKILL_COOLDOWN, PERK_STEP, SKILLS, WALL_HP } from "./balance";
import type { PerkLevels, SkillId, UpgradeLevels } from "./types";

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
  /** Equipped-skill values; the selected skill determines base radius/cooldown. */
  skillRadius: number;
  skillCooldown: number;
  skillDamage: number;
  skillBurnDps: number;
  /** 0 when missed arrows just vanish. */
  caltropSlow: number;
  caltropLife: number;
}

/** What the tower can do with these upgrades and perks; recomputed whenever it's needed. */
export function towerStats(upgrades: UpgradeLevels, perks: PerkLevels, skill: SkillId = "catapult"): TowerStats {
  const damageMultiplier = (1 + 0.25 * upgrades.damage) * (1 + PERK_STEP.fletching * perks.fletching);
  const definition = SKILLS[skill];
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
    skillRadius: definition.radius + 8 * upgrades.skillSize,
    skillCooldown: Math.max(
      MIN_SKILL_COOLDOWN,
      definition.cooldown - 1.2 * upgrades.skillCooldown - PERK_STEP.tactics * perks.tactics,
    ),
    // Catapult damage and its burn each scale once. Fire arrows improve its burn, never its impact twice.
    skillDamage: SKILLS.catapult.damage * damageMultiplier,
    skillBurnDps: (SKILLS.catapult.burnDps + 2 * upgrades.fire) * damageMultiplier,
    caltropSlow: upgrades.caltrops === 0 ? 0 : 0.15 + 0.1 * upgrades.caltrops,
    caltropLife: 3 + 3 * upgrades.caltrops,
  };
}
