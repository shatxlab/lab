import type { EnemyKind, PerkId, UpgradeId } from "./types";

/**
 * The field in world units, a phone-shaped portrait arena. Enemies come out of
 * the woods along the top and march down to the castle wall across the bottom;
 * the archer's tower stands on the middle of that wall.
 */
export const ARENA = { width: 360, height: 640 } as const;
/** The wall's front face: anything that reaches it is hitting the castle. */
export const WALL_Y = 560;
export const TOWER = { x: 180, y: WALL_Y, radius: 26 } as const;
/** Enemies keep this far from the side edges, both where they appear and where they head. */
export const LANE_MARGIN = 16;

export const BASE = {
  maxHp: 100,
  damage: 3.5,
  reload: 0.32,
  range: 330,
  arrowSpeed: 520,
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
  grunt: { hp: 10, speed: 34, radius: 9, damage: 4, attackEvery: 1, flying: false, gold: 1, color: "#6fbf5a" },
  runner: { hp: 6, speed: 70, radius: 7, damage: 3, attackEvery: 0.8, flying: false, gold: 1, color: "#f2c443" },
  brute: { hp: 45, speed: 20, radius: 14, damage: 12, attackEvery: 1.4, flying: false, gold: 3, color: "#8a63c9" },
  bat: { hp: 8, speed: 50, radius: 8, damage: 3, attackEvery: 0.9, flying: true, gold: 2, color: "#4a4466" },
  boss: { hp: 120, speed: 14, radius: 24, damage: 14, attackEvery: 2, flying: false, gold: 25, color: "#d9534f" },
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

/** A price that grows by `growth` each level, rounded to a tidy 5. */
function growing(first: number, growth: number): (level: number) => number {
  return (level) => Math.round((first * growth ** level) / 5) * 5;
}

/**
 * Every perk costs more each level, and the whole tree adds up to roughly
 * twenty decent runs of gold, so there is still something to save for long
 * after the first few levels.
 */
export const PERKS: Record<PerkId, PerkDef> = {
  fortify: { max: 10, cost: growing(20, 1.55) },
  fletching: { max: 10, cost: growing(30, 1.6) },
  quickDraw: { max: 8, cost: growing(40, 1.6) },
  tactics: { max: 4, cost: growing(50, 1.8) },
  headStart: { max: 3, cost: (level) => [80, 250, 700][level] },
};

/** What one level of each perk adds. */
export const PERK_STEP = {
  fortify: 15,
  fletching: 0.08,
  quickDraw: 0.05,
  tactics: 0.5,
} as const;

/** The volley never reloads faster than this, whatever is stacked on it. */
export const MIN_VOLLEY_COOLDOWN = 1.5;

export const PERK_IDS = Object.keys(PERKS) as PerkId[];
