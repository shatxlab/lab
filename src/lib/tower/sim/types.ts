/*
 * Lone Tower simulation types.
 *
 * The run is one mutable object stepped in place every frame: the sim is a
 * real-time loop with hundreds of short-lived arrows, so copying it per tick
 * would only make garbage. Everything random goes through `run.rng`, so a run
 * replays exactly from its seed and the same inputs.
 */

export type EnemyKind = "grunt" | "runner" | "brute" | "bat" | "boss";

export type UpgradeId =
  | "damage"
  | "reload"
  | "multishot"
  | "pierce"
  | "ricochet"
  | "crit"
  | "range"
  | "fire"
  | "frost"
  | "wall"
  | "regen"
  | "volleySize"
  | "volleyCooldown"
  | "caltrops";

/** Permanent bonuses bought with gold between runs. */
export type PerkId = "fortify" | "fletching" | "tactics" | "headStart";

export type Phase = "playing" | "choosing" | "over";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  flying: boolean;
  /** Damage per blow once it reaches the wall. */
  damage: number;
  attackEvery: number;
  attackTimer: number;
  burnLeft: number;
  burnDps: number;
  slowLeft: number;
  slow: number;
  /** Bosses call in grunts on this timer. */
  summonTimer: number;
  /** Seconds of white hit flash left, for the renderer. */
  flash: number;
  /** Phase of a bat's weave, so bats don't all flap in step. */
  phase: number;
}

export interface Arrow {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  crit: boolean;
  pierceLeft: number;
  ricochetLeft: number;
  /** Seconds of flight left before it drops to the ground. */
  life: number;
  hitIds: number[];
}

/** One arrow of a volley, arcing from the tower to a spot on the ground. */
export interface VolleyArrow {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Flight progress, 0 at the tower and 1 on landing. */
  t: number;
  duration: number;
  damage: number;
}

/** An arrow stuck in the ground that slows whoever walks over it. */
export interface Caltrop {
  id: number;
  x: number;
  y: number;
  angle: number;
  life: number;
}

export type EffectKind = "puff" | "pop" | "mark";

/** Purely visual: dust on landing, enemies popping, the volley's target ring. */
export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  radius: number;
  life: number;
  duration: number;
  color: string;
}

export interface PendingSpawn {
  kind: EnemyKind;
  /** Seconds into the wave. */
  at: number;
}

export type UpgradeLevels = Record<UpgradeId, number>;
export type PerkLevels = Record<PerkId, number>;

export interface Run {
  seed: number;
  rng: number;
  phase: Phase;
  /** Wave in progress, or just cleared while choosing. 0 before the first wave. */
  wave: number;
  waveTime: number;
  spawns: PendingSpawn[];
  /** Upgrade picks still owed before the next wave starts. */
  picksLeft: number;
  choices: UpgradeId[];
  upgrades: UpgradeLevels;
  perks: PerkLevels;
  hp: number;
  reloadLeft: number;
  volleyLeft: number;
  /** Where the archer is aiming, radians; the player's finger sets it. */
  aim: number;
  /** True while the player holds the field, which is the only time the archer shoots. */
  firing: boolean;
  enemies: Enemy[];
  arrows: Arrow[];
  volleys: VolleyArrow[];
  caltrops: Caltrop[];
  effects: Effect[];
  nextId: number;
  kills: number;
  gold: number;
}
