import { describe, expect, it } from "vitest";

import { careerBuild, normalizeCareer } from "@/lib/hr/career";
import { CART, FLOOR_PLAN, FOES, PILOT_FLOORS, SPECIALIST, floorStage, xpToNext } from "@/lib/hr/sim/balance";
import { CLASS_CORE, CLASS_IDS, CLASSES, SHARED_PASSIVES, classPassive, classPassives, classWeapons, type ClassId } from "@/lib/hr/sim/classes";
import { PASSIVE_IDS, WEAPON_IDS } from "@/lib/hr/sim/balance";
import { createRun, descend, RUN_VERSION, step, STEP } from "@/lib/hr/sim/run";
import { possiblePicks } from "@/lib/hr/sim/picks";
import type { Foe, FoeKind, PassiveId, Pick, Run, Shot, WeaponId } from "@/lib/hr/sim/types";
import { normalizeRun } from "@/lib/hr/snapshot";
import { starters } from "@/lib/roster/generate";

const still = { dx: 0, dy: 0 };
const intern = starters()[0];
const newDay = (classId: ClassId = "systems") => createRun(intern, 11, 1, null, [], {}, classId);

function room(floor: number, classId: ClassId = "systems") {
  const run = newDay(classId);
  run.floor = floor;
  run.stage = floorStage(floor);
  run.weapons = [];
  // No random encounters: each test is about the floor's scripted behavior.
  run.spike = null;
  run.printerIn = 1e9;
  return run;
}

function foe(run: Run, kind: FoeKind, dx: number, dy: number, changes: Partial<Foe> = {}): Foe {
  const def = FOES[kind];
  return {
    ...def, id: run.nextId++, kind, x: run.hero.x + dx, y: run.hero.y + dy, maxHp: def.hp,
    speed: 0, touch: 0, xp: 0, gold: 0, timer: 1e9, cycles: 0, charge: 0, chargeX: 0, chargeY: 0,
    duckCooldown: 0, pushX: 0, pushY: 0, slow: 0, detained: 0, marked: 0, blinkCd: 0, shock: 0,
    enraged: false, hurt: 0, ...changes,
  };
}

function allowed(run: Run, offered: Pick[]) {
  for (const pick of offered) {
    if (pick.kind === "weapon") expect(classWeapons(run.classId!, "stickyNotes")).toContain(pick.id);
    if (pick.kind === "passive") expect(classPassives(run.classId!)).toContain(pick.id);
    if (pick.kind === "mutation") expect(run.weapons.some(({ id }) => id === pick.weapon)).toBe(true);
  }
}

function killBoss(run: Run) {
  const boss = foe(run, FLOOR_PLAN[run.floor - 1].boss, 120, 0, { hp: 0 });
  run.bossDone = true;
  run.bossId = boss.id;
  run.foes = [boss];
  step(run, still);
}

describe("HR classes", () => {
  it("splits the arsenal: every weapon and class passive belongs to exactly one class", () => {
    const weapons: WeaponId[] = [];
    const passives: PassiveId[] = [];
    for (const id of CLASS_IDS) {
      weapons.push(...CLASSES[id].weapons);
      passives.push(...CLASSES[id].passives);
    }
    expect(new Set(weapons).size).toBe(weapons.length);
    expect(new Set(passives).size).toBe(passives.length);
    // Sticky Notes are everyone's signature; the other six weapons and three passives are split once each.
    expect(weapons).toHaveLength(WEAPON_IDS.length - 1);
    expect(passives).toHaveLength(PASSIVE_IDS.length - SHARED_PASSIVES.length);
    for (const id of CLASS_IDS) expect(CLASS_CORE[id]).not.toBe("stickyNotes");
  });
  it.each(CLASS_IDS)("filters both XP and boss rewards for %s, with a new class weapon and an owned upgrade", (classId) => {
    const level = newDay(classId);
    level.gems.push({ id: 53, x: level.hero.x, y: level.hero.y, value: xpToNext(level.level) + 1, pulled: false });
    step(level, still);
    expect(level.picks).toContainEqual({ kind: "weapon", id: "stickyNotes", level: 2 });
    expect(level.picks).toContainEqual({ kind: "weapon", id: CLASS_CORE[classId], level: 1 });
    allowed(level, level.picks!);
    const floor = newDay(classId);
    killBoss(floor);
    expect(floor.cleared).toBe(true);
    expect(floor.picks?.length).toBeGreaterThanOrEqual(3);
    allowed(floor, floor.picks!);
  });

  it("keeps the archive and perks without equipping off-class items or exceeding slots", () => {
    const saved = normalizeCareer({ classId: "compliance", gold: 123, build: {
      weapons: { stickyNotes: 4, serverRack: 6, policyBinder: 3 },
      passives: { gym: 2, lanyard: 3, powerTie: 4, coffee: 2, sneakers: 1, mentor: 3 },
    } });
    const run = createRun({ ...intern, perks: ["mentorship", "gymPass"] }, 1, 1, null, [], saved.build, saved.classId);
    expect(run.weapons.map(({ id, level }) => [id, level])).toEqual([["stickyNotes", 4], ["policyBinder", 3]]);
    expect(run.passives).toEqual({ mentor: 3, gym: 2, coffee: 2, sneakers: 1 });
    expect(careerBuild(run, saved.build)).toEqual(saved.build);
    expect(normalizeCareer({ classId: "not-a-class" }).classId).toBeNull();
  });

  it("uses fallback rewards at capacity and doesn't add a reward screen to the final audit", () => {
    const run = newDay("compliance");
    run.weapons = classWeapons("compliance", "stickyNotes").map((id) => ({ id, level: 6, spin: 0, cooldownLeft: 0 }));
    run.passives = { gym: 5, mentor: 5, sneakers: 5, coffee: 5 };
    expect(possiblePicks(run)).toEqual([]);
    run.mutations = { stickyNotes: "tandem", policyBinder: "gravity" };
    killBoss(run);
    expect(run.picks).toEqual([{ kind: "heal" }, { kind: "gold" }]);
    const final = room(20);
    killBoss(final);
    expect(final.status).toBe("won");
    expect(final.picks).toBeNull();
  });

  it("Field Rep's cards steer toward threats in front without turning to foes behind", () => {
    const run = room(2, "fieldRep");
    run.weapons = [{ id: "businessCard", level: 1, cooldownLeft: 0, spin: 0 }];
    run.foes = [foe(run, "replyAll", -70, 0), foe(run, "replyAll", 100, 85)];
    step(run, still);
    expect(run.shots).toHaveLength(3);
    expect(run.shots.every((shot) => shot.vx > 0 && shot.pierce === 2)).toBe(true);
    expect(run.shots[1].vy).toBeGreaterThan(0);
  });

  it("Compliance can swat nearby straight shots with the Binder, not lobs or far shots", () => {
    const run = room(2, "compliance");
    run.weapons = [{ id: "policyBinder", level: 1, cooldownLeft: 0, spin: 0 }];
    const shot = { id: 80, from: "printerJam" as const, x: run.hero.x + 45, y: run.hero.y, vx: 30, vy: 0, radius: 4, damage: 7, life: 1 };
    run.foeShots = [shot, { ...shot, id: 81, x: shot.x + 180 }, { ...shot, id: 82, lob: { flight: 1, splash: 20 } }];
    step(run, still);
    expect(run.foeShots.map(({ id }) => id)).toEqual([81, 82]);
  });

  it("migrates a v12 suspended day without changing its pending offer, even if the pick isn't class gear", () => {
    const { classId: _, ...old } = newDay();
    old.version = 12;
    old.picks = [{ kind: "weapon", id: "rubberDuck", level: 1 }];
    const resumed = normalizeRun(JSON.parse(JSON.stringify(old)));
    expect(resumed).toEqual({ ...old, version: RUN_VERSION, classId: null });
    expect(normalizeRun({ ...old, version: RUN_VERSION, classId: "bad" })).toBeNull();
  });
});

describe("class days: crowded and staged floors", () => {
  it("keeps floor one intact, and turns density into more bodies rather than extra KPI or XP per second", () => {
    const legacy = createRun(intern, 11);
    const fresh = newDay();
    legacy.spawnDebt = fresh.spawnDebt = 1;
    step(legacy, still);
    step(fresh, still);
    expect(fresh.foes).toEqual(legacy.foes);

    const staged = room(15);
    const baseline = structuredClone(staged);
    baseline.classId = null;
    staged.waveBeat = 1; // the stage's specialist pack has already spawned
    staged.spawnDebt = baseline.spawnDebt = 0.98;
    staged.time = baseline.time = 13;
    step(staged, still);
    step(baseline, still);
    expect(baseline.foes).toHaveLength(1);
    expect(staged.spawnDebt).toBeGreaterThan(baseline.spawnDebt);
    expect(staged.foes[0].kpi).toBeCloseTo(1 / 1.55);
    const regular = FOES[staged.foes[0].kind].xp;
    expect(staged.foes[0].xp).toBeLessThanOrEqual(regular * 2 / 1.55);
  });

  it("adds the late mixed pack once, but not over a rush warning", () => {
    const run = room(18);
    run.time = 25;
    run.waveBeat = 1;
    run.spike = { kind: "rush", at: 26, span: 10 };
    step(run, still);
    expect(run.foes.some((enemy) => enemy.squad)).toBe(false);
    run.spike.done = true;
    step(run, still);
    expect(run.waveBeat).toBe(2);
    expect(run.foes.some((enemy) => enemy.kind === "rollingCart" && enemy.squad)).toBe(true);
    const count = run.foes.filter((enemy) => enemy.squad).length;
    step(run, still);
    expect(run.foes.filter((enemy) => enemy.squad)).toHaveLength(count);
  });

  it.each([5, 9, 13, 19])("plays three different beats on floor %i, advances early, and never packs the boss phase", (floor) => {
    const run = room(floor);
    step(run, still);
    expect(run.waveBeat).toBe(1);
    expect(run.foes.filter((enemy) => enemy.squad)).toHaveLength(6);
    run.foes = [];
    run.time = 8;
    step(run, still);
    expect(run.waveBeat).toBe(2);
    expect(run.foes.filter((enemy) => enemy.kind === SPECIALIST[run.stage].kind).length).toBe(SPECIALIST[run.stage].count);
    run.foes = [];
    run.time = 23;
    step(run, still);
    expect(run.waveBeat).toBe(3);
    expect(run.foes.some((enemy) => enemy.squad && enemy.kind === SPECIALIST[run.stage].kind)).toBe(true);
    run.foes = [];
    run.time = PILOT_FLOORS[floor]!.minimum;
    step(run, still);
    expect(run.bossDone).toBe(true);
    const boss = run.foes.find((enemy) => enemy.id === run.bossId)!;
    expect(boss.kind).toBe(FLOOR_PLAN[floor - 1].boss);
    expect(boss.maxHp).toBe(FLOOR_PLAN[floor - 1].bossHp);
    run.time = PILOT_FLOORS[floor]!.horde + 2;
    step(run, still);
    expect(run.foes.filter((enemy) => enemy.squad)).toHaveLength(0);
    run.cleared = true;
    expect(descend(run)).toBe(true);
    expect(run.waveBeat).toBeUndefined();
  });

  it("the cart locks its lane before charging and stops to recover", () => {
    const run = room(6);
    const cart = foe(run, "rollingCart", -150, 0, { timer: 0 });
    run.foes = [cart];
    step(run, still);
    expect(cart.windup?.angle).toBe(0);
    run.hero.y += 90;
    cart.windup!.left = STEP / 2;
    const before = cart.x;
    step(run, still);
    expect(cart.charge).toBeGreaterThan(0);
    expect(cart.x - before).toBeCloseTo(CART.speed * STEP);
    expect(cart.chargeY).toBe(0);
    expect(cart.recovery).toBeGreaterThan(CART.recovery);
  });

  it("a pilot boss gives a warning, attacks in the locked direction, and leaves a recovery opening", () => {
    const run = room(13);
    const boss = foe(run, "printerPrime", -180, 0, { timer: 0 });
    run.bossDone = true;
    run.bossId = boss.id;
    run.foes = [boss];
    step(run, still);
    expect(run.foeShots).toHaveLength(0);
    expect(boss.windup?.angle).toBe(0);
    run.hero.y += 120;
    boss.windup!.left = STEP / 2;
    step(run, still);
    expect(run.foeShots).toHaveLength(3);
    expect(run.foeShots[1].vy).toBeCloseTo(0);
    expect(boss.recovery).toBeGreaterThan(0);
  });

  it("drones repair ordinary allies, not bosses, other drones or dead foes", () => {
    const run = room(10);
    const drone = foe(run, "patchDrone", 20, 150, { timer: 0 });
    const ordinary = foe(run, "looseCable", 60, 160, { hp: 2 });
    const boss = foe(run, "vendingMachine", 70, 110, { hp: 2 });
    const otherDrone = foe(run, "patchDrone", -20, 160, { hp: 2 });
    const dead = foe(run, "looseCable", 5, 140, { hp: 0 });
    run.foes = [drone, ordinary, boss, otherDrone, dead];
    step(run, still);
    expect(ordinary.hp).toBeGreaterThan(2);
    expect(boss.hp).toBe(2);
    expect(otherDrone.hp).toBe(2);
    expect(dead.hp).toBe(0);
  });

  it("escorts block frontal shots, but not rear shots or area damage", () => {
    const damage = (from: number | null) => {
      const run = room(14);
      const escort = foe(run, "securityEscort", 130, 0, { hp: 100, maxHp: 100, guardAngle: 0 });
      run.foes = [escort];
      if (from === null) {
        run.drops = [{ id: run.nextId++, x: escort.x, y: escort.y, radius: 20, damage: 10, delay: 0 }];
      } else {
        const shot: Shot = { id: run.nextId++, weapon: "spreadsheet", x: escort.x + from * 3, y: escort.y, vx: -from * 180,
          vy: 0, radius: 3, damage: 10, life: 1, pierce: 1, targetId: 0, hitIds: [] };
        run.shots = [shot];
      }
      step(run, still);
      return 100 - escort.hp;
    };
    expect(damage(1)).toBeGreaterThan(0);
    expect(damage(1)).toBeLessThan(damage(-1));
    expect(damage(-1)).toBeCloseTo(damage(null));
  });
});
