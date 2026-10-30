import { ENEMIES as LONE_TOWER_ENEMIES } from "@/lib/tower/sim/balance";
import type { ArcherBranch, FoeKind, TowerKind } from "./types";

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
/** Fire arrows: damage per second while a foe burns, and how long a hit keeps it alight. */
export const BURN = { dps: 6, seconds: 3 } as const;
/** Lune arrows: the share of extra damage a marked foe takes, and how long a hit keeps the mark. */
export const MARK = { bonus: 0.35, seconds: 3 } as const;

/**
 * What an archer's third level can be instead of the plain longbow, on maps that
 * allow branches. Each is about as strong as the longbow against a lone target
 * and pays off in its own way: fire keeps hurting after the hit, lune makes
 * every tower's shots count for more.
 */
export const ARCHER_BRANCHES: Record<ArcherBranch, TowerLevel & { burn: number; mark: number }> = {
  fire: { cost: 100, damage: 13, reload: 0.5, range: 108, splash: 0, slow: 0, burn: BURN.seconds, mark: 0 },
  lune: { cost: 100, damage: 12, reload: 0.5, range: 112, splash: 0, slow: 0, burn: 0, mark: MARK.seconds },
};
/** Seconds a frost hit keeps an enemy slowed. */
export const FROST_SECONDS = 2;
/** How long a stone takes to land: a base plus a little per unit of distance. */
export const STONE_FLIGHT = { base: 0.7, perUnit: 1 / 600 } as const;

/** The least a hit does to an armoured foe, as a share of its damage, so small arrows still count for something. */
export const ARMOR_FLOOR = 0.25;
/** The share of a fire arrow's own damage that gets through to a fireproof foe. */
export const FIREPROOF_HIT = 0.5;
/** How far a healer's mending reaches. */
export const HEAL_RANGE = 48;

export interface FoeDef {
  hp: number;
  speed: number;
  /** Lives lost when it gets through the gate. */
  leak: number;
  gold: number;
}

interface FoeStats extends FoeDef {
  radius: number;
  flying: boolean;
  /** Taken off every hit's damage (fire's burning ignores it), down to `ARMOR_FLOOR` of the hit. */
  armor: number;
  /** Ignores burning, and takes only `FIREPROOF_HIT` of a fire arrow's own damage. */
  fireproof: boolean;
  /** Share of a friend's full health a healer restores each second within `HEAL_RANGE`; 0 for foes that don't. */
  heal: number;
  color: string;
}

const foe = (stats: Pick<FoeStats, "hp" | "speed" | "leak" | "gold" | "radius" | "color"> & Partial<FoeStats>): FoeStats => ({
  flying: false,
  armor: 0,
  fireproof: false,
  heal: 0,
  ...stats,
});

/** Tougher than Lone Tower's horde, since a whole row of towers is shooting at it, but the same army; the last five are the second canvas's. */
export const FOES: Record<FoeKind, FoeStats> = {
  grunt: foe({ hp: 28, speed: 30, leak: 1, gold: 5, radius: LONE_TOWER_ENEMIES.grunt.radius, color: LONE_TOWER_ENEMIES.grunt.color }),
  runner: foe({ hp: 18, speed: 56, leak: 1, gold: 5, radius: LONE_TOWER_ENEMIES.runner.radius, color: LONE_TOWER_ENEMIES.runner.color }),
  brute: foe({ hp: 130, speed: 18, leak: 2, gold: 14, radius: LONE_TOWER_ENEMIES.brute.radius, color: LONE_TOWER_ENEMIES.brute.color }),
  bat: foe({ hp: 22, speed: 38, leak: 1, gold: 7, radius: LONE_TOWER_ENEMIES.bat.radius, flying: true, color: LONE_TOWER_ENEMIES.bat.color }),
  boss: foe({ hp: 700, speed: 12, leak: 10, gold: 120, radius: LONE_TOWER_ENEMIES.boss.radius, color: LONE_TOWER_ENEMIES.boss.color }),
  // Plate shrugs off small arrows; ballista bolts, stones and burning go through it.
  knight: foe({ hp: 130, speed: 22, leak: 2, gold: 14, radius: 12, armor: 5, color: "#7f8a99" }),
  // Born in fire: no use setting it alight.
  imp: foe({ hp: 55, speed: 34, leak: 1, gold: 8, radius: 8, fireproof: true, color: "#e2552b" }),
  // Walks in the column and mends it; kill it first.
  healer: foe({ hp: 40, speed: 30, leak: 1, gold: 12, radius: 9, heal: 0.06, color: "#f3f0e6" }),
  // A swarm of them: stones and frost sweep them up, single-target shots waste themselves.
  scamp: foe({ hp: 8, speed: 54, leak: 1, gold: 2, radius: 5, color: "#a8754a" }),
  // A flyer that archers, ballistas and frost can reach, and few shots hurt much.
  gargoyle: foe({ hp: 140, speed: 28, leak: 3, gold: 16, radius: 11, flying: true, armor: 2, color: "#7d8591" }),
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
