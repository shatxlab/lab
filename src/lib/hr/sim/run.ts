import { DEPARTMENTS } from "@/lib/roster/data";
import type { DepartmentId, QuirkId } from "@/lib/roster/types";
import type { Coworker } from "@/lib/roster/types";
import { random, randomBetween } from "@/lib/tower/sim/random";
import {
  ARENA,
  AUDITOR_ENRAGE,
  AUDITOR_SUMMON_EVERY,
  AUDITOR_SUMMONS,
  BLINK,
  BINDER_PARRY,
  BOSS_PUSH,
  CAMEO,
  CART,
  DRONE,
  ESCORT,
  LATE_PACK,
  SYSTEMS_RACK_BOSS_DAMAGE,
  PILOT_BOSS,
  PILOT_FLOORS,
  SPECIALIST,
  CHAIR_SUMMONS,
  CHARGE,
  COFFEE,
  DROP_REACH,
  DUCK_RADIUS,
  ELITE,
  enrageFactor,
  FAN_SPREAD,
  FIELD_FAN,
  FOE_HURT_FLASH,
  FOES,
  FLOOR_PLAN,
  GEM_PULL,
  GEM_RADIUS,
  GRID_CELL,
  HERO_RADIUS,
  HURT_FLASH,
  INTERVIEW,
  KITCHEN,
  LAST_FLOOR,
  SKILL,
  SKILL_EFFECTS,
  skillTier,
  PING,
  INVITE_SUMMONS,
  LEAD_CHARGE,
  BOSS_AIM_BIAS,
  BOSS_WALK_IN,
  PAPERWORK,
  PERK_PASSIVE,
  MAX_FOES,
  MAX_GEMS,
  MAX_WEAPON_LEVEL,
  MAX_WEAPONS,
  MAX_PASSIVES,
  WEAPON_IDS,
  MAX_PRINTERS,
  MAX_SHOTS,
  MIN_COOLDOWN,
  MIX,
  MUTATIONS,
  MUTATION_RULES,
  PRIME_TONER,
  PRINTER_EVERY,
  PRINTER_RANGE,
  BOARDROOM,
  BLOCKERS,
  GREASE,
  RACK,
  PUSH_FADE,
  RECRUITER_CLONES,
  RED_TAPE,
  REVIEW,
  SECOND_WIND,
  SERVER_ROOM,
  SHOCK,
  SHOT_ARM,
  SHREDDER,
  SPAWN_DISTANCE,
  SPIKE,
  STAGES,
  TONER,
  VENDING,
  WEAPONS,
  floorStage,
  hpScale,
  hordeDensity,
  spawnRate,
  touchScale,
  weaponNumbers,
  xpToNext,
} from "./balance";
import { Grid } from "./grid";
import { classPassives, classWeapons, type ClassId } from "./classes";
import { baseNumbers, withPassives } from "./hero";
import { ITEM_DROPS, itemEffect, type ItemState } from "../kit";
import { applyPick, rollPicks } from "./picks";
import type { Effect, Foe, FoeKind, Hazard, Input, Interview, OwnedWeapon, PassiveId, Run, Shot, Source, Stage, WeaponId } from "./types";

/** The fixed tick the page steps the sim with, so every device plays the same run. */
export const STEP = 1 / 60;
export const RUN_VERSION = 13;

/** The biggest foe's radius, which every grid search is widened by. */
const FOE_PAD = Math.max(...Object.values(FOES).map((foe) => foe.radius));
/** Homing and piercing weapons look for foes this close. */
const AIM_REACH = 450;
/** Class-day auto-aim lets ordinary foes enter the fight instead of clearing the wave offscreen. */
const CLASS_HORDE_AIM = 235;

/** The paperwork family of shots, which the Shredder Guard softens. */
const PAPER_SHOTS = new Set<Source>(["hrManager", "auditor", "shredder", "printerJam", "printerPrime"]);

const grid = new Grid<Foe>(ARENA.width, ARENA.height, GRID_CELL);
/** Foes by id for homing shots; rebuilt every tick alongside the grid. */
const byId = new Map<number, Foe>();

/**
 * `difficulty` is 1 for a first-day coworker and grows with their career level (see `difficultyFor`). With an
 * `interview` the run is a fight against that boss alone, not a day at the office. A day is a descent through the
 * floor plan: twenty floors, each its own stage's arena and ending in its own boss (see `FLOOR_PLAN`). The `kit` and
 * the `build` are what the hero carried out of their last day: the gear's stat points, the weapons and the passives
 * at their levels — and the XP mid-level comes from the coworker — so tomorrow starts where tonight ended.
 */
/** The carried gear's unique effect, by its level: 0 without the item. */
function gearEffect(run: Run, id: ItemState["id"]): number {
  const item = run.kit.find((carried) => carried.id === id);
  return item ? itemEffect(item) : 0;
}

type SavedBuild = { weapons?: Partial<Record<WeaponId, number>>; passives?: Partial<Record<PassiveId, number>> };

/** The loadout used by both the class preview and the day, including promotion grants. */
export function startingLoadout(coworker: Coworker, build: SavedBuild, classId: ClassId | null) {
  const signature = DEPARTMENTS[coworker.department].weapon;
  const saved = Object.entries(build.weapons ?? {}) as [WeaponId, number][];
  const weaponIds = classId ? classWeapons(classId, signature) : WEAPON_IDS;
  const armed = saved.filter(([id, level]) => weaponIds.includes(id) && Number.isFinite(level) && level >= 1);
  const signatureLevel = Math.max(armed.find(([id]) => id === signature)?.[1] ?? 0, coworker.perks.includes("overtime") ? 2 : 1);
  const equipped = classId ? [[signature, signatureLevel] as const, ...armed.filter(([id]) => id !== signature).slice(0, MAX_WEAPONS - 1)] : armed;
  if (!classId && !equipped.some(([id]) => id === signature)) equipped.push([signature, signatureLevel]);
  const weapons: Run["weapons"] = equipped.map(([id, level]) => ({ id, level: Math.min(MAX_WEAPON_LEVEL, Math.floor(id === signature ? signatureLevel : level)), cooldownLeft: 0, spin: 0 }));

  const passives: Run["passives"] = classId ? {} : { ...build.passives };
  for (const perk of coworker.perks) {
    const passive = PERK_PASSIVE[perk];
    if (passive) passives[passive] = Math.max(build.passives?.[passive] ?? 0, 1);
  }
  if (classId) {
    for (const id of classPassives(classId)) {
      if (Object.keys(passives).length >= MAX_PASSIVES) break;
      if (build.passives?.[id]) passives[id] = build.passives[id];
    }
  }
  return { weapons, passives };
}

export function createRun(coworker: Coworker, seed: number, difficulty = 1, interview: Interview | null = null, kit: readonly ItemState[] = [], build: SavedBuild = {}, classId: ClassId | null = null): Run {
  // The desk's gear is a third stat source, after the level and the quirks.
  const base = baseNumbers(coworker, kit);
  const { weapons, passives } = startingLoadout(coworker, build, classId);
  const numbers = withPassives(base, passives);
  const run: Run = {
    version: RUN_VERSION,
    seed,
    rng: seed,
    coworkerId: coworker.id,
    classId,
    department: coworker.department,
    careerLevel: coworker.level,
    quirks: [...coworker.quirks],
    kit: kit.map((item) => ({ ...item })),
    lootFound: [],
    mutations: {},
    cameosUsed: 0,
    difficulty,
    interview,
    floor: 1,
    floorStart: 0,
    bossId: null,
    cleared: false,
    floorsCleared: 0,
    skillCd: 0,
    decoy: null,
    aura: 0,
    stage: "openSpace",
    hazards: [],
    extraPicks: coworker.perks.includes("cornerOffice") ? 1 : 0,
    revive: coworker.perks.includes("secondWind"),
    grace: 0,
    status: "playing",
    time: 0,
    base,
    numbers,
    hero: { x: ARENA.width / 2, y: ARENA.height / 2, hp: numbers.maxHp, faceX: 1, faceY: 0, hurt: 0 },
    weapons,
    passives,
    // The hero's level and XP are theirs to keep: the day starts at the starting screen's level and mid-level XP,
    // and everything gained today stays after it (see `settle` and `careerBuild`).
    level: Math.max(1, coworker.level),
    xp: Math.max(0, Math.floor(coworker.xp)),
    picks: null,
    queuedPicks: 0,
    spawnDebt: 0,
    printerIn: PRINTER_EVERY,
    bossDone: false,
    foes: [],
    shots: [],
    drops: [],
    foeShots: [],
    gems: [],
    effects: [],
    nextId: 1,
    kills: 0,
    gold: 0,
    dealt: {},
    takenFrom: {},
    lastHitBy: null,
    abandoned: false,
  };
  run.hazards = run.stage === "kitchen" ? kitchenHazards(run) : run.stage === "serverRoom" ? serverRoomHazards(run) : [];
  seedFloor(run);
  return run;
}

/** The kitchen's floor: spills scattered clear of the start, and microwaves in two of the four corners. */
function kitchenHazards(run: Run): Hazard[] {
  const hazards: Hazard[] = [];
  const edge = 90;
  while (hazards.length < KITCHEN.spills) {
    const x = randomBetween(run, edge, ARENA.width - edge);
    const y = randomBetween(run, edge, ARENA.height - edge);
    if (Math.hypot(x - ARENA.width / 2, y - ARENA.height / 2) < KITCHEN.clearRadius) continue;
    hazards.push({ kind: "spill", x, y, radius: KITCHEN.spillRadius, timer: 0, active: 0 });
  }
  const corners = [
    [150, 150],
    [ARENA.width - 150, 150],
    [150, ARENA.height - 150],
    [ARENA.width - 150, ARENA.height - 150],
  ];
  for (let index = 0; index < KITCHEN.microwaves; index += 1) {
    const [x, y] = corners.splice(Math.floor(random(run) * corners.length), 1)[0];
    hazards.push({ kind: "microwave", x, y, radius: KITCHEN.microwaveRadius, timer: (KITCHEN.microwaveEvery * (index + 1)) / KITCHEN.microwaves, active: 0 });
  }
  return hazards;
}

/** The server room's floor: vents scattered clear of the start, their blasts staggered so they don't all go at once. */
function serverRoomHazards(run: Run): Hazard[] {
  const hazards: Hazard[] = [];
  const edge = 90;
  while (hazards.length < SERVER_ROOM.vents) {
    const x = randomBetween(run, edge, ARENA.width - edge);
    const y = randomBetween(run, edge, ARENA.height - edge);
    if (Math.hypot(x - ARENA.width / 2, y - ARENA.height / 2) < SERVER_ROOM.clearRadius) continue;
    const index = hazards.length;
    hazards.push({ kind: "vent", x, y, radius: SERVER_ROOM.ventRadius, timer: SERVER_ROOM.warn + (SERVER_ROOM.every * index) / SERVER_ROOM.vents, active: 0 });
  }
  return hazards;
}

/** The boardroom's floor: projectors scattered clear of the start, their blasts staggered like the vents'. */
function boardroomHazards(run: Run): Hazard[] {
  const hazards: Hazard[] = [];
  const edge = 90;
  while (hazards.length < BOARDROOM.projectors) {
    const x = randomBetween(run, edge, ARENA.width - edge);
    const y = randomBetween(run, edge, ARENA.height - edge);
    if (Math.hypot(x - ARENA.width / 2, y - ARENA.height / 2) < SERVER_ROOM.clearRadius) continue;
    const index = hazards.length;
    hazards.push({ kind: "projector", x, y, radius: BOARDROOM.radius, timer: BOARDROOM.warn + (BOARDROOM.every * index) / BOARDROOM.projectors, active: 0 });
  }
  return hazards;
}

/** The warn-then-blast fixed hazards: a vent's heat, a projector's light. */
function hazardBlast(hazard: Hazard): { warn: number; every: number; burst: number; dps: number } {
  return hazard.kind === "vent" ? SERVER_ROOM : BOARDROOM;
}

function tickHazards(run: Run, dt: number): void {
  // The guardian wings turn part of the stage's blasts aside.
  const resist = Math.min(0.8, gearEffect(run, "guardianWings"));
  for (const hazard of run.hazards) {
    if (hazard.kind === "puddle") {
      hazard.life = (hazard.life ?? 0) - dt;
      continue;
    }
    if (hazard.kind === "vent" || hazard.kind === "projector") {
      const blast = hazardBlast(hazard);
      if (hazard.active > 0) {
        hazard.active = Math.max(0, hazard.active - dt);
        if (Math.hypot(run.hero.x - hazard.x, run.hero.y - hazard.y) < hazard.radius + HERO_RADIUS) hurtHero(run, blast.dps * dt * (1 - resist), hazard.kind);
      } else {
        hazard.timer -= dt;
        if (hazard.timer <= 0) {
          hazard.timer += blast.every;
          hazard.active = blast.burst;
        }
      }
      continue;
    }
    if (hazard.kind !== "microwave") continue;
    hazard.timer -= dt;
    if (hazard.timer > 0) continue;
    hazard.timer += KITCHEN.microwaveEvery;
    const turn = run.time * 0.7;
    for (let index = 0; index < KITCHEN.ring; index += 1) {
      const angle = turn + (index / KITCHEN.ring) * Math.PI * 2;
      run.foeShots.push({
        id: run.nextId++,
        from: "microwave",
        x: hazard.x,
        y: hazard.y,
        vx: Math.cos(angle) * KITCHEN.shot.speed,
        vy: Math.sin(angle) * KITCHEN.shot.speed,
        radius: KITCHEN.shot.radius,
        damage: KITCHEN.shot.damage,
        life: KITCHEN.shot.life,
      });
    }
  }
  run.hazards = run.hazards.filter((hazard) => hazard.life === undefined || hazard.life > 0);
}

/** Advance the run by one `STEP`. While a pick is waiting, or once the run is over, only the effects fade. */
export function step(run: Run, input: Input): void {
  fadeEffects(run, STEP);
  if (run.status !== "playing" || run.picks || run.cleared) return;
  run.time += STEP;
  run.grace = Math.max(0, run.grace - STEP);
  run.skillCd = Math.max(0, run.skillCd - STEP);
  run.aura = Math.max(0, run.aura - STEP);
  if (run.decoy) {
    run.decoy.life -= STEP;
    if (run.decoy.life <= 0) run.decoy = null;
  }
  moveHero(run, input, STEP);
  spawn(run, STEP);
  tickHazards(run, STEP);
  index(run);
  moveFoes(run, STEP);
  index(run);
  for (const weapon of run.weapons) fire(run, weapon, STEP);
  moveShots(run, STEP);
  landDrops(run, STEP);
  moveFoeShots(run, STEP);
  touchHero(run, STEP);
  reap(run);
  collectGems(run, STEP);
  if (run.hero.hp <= 0 && run.revive) {
    run.revive = false;
    run.hero.hp = run.numbers.maxHp * SECOND_WIND.hp;
    run.grace = SECOND_WIND.grace;
    run.foeShots = [];
    addEffect(run, "pop", run.hero.x, run.hero.y, 60, 0.5);
  }
  if (run.hero.hp <= 0) {
    run.hero.hp = 0;
    run.status = "lost";
  } else if (run.status === "playing" && run.interview && run.time >= INTERVIEW.closesAt) {
    run.status = "lost";
  } else if (run.status === "playing" && run.queuedPicks > 0 && !run.picks) {
    run.queuedPicks -= 1;
    run.picks = rollPicks(run);
  }
}

/** Take one of the offered picks; the next owed level-up is offered straight away. */
export function choose(run: Run, pick: number): boolean {
  const chosen = run.picks?.[pick];
  if (!chosen || run.status !== "playing") return false;
  applyPick(run, chosen);
  run.picks = null;
  if (run.queuedPicks > 0) {
    run.queuedPicks -= 1;
    run.picks = rollPicks(run);
  }
  return true;
}

/** Walk out of the run: it counts as falling. */
export function abandon(run: Run): void {
  if (run.status !== "playing") return;
  run.status = "lost";
  run.abandoned = true;
}

/**
 * The department's signature move, cast at the tapped point (or, with none given, at the nearest foe — the
 * keyboard's aim). Focus shortens the cooldown; the career's tier scales the effect; quirks bend the casting.
 */
export function castSkill(run: Run, x?: number, y?: number): boolean {
  if (run.department === "interns" || run.status !== "playing" || run.picks || run.cleared || run.skillCd > 0) return false;
  const department = run.department;
  const effect = SKILL_EFFECTS[department];
  const tierFactor = skillTier(run.careerLevel);
  const target = { x: x ?? 0, y: y ?? 0 };
  const settled = Number.isFinite(target.x) && Number.isFinite(target.y);
  const point = settled ? { x: clampTo(target.x, 0, ARENA.width), y: clampTo(target.y, 0, ARENA.height) } : autoAim(run);
  let touched = 0;
  switch (department) {
    case "engineering": {
      run.decoy = { x: point.x, y: point.y, life: effect.duration * tierFactor };
      addEffect(run, "blast", point.x, point.y, 40, 0.4);
      touched = 1;
      break;
    }
    case "finance": {
      for (const foe of run.foes) {
        if (Math.hypot(foe.x - point.x, foe.y - point.y) <= effect.radius * tierFactor) {
          foe.marked = effect.duration * tierFactor;
          touched += 1;
        }
      }
      addEffect(run, "blast", point.x, point.y, effect.radius * tierFactor, 0.4);
      break;
    }
    case "legal": {
      for (const foe of run.foes) {
        if (Math.hypot(foe.x - point.x, foe.y - point.y) <= effect.radius * tierFactor) {
          foe.detained = effect.duration * tierFactor;
          touched += 1;
        }
      }
      addEffect(run, "blast", point.x, point.y, effect.radius * tierFactor, 0.4);
      break;
    }
    case "sales": {
      const inReach = run.foes
        .map((foe) => ({ foe, distance: Math.hypot(foe.x - point.x, foe.y - point.y) }))
        .filter((entry) => entry.distance <= effect.radius * tierFactor)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, effect.count);
      for (const { foe } of inReach) {
        foe.detained = effect.duration * tierFactor;
        hurtFoe(run, foe, effect.damage, DEPARTMENTS[department].weapon);
        touched += 1;
      }
      addEffect(run, "blast", point.x, point.y, 60, 0.35);
      break;
    }
    case "it": {
      run.foeShots = [];
      run.grace = Math.max(run.grace, effect.duration * tierFactor);
      addEffect(run, "blast", run.hero.x, run.hero.y, 90, 0.4);
      touched = 1;
      break;
    }
    case "hr": {
      run.hero.hp = Math.min(run.numbers.maxHp, run.hero.hp + run.numbers.maxHp * 0.25 * tierFactor);
      run.aura = effect.duration * tierFactor;
      addEffect(run, "blast", run.hero.x, run.hero.y, 70, 0.4);
      touched = 1;
      break;
    }
  }
  // Quirk hooks: the casting bends to who is casting it.
  let cd = SKILL.cooldown * run.numbers.cooldown;
  if (run.quirks.includes("caffeinated")) cd *= 0.8;
  if (run.quirks.includes("overachiever")) cd *= 1.15;
  if (run.quirks.includes("stealsLunches")) run.gold += touched;
  run.skillCd = Math.max(1, cd);
  return true;
}

/** The cast's target when none was given: the nearest foe's spot, or a step ahead of the hero. */
function autoAim(run: Run): { x: number; y: number } {
  let best: Foe | null = null;
  let bestDistance = 400;
  for (const foe of run.foes) {
    const distance = Math.hypot(foe.x - run.hero.x, foe.y - run.hero.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = foe;
    }
  }
  if (best) return { x: best.x, y: best.y };
  return { x: run.hero.x + run.hero.faceX * 150, y: run.hero.y + run.hero.faceY * 150 };
}

/**
 * Take the stairs after a cleared floor: the next one, its stage's hazards, and nothing on the field. The hero keeps
 * everything they have picked up; their hp is theirs to look after.
 */
export function descend(run: Run): boolean {
  if (run.status !== "playing" || !run.cleared) return false;
  run.cleared = false;
  run.picks = null;
  run.floor += 1;
  run.floorStart = run.time;
  delete run.waveBeat;
  delete run.waveBeatAt;
  run.bossDone = false;
  run.bossId = null;
  run.spawnDebt = 0;
  run.printerIn = PRINTER_EVERY;
  run.foes = [];
  run.shots = [];
  run.drops = [];
  run.foeShots = [];
  run.gems = [];
  run.effects = [];
  run.stage = floorStage(run.floor);
  run.hazards = run.stage === "kitchen" ? kitchenHazards(run) : run.stage === "serverRoom" ? serverRoomHazards(run) : run.stage === "boardroom" ? boardroomHazards(run) : [];
  seedFloor(run);
  return true;
}

// ---- The hero ----------------------------------------------------------------------------------------------------

function clampTo(value: number, radius: number, size: number): number {
  return Math.min(size - radius, Math.max(radius, value));
}

function moveHero(run: Run, input: Input, dt: number): void {
  const { hero } = run;
  hero.hurt = Math.max(0, hero.hurt - dt);
  let { dx, dy } = input;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) dx = dy = 0;
  else if (length > 1) {
    dx /= length;
    dy /= length;
  }
  const untangled = run.kit.some((item) => item.id === "cableUntangler");
  // The guardian wings hover the hero over the floor's spills and puddles.
  const winged = gearEffect(run, "guardianWings") > 0;
  const slowed = !untangled && !winged && run.hazards.some(
    (hazard) => (hazard.kind === "spill" || hazard.kind === "puddle") && Math.hypot(hero.x - hazard.x, hero.y - hazard.y) < hazard.radius,
  );
  // The winged loafers put every step ahead of schedule.
  const speed = run.numbers.speed * (1 + gearEffect(run, "hermesLoafers")) * (slowed ? 1 - KITCHEN.spillSlow : 1) * (run.aura > 0 ? 1.3 : 1);
  hero.x = clampTo(hero.x + dx * speed * dt, HERO_RADIUS, ARENA.width);
  hero.y = clampTo(hero.y + dy * speed * dt, HERO_RADIUS, ARENA.height);
  if (length > 0.1) {
    hero.faceX = dx / Math.min(1, length);
    hero.faceY = dy / Math.min(1, length);
  }
  // Printer jams and the immobile bosses block the way.
  for (const foe of run.foes) {
    if (foe.speed !== 0) continue;
    const ox = hero.x - foe.x;
    const oy = hero.y - foe.y;
    const distance = Math.hypot(ox, oy);
    const touch = HERO_RADIUS + foe.radius;
    if (distance >= touch) continue;
    const [nx, ny] = distance > 0 ? [ox / distance, oy / distance] : [1, 0];
    hero.x = clampTo(foe.x + nx * touch, HERO_RADIUS, ARENA.width);
    hero.y = clampTo(foe.y + ny * touch, HERO_RADIUS, ARENA.height);
  }
}

function touchHero(run: Run, dt: number): void {
  const { hero } = run;
  grid.near(hero.x, hero.y, HERO_RADIUS, FOE_PAD, (foe) => {
    if (foe.hp <= 0) return;
    const scale = (foe.boss ? 1 : touchScale(floorElapsed(run))) * enrageFactor(foe);
    hurtHero(run, foe.touch * scale * dt, foe.kind);
  });
}

/** Foe lethality (P0, hr-harder-roadmap): a flat base plus a step per difficulty point. Interviews are short
 * optional retries with no loss, so they take half the whole factor, like their difficulty does. */
export function foeDamageFactor(run: Run): number {
  const factor = REVIEW.foeDamageBase + REVIEW.foeDamagePerLevel * (run.difficulty - 1);
  return run.interview ? 1 + (factor - 1) / 2 : factor;
}

function hurtHero(run: Run, amount: number, by: Source): void {
  if (run.grace > 0) return;
  const taken = amount * run.numbers.taken * foeDamageFactor(run);
  run.hero.hp -= taken;
  run.takenFrom[by] = (run.takenFrom[by] ?? 0) + taken;
  run.hero.hurt = HURT_FLASH;
  run.lastHitBy = by;
}

// ---- Foes --------------------------------------------------------------------------------------------------------

function index(run: Run): void {
  grid.rebuild(run.foes);
  byId.clear();
  for (const foe of run.foes) byId.set(foe.id, foe);
}

function addFoe(run: Run, kind: FoeKind, x: number, y: number, overrides: { boss?: boolean; hp?: number; elite?: boolean; pay?: number; squad?: true } = {}): Foe {
  const def = FOES[kind];
  const boss = overrides.boss ?? def.boss;
  const elite = overrides.elite ?? false;
  const hp = (overrides.hp ?? (boss ? def.hp : def.hp * hpScale(floorElapsed(run)))) * run.difficulty;
  const foe: Foe = {
    id: run.nextId++,
    kind,
    boss,
    elite,
    x: clampTo(x, def.radius, ARENA.width),
    y: clampTo(y, def.radius, ARENA.height),
    hp,
    maxHp: hp,
    radius: def.radius,
    speed: def.speed,
    touch: def.touch * (elite ? ELITE.touch : 1),
    xp: def.xp * (elite ? ELITE.pay : 1) * (overrides.pay ?? 1),
    gold: def.gold * (elite ? ELITE.pay : 1) * (overrides.pay ?? 1),
    ...(overrides.pay !== undefined ? { kpi: overrides.pay } : {}),
    ...(overrides.squad ? { squad: true } : {}),
    pushX: 0,
    pushY: 0,
    slow: 0,
    timer: def.every,
    cycles: 0,
    charge: 0,
    chargeX: 0,
    chargeY: 0,
    duckCooldown: 0,
    detained: 0,
    marked: 0,
    blinkCd: 0,
    shock: 0,
    enraged: false,
    hurt: 0,
  };
  run.foes.push(foe);
  return foe;
}


/** A point between `min` and `max` from the hero, inside the arena and not right on top of them. */
function pointAround(run: Run, min: number, max: number): { x: number; y: number } {
  const { hero } = run;
  let point = { x: hero.x, y: hero.y };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const angle = random(run) * Math.PI * 2;
    const distance = randomBetween(run, min, max);
    point = { x: clampTo(hero.x + Math.cos(angle) * distance, 0, ARENA.width), y: clampTo(hero.y + Math.sin(angle) * distance, 0, ARENA.height) };
    if (Math.hypot(point.x - hero.x, point.y - hero.y) >= min * 0.75) break;
  }
  return point;
}

function drawKind(run: Run): FoeKind {
  // The floor's own boss kind is reserved for the boss, so a horde meeting-invite can never be mistaken for it.
  const boss = run.interview ? run.interview.boss : FLOOR_PLAN[run.floor - 1].boss;
  const open = MIX[run.stage].filter((entry) => run.time >= entry.from && entry.kind !== boss);
  let roll = random(run) * open.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of open) {
    roll -= entry.weight;
    if (roll < 0) return entry.kind;
  }
  return "replyAll";
}

function spawnInterview(run: Run, interview: Interview, dt: number): void {
  if (!run.bossDone && run.time >= INTERVIEW.bossAt) {
    run.bossDone = true;
    const at = pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
    run.bossId = addFoe(run, interview.boss, at.x, at.y).id;
  }
  const bossOut = run.foes.some((foe) => foe.kind === interview.boss);
  run.spawnDebt += INTERVIEW.spawnRate * (1 + (run.difficulty - 1) / 2) * (bossOut ? INTERVIEW.bossOutShare : 1) * dt;
  while (run.spawnDebt >= 1) {
    run.spawnDebt -= 1;
    if (run.foes.length >= MAX_FOES) continue;
    const at = pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
    addFoe(run, "replyAll", at.x, at.y);
  }
}

function spawn(run: Run, dt: number): void {
  if (run.interview) {
    spawnInterview(run, run.interview, dt);
    return;
  }
  spawnFloor(run, dt);
}

/** Two different approach lanes, when the walls allow it. Keep each small pack together. */
function spawnSquads(run: Run, kinds: readonly FoeKind[], pay: number): void {
  const { hero } = run;
  const first = pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
  const angle = Math.atan2(first.y - hero.y, first.x - hero.x);
  const other = [Math.PI, Math.PI * 2 / 3, -Math.PI * 2 / 3].map((turn) => ({
    x: clampTo(hero.x + Math.cos(angle + turn) * SPAWN_DISTANCE.min, 0, ARENA.width),
    y: clampTo(hero.y + Math.sin(angle + turn) * SPAWN_DISTANCE.min, 0, ARENA.height),
  })).find(({ x, y }) => Math.hypot(x - hero.x, y - hero.y) >= SPAWN_DISTANCE.min * 0.95)
    ?? pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
  kinds.forEach((kind, index) => {
    if (run.foes.length >= MAX_FOES) return;
    const at = index % 2 === 0 ? first : other;
    const heading = Math.atan2(at.y - hero.y, at.x - hero.x);
    const offset = (Math.floor(index / 2) % 5 - 2) * 19;
    addFoe(run, kind, at.x - Math.sin(heading) * offset, at.y + Math.cos(heading) * offset, { pay, squad: true });
  });
}

function advanceWaves(run: Run, elapsed: number, pilot: NonNullable<(typeof PILOT_FLOORS)[number]> | undefined): boolean {
  const plan = FLOOR_PLAN[run.floor - 1];
  const specialist = SPECIALIST[plan.stage];
  const beat = run.waveBeat ?? 0;
  if (!pilot) {
    if (beat === 0 && run.floor >= specialist.from && elapsed >= plan.horde * 0.45 && elapsed < plan.horde && spikeRate(run) === 1) {
      spawnSquads(run, Array<FoeKind>(specialist.count).fill(specialist.kind), 0.45);
      run.waveBeat = 1;
    } else if (run.floor >= 14 && beat === 1 && elapsed >= plan.horde * 0.68 && elapsed < plan.horde
      && (!run.spike || run.spike.done || elapsed < run.spike.at - SPIKE.rushWarn - 5)) {
      // A second front on late regular floors, never layered over a warning or a rush.
      spawnSquads(run, LATE_PACK, 0.35);
      run.waveBeat = 2;
    }
    return elapsed >= plan.horde;
  }
  const packAlive = run.foes.some((foe) => foe.squad && foe.hp > 0);
  const sinceBeat = elapsed - (run.waveBeatAt ?? 0);
  if (elapsed >= pilot.horde) return true;
  if (beat === 3 && elapsed >= pilot.minimum && sinceBeat >= 6 && !packAlive) return true;
  if (beat === 0) {
    spawnSquads(run, ["replyAll", "replyAll", "replyAll", "replyAll", "paperPlane", "paperPlane"], pilot.pay);
  } else if (beat === 1 && (elapsed >= 14 || (sinceBeat >= 7 && !packAlive))) {
    spawnSquads(run, [...Array<FoeKind>(specialist.count).fill(specialist.kind), "replyAll", "replyAll", "paperPlane"], pilot.pay);
  } else if (beat === 2 && (elapsed >= pilot.horde - 12 || (elapsed >= 22 && sinceBeat >= 7 && !packAlive))) {
    spawnSquads(run, ["replyAll", "paperPlane", "replyAll", "paperPlane", "replyAll", "replyAll", specialist.kind, "replyAll", "paperPlane", "replyAll"], pilot.pay);
  } else {
    return false;
  }
  run.waveBeat = beat + 1;
  run.waveBeatAt = elapsed;
  return false;
}

/** One floor of the day: a horde for the plan's span, then its boss walks in and the horde thins. */
function spawnFloor(run: Run, dt: number): void {
  const plan = FLOOR_PLAN[run.floor - 1];
  const elapsed = floorElapsed(run);
  const pilot = run.classId ? PILOT_FLOORS[run.floor] : undefined;
  const bossReady = !run.bossDone && (run.classId ? advanceWaves(run, elapsed, pilot) : elapsed >= plan.horde);
  if (bossReady) {
    run.bossDone = true;
    const at = pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
    const boss = addFoe(run, plan.boss, at.x, at.y, { boss: true, hp: plan.bossHp });
    // An immobile boss cannot come to the fight later, so it walks in first and plants itself near the hero.
    if (FOES[plan.boss].speed === 0) boss.walkIn = true;
    if (pilot) boss.timer = 0;
    run.bossId = boss.id;
  }
  const bossOut = run.bossId !== null && run.foes.some((foe) => foe.id === run.bossId);
  const rush = spikeRate(run);
  const density = run.classId && !pilot && !bossOut && rush === 1 ? hordeDensity(run.floor) : 1;
  // A staged floor gets some of its bodies from the packs. The boss entrance trims spawns still further.
  const phaseRate = bossOut ? INTERVIEW.bossOutShare * (pilot ? 0.65 : 1) : pilot ? 0.78 : 1;
  const baseRate = spawnRate(pilot ? Math.min(elapsed, plan.horde) : elapsed);
  run.spawnDebt += baseRate * (1 + (run.difficulty - 1) / 2) * phaseRate * rush * density * dt;
  while (run.spawnDebt >= 1) {
    run.spawnDebt -= 1;
    if (run.foes.length >= MAX_FOES) continue;
    const at = pointAround(run, SPAWN_DISTANCE.min, SPAWN_DISTANCE.max);
    // From the second act on, a share of the horde comes in elite: no flinch, half knockback, a harder touch.
    const elite = !bossOut && random(run) < ELITE.share[run.stage];
    addFoe(run, drawKind(run), at.x, at.y, { elite, pay: pilot && !bossOut ? pilot.pay : density > 1 ? 1 / density : undefined });
  }
  if (!pilot || !bossOut) tickSpike(run, dt);
  // Each act plants its immobile blocker on a timer: the printer from floor 3, then the act's own.
  const blocker = BLOCKERS[run.stage];
  if (!blocker || run.floor < blocker.from || (pilot && bossOut)) return;
  run.printerIn -= dt;
  if (run.printerIn > 0) return;
  run.printerIn = blocker.every;
  if (run.foes.filter((foe) => foe.kind === blocker.kind).length >= blocker.cap) return;
  const at = pointAround(run, 220, 360);
  addFoe(run, blocker.kind, at.x, at.y);
}

/** Seconds since this floor began; a floor's ramp lives within itself, not across the whole day. */
function floorElapsed(run: Run): number {
  return run.interview ? run.time : run.time - run.floorStart;
}

/** The rush's spawn multiplier while the floor's rush window is open. */
function spikeRate(run: Run): number {
  const spike = run.spike;
  if (!spike || spike.kind !== "rush" || spike.done) return 1;
  return floorElapsed(run) >= spike.at ? SPIKE.rushRate : 1;
}

/** Raises the ambush ring's warning and fires it, and closes the rush window when its span is out. */
function tickSpike(run: Run, dt: number): void {
  const spike = run.spike;
  if (!spike || run.interview || spike.done) return;
  void dt;
  const elapsed = floorElapsed(run);
  const warn = spike.kind === "ring" ? SPIKE.ringWarn : SPIKE.rushWarn;
  if (!spike.armed && elapsed >= spike.at - warn) {
    spike.armed = true;
    if (spike.kind === "ring") {
      spike.points = [];
      for (let index = 0; index < SPIKE.ringCount; index += 1) {
        const angle = (index / SPIKE.ringCount) * Math.PI * 2;
        spike.points.push({
          x: clampTo(run.hero.x + Math.cos(angle) * SPIKE.ringRadius, 12, ARENA.width),
          y: clampTo(run.hero.y + Math.sin(angle) * SPIKE.ringRadius, 12, ARENA.height),
        });
      }
      for (const point of spike.points) addEffect(run, "spikeWarn", point.x, point.y, 24, SPIKE.ringWarn);
    }
  }
  if (spike.kind === "ring" && spike.armed && elapsed >= spike.at) {
    spike.done = true;
    for (const point of spike.points ?? []) {
      if (run.foes.length >= MAX_FOES) break;
      addFoe(run, drawKind(run), point.x, point.y);
    }
  }
  if (spike.kind === "rush" && elapsed >= spike.at + (spike.span ?? 0)) spike.done = true;
}

/** Seeds this floor's pressure spike and cameo guest; deterministic through `random(run)`. */
function seedFloor(run: Run): void {
  const plan = FLOOR_PLAN[run.floor - 1];
  const room = Math.max(4, plan.horde - SPIKE.hordeMargin);
  if (!run.interview && !(run.classId && PILOT_FLOORS[run.floor]) && run.floor >= SPIKE.from && random(run) < SPIKE.chance) {
    // Rings lean early in the horde, rushes middle: both well before the boss walks in.
    const at = 4 + random(run) * room;
    run.spike = random(run) < 0.6 ? { kind: "ring", at } : { kind: "rush", at, span: SPIKE.rushSpan };
  } else {
    run.spike = null;
  }
  const used = run.cameosUsed ?? 0;
  if (run.interview || run.floor < CAMEO.from || used >= CAMEO.cap || random(run) >= CAMEO.chance) {
    run.cameo = null;
    return;
  }
  run.cameosUsed = used + 1;
  const roll = random(run);
  if (roll < 0.34) {
    run.cameo = { kind: "senior" };
  } else if (roll < 0.67) {
    run.cameo = { kind: "nurse" };
    run.hero.hp = Math.min(run.numbers.maxHp, run.hero.hp + run.numbers.maxHp * CAMEO.nurseHeal);
  } else {
    run.cameo = { kind: "rival", kills0: run.kills, target: CAMEO.rivalKills + CAMEO.rivalKillsPerFloor * run.floor, ...(run.classId ? { credited: 0 } : {}) };
  }
}

function summon(run: Run, around: Foe, count: number, kind: FoeKind = "replyAll"): void {
  for (let index = 0; index < count && run.foes.length < MAX_FOES; index += 1) {
    const angle = random(run) * Math.PI * 2;
    addFoe(run, kind, around.x + Math.cos(angle) * (around.radius + 12), around.y + Math.sin(angle) * (around.radius + 12));
  }
}

function shootAt(run: Run, from: Foe, angle: number, shot: { speed: number; radius: number; damage: number; life: number }, arm = 0): void {
  const hard = enrageFactor(from);
  run.foeShots.push({
    id: run.nextId++,
    from: from.kind,
    x: from.x,
    y: from.y,
    vx: Math.cos(angle) * shot.speed,
    vy: Math.sin(angle) * shot.speed,
    radius: shot.radius,
    damage: shot.damage * hard,
    life: shot.life,
    ...(arm > 0 ? { arm, flown: 0 } : {}),
  });
}

/** A foe's timer went off: summon, shoot or charge, by kind. */
function act(run: Run, foe: Foe, toHero: number, distance: number): void {
  foe.cycles += 1;
  switch (foe.kind) {
    case "rollingCart":
      foe.charge = CART.duration;
      foe.chargeX = Math.cos(toHero);
      foe.chargeY = Math.sin(toHero);
      break;
    case "patchDrone": {
      let repaired = 0;
      grid.near(foe.x, foe.y, DRONE.range, FOE_PAD, (ally) => {
        if (repaired >= DRONE.recipients || ally.boss || ally.kind === "patchDrone" || ally.hp <= 0 || ally.hp >= ally.maxHp) return;
        ally.hp = Math.min(ally.maxHp, ally.hp + DRONE.repair);
        repaired += 1;
        addEffect(run, "repair", ally.x, ally.y, ally.radius + 5, 0.45);
      });
      if (repaired) addEffect(run, "repair", foe.x, foe.y, DRONE.range, 0.5);
      break;
    }
    case "securityEscort":
      foe.guardAngle = toHero;
      break;
    case "meetingInvite":
      summon(run, foe, INVITE_SUMMONS);
      break;
    case "meetingChair":
      summon(run, foe, CHAIR_SUMMONS);
      break;
    case "printerJam":
      if (distance <= PRINTER_RANGE) shootAt(run, foe, toHero, TONER);
      break;
    case "greaseFire":
      if (distance <= GREASE.range) shootAt(run, foe, toHero, GREASE.shot);
      break;
    case "hotRack":
      for (let index = 0; index < RACK.ring; index += 1) shootAt(run, foe, toHero + (index / RACK.ring) * Math.PI * 2, RACK.shot);
      break;
    case "printerPrime": {
      for (let index = 0; index < PRIME_TONER.stream; index += 1) shootAt(run, foe, toHero + (index - (PRIME_TONER.stream - 1) / 2) * 0.12, PRIME_TONER);
      if (foe.cycles % 4 === 0) summon(run, foe, 3);
      break;
    }
    case "shredder":
      if (distance > SHREDDER.wake) break;
      if (foe.cycles % SHREDDER.burstEvery === 0) {
        for (let index = 0; index < SHREDDER.burst; index += 1) shootAt(run, foe, toHero + (index / SHREDDER.burst) * Math.PI * 2, SHREDDER.shot, SHOT_ARM);
      } else {
        // Fans sweep alternately to either side of the hero, so standing in one is a choice.
        const side = foe.cycles % 4 < 2 ? -1 : 1;
        for (let index = 0; index < SHREDDER.fan; index += 1) shootAt(run, foe, toHero + side * (index - (SHREDDER.fan - 1) / 2) * SHREDDER.spread, SHREDDER.shot, SHOT_ARM);
      }
      break;
    case "coffeeMachine":
      lobAt(run, foe, run.hero.x, run.hero.y, COFFEE.glob, COFFEE.puddle);
      break;
    case "vendingMachine":
      lobAt(run, foe, run.hero.x, run.hero.y, VENDING.can, null);
      break;
    case "middleManager":
      foe.charge = CHARGE.seconds;
      foe.chargeX = Math.cos(toHero);
      foe.chargeY = Math.sin(toHero);
      break;
    case "lunchMonitor":
      // The monitor charges, and its lunch parade follows it out of the kitchen.
      summon(run, foe, 2, "lunchThief");
      foe.charge = CHARGE.seconds;
      foe.chargeX = Math.cos(toHero);
      foe.chargeY = Math.sin(toHero);
      break;
    case "sysadmin":
      for (let index = 0; index < PING.fan; index += 1) shootAt(run, foe, toHero + (index - (PING.fan - 1) / 2) * PING.spread, PING);
      break;
    case "teamLead":
      // Every other charge, the lead brings a pair of the team along.
      if (foe.cycles % 2 === 0) summon(run, foe, 2);
      foe.charge = LEAD_CHARGE.seconds;
      foe.chargeX = Math.cos(toHero);
      foe.chargeY = Math.sin(toHero);
      break;
    case "hrManager":
      if (foe.cycles % PAPERWORK.ringEvery === 0) {
        for (let index = 0; index < PAPERWORK.ring; index += 1) shootAt(run, foe, toHero + (index / PAPERWORK.ring) * Math.PI * 2, PAPERWORK);
      } else {
        for (let index = 0; index < PAPERWORK.fan; index += 1) shootAt(run, foe, toHero + (index - (PAPERWORK.fan - 1) / 2) * PAPERWORK.spread, PAPERWORK);
      }
      break;
    case "recruiter":
      summon(run, foe, RECRUITER_CLONES);
      break;
    case "blobPrime":
      foe.shock = SHOCK.seconds;
      break;
    case "auditor":
      for (let index = 0; index < RED_TAPE.count; index += 1) shootAt(run, foe, toHero + (index / RED_TAPE.count) * Math.PI * 2, RED_TAPE);
      if (foe.cycles % AUDITOR_SUMMON_EVERY === 0) summon(run, foe, foe.enraged ? AUDITOR_ENRAGE.summons : AUDITOR_SUMMONS);
      break;
    default:
      break;
  }
}

/** A lob: a shot that flies to the landing point, hurts everything close there, and may leave a puddle. */
function lobAt(
  run: Run,
  from: Foe,
  x: number,
  y: number,
  shot: { flight: number; radius: number; damage: number; splash: number },
  puddle: { radius: number; life: number; slow: number } | null,
): void {
  run.foeShots.push({
    id: run.nextId++,
    from: from.kind,
    x: from.x,
    y: from.y,
    vx: (x - from.x) / shot.flight,
    vy: (y - from.y) / shot.flight,
    radius: shot.radius,
    damage: shot.damage,
    life: shot.flight,
    lob: { flight: shot.flight, splash: shot.splash, puddle: puddle ? puddle.radius : undefined },
  });
}

/** Is this foe heavy enough that others should move around it rather than push it? */
function anchored(foe: Foe): boolean {
  return foe.kind === "printerJam" || foe.boss;
}

function hasPilotBoss(run: Run, foe: Foe): boolean {
  return Boolean(foe.boss && run.classId && !run.interview && PILOT_FLOORS[run.floor]);
}

/** Lock the attack direction (never the player's controls), then give a chance to close in. */
function tickTelegraph(run: Run, foe: Foe, dt: number, pilotBoss: boolean): void {
  const distance = Math.hypot(run.hero.x - foe.x, run.hero.y - foe.y);
  const range = pilotBoss ? PILOT_BOSS.close : CART.range;
  if (foe.windup) {
    foe.windup.left -= dt;
    if (foe.windup.left > 0) return;
    const { angle } = foe.windup;
    delete foe.windup;
    act(run, foe, angle, distance);
    foe.recovery = (pilotBoss ? PILOT_BOSS.recovery : CART.recovery) + Math.max(foe.charge, foe.shock);
    return;
  }
  if ((foe.recovery ?? 0) > 0) {
    foe.recovery = Math.max(0, foe.recovery! - dt);
    return;
  }
  foe.timer = Math.max(0, foe.timer - dt);
  if (foe.timer === 0 && distance <= range) {
    foe.timer = FOES[foe.kind].every;
    foe.windup = { angle: toHeroOf(foe, run.hero), left: pilotBoss ? PILOT_BOSS.windup : CART.windup };
  }
}

function moveFoes(run: Run, dt: number): void {
  const { hero } = run;
  const fade = Math.max(0, 1 - PUSH_FADE * dt);
  for (const foe of [...run.foes]) {
    foe.hurt = Math.max(0, foe.hurt - dt);
    if (foe.boss) foe.age = (foe.age ?? 0) + dt;
    foe.duckCooldown = Math.max(0, foe.duckCooldown - dt);
    foe.blinkCd = Math.max(0, foe.blinkCd - dt);
    foe.marked = Math.max(0, foe.marked - dt);
    foe.detained = Math.max(0, foe.detained - dt);
    if (foe.detained > 0) continue;
    if (foe.kind === "auditor" && !foe.enraged && foe.hp <= foe.maxHp / 2) {
      foe.enraged = true;
      addEffect(run, "pop", foe.x, foe.y, foe.radius + 8, 0.5);
    }
    const enraged = foe.enraged ? AUDITOR_ENRAGE.speed : 1;
    // The decoy draws the horde: everything walks at it instead of the hero.
    const target = run.decoy ?? hero;
    const dx = target.x - foe.x;
    const dy = target.y - foe.y;
    const distance = Math.hypot(dx, dy);
    // A sysadmin blinks away when the hero closes in, so the fight stays ranged.
    if (foe.kind === "sysadmin" && foe.boss && foe.blinkCd <= 0 && distance < BLINK.range && !run.decoy) {
      addEffect(run, "pop", foe.x, foe.y, foe.radius, 0.3);
      const at = pointAround(run, BLINK.min, BLINK.max);
      foe.x = clampTo(at.x, foe.radius, ARENA.width);
      foe.y = clampTo(at.y, foe.radius, ARENA.height);
      foe.blinkCd = BLINK.every;
    }
    const def = FOES[foe.kind];
    const pilotBoss = hasPilotBoss(run, foe);
    if (foe.kind === "securityEscort" && foe.guardAngle === undefined) foe.guardAngle = toHeroOf(foe, hero);
    if (pilotBoss || foe.kind === "rollingCart") {
      tickTelegraph(run, foe, dt, pilotBoss);
    } else if (def.every > 0) {
      foe.timer -= dt;
      if (foe.timer <= 0) {
        foe.timer += def.every * (foe.enraged ? AUDITOR_ENRAGE.timerScale : 1);
        act(run, foe, toHeroOf(foe, hero), Math.hypot(hero.x - foe.x, hero.y - foe.y));
      }
    }
    let speed = foe.speed * (1 - foe.slow) * enraged;
    let [mx, my] = distance > 0 ? [dx / distance, dy / distance] : [0, 0];
    // An immobile floor boss walks in first, then plants itself for good.
    if (foe.walkIn) {
      if (distance <= BOSS_WALK_IN.station) {
        foe.walkIn = false;
      } else {
        speed = BOSS_WALK_IN.speed;
      }
    }
    if (pilotBoss && distance > PILOT_BOSS.close) speed = Math.max(speed, PILOT_BOSS.approach);
    if (foe.windup || (foe.recovery ?? 0) > 0) speed = foe.windup ? 0 : speed * 0.2;
    if (foe.charge > 0) {
      foe.charge -= dt;
      speed = foe.kind === "rollingCart" ? CART.speed : foe.speed * (1 - foe.slow) * enraged * (foe.kind === "teamLead" ? LEAD_CHARGE.speed : CHARGE.speed);
      mx = foe.chargeX;
      my = foe.chargeY;
    }
    // Stop at the hero's edge rather than walking through them.
    const stride = foe.charge > 0 ? speed * dt : Math.min(speed * dt, Math.max(0, distance - foe.radius - HERO_RADIUS + 1));
    foe.x = clampTo(foe.x + mx * stride + foe.pushX * dt, foe.radius, ARENA.width);
    foe.y = clampTo(foe.y + my * stride + foe.pushY * dt, foe.radius, ARENA.height);
    foe.pushX *= fade;
    foe.pushY *= fade;
    foe.slow = 0;
    // A blob prime's shockwave expands from it, and the hero had better not stand in the band.
    if (foe.shock > 0) {
      foe.shock = Math.max(0, foe.shock - dt);
      const radius = (SHOCK.seconds - foe.shock) * SHOCK.speed;
      const at = Math.abs(distance - radius);
      if (at <= SHOCK.band + HERO_RADIUS) hurtHero(run, SHOCK.dps * dt, foe.kind);
    }
  }
  separate(run);
}

function toHeroOf(foe: Foe, hero: { x: number; y: number }): number {
  return Math.atan2(hero.y - foe.y, hero.x - foe.x);
}

/** Foes that overlap shove apart, so the horde spreads instead of stacking on one spot. */
function separate(run: Run): void {
  for (const foe of run.foes) {
    if (anchored(foe)) continue;
    grid.near(foe.x, foe.y, foe.radius, FOE_PAD, (other) => {
      if (other === foe || (!anchored(other) && other.id < foe.id)) return;
      const dx = foe.x - other.x;
      const dy = foe.y - other.y;
      const distance = Math.hypot(dx, dy);
      const overlap = foe.radius + other.radius - distance;
      if (overlap <= 0) return;
      const [nx, ny] = distance > 0 ? [dx / distance, dy / distance] : [1, 0];
      const share = anchored(other) ? 1 : 0.5;
      foe.x += nx * overlap * share;
      foe.y += ny * overlap * share;
      if (!anchored(other)) {
        other.x -= nx * overlap * share;
        other.y -= ny * overlap * share;
      }
    });
  }
}

function hurtFoe(run: Run, foe: Foe, amount: number, weapon: WeaponId, shot?: Shot): void {
  if (foe.hp <= 0) return;
  const guard = foe.kind === "securityEscort" && foe.guardAngle !== undefined && shot
    && -(shot.vx * Math.cos(foe.guardAngle) + shot.vy * Math.sin(foe.guardAngle)) >= Math.hypot(shot.vx, shot.vy) * Math.cos(ESCORT.arc);
  const dealt = Math.min(foe.hp, amount * run.numbers.damage * (guard ? ESCORT.damage : 1) * (foe.marked > 0 ? 1.5 : 1));
  foe.hp -= dealt;
  foe.hurt = FOE_HURT_FLASH;
  run.dealt[weapon] = (run.dealt[weapon] ?? 0) + dealt;
}

function knock(foe: Foe, fromX: number, fromY: number, speed: number): void {
  const dx = foe.x - fromX;
  const dy = foe.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  const scale = foe.boss ? BOSS_PUSH : foe.kind === "printerJam" ? 0 : foe.elite ? ELITE.push : 1;
  foe.pushX += (dx / distance) * speed * scale;
  foe.pushY += (dy / distance) * speed * scale;
}

function reap(run: Run): void {
  const alive: Foe[] = [];
  for (const foe of run.foes) {
    if (foe.hp > 0) {
      alive.push(foe);
      continue;
    }
    run.kills += 1;
    if (run.cameo?.credited !== undefined && !run.cameo.done) run.cameo.credited += foe.kpi ?? 1;
    run.gold += foe.gold * run.numbers.gold * STAGES[run.stage].gold * (foe.marked > 0 ? 2 : 1);
    if (foe.xp > 0) run.gems.push({ id: run.nextId++, x: foe.x, y: foe.y, value: foe.xp, pulled: false });
    addEffect(run, "pop", foe.x, foe.y, foe.radius, 0.3);
    if (foe.id === run.bossId) {
      run.bossId = null;
      if (run.interview || run.floor >= LAST_FLOOR) {
        run.status = "won";
      } else {
        // The floor is cleared: its gems go straight to the hero, and the pick offer and the stairs wait.
        run.floorsCleared = run.floor;
        for (const gem of run.gems) gainXp(run, gem.value);
        run.gems = [];
        // The rival's KPI is scored when the floor's boss falls.
        const cameo = run.cameo;
        if (cameo?.kind === "rival" && !cameo.done) {
          cameo.done = true;
          cameo.won = (cameo.credited === undefined ? run.kills - (cameo.kills0 ?? 0) : cameo.credited + 1e-9) >= (cameo.target ?? Infinity);
          if (cameo.won) run.gold += CAMEO.rivalGold + CAMEO.rivalGoldPerFloor * run.floor;
        }
        // Luck rolls the boss's signature item; a lucky desk fills faster.
        const drop = ITEM_DROPS[run.floor];
        if (drop && random(run) < run.numbers.loot * 2.5) {
          run.lootFound.push({ id: drop, level: 1, floor: run.floor });
          addEffect(run, "blast", run.hero.x, run.hero.y, 50, 0.5);
        }
        run.cleared = true;
        // A pick offer of its own, unless a level-up already owes one: the cleared screen always shows. Luck
        // rolls the lucky find: a fourth choice on the cleared floor — the dial the desk's loot will share.
        // A retired senior in the break room sits in: one more choice. A hammer may bend a weapon's pattern.
        if (!run.picks) {
          const lucky = (random(run) < run.numbers.loot ? 1 : 0) + (cameo?.kind === "senior" ? 1 : 0);
          const offer = rollPicks(run, lucky);
          const bent = Object.keys(run.mutations ?? {}).length;
          const fresh = run.weapons.filter((weapon) => !run.mutations?.[weapon.id]);
          if (bent < MUTATION_RULES.perDay && fresh.length > 0 && random(run) < MUTATION_RULES.chance) {
            const weapon = fresh[Math.floor(random(run) * fresh.length)];
            offer.push({ kind: "mutation", weapon: weapon.id, mutation: MUTATIONS[weapon.id] });
          }
          run.picks = offer;
        }
      }
    }
  }
  run.foes = alive;
  while (run.gems.length > MAX_GEMS) {
    const oldest = run.gems.shift()!;
    run.gems[0].value += oldest.value;
  }
}

// ---- Weapons -----------------------------------------------------------------------------------------------------

function nearestFoes(run: Run, count: number, reach: number, primary = false): Foe[] {
  const { hero } = run;
  const ordinaryReach = primary && run.classId && !run.interview && run.floor > 1 ? Math.min(reach, CLASS_HORDE_AIM) : reach;
  return run.foes
    .map((foe) => ({ foe, distance: Math.hypot(foe.x - hero.x, foe.y - hero.y) }))
    .filter(({ foe, distance }) => foe.hp > 0 && distance <= (foe.boss
      ? hasPilotBoss(run, foe) ? Math.min(reach + BOSS_AIM_BIAS, PILOT_BOSS.aim) : reach + BOSS_AIM_BIAS
      : ordinaryReach))
    // A boss is the point of its phase: aimed weapons pick it over the horde around it.
    .sort((a, b) => (Number(b.foe.boss) - Number(a.foe.boss)) || (a.distance - b.distance))
    .slice(0, count)
    .map((entry) => entry.foe);
}

function addShot(run: Run, weapon: WeaponId, angle: number, numbers: ReturnType<typeof weaponNumbers>, targetId = 0): void {
  if (run.shots.length >= MAX_SHOTS) return;
  const shot: Shot = {
    id: run.nextId++,
    weapon,
    x: run.hero.x,
    y: run.hero.y,
    vx: Math.cos(angle) * numbers.speed,
    vy: Math.sin(angle) * numbers.speed,
    radius: numbers.radius,
    damage: numbers.damage,
    life: numbers.life,
    pierce: numbers.pierce,
    targetId,
    hitIds: [],
  };
  run.shots.push(shot);
}

/** Fires the weapon if it's ready and has something to fire at; returns whether it did. */
function trigger(run: Run, weapon: OwnedWeapon): boolean {
  const { hero } = run;
  const numbers = weaponNumbers(weapon.id, weapon.level, run.mutations?.[weapon.id], run.classId);
  const facing = Math.atan2(hero.faceY, hero.faceX);
  switch (WEAPONS[weapon.id].pattern) {
    case "homing": {
      const targets = nearestFoes(run, numbers.count, AIM_REACH, true);
      if (targets.length === 0) return false;
      for (let index = 0; index < numbers.count; index += 1) {
        const target = targets[index % targets.length];
        addShot(run, weapon.id, Math.atan2(target.y - hero.y, target.x - hero.x) + (index - (numbers.count - 1) / 2) * 0.3, numbers, target.id);
      }
      return true;
    }
    case "pierce": {
      const [target] = nearestFoes(run, 1, AIM_REACH, true);
      if (!target) return false;
      const aim = Math.atan2(target.y - hero.y, target.x - hero.x);
      for (let index = 0; index < numbers.count; index += 1) addShot(run, weapon.id, aim + (index - (numbers.count - 1) / 2) * 0.15, numbers);
      return true;
    }
    case "fan": {
      let aim = facing;
      if (run.classId === "fieldRep") {
        let best: number = FIELD_FAN.range;
        for (const foe of run.foes) {
          const dx = foe.x - hero.x;
          const dy = foe.y - hero.y;
          const distance = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx) - facing;
          if (foe.hp <= 0 || distance >= best || Math.cos(angle) < Math.cos(FIELD_FAN.cone)) continue;
          best = distance;
          aim = facing + Math.atan2(Math.sin(angle), Math.cos(angle)) * FIELD_FAN.assist;
        }
      }
      for (let index = 0; index < numbers.count; index += 1) addShot(run, weapon.id, aim + (index - (numbers.count - 1) / 2) * FAN_SPREAD, numbers);
      return true;
    }
    case "drop": {
      const near = nearestFoes(run, 12, DROP_REACH, run.classId === "systems");
      for (let index = 0; index < numbers.count; index += 1) {
        const target = near.length > 0 ? near[Math.floor(random(run) * near.length)] : null;
        const x = target ? target.x : hero.x + hero.faceX * 120;
        const y = target ? target.y : hero.y + hero.faceY * 120;
        run.drops.push({ id: run.nextId++, x, y, delay: numbers.life, radius: numbers.radius, damage: numbers.damage });
      }
      return true;
    }
    case "swing":
      grid.near(hero.x, hero.y, numbers.radius, FOE_PAD, (foe) => {
        hurtFoe(run, foe, numbers.damage, weapon.id);
        // Gravity well: the swing pulls the office in instead of shoving it out.
        const pull = run.mutations?.[weapon.id] === "gravity";
        knock(foe, hero.x, hero.y, pull ? -numbers.knockback * 1.2 : numbers.knockback);
      });
      if (run.classId === "compliance") {
        let parried = 0;
        run.foeShots = run.foeShots.filter((shot) => {
          if (parried >= BINDER_PARRY.count || shot.lob || Math.hypot(shot.x - hero.x, shot.y - hero.y) > BINDER_PARRY.radius + shot.radius) return true;
          parried += 1;
          return false;
        });
      }
      addEffect(run, "swing", hero.x, hero.y, numbers.radius, 0.2);
      return true;
    case "aura":
      grid.near(hero.x, hero.y, numbers.radius, FOE_PAD, (foe) => hurtFoe(run, foe, numbers.damage, weapon.id));
      return true;
    case "orbit":
      return false;
  }
}

function fire(run: Run, weapon: OwnedWeapon, dt: number): void {
  const { hero } = run;
  const numbers = weaponNumbers(weapon.id, weapon.level, run.mutations?.[weapon.id], run.classId);
  const pattern = WEAPONS[weapon.id].pattern;
  if (pattern === "orbit") {
    weapon.spin = (weapon.spin + numbers.speed * dt) % (Math.PI * 2);
    for (let index = 0; index < numbers.count; index += 1) {
      const angle = weapon.spin + (index / numbers.count) * Math.PI * 2;
      const x = hero.x + Math.cos(angle) * numbers.radius;
      const y = hero.y + Math.sin(angle) * numbers.radius;
      let hit = false;
      grid.near(x, y, DUCK_RADIUS, FOE_PAD, (foe) => {
        if (foe.duckCooldown > 0) return;
        const wasAlive = foe.hp > 0;
        hurtFoe(run, foe, numbers.damage, weapon.id);
        foe.duckCooldown = numbers.life;
        hit ||= wasAlive;
      });
      // One short flash per contacting duck, not one per enemy in a dense pack.
      if (hit) addEffect(run, "duckHit", x, y, DUCK_RADIUS + 5, 0.18);
    }
    return;
  }
  if (pattern === "aura") grid.near(hero.x, hero.y, numbers.radius, FOE_PAD, (foe) => (foe.slow = Math.max(foe.slow, numbers.slow)));
  weapon.cooldownLeft -= dt;
  if (weapon.cooldownLeft > 0) return;
  // Nothing to fire at: stay ready rather than waste the shot.
  if (!trigger(run, weapon)) {
    weapon.cooldownLeft = 0;
    return;
  }
  weapon.cooldownLeft = Math.max(MIN_COOLDOWN, numbers.cooldown * run.numbers.cooldown);
}

function moveShots(run: Run, dt: number): void {
  const kept: Shot[] = [];
  for (const shot of run.shots) {
    if (shot.targetId) {
      const target = byId.get(shot.targetId);
      if (target && target.hp > 0) {
        const speed = Math.hypot(shot.vx, shot.vy);
        const angle = Math.atan2(target.y - shot.y, target.x - shot.x);
        shot.vx = Math.cos(angle) * speed;
        shot.vy = Math.sin(angle) * speed;
      } else shot.targetId = 0;
    }
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    grid.near(shot.x, shot.y, shot.radius, FOE_PAD, (foe) => {
      if (shot.pierce <= 0 || foe.hp <= 0 || shot.hitIds.includes(foe.id)) return;
      hurtFoe(run, foe, shot.damage, shot.weapon, shot);
      shot.hitIds.push(foe.id);
      shot.pierce -= 1;
    });
    const inside = shot.x >= 0 && shot.y >= 0 && shot.x <= ARENA.width && shot.y <= ARENA.height;
    if (shot.life > 0 && shot.pierce > 0 && inside) kept.push(shot);
  }
  run.shots = kept;
}

function landDrops(run: Run, dt: number): void {
  run.drops = run.drops.filter((drop) => {
    drop.delay -= dt;
    if (drop.delay > 0) return true;
    grid.near(drop.x, drop.y, drop.radius, FOE_PAD, (foe) => {
      const damage = foe.boss && run.classId === "systems" ? drop.damage * SYSTEMS_RACK_BOSS_DAMAGE : drop.damage;
      hurtFoe(run, foe, damage, "serverRack");
    });
    addEffect(run, "blast", drop.x, drop.y, drop.radius, 0.35);
    return false;
  });
}

function moveFoeShots(run: Run, dt: number): void {
  const { hero } = run;
  // The Auditor's Red Pen: paperwork fades a shade faster, its level the depth of the ink.
  const pen = gearEffect(run, "redPen") > 0 ? 1 : 0;
  const fade = 1 + pen * 0.5;
  run.foeShots = run.foeShots.filter((shot) => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt * fade;
    if (shot.lob) {
      // A lob lands where it arrives: it hurts everything close there, and a coffee glob leaves a puddle.
      if (shot.life > 0) return true;
      const lob = shot.lob;
      addEffect(run, "blast", shot.x, shot.y, lob.splash, 0.35);
      if (Math.hypot(shot.x - hero.x, shot.y - hero.y) <= lob.splash + HERO_RADIUS) hurtHero(run, shot.damage, shot.from);
      if (lob.puddle) {
        run.hazards.push({ kind: "puddle", x: shot.x, y: shot.y, radius: lob.puddle, timer: 0, active: 0, life: COFFEE.puddle.life });
      }
      return false;
    }
    if (shot.arm !== undefined) shot.flown = (shot.flown ?? 0) + Math.hypot(shot.vx, shot.vy) * dt;
    if ((shot.flown ?? shot.arm ?? 0) >= (shot.arm ?? 0)) {
      if (Math.hypot(shot.x - hero.x, shot.y - hero.y) <= shot.radius + HERO_RADIUS) {
        hurtHero(run, shot.damage, shot.from);
        return false;
      }
    }
    return shot.life > 0 && shot.x >= 0 && shot.y >= 0 && shot.x <= ARENA.width && shot.y <= ARENA.height;
  });
}

// ---- Gems and levels ---------------------------------------------------------------------------------------------

function collectGems(run: Run, dt: number): void {
  const { hero } = run;
  run.gems = run.gems.filter((gem) => {
    const dx = hero.x - gem.x;
    const dy = hero.y - gem.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= HERO_RADIUS + GEM_RADIUS) {
      gainXp(run, gem.value);
      return false;
    }
    if (gem.pulled || distance <= run.numbers.magnet) {
      gem.pulled = true;
      const move = Math.min(distance, GEM_PULL * dt);
      gem.x += (dx / distance) * move;
      gem.y += (dy / distance) * move;
    }
    return true;
  });
}

function gainXp(run: Run, value: number): void {
  run.xp += value * run.numbers.xp;
  // The hero's own ladder, continued from the last day: a level is a level, wherever it was earned.
  while (run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level += 1;
    run.queuedPicks += 1;
  }
}

// ---- Effects -----------------------------------------------------------------------------------------------------

function addEffect(run: Run, kind: Effect["kind"], x: number, y: number, radius: number, life: number): void {
  run.effects.push({ kind, x, y, radius, age: 0, life });
}

function fadeEffects(run: Run, dt: number): void {
  run.effects = run.effects.filter((effect) => (effect.age += dt) < effect.life);
}
