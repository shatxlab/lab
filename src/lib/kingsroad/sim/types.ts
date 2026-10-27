/*
 * Kingsroad simulation types.
 *
 * Like Lone Tower, the game is one mutable object stepped in place on a fixed
 * tick, and everything random goes through `game.rng`, so a game replays
 * exactly from its seed and the same inputs. The horde, the volley and the
 * effects are Lone Tower's own, so the two games share their types.
 */
import type { FoeSprite } from "@/lib/tower/render/sprites";
import type { Effect, EnemyKind, VolleyArrow } from "@/lib/tower/sim/types";

export type { Effect, EnemyKind, VolleyArrow };

export type TowerKind = "archer" | "catapult" | "frost" | "ballista";

export type MapId = "meadow" | "ford" | "crossroads" | "switchback" | "rivers" | "serpent" | "saltire" | "gorge" | "trident" | "citadel";

/** `ready` is the calm before the first wave, while the first towers go up. */
export type Status = "ready" | "playing" | "won" | "lost";

/** Which way an enemy comes: along one of the map's roads, or straight over everything by air. */
export type Route = { road: number } | { air: { fromX: number } };

export interface Foe extends FoeSprite {
  id: number;
  route: Route;
  /** How far along its route it has come. */
  distance: number;
  /** Sideways from the middle of the road, so a column doesn't walk in single file. */
  lane: number;
  facing: number;
  /** Fraction of speed lost while frosted. */
  slow: number;
  /** Bosses call in footmen on this timer. */
  summonTimer: number;
}

export interface Tower {
  id: number;
  /** Index into the map's plots. */
  plot: number;
  kind: TowerKind;
  /** 1 to 3. */
  level: number;
  aim: number;
  reloadLeft: number;
  /** Seconds since it last shot, for the renderer's recoil. */
  sinceShot: number;
  /** Gold put into it so far, for the refund when it's sold. */
  spent: number;
}

/**
 * Something a tower has let fly. Arrows and frost bolts home in on their
 * target; stones arc to where the target was going to be; ballista bolts fly
 * straight through whatever is in the way.
 */
export interface Shot {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** The foe a homing shot follows; 0 once it's gone. */
  targetId: number;
  /** Arc progress for stones, 0 at the tower and 1 on landing. */
  t: number;
  duration: number;
  /** Seconds a ballista bolt has left before it drops. */
  life: number;
  damage: number;
  splash: number;
  slow: number;
  air: boolean;
  hitIds: number[];
}

export interface PendingSpawn {
  kind: EnemyKind;
  /** Seconds into the wave. */
  at: number;
  /** Which road it walks; ignored for bats, which fly. */
  road: number;
}

export interface Game {
  map: MapId;
  seed: number;
  rng: number;
  status: Status;
  /** Waves sent so far; 0 before the first. */
  wave: number;
  waveTime: number;
  spawns: PendingSpawn[];
  /** Seconds until the next wave marches on its own; null while one is still coming out of the woods. */
  nextWaveIn: number | null;
  lives: number;
  gold: number;
  towers: Tower[];
  foes: Foe[];
  shots: Shot[];
  volleys: VolleyArrow[];
  effects: Effect[];
  volleyLeft: number;
  nextId: number;
  kills: number;
}
