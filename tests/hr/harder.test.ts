import { describe, expect, it } from "vitest";

import { CAMEO, ELITE, ENRAGE, FOES, MUTATIONS, PICKS_OFFERED, SPIKE, enrageFactor, floorStage, weaponNumbers } from "@/lib/hr/sim/balance";
import { createRun, descend, foeDamageFactor, step, STEP } from "@/lib/hr/sim/run";
import { applyPick } from "@/lib/hr/sim/picks";
import type { Foe, Run } from "@/lib/hr/sim/types";
import { difficultyFor, defaultCareer, normalizeCareer } from "@/lib/hr/career";
import { mergeKit, type ItemState } from "@/lib/hr/kit";
import { starters } from "@/lib/roster/generate";
import type { Coworker } from "@/lib/roster/types";

const [intern] = starters();
const plain: Coworker = { ...intern, quirks: [], stats: { grit: 10, output: 10, hustle: 10, focus: 10, luck: 10 } };

function foe(fields: Partial<Run["foes"][number]>): Run["foes"][number] {
  return {
    id: 0,
    kind: "replyAll",
    boss: false,
    elite: false,
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    radius: 8,
    speed: 0,
    touch: 0,
    xp: 0,
    gold: 0,
    pushX: 0,
    pushY: 0,
    slow: 0,
    timer: 0,
    cycles: 0,
    charge: 0,
    chargeX: 0,
    chargeY: 0,
    duckCooldown: 0,
    detained: 0,
    stuck: 0,
    marked: 0,
    blinkCd: 0,
    shock: 0,
    enraged: false,
    hurt: 0,
    ...fields,
  };
}

/** Puts a run on a given floor with its stage and hazards, boss out of the way, horde debt frozen. */
function floorScene(floor: number): Run {
  const run = createRun(plain, 77);
  run.floor = floor - 1;
  run.cleared = true;
  descend(run);
  run.spike = null;
  run.cameo = null;
  run.bossDone = true;
  return run;
}

describe("elites (P1)", () => {
  it("spawn by the act's share from the kitchen on, hit harder, and pay double", () => {
    const run = floorScene(7); // kitchen
    for (let ticks = 0; ticks < 60 * 40; ticks += 1) step(run, { dx: 0, dy: 0 });
    const elites = run.foes.filter((foe) => foe.elite);
    expect(elites.length).toBeGreaterThan(0);
    for (const elite of elites) {
      expect(elite.touch).toBeCloseTo(FOES[elite.kind].touch * ELITE.touch, 5);
      expect(elite.gold).toBeCloseTo(FOES[elite.kind].gold * ELITE.pay, 5);
    }
    expect(run.foes.some((foe) => !foe.elite)).toBe(true);
  });

  it("never spawn in the open space", () => {
    const run = floorScene(2); // open space
    for (let ticks = 0; ticks < 60 * 40; ticks += 1) step(run, { dx: 0, dy: 0 });
    expect(run.foes.some((foe) => foe.elite)).toBe(false);
  });

  it("take half the knockback of a swing", () => {
    const run = createRun(plain, 5);
    run.weapons = [{ id: "policyBinder", level: 1, cooldownLeft: 0, spin: 0 }];
    const plainFoe = foe({ id: 1, kind: "replyAll", x: run.hero.x + 30, y: run.hero.y, touch: 0, speed: 0, hp: 1e9, maxHp: 1e9, radius: 8 });
    const elite = foe({ id: 2, kind: "replyAll", elite: true, x: run.hero.x + 30, y: run.hero.y + 1, touch: 0, speed: 0, hp: 1e9, maxHp: 1e9, radius: 8 });
    run.foes = [plainFoe, elite];
    run.spawnDebt = -1e9;
    run.bossDone = true;
    step(run, { dx: 0, dy: 0 });
    expect(Math.abs(plainFoe.pushX)).toBeGreaterThan(0);
    expect(Math.abs(elite.pushX)).toBeLessThan(Math.abs(plainFoe.pushX));
  });
});

describe("the bosses' soft enrage (P1)", () => {
  it("climbs a quarter per half minute after 45 s, capped at double, and only for bosses", () => {
    expect(enrageFactor({ boss: true, age: 0 })).toBe(1);
    expect(enrageFactor({ boss: true, age: ENRAGE.after })).toBe(1);
    expect(enrageFactor({ boss: true, age: ENRAGE.after + 1 })).toBeCloseTo(1 + ENRAGE.gain, 5);
    expect(enrageFactor({ boss: true, age: ENRAGE.after + ENRAGE.step + 1 })).toBeCloseTo(1 + 2 * ENRAGE.gain, 5);
    expect(enrageFactor({ boss: true, age: 1000 })).toBe(ENRAGE.cap);
    expect(enrageFactor({ boss: false, age: 1000 })).toBe(1);
  });

  it("scales the boss's touch and its shots", () => {
    const early = createRun(plain, 9);
    const late = createRun(plain, 9);
    for (const run of [early, late]) {
      const boss = foe({ id: 9, kind: "middleManager", boss: true, x: run.hero.x, y: run.hero.y, touch: 10, hp: 1e9, maxHp: 1e9, timer: 999 });
      run.foes = [boss];
      run.bossId = boss.id;
      run.bossDone = true;
      run.spawnDebt = -1e9;
    }
    (late.foes[0] as Foe).age = ENRAGE.after + 1;
    for (let ticks = 0; ticks < 30; ticks += 1) {
      step(early, { dx: 0, dy: 0 });
      step(late, { dx: 0, dy: 0 });
    }
    const earlyLost = 100 - early.hero.hp;
    const lateLost = 100 - late.hero.hp;
    expect(lateLost).toBeGreaterThan(earlyLost);
    expect(lateLost / Math.max(earlyLost, 0.001)).toBeCloseTo(1 + ENRAGE.gain, 1);
  });
});

describe("pressure spikes (P2)", () => {
  it("warn the ambush ring, then close it around the hero", () => {
    const run = floorScene(2);
    run.spike = { kind: "ring", at: 1.0 };
    for (let ticks = 0; ticks < Math.ceil(SPIKE.ringWarn / STEP); ticks += 1) step(run, { dx: 0, dy: 0 });
    expect(run.spike?.armed).toBe(true);
    expect(run.effects.filter((effect) => effect.kind === "spikeWarn")).toHaveLength(SPIKE.ringCount);
    for (let ticks = 0; ticks < Math.ceil(1.0 / STEP) + 1; ticks += 1) step(run, { dx: 0, dy: 0 });
    expect(run.spike?.done).toBe(true);
    const ring = run.foes.filter((foe) => Math.hypot(foe.x - run.hero.x, foe.y - run.hero.y) > SPIKE.ringRadius * 0.6);
    expect(ring.length).toBeGreaterThanOrEqual(SPIKE.ringCount - 2);
  });

  it("multiply the horde's spawns for the rush's span", () => {
    const rushed = floorScene(2);
    rushed.hero.hp = 1e9;
    rushed.spike = { kind: "rush", at: 0.5, span: 3 };
    const calm = floorScene(2);
    calm.hero.hp = 1e9;
    calm.spike = null;
    for (let ticks = 0; ticks < 60 * 4; ticks += 1) {
      step(rushed, { dx: 0, dy: 0 });
      step(calm, { dx: 0, dy: 0 });
    }
    expect(rushed.foes.length).toBeGreaterThan(calm.foes.length * 1.5);
    expect(rushed.spike?.done).toBe(true);
  });

  it("stay out of interviews and floor 1", () => {
    const run = createRun(plain, 3, 1, { boss: "teamLead", candidateId: 2 });
    expect(run.spike).toBe(null);
    const first = createRun(plain, 3);
    expect(first.spike).toBe(null);
    expect(first.cameo).toBe(null);
  });
});

describe("cameo guests (P3)", () => {
  it("the retired senior adds a choice to the cleared floor's offer", () => {
    const run = floorScene(3);
    run.cameo = { kind: "senior" };
    const boss = foe({ id: 20, kind: "middleManager", boss: true, x: run.hero.x, y: run.hero.y, hp: 1, maxHp: 1, touch: 0, speed: 0, timer: 999 });
    run.foes = [boss];
    run.bossId = boss.id;
    for (let ticks = 0; ticks < 30 && !run.cleared; ticks += 1) step(run, { dx: 0, dy: 0 });
    expect(run.cleared).toBe(true);
    expect((run.picks?.length ?? 0)).toBeGreaterThanOrEqual(PICKS_OFFERED + 1);
  });

  it("the rival intern pays gold for the KPI, and taunts otherwise", () => {
    const wonRun = floorScene(3);
    wonRun.cameo = { kind: "rival", kills0: 0, target: 5 };
    wonRun.kills = 10;
    const boss = foe({ id: 21, kind: "middleManager", boss: true, x: wonRun.hero.x, y: wonRun.hero.y, hp: 1, maxHp: 1, touch: 0, speed: 0, timer: 999 });
    wonRun.foes = [boss];
    wonRun.bossId = boss.id;
    const before = wonRun.gold;
    for (let ticks = 0; ticks < 30 && !wonRun.cameo.done; ticks += 1) step(wonRun, { dx: 0, dy: 0 });
    expect(wonRun.cameo?.done).toBe(true);
    expect(wonRun.cameo?.won).toBe(true);
    expect(wonRun.gold).toBeGreaterThan(before);

    const lostRun = floorScene(3);
    lostRun.cameo = { kind: "rival", kills0: 0, target: 50 };
    lostRun.kills = 10;
    const boss2 = foe({ id: 22, kind: "middleManager", boss: true, x: lostRun.hero.x, y: lostRun.hero.y, hp: 1, maxHp: 1, touch: 0, speed: 0, timer: 999 });
    lostRun.foes = [boss2];
    lostRun.bossId = boss2.id;
    for (let ticks = 0; ticks < 30 && !lostRun.cameo.done; ticks += 1) step(lostRun, { dx: 0, dy: 0 });
    expect(lostRun.cameo?.won).toBe(false);
    expect(lostRun.gold).toBe(before);
  });
});

describe("the hammers (P3)", () => {
  it("bend the weapon's numbers per mutation", () => {
    const base = weaponNumbers("stickyNotes", 1);
    const tandem = weaponNumbers("stickyNotes", 1, "tandem");
    expect(tandem.count).toBe(base.count + 2);
    expect(tandem.damage).toBeCloseTo(base.damage * 0.75, 5);
    const rack = weaponNumbers("serverRack", 2, "overclocked");
    expect(rack.radius).toBeGreaterThan(weaponNumbers("serverRack", 2).radius);
    expect(rack.cooldown).toBeLessThan(weaponNumbers("serverRack", 2).cooldown);
    expect(Object.keys(MUTATIONS)).toHaveLength(7);
  });

  it("gravity pulls instead of shoving", () => {
    const swing = (mutation?: "gravity") => {
      const run = createRun(plain, 11);
      if (mutation) run.mutations = { policyBinder: mutation };
      run.weapons = [{ id: "policyBinder", level: 1, cooldownLeft: 0, spin: 0 }];
      const target = foe({ id: 1, kind: "replyAll", x: run.hero.x + 30, y: run.hero.y, touch: 0, speed: 0, hp: 1e9, maxHp: 1e9, radius: 8 });
      run.foes = [target];
      run.spawnDebt = -1e9;
      run.bossDone = true;
      step(run, { dx: 0, dy: 0 });
      return target;
    };
    const shoved = swing();
    const pulled = swing("gravity");
    expect(shoved.pushX).toBeGreaterThan(0);
    expect(pulled.pushX).toBeLessThan(0);
  });

  it("join the run only through the pick, per-run", () => {
    const run = createRun(plain, 13);
    expect(run.mutations).toEqual({});
    applyPick(run, { kind: "mutation", weapon: "stickyNotes", mutation: MUTATIONS.stickyNotes });
    expect(run.mutations?.stickyNotes).toBe("tandem");
  });
});

describe("the slump mercy (P1)", () => {
  it("eases the difficulty per lost day in a row, capped", () => {
    const none = difficultyFor(12);
    const some = difficultyFor(12, "common", [], 2);
    const capped = difficultyFor(12, "common", [], 9);
    expect(some).toBeCloseTo(none - 0.2, 5);
    expect(capped).toBeCloseTo(none - 0.3, 5);
    expect(difficultyFor(1)).toBeGreaterThan(0.7);
  });

  it("survives the save repair, and a career starts at none", () => {
    expect(defaultCareer().slump).toBe(0);
    expect(normalizeCareer({ focusId: 1, owned: [1], gold: 5, slump: 2 }).slump).toBe(2);
    expect(normalizeCareer({ focusId: 1, owned: [1], gold: 5 }).slump).toBe(0);
    expect(normalizeCareer({ focusId: 1, slump: -3 }).slump).toBe(0);
  });
});

describe("the keepsake swap (P3)", () => {
  const kit: ItemState[] = [
    { id: "shredderGuard", level: 1, floor: 4 },
    { id: "goldenBadge", level: 2, floor: 8 },
    { id: "redPen", level: 3, floor: 13 },
  ];
  const found: ItemState[] = [{ id: "cableUntangler", level: 1, floor: 9 }];

  it("lets the player choose what the new relic replaces", () => {
    const merge = mergeKit(kit, found, false, "goldenBadge");
    expect(merge.kit.map((item) => item.id)).toEqual(["shredderGuard", "redPen", "cableUntangler"]);
    expect(merge.scrapped.map((item) => item.id)).toEqual(["goldenBadge"]);
    expect(merge.gold).toBeGreaterThan(0);
  });

  it("falls back to the oldest when the player leaves it to the desk", () => {
    const merge = mergeKit(kit, found, false);
    expect(merge.kit.map((item) => item.id)).toEqual(["goldenBadge", "redPen", "cableUntangler"]);
    expect(merge.scrapped.map((item) => item.id)).toEqual(["shredderGuard"]);
  });

  it("still honours the swap on a won day", () => {
    const merge = mergeKit(kit, found, true, "shredderGuard");
    expect(merge.kit.map((item) => item.id)).toEqual(["goldenBadge", "redPen", "cableUntangler"]);
    // The carried items level up; the fresh find joins at its own level.
    expect(merge.kit.find((item) => item.id === "goldenBadge")?.level).toBe(3);
    expect(merge.kit.find((item) => item.id === "cableUntangler")?.level).toBe(1);
  });
});

describe("interview lethality (P0)", () => {
  it("takes half the factor, like the interview's difficulty does", () => {
    const day = createRun(plain, 17, 2);
    const interview = createRun(plain, 17, 2, { boss: "teamLead", candidateId: 2 });
    const full = 1.18 + 0.15 * (2 - 1);
    expect(foeDamageFactor(day)).toBeCloseTo(full, 5);
    expect(foeDamageFactor(interview)).toBeCloseTo(1 + (full - 1) / 2, 5);
  });
});

describe("floor seeding (P2)", () => {
  it("gives every descended floor a spike and a cameo verdict, deterministic per seed", () => {
    const run = floorScene(3);
    expect(run.spike).not.toBeUndefined();
    expect(run.cameo).not.toBeUndefined();
    const again = floorScene(3);
    expect(again.spike).toEqual(run.spike);
    expect(again.cameo).toEqual(run.cameo);
    expect(run.stage).toBe(floorStage(3));
  });

  it("respects the cameo's daily cap", () => {
    expect(CAMEO.cap).toBe(2);
    expect(SPIKE.from).toBe(2);
  });
});
