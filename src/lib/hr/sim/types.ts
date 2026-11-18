/*
 * The hero run's simulation types.
 *
 * As in Tower and Kingsroad, a run is one mutable object stepped in place on a fixed tick, and everything random
 * goes through `run.rng`, so a run replays exactly from its seed and the same inputs. It is plain JSON on purpose:
 * the page saves it as it goes and picks it up again (see `snapshot.ts`).
 */
import type { DepartmentId, QuirkId, WeaponId } from "@/lib/roster/types";
import type { ItemId, ItemState } from "@/lib/hr/kit";

export type { WeaponId };

export type FoeKind = "replyAll" | "paperPlane" | "mondayBlob" | "meetingInvite" | "printerJam" | "middleManager" | "lunchMonitor" | "sysadmin" | "auditor" | InterviewBoss | "meetingChair" | "shredder" | "coffeeMachine" | "vendingMachine" | "printerPrime" | "blobPrime" | "lunchThief" | "greaseFire" | "looseCable" | "hotRack";

/** What hurt the hero: a foe, or a hazard of the stage. */
export type Source = FoeKind | "microwave" | "vent" | "projector";

/** Where a day is spent: the open space everyone starts in, then the areas with a hazard of their own, and
 * the boardroom, where the audit waits. */
export type Stage = "openSpace" | "kitchen" | "serverRoom" | "boardroom";

/**
 * Something fixed to the floor of a stage: a coffee spill that slows the hero, a microwave that fires rings, a vent that
 * blasts heat in bursts — or a coffee puddle a lob leaves behind.
 */
export interface Hazard {
  kind: "spill" | "microwave" | "vent" | "projector" | "puddle";
  x: number;
  y: number;
  radius: number;
  /** Seconds until a microwave fires or a vent next blasts. */
  timer: number;
  /** Seconds left of a vent's blast; 0 while it is quiet. */
  active: number;
  /** Seconds until a puddle dries; absent for the stage's permanent hazards. */
  life?: number;
}

/** The monsters a new hire has to beat before they join: a charging lead, an HR manager, a recruiter. */
export type InterviewBoss = "teamLead" | "hrManager" | "recruiter";

/** A run that is an interview, not a day: beat `boss` to hire the card `candidateId`. */
export interface Interview {
  boss: InterviewBoss;
  candidateId: number;
}

export type PassiveId = "coffee" | "gym" | "sneakers" | "lanyard" | "mentor" | "ergoChair" | "powerTie";

export type Status = "playing" | "won" | "lost";

/** The stick: a direction, at most length 1. */
export interface Input {
  dx: number;
  dy: number;
}

/** What the hero's stats and passives come to; recomputed whenever a passive is picked. */
export interface HeroNumbers {
  maxHp: number;
  /** World units per second. */
  speed: number;
  damage: number;
  /** Multiplies every weapon's cooldown; below 1 is faster. */
  cooldown: number;
  /** Gems inside this radius fly to the hero. */
  magnet: number;
  xp: number;
  gold: number;
  /** The chance of a lucky find on a cleared floor, and (batch 3) of boss loot. */
  loot: number;
  /** Multiplies damage the hero takes. */
  taken: number;
}

export interface Hero {
  x: number;
  y: number;
  hp: number;
  /** The last way the hero moved, for weapons that throw forward and for the sprite. */
  faceX: number;
  faceY: number;
  /** Seconds left on the hit flash. */
  hurt: number;
}

export interface OwnedWeapon {
  id: WeaponId;
  level: number;
  /** Seconds until it fires again. */
  cooldownLeft: number;
  /** Angle of the first orbiter, for the rubber duck. */
  spin: number;
}

export interface Foe {
  id: number;
  kind: FoeKind;
  /** A floor boss or an interview boss: hp that does not scale, thin knockback, an anchored body. */
  boss: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  /** Damage per second while touching the hero. */
  touch: number;
  xp: number;
  gold: number;
  /** Knockback velocity, which fades. */
  pushX: number;
  pushY: number;
  /** Fraction of speed lost to the contract's fine print; set each tick it is inside. */
  slow: number;
  /** Seconds to its next summon, shot or charge. */
  timer: number;
  /** How many times the timer has gone off. */
  cycles: number;
  /** Seconds left on a charge, for the middle manager. */
  charge: number;
  chargeX: number;
  chargeY: number;
  /** Seconds until a rubber duck may hit it again. */
  duckCooldown: number;
  /** Seconds left bound by Cease & Desist: it neither moves nor acts. */
  detained: number;
  /** Seconds left glued by Sticky Situation: it crawls. */
  stuck: number;
  /** Seconds left under Audit: it takes half again as much and pays double. */
  marked: number;
  /** Seconds until a blinking sysadmin may blink away again. */
  blinkCd: number;
  /** Set on an immobile floor boss until it has walked in to its post. */
  walkIn?: boolean;
  /** Seconds left of a blob prime's expanding shockwave. */
  shock: number;
  /** Set when the auditor falls to half hp and gets angry. */
  enraged: boolean;
  /** An elite horde foe: no flinch, half knockback, a harder touch, double pay. */
  elite?: boolean;
  /** Seconds this boss has been on the field; drives the soft enrage (see `ENRAGE`). */
  age?: number;
  /** Seconds left on its hit flash. */
  hurt: number;
}

/** Something the hero's weapons have let fly. */
export interface Shot {
  id: number;
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  /** Seconds before it drops. */
  life: number;
  /** Foes it may still pass through; it is spent at 0. */
  pierce: number;
  /** A homing shot follows this foe; 0 once it's gone. */
  targetId: number;
  hitIds: number[];
}

/** A server rack on its way down: it lands after `delay` and hits everything under it. */
export interface Drop {
  id: number;
  x: number;
  y: number;
  delay: number;
  radius: number;
  damage: number;
}

/** Toner from a printer jam or red tape from the auditor, flying at the hero. A lob flies to where it will land. */
export interface FoeShot {
  id: number;
  from: Source;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  /** A lob hurts everything close on arrival and may leave a puddle. */
  lob?: { flight: number; splash: number; puddle?: number };
  /** A shot with an arm distance only hurts the hero once it has flown that far. */
  arm?: number;
  /** How far an armed shot has flown. */
  flown?: number;
}

export interface Gem {
  id: number;
  x: number;
  y: number;
  value: number;
  /** Flying to the hero once caught by the magnet. */
  pulled: boolean;
}

/** Something only the renderer cares about: a swing, a blast, a pop. */
export interface Effect {
  kind: "swing" | "blast" | "pop" | "duckHit" | "spikeWarn";
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
}

/** One of the three offers at a level-up. */
export type Pick =
  | { kind: "weapon"; id: WeaponId; level: number }
  | { kind: "passive"; id: PassiveId; level: number }
  | { kind: "heal" }
  | { kind: "gold" }
  | { kind: "mutation"; weapon: WeaponId; mutation: MutationId };

/** A floor-clear hammer: one owned weapon's pattern bends for the rest of the day (see `MUTATIONS`). */
export type MutationId =
  | "tandem"
  | "ricochet"
  | "overclocked"
  | "gravity"
  | "wide"
  | "deep"
  | "burst";

/** A seeded pressure spike: an ambush ring that closes around the hero, or a rush of spawns. */
export interface Spike {
  kind: "ring" | "rush";
  /** Seconds into the floor's horde phase when it fires (rush: when the rush starts). */
  at: number;
  /** A rush lasts this long once it starts. */
  span?: number;
  /** The ring's ambush points, computed once the warning starts. */
  points?: { x: number; y: number }[];
  /** Set once the warning has been raised. */
  armed?: boolean;
  /** Set once it has done its thing. */
  done?: boolean;
}

/** A cameo guest between floors: a retired senior, the office nurse, or a rival intern. */
export interface Cameo {
  kind: "senior" | "nurse" | "rival";
  /** Rival: the hero's kill count when the floor began, and the KPI target to beat. */
  kills0?: number;
  target?: number;
  /** Rival: set once the floor has been scored. */
  done?: boolean;
  /** Rival: whether the target was beaten (gold) or not (a taunt). */
  won?: boolean;
}

export interface Run {
  /** Bump when the shape changes, so an old snapshot is thrown away rather than misread. */
  version: number;
  seed: number;
  rng: number;
  coworkerId: number;
  /** Multiplies foes' hp and (by half) their spawns; 1 on a coworker's first day. */
  difficulty: number;
  /** Set when the run is an interview: no review, no day, and the boss is the only goal. */
  interview: Interview | null;
  /** Which floor of the floor plan the day is on, 1 to `LAST_FLOOR`; interviews ignore it. */
  floor: number;
  /** The run time this floor began at, so a floor's horde and its spawns ramp from their own start. */
  floorStart: number;
  /** The floor boss's foe id once it has walked in; null until then and after it falls. */
  bossId: number | null;
  /** The floor's boss is down: the pick offer and the stairs wait, the arena holds still. */
  cleared: boolean;
  /** Floors whose boss has fallen this day; the review pays for them (see `reviewXp`). */
  floorsCleared: number;
  /** Seconds left of the department skill's cooldown; 0 casts. */
  skillCd: number;
  /** The department, so the skill knows whose signature move this is. */
  department: DepartmentId;
  /** The coworker's career level: the skill's tier. */
  careerLevel: number;
  /** The quirks, for the casting hooks. */
  quirks: QuirkId[];
  /** The desk kit carried into the day, whole with its levels, for its stat points and unique effects. */
  kit: ItemState[];
  /** The loot the day's bosses have dropped so far; the desk takes it at settlement. */
  lootFound: ItemState[];
  /** The carried item the player chose to swap out for the day's find; the desk honours it at settlement. */
  swapOut?: ItemId;
  /** The weapon patterns bent by this day's hammers, by weapon (see `MUTATIONS`); per-run, never carried. */
  mutations?: Partial<Record<WeaponId, MutationId>>;
  /** This floor's pressure spike, seeded per floor (see `SPIKE`); null on floors that draw none. */
  spike?: Spike | null;
  /** This floor's cameo guest (see `CAMEO`); null on floors that draw none. */
  cameo?: Cameo | null;
  /** Cameo guests hosted so far today; `CAMEO.cap` a day. */
  cameosUsed?: number;
  /** The rubber-duck decoy, while a Rubber Duck Program runs: foes pile onto it. */
  decoy: { x: number; y: number; life: number } | null;
  /** Seconds left of Team Building's carry: the hero strides. */
  aura: number;
  stage: Stage;
  hazards: Hazard[];
  /** Level-up offers show this many more picks (the corner office perk). */
  extraPicks: number;
  /** Whether the hero can still get up once (the second wind perk). */
  revive: boolean;
  /** Seconds of not being hurt left, after getting up. */
  grace: number;
  status: Status;
  /** Seconds played; the clock stops while a pick is waiting. */
  time: number;
  /** What the coworker's stats and quirks give, before passives. */
  base: HeroNumbers;
  /** `base` with the passives on. */
  numbers: HeroNumbers;
  hero: Hero;
  weapons: OwnedWeapon[];
  passives: Partial<Record<PassiveId, number>>;
  level: number;
  xp: number;
  /** The offer the player must choose from before the run goes on; null while playing. */
  picks: Pick[] | null;
  /** Level-ups still owed an offer after this one. */
  queuedPicks: number;
  /** Fractional spawns carried between ticks. */
  spawnDebt: number;
  /** Seconds until the next printer jam may be placed. */
  printerIn: number;
  /** Set once this floor's boss (or, in an interview, its boss) has walked in. */
  bossDone: boolean;
  foes: Foe[];
  shots: Shot[];
  drops: Drop[];
  foeShots: FoeShot[];
  gems: Gem[];
  effects: Effect[];
  nextId: number;
  kills: number;
  gold: number;
  /** Damage dealt by each weapon, for the bot's report. */
  dealt: Partial<Record<WeaponId, number>>;
  /** Damage the hero took from each kind of foe, for the bot's report and "what wore me down". */
  takenFrom: Partial<Record<Source, number>>;
  /** The last thing that hurt the hero, for "how did I die". */
  lastHitBy: Source | null;
  abandoned: boolean;
}
