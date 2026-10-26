import { ENEMIES as LONE_TOWER_ENEMIES } from "@/lib/tower/sim/balance";
import type { EnemyKind, TowerKind } from "./types";

/**
 * The same phone-shaped field as Lone Tower: the woods along the top, the
 * castle wall across the bottom, and the road between them ending at the gate.
 */
export const ARENA = { width: 360, height: 640 } as const;
export const WALL_Y = 572;
export const GATE = { x: 180, y: WALL_Y } as const;

/** Half the road's width. */
export const ROAD_HALF = 13;
/** A build plot's size on the field, and how far a tap may land from it and still pick it. */
export const PLOT_RADIUS = 17;
export const PLOT_REACH = 24;

export const START_LIVES = 20;
/** Seconds between the last of a wave leaving the woods and the next one setting off on its own. */
export const WAVE_GAP = 14;
/** Gold for each second left on that wait when the next wave is called early. */
export const EARLY_GOLD_PER_SECOND = 1;
/** Share of what went into a tower that selling it gives back, once the first wave is on its way. */
export const SELL_REFUND = 0.6;

export interface TowerLevel {
  cost: number;
  damage: number;
  /** Seconds between shots. */
  reload: number;
  range: number;
  /** Radius hit around where the shot lands; 0 for one target. */
  splash: number;
  /** Fraction of speed a hit takes away, for a few seconds. */
  slow: number;
}

export interface TowerDef {
  /** Whether it can hit bats. */
  air: boolean;
  /** Units per second; stones arc over a set time instead. */
  shotSpeed: number;
  levels: readonly [TowerLevel, TowerLevel, TowerLevel];
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  archer: {
    air: true,
    shotSpeed: 420,
    levels: [
      { cost: 70, damage: 6, reload: 0.7, range: 92, splash: 0, slow: 0 },
      { cost: 60, damage: 10, reload: 0.6, range: 100, splash: 0, slow: 0 },
      { cost: 100, damage: 16, reload: 0.5, range: 110, splash: 0, slow: 0 },
    ],
  },
  catapult: {
    air: false,
    shotSpeed: 0,
    levels: [
      { cost: 100, damage: 14, reload: 2.4, range: 105, splash: 30, slow: 0 },
      { cost: 90, damage: 26, reload: 2.2, range: 115, splash: 34, slow: 0 },
      { cost: 150, damage: 44, reload: 2, range: 125, splash: 38, slow: 0 },
    ],
  },
  frost: {
    air: true,
    shotSpeed: 300,
    levels: [
      { cost: 80, damage: 3, reload: 1.1, range: 85, splash: 20, slow: 0.35 },
      { cost: 70, damage: 5, reload: 1, range: 92, splash: 24, slow: 0.45 },
      { cost: 110, damage: 8, reload: 0.9, range: 100, splash: 28, slow: 0.55 },
    ],
  },
  ballista: {
    air: true,
    shotSpeed: 460,
    levels: [
      { cost: 120, damage: 32, reload: 2.4, range: 140, splash: 0, slow: 0 },
      { cost: 110, damage: 56, reload: 2.2, range: 150, splash: 0, slow: 0 },
      { cost: 170, damage: 95, reload: 2, range: 165, splash: 0, slow: 0 },
    ],
  },
};

export const TOWER_KINDS = Object.keys(TOWERS) as TowerKind[];
export const MAX_LEVEL = 3;
/** Seconds a frost hit keeps an enemy slowed. */
export const FROST_SECONDS = 2;
/** How long a stone takes to land: a base plus a little per unit of distance. */
export const STONE_FLIGHT = { base: 0.7, perUnit: 1 / 600 } as const;

export interface FoeDef {
  hp: number;
  speed: number;
  /** Lives lost when it gets through the gate. */
  leak: number;
  gold: number;
}

/** Tougher than Lone Tower's horde, since a whole row of towers is shooting at it, but the same army. */
export const FOES: Record<EnemyKind, FoeDef & { radius: number; flying: boolean }> = {
  grunt: { hp: 28, speed: 30, leak: 1, gold: 5, radius: LONE_TOWER_ENEMIES.grunt.radius, flying: false },
  runner: { hp: 18, speed: 56, leak: 1, gold: 5, radius: LONE_TOWER_ENEMIES.runner.radius, flying: false },
  brute: { hp: 130, speed: 18, leak: 2, gold: 14, radius: LONE_TOWER_ENEMIES.brute.radius, flying: false },
  bat: { hp: 22, speed: 38, leak: 1, gold: 7, radius: LONE_TOWER_ENEMIES.bat.radius, flying: true },
  boss: { hp: 700, speed: 12, leak: 10, gold: 120, radius: LONE_TOWER_ENEMIES.boss.radius, flying: false },
};

/** Seconds between a warlord's calls for help, and how many footmen answer. */
export const BOSS_SUMMON = { every: 11, count: 2 } as const;

/** Enemy HP grows a little faster than linearly so late waves need the upgrades. */
export function hpScale(wave: number): number {
  const step = Math.max(0, wave - 1);
  return 1 + 0.14 * step + 0.012 * step * step;
}

/** Lone Tower's volley, loosed from the gatehouse. */
export const VOLLEY = {
  arrows: 12,
  radius: 36,
  damage: 14,
  /** Extra damage per wave sent, so the volley keeps up with the horde. */
  growth: 0.1,
  cooldown: 30,
  splash: 14,
} as const;

export function volleyDamage(wave: number): number {
  return VOLLEY.damage * (1 + VOLLEY.growth * Math.max(0, wave - 1));
}

/** Stars for a win, by lives left at the end. */
export function starsFor(lives: number): number {
  if (lives >= 18) return 3;
  if (lives >= 10) return 2;
  return 1;
}
