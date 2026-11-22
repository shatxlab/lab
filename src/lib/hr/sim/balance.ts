/*
 * Every number the hero run is tuned by. Change them here and check with the bot:
 * `scripts/hr/playthrough.ts` (usage in its header).
 */
import type { DepartmentId, Effect as QuirkEffect, PerkId, Stat } from "@/lib/roster/types";
import type { ClassId } from "./classes";
import type { FoeKind, HeroNumbers, InterviewBoss, MutationId, PassiveId, Stage, WeaponId } from "./types";

/** A walled office floor, about 3 by 3 phone screens. */
export const ARENA = { width: 1400, height: 1400 } as const;

export const HERO_RADIUS = 12;
/** A coworker with every stat at 10 plays with these. */
export const HERO_BASE: HeroNumbers = { maxHp: 100, speed: 120, damage: 1, cooldown: 1, magnet: 80, xp: 1, gold: 1, loot: 0.12, taken: 1 };
/** Each stat's steps: the per-point factors, off the base 10. Luck's loot step is the dial the desk will tune. */
export const STAT_STEPS: Readonly<Record<Stat, Partial<Record<keyof HeroNumbers, number>>>> = {
  grit: { maxHp: 0.05 },
  output: { damage: 0.05 },
  hustle: { speed: 0.05, magnet: 0.06 },
  focus: { cooldown: 0.05 },
  luck: { gold: 0.05, loot: 0.04 },
};
/** Each stat point above or below 10 moves its number by this fraction. */
export const STAT_STEP = 0.05;
/** Which hero number each stat moves; focus shortens the cooldown, so it divides. */
export const STAT_NUMBER: Readonly<Record<Stat, keyof HeroNumbers>> = {
  grit: "maxHp",
  output: "damage",
  hustle: "speed",
  focus: "cooldown",
  luck: "gold",
};
/** Which hero number each quirk effect moves, in percent. Quit chances and salary are not the run's business. */
export const QUIRK_NUMBER: Readonly<Partial<Record<QuirkEffect, keyof HeroNumbers>>> = {
  ...STAT_NUMBER,
  gold: "gold",
  xp: "xp",
  damageTaken: "taken",
};

export const HURT_FLASH = 0.15;
export const FOE_HURT_FLASH = 0.1;

// ---- The clock ---------------------------------------------------------------------------------------------------

// ---- The floor plan ---------------------------------------------------------------------------------------------

/** The day's last floor, where the audit waits. */
export const LAST_FLOOR = 20;

/** Prototype floors: the scripted surge may hand over sooner, after its foes are cleared. */
export const PILOT_FLOORS: Partial<Record<number, { horde: number; minimum: number; pay: number }>> = {
  5: { horde: 42, minimum: 35, pay: 0.5 },
  9: { horde: 43, minimum: 35, pay: 0.6 },
  13: { horde: 45, minimum: 37, pay: 0.65 },
  19: { horde: 48, minimum: 39, pay: 0.7 },
};

export const SPECIALIST: Record<Stage, { kind: FoeKind; from: number; count: number }> = {
  openSpace: { kind: "paperShredling", from: 3, count: 4 },
  kitchen: { kind: "rollingCart", from: 6, count: 2 },
  serverRoom: { kind: "patchDrone", from: 10, count: 1 },
  boardroom: { kind: "securityEscort", from: 14, count: 3 },
};

export const LATE_PACK: readonly FoeKind[] = ["securityEscort", "rollingCart", "paperPlane", "paperPlane", "replyAll", "replyAll", "replyAll", "paperPlane"];

export const CART = { range: 176, windup: 0.65, duration: 0.9, speed: 210, recovery: 0.95 } as const;
export const DRONE = { range: 115, repair: 8, recipients: 3 } as const;
export const ESCORT = { damage: 0.3, arc: Math.PI / 3 } as const;
export const PILOT_BOSS = { approach: 140, close: 180, aim: 225, windup: 0.7, recovery: 1 } as const;

export function hordeDensity(floor: number): number {
  return floor <= 1 ? 1 : floor <= 5 ? 1.1 : floor <= 9 ? 1.2 : floor <= 13 ? 1.3 : 1.55;
}

/** Foes per second at `time` seconds; halved while a floor's boss is out. The office is busy: more mails than ever. */
export function spawnRate(time: number): number {
  return 0.9 + time / 26;
}

/** Foes get tougher as the run goes on. Bosses are not scaled. */
export function hpScale(time: number): number {
  return 1 + time / 100;
}

export function touchScale(time: number): number {
  return 1 + time / 300;
}

/**
 * The mix of each act's horde by time: from `from` seconds on, a kind is drawn with this weight. The mail stays the
 * bulk of every act — it is the weakest — with the tougher kinds few and late, so more foes can fly around without
 * the horde outgrowing the hero.
 */
export const MIX: Readonly<Record<Stage, readonly { kind: FoeKind; from: number; weight: number }[]>> = {
  openSpace: [
    { kind: "replyAll", from: 0, weight: 10 },
    { kind: "paperPlane", from: 25, weight: 3 },
    { kind: "mondayBlob", from: 14, weight: 2 },
    { kind: "meetingInvite", from: 22, weight: 1 },
  ],
  kitchen: [
    { kind: "replyAll", from: 0, weight: 8 },
    { kind: "lunchThief", from: 3, weight: 5 },
    { kind: "mondayBlob", from: 10, weight: 2 },
  ],
  serverRoom: [
    { kind: "replyAll", from: 0, weight: 7 },
    { kind: "lunchThief", from: 3, weight: 4 },
    { kind: "paperPlane", from: 20, weight: 2 },
    { kind: "looseCable", from: 6, weight: 3 },
    { kind: "mondayBlob", from: 12, weight: 2 },
  ],
  boardroom: [
    { kind: "replyAll", from: 0, weight: 6 },
    { kind: "lunchThief", from: 3, weight: 4 },
    { kind: "paperPlane", from: 16, weight: 3 },
    { kind: "looseCable", from: 6, weight: 4 },
    { kind: "mondayBlob", from: 10, weight: 2 },
    { kind: "meetingInvite", from: 14, weight: 1 },
  ],
};

/** Each act plants one immobile blocker on a timer: the jammed printer, the burning pan, the hot rack. */
export const BLOCKERS: Partial<Record<Stage, { kind: FoeKind; from: number; every: number; cap: number; max: number }>> = {
  openSpace: { kind: "printerJam", from: 3, every: 25, cap: 3, max: 3 },
  kitchen: { kind: "greaseFire", from: 6, every: 20, cap: 2, max: 2 },
  serverRoom: { kind: "hotRack", from: 10, every: 22, cap: 2, max: 2 },
};


export const PRINTER_FROM = 120;
export const PRINTER_EVERY = 25;
export const MAX_PRINTERS = 3;

/** New foes appear this far from the hero: just off a phone screen. */
export const SPAWN_DISTANCE = { min: 460, max: 520 } as const;

export const MAX_FOES = 300;
export const MAX_SHOTS = 200;
/** Past this many gems, the oldest is folded into the next oldest. */
export const MAX_GEMS = 150;

/** Cell size of the collision grid. */
export const GRID_CELL = 64;

// ---- Foes --------------------------------------------------------------------------------------------------------

export interface FoeDef {
  hp: number;
  radius: number;
  speed: number;
  touch: number;
  xp: number;
  gold: number;
  /** Seconds between summons, shots or charges; 0 for none. */
  every: number;
  /** Bosses keep their hp whatever the time. */
  boss: boolean;
}

export const FOES: Readonly<Record<FoeKind, FoeDef>> = {
  /** The mail: the weakest thing in the office, and the most of it. */
  replyAll: { hp: 5, radius: 8, speed: 70, touch: 10, xp: 1, gold: 0.1, every: 0, boss: false },
  /** A paper plane: a hair tougher than the mail, and it glides in fast. */
  paperPlane: { hp: 6, radius: 8, speed: 88, touch: 9, xp: 1, gold: 0.1, every: 0, boss: false },
  /** A slow tank. */
  mondayBlob: { hp: 30, radius: 16, speed: 38, touch: 18, xp: 4, gold: 0.5, every: 0, boss: false },
  /** Calls more reply-alls into the meeting. */
  meetingInvite: { hp: 30, radius: 11, speed: 45, touch: 10, xp: 3, gold: 0.4, every: 6, boss: false },
  /** Does not move, blocks the hero, and spits toner. */
  printerJam: { hp: 60, radius: 16, speed: 0, touch: 6, xp: 5, gold: 1, every: 3.5, boss: false },
  /** The mini-boss: walks, then charges at where the hero is. */
  middleManager: { hp: 1000, radius: 22, speed: 55, touch: 30, xp: 60, gold: 25, every: 4, boss: true },
  /** The kitchen's mini-boss: charges like the middle manager, a little quicker and tougher. */
  lunchMonitor: { hp: 1300, radius: 21, speed: 60, touch: 30, xp: 70, gold: 30, every: 3.5, boss: true },
  /** The server room's mini-boss: slow, and sends fans of pings instead of charging. */
  sysadmin: { hp: 1300, radius: 21, speed: 42, touch: 24, xp: 80, gold: 35, every: 3.2, boss: true },
  /** The boss: rings of red tape and a reply-all chain now and then. */
  auditor: { hp: 7000, radius: 28, speed: 45, touch: 40, xp: 0, gold: 100, every: 3, boss: true },
  /** Interview bosses (hp before the coworker's difficulty). A lead who charges often and hard. */
  teamLead: { hp: 1500, radius: 22, speed: 60, touch: 28, xp: 0, gold: 0, every: 2.6, boss: true },
  /** Throws paperwork in fans, and now and then a ring of it. */
  hrManager: { hp: 600, radius: 24, speed: 55, touch: 25, xp: 0, gold: 0, every: 2.2, boss: true },
  /** Keeps calling in clones. */
  recruiter: { hp: 1700, radius: 20, speed: 50, touch: 20, xp: 0, gold: 0, every: 3.5, boss: true },
  /** The floor-2 boss: an immobile chair that blocks the way and calls reply-alls into the meeting. */
  meetingChair: { hp: 400, radius: 18, speed: 0, touch: 14, xp: 0, gold: 30, every: 9, boss: true },
  /** The floor-4 boss: an immobile shredder that spits paperwork fans and bursts all around. */
  shredder: { hp: 330, radius: 19, speed: 0, touch: 10, xp: 0, gold: 30, every: 3.8, boss: true },
  /** The floor-7 boss: an immobile machine that lobs hot globs where the hero stands, leaving slow puddles. */
  coffeeMachine: { hp: 600, radius: 18, speed: 0, touch: 10, xp: 0, gold: 30, every: 3.2, boss: true },
  /** The floor-9 boss: an immobile tank that lobs cans in high arcs where the hero was. */
  vendingMachine: { hp: 750, radius: 20, speed: 0, touch: 12, xp: 0, gold: 30, every: 3.4, boss: true },
  /** The floor-10 boss: a slow walker that spits toner streams and coughs up paper trails. */
  printerPrime: { hp: 800, radius: 20, speed: 24, touch: 16, xp: 0, gold: 30, every: 2.6, boss: true },
  /** The floor-12 boss: a huge, slow tank whose steps send out expanding shockwaves. */
  blobPrime: { hp: 950, radius: 26, speed: 26, touch: 22, xp: 0, gold: 30, every: 3.4, boss: true },
  /** The kitchen's fast weak swarm: quick, squishy, and always hungry — and still a shade above the mail. */
  lunchThief: { hp: 6, radius: 8, speed: 90, touch: 9, xp: 1, gold: 0.1, every: 0, boss: false },
  /** The kitchen's blocker: a burning pan that spits short-range fire at the hero. */
  greaseFire: { hp: 45, radius: 14, speed: 0, touch: 8, xp: 3, gold: 0.6, every: 2.8, boss: false },
  /** The server room's mid foe: a slow tangle of cables, dense and annoying. */
  looseCable: { hp: 14, radius: 10, speed: 60, touch: 12, xp: 2, gold: 0.25, every: 0, boss: false },
  /** The server room's blocker: an overheating rack that rings pings all around itself. */
  hotRack: { hp: 55, radius: 15, speed: 0, touch: 8, xp: 4, gold: 0.8, every: 4.2, boss: false },
  paperShredling: { hp: 7, radius: 8, speed: 94, touch: 10, xp: 1, gold: 0.1, every: 0, boss: false },
  rollingCart: { hp: 22, radius: 15, speed: 60, touch: 15, xp: 2, gold: 0.2, every: 4.2, boss: false },
  patchDrone: { hp: 14, radius: 12, speed: 86, touch: 7, xp: 2, gold: 0.2, every: 2.3, boss: false },
  securityEscort: { hp: 24, radius: 15, speed: 60, touch: 16, xp: 2, gold: 0.25, every: 2.4, boss: false },
};

/** The interview: a short fight against one boss, with a thin horde around it. */
export const INTERVIEW = {
  /** The boss walks in at this time. */
  bossAt: 4,
  /** If the boss still stands at this time, the interview is over. */
  closesAt: 150,
  /** Foes per second, flat; only `bossOutShare` of it while the boss is out, so the fight is about the boss. */
  spawnRate: 1.6,
  bossOutShare: 0.3,
} as const;

export const INTERVIEW_BOSSES: readonly InterviewBoss[] = ["teamLead", "hrManager", "recruiter"];

/** The boss a card's interview is, fixed by its id so a retry is the same fight. */
export function interviewBossFor(candidateId: number): InterviewBoss {
  return INTERVIEW_BOSSES[candidateId % INTERVIEW_BOSSES.length];
}

/** The HR manager throws a fan of this many sheets at the hero, and every `ringEvery` fans a ring of `ring`. */
export const PAPERWORK = { speed: 120, radius: 6, damage: 9, life: 5, fan: 5, spread: 0.22, ringEvery: 3, ring: 10 } as const;
/** Clones a recruiter calls in at a time. */
export const RECRUITER_CLONES = 5;
/** The team lead's charge: the middle manager's, but quicker. */
export const LEAD_CHARGE = { seconds: 0.8, speed: 3 } as const;

/** Reply-alls a meeting invite calls in at a time. */
export const INVITE_SUMMONS = 3;
export const PRINTER_RANGE = 280;
export const TONER = { speed: 150, radius: 6, damage: 8, life: 3 } as const;
export const CHARGE = { seconds: 1, speed: 2.4 } as const;
export const RED_TAPE = { count: 12, speed: 140, radius: 7, damage: 14, life: 5 } as const;
/** Every this many rings, the auditor also cc's a chain of reply-alls. */
export const AUDITOR_SUMMON_EVERY = 3;
export const AUDITOR_SUMMONS = 6;
/** Below half hp the auditor speeds up, fires more often and doubles its chains. */
export const AUDITOR_ENRAGE = { timerScale: 0.6, speed: 1.3, summons: AUDITOR_SUMMONS * 2 } as const;
/** Knockback speed fades by this fraction per second. */
export const PUSH_FADE = 8;
/** Bosses only take this share of knockback. */
export const BOSS_PUSH = 0.15;

// ---- The floor bosses' own tricks -------------------------------------------------------------------------------

/** Reply-alls a meeting chair calls in at a time. */
export const CHAIR_SUMMONS = 3;
/** The shredder: quick double fans of paperwork, and every `burstEvery` timer a full burst around it. */
export const SHREDDER = {
  fan: 4,
  spread: 0.3,
  shot: { speed: 130, radius: 6, damage: 6, life: 2.2 },
  burstEvery: 4,
  burst: 10,
  /** The shredder only wakes, and its fans and bursts only fly, while the hero is this close. */
  wake: 300,
} as const;
/** The coffee machine: lobs a hot glob to where the hero stands; where it lands, a puddle slows the hero. */
export const COFFEE = {
  glob: { flight: 1.1, radius: 7, damage: 12, splash: 34 },
  puddle: { radius: 34, life: 4, slow: 0.35 },
} as const;
/** The vending machine: lobs a can in a high arc to where the hero was; no puddle, more hurt. */
export const VENDING = { can: { flight: 1.3, radius: 8, damage: 16, splash: 40 } } as const;
/** The printer prime: a quicker toner than the jammed printer's, in short streams. */
export const PRIME_TONER = { speed: 170, radius: 6, damage: 9, life: 3.5, stream: 3 } as const;
/** A blob prime's shockwave: an expanding ring the hero had better not stand in. */
export const SHOCK = { seconds: 1.1, speed: 130, band: 14, dps: 16 } as const;
/** A sysadmin blinks away when the hero closes in, and only then. */
export const BLINK = { range: 150, min: 300, max: 380, every: 5 } as const;
/** An immobile boss walks in at this speed until it is this close to the hero, then plants itself. */
export const BOSS_WALK_IN = { speed: 85, station: 170 } as const;
/** A boss within this much extra reach counts as the nearest foe, so the horde cannot starve it of shots. */
export const BOSS_AIM_BIAS = 150;
/** The shredder's shots only arm after this far of flight, so hugging the machine is safe and stepping out is not. */
export const SHOT_ARM = 60;
/** The kitchen's burning pan: short-range fire spat at the hero. */
export const GREASE = { range: 240, shot: { speed: 160, radius: 6, damage: 10, life: 2.2 } } as const;
/** The server room's hot rack: pings in a ring all around itself. */
export const RACK = { ring: 6, shot: { speed: 140, radius: 6, damage: 9, life: 2.6 } } as const;

// ---- The floor plan ---------------------------------------------------------------------------------------------

/** Which stage's arena a floor is fought in: five floors a stage, and the boardroom holds the whole last act. */
export function floorStage(floor: number): Stage {
  if (floor <= 5) return "openSpace";
  if (floor <= 9) return "kitchen";
  if (floor <= 13) return "serverRoom";
  return "boardroom";
}

export interface FloorPlan {
  stage: Stage;
  /** Seconds of horde before the floor's boss walks in. */
  horde: number;
  boss: FoeKind;
  /** The boss's hp before the run's difficulty. */
  bossHp: number;
}

/**
 * The twenty floors of a day, each ending in its own boss. The acts run five floors each (open space, kitchen,
 * server room, then the boardroom), and the plan's bosses escalate: an act's elite floors bring back its bosses
 * tougher than before, so difficulty climbs floor by floor and the audit on 20 stays the wall.
 */
export const FLOOR_PLAN: readonly FloorPlan[] = [
  { stage: "openSpace", horde: 16, boss: "middleManager", bossHp: 300 },
  { stage: "openSpace", horde: 17, boss: "meetingChair", bossHp: 250 },
  { stage: "openSpace", horde: 18, boss: "teamLead", bossHp: 420 },
  { stage: "openSpace", horde: 19, boss: "shredder", bossHp: 420 },
  { stage: "openSpace", horde: 20, boss: "hrManager", bossHp: 520 },
  { stage: "kitchen", horde: 21, boss: "lunchMonitor", bossHp: 650 },
  { stage: "kitchen", horde: 22, boss: "coffeeMachine", bossHp: 600 },
  { stage: "kitchen", horde: 23, boss: "recruiter", bossHp: 750 },
  { stage: "kitchen", horde: 24, boss: "lunchMonitor", bossHp: 900 },
  { stage: "serverRoom", horde: 25, boss: "vendingMachine", bossHp: 850 },
  { stage: "serverRoom", horde: 26, boss: "printerPrime", bossHp: 800 },
  { stage: "serverRoom", horde: 27, boss: "sysadmin", bossHp: 900 },
  { stage: "serverRoom", horde: 28, boss: "printerPrime", bossHp: 1150 },
  { stage: "boardroom", horde: 29, boss: "shredder", bossHp: 900 },
  { stage: "boardroom", horde: 30, boss: "hrManager", bossHp: 1050 },
  { stage: "boardroom", horde: 31, boss: "blobPrime", bossHp: 950 },
  { stage: "boardroom", horde: 32, boss: "sysadmin", bossHp: 1250 },
  { stage: "boardroom", horde: 33, boss: "recruiter", bossHp: 1350 },
  { stage: "boardroom", horde: 34, boss: "blobPrime", bossHp: 1450 },
  { stage: "boardroom", horde: 36, boss: "auditor", bossHp: 3200 },
];

// ---- Weapons -----------------------------------------------------------------------------------------------------

/**
 * How a weapon fights. `homing`: shots that follow a foe. `pierce`: thrown at the nearest foe, through several.
 * `drop`: lands on a foe after a delay and hits all around. `swing`: hits and knocks back everything close.
 * `orbit`: circles the hero. `aura`: hurts and slows everything close, on a tick. `fan`: a spread thrown forward.
 */
export type Pattern = "homing" | "pierce" | "drop" | "swing" | "orbit" | "aura" | "fan";

export interface WeaponNumbers {
  cooldown: number;
  damage: number;
  count: number;
  pierce: number;
  /** Shot size, blast radius, swing reach or orbit distance. */
  radius: number;
  /** Shot speed, or the orbit's turn in radians per second. */
  speed: number;
  /** Shot lifetime, or a drop's delay. */
  life: number;
  knockback: number;
  slow: number;
}

const NONE: WeaponNumbers = { cooldown: 1, damage: 0, count: 1, pierce: 1, radius: 0, speed: 0, life: 1, knockback: 0, slow: 0 };

export interface WeaponDef {
  pattern: Pattern;
  base: WeaponNumbers;
  /** Added per level past the first; counts and pierce are floored when used. */
  perLevel: Partial<WeaponNumbers>;
}

const weapon = (pattern: Pattern, base: Partial<WeaponNumbers>, perLevel: Partial<WeaponNumbers>): WeaponDef => ({
  pattern,
  base: { ...NONE, ...base },
  perLevel,
});

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  stickyNotes: weapon("homing", { cooldown: 0.55, damage: 8, radius: 5, speed: 320, life: 1.5 }, { damage: 3, count: 0.6, cooldown: -0.03, pierce: 0.3 }),
  spreadsheet: weapon("pierce", { cooldown: 1.1, damage: 16, pierce: 4, radius: 8, speed: 260, life: 1.6 }, { damage: 5, pierce: 1, count: 0.34 }),
  serverRack: weapon("drop", { cooldown: 2.2, damage: 22, radius: 45, life: 0.6 }, { damage: 7, radius: 4, cooldown: -0.15, count: 0.3 }),
  policyBinder: weapon("swing", { cooldown: 1, damage: 12, radius: 55, knockback: 260 }, { damage: 4, radius: 6, cooldown: -0.05 }),
  rubberDuck: weapon("orbit", { damage: 8, radius: 60, speed: 3, life: 0.4 }, { damage: 3, radius: 3, count: 1 }),
  contract: weapon("aura", { cooldown: 0.5, damage: 4, radius: 50, slow: 0.3 }, { damage: 2, radius: 8, slow: 0.03 }),
  businessCard: weapon("fan", { cooldown: 1.1, damage: 10, count: 3, pierce: 1, radius: 5, speed: 300, life: 1.2 }, { damage: 3, count: 0.5, pierce: 0.2 }),
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const MAX_WEAPON_LEVEL = 6;
export const MAX_WEAPONS = 4;
/** Angle between two cards of a fan, in radians. */
export const FAN_SPREAD = 0.22;
/** Field Rep still has to face the pack; cards converge a little towards the front target. */
export const FIELD_FAN = { range: 275, cone: Math.PI / 3, assist: 0.7 } as const;
export const SYSTEMS_RACK_DAMAGE = 0.76;
/** Racks excel against groups; the Operator still needs a single-target weapon for bosses. */
export const SYSTEMS_RACK_BOSS_DAMAGE = 0.62;
export const BINDER_PARRY = { count: 2, radius: 48 } as const;
/** A server rack lands on a foe within this reach of the hero, or in front of them. */
export const DROP_REACH = 300;
/** Size of a rubber duck. */
export const DUCK_RADIUS = 9;
/** Floor for any weapon's cooldown, in seconds. */
export const MIN_COOLDOWN = 0.15;

/** Applies a hammer's deltas on top of the weapon's level numbers; the pattern reads the rest (gravity's pull) from `Run.mutations`. */
export function weaponNumbers(id: WeaponId, level: number, mutation?: MutationId, classId?: ClassId | null): WeaponNumbers {
  const { base, perLevel } = WEAPONS[id];
  const numbers = { ...base };
  for (const key of Object.keys(perLevel) as (keyof WeaponNumbers)[]) numbers[key] += perLevel[key]! * (level - 1);
  numbers.count = Math.floor(numbers.count);
  numbers.pierce = Math.floor(numbers.pierce);
  // Compliance can engage just beyond boss contact; it's still the shortest-range track.
  // Keep the base signature, but prevent its upgrades from eclipsing the whole class.
  if (classId && id === "stickyNotes") numbers.damage -= Math.max(0, level - 2) * 1.5;
  if (classId === "compliance") numbers.radius += id === "policyBinder" ? 15 : id === "contract" ? 10 : 0;
  if (classId === "fieldRep" && id === "businessCard") numbers.pierce += 1;
  if (classId === "systems" && id === "serverRack") numbers.damage *= SYSTEMS_RACK_DAMAGE;
  return mutation ? mutateNumbers(mutation, numbers) : numbers;
}

// ---- Passives ----------------------------------------------------------------------------------------------------

/** Each level multiplies one hero number by (1 + `per`). */
export const PASSIVES: Readonly<Record<PassiveId, { number: keyof HeroNumbers; per: number }>> = {
  coffee: { number: "cooldown", per: -0.08 },
  gym: { number: "maxHp", per: 0.15 },
  sneakers: { number: "speed", per: 0.08 },
  lanyard: { number: "magnet", per: 0.3 },
  mentor: { number: "xp", per: 0.1 },
  ergoChair: { number: "taken", per: -0.08 },
  powerTie: { number: "damage", per: 0.1 },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];
export const MAX_PASSIVE_LEVEL = 5;
export const MAX_PASSIVES = 4;

// ---- Levels and pickups ------------------------------------------------------------------------------------------

export const PICKS_OFFERED = 3;

/** Perks: each starts a run with a passive at level 1 (these), or changes the run in a way noted at its use. */
export const PERK_PASSIVE: Readonly<Partial<Record<PerkId, PassiveId>>> = {
  coffeeRun: "coffee",
  gymPass: "gym",
  freshSneakers: "sneakers",
  mentorship: "mentor",
};
/** The second wind: the hero gets up with this share of max hp, and cannot be hurt for `grace` seconds. */
export const SECOND_WIND = { hp: 0.4, grace: 2 } as const;

/**
 * XP from `level` to the next: the hero's ladder, one number everywhere. The quadratic term is what keeps a career
 * paced — gem income stays roughly flat once the build is maxed, so a strong early day buys many levels (and picks)
 * and a veteran's day buys fewer and fewer.
 */
export function xpToNext(level: number): number {
  return Math.floor(5 + level * 5 + 1.1 * level * level);
}

/** The heal offered when nothing else is left, as a share of max hp. */
export const HEAL_SHARE = 0.3;
/** An exhausted class pool shouldn't refill a veteran on virtually every floor. */
export const CLASS_HEAL_SHARE = 0.18;
/** Gold offered when nothing else is left. */
export const GOLD_PICK = 10;
/** Speed of a gem flying to the hero. */
export const GEM_PULL = 320;
export const GEM_RADIUS = 5;

// ---- The career (between runs) -----------------------------------------------------------------------------------

/**
 * One run is one day, and the day is the hero's: the level, XP, weapons and passives they leave with are theirs to
 * keep (see `settle` and `careerBuild`). Each level grants a stat point; every `levelsPerRank` levels is a promotion
 * with a bonus and a perk. Foes get tougher with the level so growth doesn't make runs trivial.
 */
export const REVIEW = {
  levelsPerRank: 5,
  /** Extra points in each of grit, output and focus at a promotion. */
  promotionBonus: 1,
  /** A promotion lets the player pick one of this many perks (see `PERK_IDS`). */
  perksOffered: 3,
  /** Foes' hp (bosses too) grows by this fraction per level past the first; spawns by half of it. Foe damage has its
 * own channels now (`foeDamageBase`/`foeDamagePerLevel`), so this is the tankiness share of the budget. */
  difficultyPerLevel: 0.13,
  /** Foe lethality: all incoming damage is multiplied by this flat base (P0, hr-harder-roadmap). */
  foeDamageBase: 1.18,
  /** …plus this fraction per point of the run's difficulty, so a veteran's foes hit harder too, not just tankier. */
  foeDamagePerLevel: 0.15,
  /** The office goes easy on a hero in a slump: difficulty relief per lost day in a row, up to `slumpDays`. */
  slumpRelief: 0.1,
  slumpDays: 3,
} as const;

// ---- Elites, enrage, spikes, cameos, hammers (P1–P3, hr-harder-roadmap) ------------------------------------------

/** A share of the horde comes in elite from the second act on: no flinch, half knockback, a harder touch. */
export const ELITE = {
  /** Elite share by act stage. */
  share: { openSpace: 0, kitchen: 0.08, serverRoom: 0.14, boardroom: 0.2 } as Record<Stage, number>,
  /** Elite touch multiplier. */
  touch: 1.5,
  /** Elite knockback taken multiplier (a boss's own BOSS_PUSH is untouched). */
  push: 0.5,
  /** Elite xp and gold multiplier: the extra threat pays. */
  pay: 2,
} as const;

/** Every boss softly enrages the longer the fight drags: a tell, then a step per further span, capped. */
export const ENRAGE = { after: 45, step: 30, gain: 0.25, cap: 2 } as const;

/** The bosses' soft enrage factor from the time it has spent on the field. */
export function enrageFactor(foe: { boss?: boolean; age?: number }): number {
  const age = foe.age ?? 0;
  if (!foe.boss || age <= ENRAGE.after) return 1;
  const steps = 1 + Math.floor((age - ENRAGE.after) / ENRAGE.step);
  return Math.min(ENRAGE.cap, 1 + ENRAGE.gain * steps);
}

/** Pressure spikes: a telegraphed ambush ring, or a rush of spawns. Roughly one floor in two or three. */
export const SPIKE = {
  chance: 0.5,
  /** No spikes before this floor: floor 1 teaches the descent. */
  from: 2,
  /** The ring: this many foes close in around the hero after the warning. */
  ringCount: 9,
  ringWarn: 0.9,
  ringRadius: 210,
  /** The rush: spawns at this multiple for `rushSpan` seconds, warned this long before. */
  rushRate: 3,
  rushWarn: 5,
  rushSpan: 18,
  /** The spike fires inside the horde phase, never against the boss, and never right at its walk-in. */
  hordeMargin: 12,
} as const;

/** Cameo guests between floors: texture, small mercy, one wager. */
export const CAMEO = {
  chance: 0.3,
  from: 3,
  cap: 2,
  /** The nurse patches the hero up by this share of max hp when the floor begins. */
  nurseHeal: 0.4,
  /** The rival's KPI: kills to beat during the horde phase, and the gold for beating it. */
  rivalKills: 30,
  rivalKillsPerFloor: 2,
  rivalGold: 60,
  rivalGoldPerFloor: 15,
} as const;

/** The hammers: one pattern bend per weapon, offered as a rare floor-clear choice, twice a day at most. */
export const MUTATION_RULES = { chance: 0.35, perDay: 2 } as const;

/** Each weapon's hammer; names and lines live in the i18n. */
export const MUTATIONS: Readonly<Record<WeaponId, MutationId>> = {
  stickyNotes: "tandem",
  spreadsheet: "ricochet",
  serverRack: "overclocked",
  policyBinder: "gravity",
  rubberDuck: "wide",
  contract: "deep",
  businessCard: "burst",
};

/** Applies a hammer's deltas on top of the weapon's level numbers. */
export function mutateNumbers(mutation: MutationId, numbers: WeaponNumbers): WeaponNumbers {
  const out = { ...numbers };
  switch (mutation) {
    case "tandem": // the notes split: two more per volley, each a quarter lighter
      out.count += 2;
      out.damage *= 0.75;
      break;
    case "ricochet": // thick stock: two more targets, a fifth lighter
      out.pierce += 2;
      out.damage *= 0.8;
      break;
    case "overclocked": // the rack slams down sooner and spreads wider
      out.radius *= 1.2;
      out.cooldown *= 0.6;
      break;
    case "gravity": // the swing pulls the office in, and hits harder for it
      out.damage *= 1.3;
      break;
    case "wide": // a wider, heavier waddle
      out.radius *= 1.35;
      out.slow *= 2;
      break;
    case "deep": // the fine print sinks deeper and reaches further
      out.radius *= 1.25;
      out.slow *= 1.5;
      break;
    case "burst": // three more cards in the fan, each a quarter lighter
      out.count += 3;
      out.damage *= 0.75;
      break;
  }
  out.count = Math.floor(out.count);
  out.pierce = Math.floor(out.pierce);
  return out;
}

// ---- Stages ------------------------------------------------------------------------------------------------------

export interface StageDef {
  /** Multiply the gold from a floor's foes, so the deeper acts pay. */
  gold: number;
}

export const STAGES: Readonly<Record<Stage, StageDef>> = {
  openSpace: { gold: 1 },
  kitchen: { gold: 1.25 },
  serverRoom: { gold: 1.5 },
  boardroom: { gold: 1.6 },
};

export const STAGE_IDS = Object.keys(STAGES) as Stage[];

/** The department skill: a cooldown in seconds (focus divides it), and the career tiers' power. */
export const SKILL = { cooldown: 18, tierStep: 1.25 } as const;

/** The skill's power tier: a fresh hire's 1, a promoted lead's 1.25, a senior's 1.5. */
export function skillTier(level: number): number {
  return level >= 11 ? 1.5 : level >= 6 ? SKILL.tierStep : 1;
}

/** Each department's skill numbers, at tier 1; durations and radii scale with the tier. */
export const SKILL_EFFECTS: Record<
  Exclude<DepartmentId, "interns">,
  { radius: number; duration: number; count: number; damage: number }
> = {
  engineering: { radius: 0, duration: 3, count: 1, damage: 0 },
  finance: { radius: 170, duration: 4, count: 1, damage: 0 },
  legal: { radius: 170, duration: 2, count: 1, damage: 0 },
  sales: { radius: 400, duration: 1.5, count: 5, damage: 12 },
  it: { radius: 0, duration: 1, count: 1, damage: 0 },
  hr: { radius: 0, duration: 3, count: 1, damage: 0 },
};

/** The boardroom: the audit's arena. A projector flashes a warning circle, then blasts a wide burst of light. */
export const BOARDROOM = {
  projectors: 5,
  /** The blast's reach. */
  radius: 70,
  /** Seconds of blinking warning before a blast. */
  warn: 1.6,
  /** Seconds between one blast's end and the next warning. */
  every: 7,
  /** Seconds of light while a projector blasts. */
  burst: 0.5,
  /** Light damage per second while a blast holds. */
  dps: 26,
} as const;

/** The kitchen: coffee spills that slow the hero (not the foes), and microwaves in the corners firing rings. */
export const KITCHEN = {
  spills: 9,
  spillRadius: 40,
  /** The share of speed lost standing in a spill. */
  spillSlow: 0.35,
  /** No spill lands this close to where the hero starts. */
  clearRadius: 170,
  microwaves: 2,
  microwaveEvery: 5,
  microwaveRadius: 18,
  /** Shots in a ring; each ring is turned a little from the last so the gaps move. */
  ring: 8,
  shot: { speed: 130, radius: 6, damage: 10, life: 4 },
} as const;

/**
 * What each perk adds to the difficulty its coworker faces (like extra rarity), so a perk is power, not a free win. Set
 * from the bot: alone at level 6, the strong ones (overtime, corner office) won about 10 points more than the rest.
 */
export const PERK_DIFFICULTY: Readonly<Record<PerkId, number>> = {
  coffeeRun: 0.22,
  gymPass: 0.17,
  freshSneakers: 0.12,
  mentorship: 0.18,
  overtime: 0.45,
  cornerOffice: 0.38,
  secondWind: 0.24,
};

/**
 * The server room: floor vents that flash for `warn` seconds, then blast heat for `burst` seconds, then go quiet.
 * Standing in a blast hurts; the flash gives time to leave.
 */
export const SERVER_ROOM = {
  vents: 7,
  ventRadius: 62,
  /** Seconds between the starts of one vent's blasts. */
  every: 6,
  warn: 1.2,
  burst: 1.6,
  /** Damage per second standing in a blast. */
  dps: 15,
  /** No vent sits this close to where the hero starts. */
  clearRadius: 170,
} as const;

/** The sysadmin's ping: a fan of this many shots at the hero. */
export const PING = { speed: 150, radius: 5, damage: 7, life: 4, fan: 3, spread: 0.3 } as const;
