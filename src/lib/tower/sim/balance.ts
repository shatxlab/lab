import type { EnemyKind, PerkId, UpgradeId } from "./types";

/** The field in world units: a phone-shaped portrait arena with the tower in the middle. */
export const ARENA = { width: 360, height: 640 } as const;
export const TOWER = { x: 180, y: 330, radius: 24 } as const;

export const BASE = {
  maxHp: 100,
  damage: 6,
  reload: 0.55,
  range: 165,
  arrowSpeed: 430,
  critChance: 0.05,
  critMultiplier: 2,
  volleyArrows: 10,
  volleyRadius: 42,
  volleyDamage: 6,
  volleyCooldown: 6,
  /** How close to a landing volley arrow an enemy has to be to get hit. */
  volleySplash: 15,
} as const;

/** HP the wall gets back after clearing a wave. */
export const WAVE_CLEAR_HEAL = 15;
export const BOSS_EVERY = 5;
export const MAX_CALTROPS = 90;
/** How far a ricocheting arrow looks for its next target. */
export const RICOCHET_RANGE = 120;

export interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  attackEvery: number;
  flying: boolean;
  gold: number;
  color: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 10, speed: 26, radius: 9, damage: 4, attackEvery: 1, flying: false, gold: 1, color: "#6fbf5a" },
  runner: { hp: 6, speed: 56, radius: 7, damage: 3, attackEvery: 0.8, flying: false, gold: 1, color: "#f2c443" },
  brute: { hp: 45, speed: 15, radius: 14, damage: 12, attackEvery: 1.4, flying: false, gold: 3, color: "#8a63c9" },
  bat: { hp: 8, speed: 40, radius: 8, damage: 3, attackEvery: 0.9, flying: true, gold: 2, color: "#4a4466" },
  boss: { hp: 120, speed: 11, radius: 24, damage: 14, attackEvery: 2, flying: false, gold: 25, color: "#d9534f" },
};

/** Seconds between a boss's calls for help, and how many grunts answer. */
export const BOSS_SUMMON = { every: 8, count: 2 } as const;

/** Enemy HP grows a little faster than linearly so late waves stay a threat. */
export function hpScale(wave: number): number {
  const step = Math.max(0, wave - 1);
  return 1 + 0.12 * step + 0.008 * step * step;
}

export function speedScale(wave: number): number {
  return Math.min(1.3, 1 + 0.01 * Math.max(0, wave - 1));
}

export const UPGRADE_MAX: Record<UpgradeId, number> = {
  damage: 5,
  reload: 5,
  multishot: 4,
  pierce: 3,
  ricochet: 3,
  crit: 4,
  range: 3,
  fire: 3,
  frost: 3,
  wall: 5,
  regen: 3,
  volleySize: 3,
  volleyCooldown: 3,
  caltrops: 3,
};

export const UPGRADE_IDS = Object.keys(UPGRADE_MAX) as UpgradeId[];

/** HP each Stone wall level adds, and heals right away. */
export const WALL_HP = 30;

export interface PerkDef {
  max: number;
  /** Gold for the next level, given the current one. */
  cost: (level: number) => number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  fortify: { max: 5, cost: (level) => 15 + 15 * level },
  fletching: { max: 5, cost: (level) => 20 + 20 * level },
  tactics: { max: 3, cost: (level) => 30 + 30 * level },
  headStart: { max: 2, cost: (level) => (level === 0 ? 60 : 150) },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];
