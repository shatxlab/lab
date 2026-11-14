import { describe, expect, it } from "vitest";

import { FOES, FLOOR_PLAN, INTERVIEW, KITCHEN, LAST_FLOOR, PICKS_OFFERED, PING, SECOND_WIND, SERVER_ROOM, STAGES, HERO_BASE, MAX_FOES, MAX_GEMS, MAX_SHOTS, floorStage, xpToNext } from "@/lib/hr/sim/balance";
import { abandon, choose, createRun, descend, step } from "@/lib/hr/sim/run";
import type { Input, Run } from "@/lib/hr/sim/types";
import { starters } from "@/lib/roster/generate";
import type { Coworker } from "@/lib/roster/types";

const [intern, accountant] = starters();

/** A plain coworker: every stat 10, no quirks, so the run plays on the base numbers. */
const plain: Coworker = { ...intern, quirks: [], stats: { grit: 10, output: 10, hustle: 10, focus: 10, luck: 10 } };

/** Walks a slow circle and always takes the first pick. */
function play(run: Run, seconds: number): void {
  let tick = 0;
  while (run.status === "playing" && run.time < seconds) {
    if (run.picks) {
      choose(run, 0);
      continue;
    }
    const angle = (tick / 60) * 0.3;
    const input: Input = { dx: Math.cos(angle), dy: Math.sin(angle) };
    step(run, input);
    tick += 1;
  }
}

describe("createRun", () => {
  it("starts with the department's weapon and the coworker's numbers", () => {
    expect(createRun(intern, 1).weapons.map((weapon) => weapon.id)).toEqual(["stickyNotes"]);
    expect(createRun(accountant, 1).weapons.map((weapon) => weapon.id)).toEqual(["spreadsheet"]);
    const run = createRun(plain, 1);
    expect(run.numbers).toEqual(HERO_BASE);
    expect(run.hero.hp).toBe(HERO_BASE.maxHp);
  });
});

describe("step", () => {
  it("replays exactly from the seed and the inputs", () => {
    const a = createRun(intern, 7);
    const b = createRun(intern, 7);
    play(a, 60);
    play(b, 60);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.kills).toBeGreaterThan(0);
  });

  it("carries on the same after a trip through JSON", () => {
    const run = createRun(accountant, 3);
    play(run, 45);
    const copy = JSON.parse(JSON.stringify(run)) as Run;
    play(run, 90);
    play(copy, 90);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(run));
  });

  // Bosses and printers are placed past the foe cap, so it may be passed by a few.
  it("keeps foes, shots and gems under their caps", () => {
    const run = createRun(accountant, 5);
    let tick = 0;
    while (run.status === "playing" && run.time < 200) {
      if (run.picks) choose(run, 0);
      else {
        step(run, { dx: Math.cos(tick / 200), dy: Math.sin(tick / 200) });
        tick += 1;
      }
      expect(run.foes.length).toBeLessThanOrEqual(MAX_FOES + 3);
      expect(run.shots.length).toBeLessThanOrEqual(MAX_SHOTS);
      expect(run.gems.length).toBeLessThanOrEqual(MAX_GEMS);
    }
  });

  it("is lost standing still, sooner or later", () => {
    const run = createRun(plain, 2);
    while (run.status === "playing") {
      if (run.picks) choose(run, 0);
      else step(run, { dx: 0, dy: 0 });
    }
    expect(run.status).toBe("lost");
    expect(run.hero.hp).toBe(0);
    expect(run.lastHitBy).not.toBeNull();
    expect(Object.values(run.takenFrom).reduce((sum, damage) => sum + damage, 0)).toBeGreaterThanOrEqual(HERO_BASE.maxHp);
  });

  it("is won when the audit's auditor falls on the last floor", () => {
    const run = createRun(plain, 4);
    run.floor = LAST_FLOOR;
    run.bossId = 999;
    step(run, { dx: 0, dy: 0 });
    run.foes.push(foe({ id: 999, kind: "auditor", boss: true, hp: 0, gold: FOES.auditor.gold, x: 100, y: 100 }));
    step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("won");
    expect(run.gold).toBeGreaterThanOrEqual(FOES.auditor.gold);
  });

  it("is never lost to the clock: a day only ends on the floor", () => {
    const run = createRun(plain, 4);
    run.time = 10_000;
    step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("playing");
  });
});

describe("level-ups", () => {
  it("stop the clock until a pick is taken, and offer every owed level in turn", () => {
    const run = createRun(plain, 9);
    run.gems.push({ id: 900, x: run.hero.x, y: run.hero.y, value: xpToNext(1) + xpToNext(2), pulled: false });
    step(run, { dx: 0, dy: 0 });
    expect(run.level).toBe(3);
    expect(run.picks).toHaveLength(3);
    const time = run.time;
    step(run, { dx: 1, dy: 0 });
    expect(run.time).toBe(time);
    expect(choose(run, 0)).toBe(true);
    expect(run.picks).toHaveLength(3);
    expect(choose(run, 1)).toBe(true);
    expect(run.picks).toBeNull();
    expect(choose(run, 0)).toBe(false);
  });
});

describe("the floor plan", () => {
  it("has thirteen floors, each a stage and a boss, and the audit last", () => {
    expect(FLOOR_PLAN).toHaveLength(LAST_FLOOR);
    expect(FLOOR_PLAN[LAST_FLOOR - 1].boss).toBe("auditor");
    expect(floorStage(1)).toBe("openSpace");
    expect(floorStage(5)).toBe("kitchen");
    expect(floorStage(9)).toBe("serverRoom");
    expect(floorStage(LAST_FLOOR)).toBe("openSpace");
    for (let floor = 1; floor <= LAST_FLOOR; floor += 1) {
      expect(floorStage(floor)).toBe(FLOOR_PLAN[floor - 1].stage);
      expect(FLOOR_PLAN[floor - 1].bossHp).toBeGreaterThan(0);
      expect(FLOOR_PLAN[floor - 1].horde).toBeGreaterThan(0);
    }
  });

  it("walks floor 1's boss in after the horde, and reserves its kind for the boss", () => {
    const run = createRun(plain, 11);
    const plan = FLOOR_PLAN[0];
    run.time = plan.horde - 1;
    play(run, plan.horde + 1);
    const boss = run.foes.find((foe) => foe.id === run.bossId);
    expect(boss).toMatchObject({ kind: plan.boss, boss: true });
    expect(boss?.maxHp).toBeCloseTo(plan.bossHp);
    expect(run.foes.filter((foe) => foe.kind === plan.boss)).toHaveLength(1);
  });

  it("clears the floor when its boss falls: gems go to the hero, a pick is offered, the stairs wait", () => {
    const run = createRun(plain, 12);
    const plan = FLOOR_PLAN[0];
    run.time = plan.horde - 1;
    play(run, plan.horde + 1);
    const boss = run.foes.find((foe) => foe.id === run.bossId)!;
    // Only the boss on the field, and nothing it drops, so the vacuum's totals are exact.
    run.foes = [boss];
    boss.xp = 0;
    boss.gold = 0;
    // Exactly one level's worth minus what the hero already holds, plus 5, so the totals are exact.
    const value = xpToNext(run.level) - run.xp + 5;
    run.gems = [{ id: 900, x: run.hero.x, y: run.hero.y, value, pulled: false }];
    const level = run.level;
    boss.hp = 0;
    step(run, { dx: 0, dy: 0 });
    expect(run.cleared).toBe(true);
    expect(run.floorsCleared).toBe(1);
    expect(run.picks).not.toBeNull();
    // The fallen gem is a level and 5 xp; the hero's own numbers are plain, so nothing multiplies it.
    expect(run.level).toBe(level + 1);
    expect(run.xp).toBe(5);
    expect(run.status).toBe("playing");
    const time = run.time;
    step(run, { dx: 1, dy: 0 });
    expect(run.time).toBe(time);
    choose(run, 0);
    expect(descend(run)).toBe(true);
    expect(run).toMatchObject({ floor: 2, cleared: false, bossId: null, bossDone: false });
    expect(run.foes).toEqual([]);
  });

  it("wins the day on the last floor's boss and not before", () => {
    const run = createRun(plain, 13);
    run.floor = LAST_FLOOR - 1;
    run.cleared = true;
    descend(run);
    expect(run).toMatchObject({ floor: LAST_FLOOR, stage: "openSpace" });
    const plan = FLOOR_PLAN[LAST_FLOOR - 1];
    run.time += plan.horde;
    play(run, run.time + 2);
    const boss = run.foes.find((foe) => foe.id === run.bossId)!;
    boss.hp = 0;
    step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("won");
    expect(run.cleared).toBe(false);
  });
});

describe("abandon", () => {
  it("ends the run as a fall", () => {
    const run = createRun(plain, 1);
    abandon(run);
    expect(run).toMatchObject({ status: "lost", abandoned: true });
  });
});

/** A foe with every field filled in. */
function foe(fields: Partial<Run["foes"][number]>): Run["foes"][number] {
  return {
    id: 0,
    kind: "replyAll",
    boss: false,
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
    hurt: 0,
    ...fields,
  };
}

describe("an interview", () => {
  const interview = { boss: "hrManager", candidateId: 9 } as const;

  it("brings the boss in at once, and none of the day's bosses or printers", () => {
    const run = createRun(plain, 1, 1, interview);
    play(run, INTERVIEW.bossAt + 20);
    expect(run.foes.some((foe) => foe.kind === "hrManager")).toBe(true);
    expect(run.foes.some((foe) => ["middleManager", "auditor", "printerJam"].includes(foe.kind))).toBe(false);
  });

  it("is won by beating the boss, not the auditor", () => {
    const run = createRun(plain, 1, 1, interview);
    play(run, INTERVIEW.bossAt + 1);
    for (const foe of run.foes) if (foe.kind === "hrManager") foe.hp = 0;
    step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("won");
  });

  it("is lost when its time runs out with the boss still standing", () => {
    // A boss nobody can beat and a hero who cannot fall, joined just before the interview closes.
    const run = createRun(plain, 1, 1e6, interview);
    run.hero.hp = run.numbers.maxHp = 1e12;
    play(run, INTERVIEW.bossAt + 1);
    expect(run.status).toBe("playing");
    run.time = INTERVIEW.closesAt - 0.5;
    play(run, INTERVIEW.closesAt + 1);
    expect(run.status).toBe("lost");
    expect(run.time).toBeGreaterThanOrEqual(INTERVIEW.closesAt);
  });

  it("makes foes tougher with the difficulty, the boss included", () => {
    const hard = createRun(plain, 1, 2, interview);
    const easy = createRun(plain, 1, 1, interview);
    play(hard, INTERVIEW.bossAt + 1);
    play(easy, INTERVIEW.bossAt + 1);
    const hp = (run: Run) => run.foes.find((foe) => foe.kind === "hrManager")!.maxHp;
    expect(hp(hard)).toBeCloseTo(hp(easy) * 2);
  });
});

describe("the kitchen", () => {
  /** Floor 5, reached by descending from a cleared floor 4. */
  const kitchen = () => {
    const run = createRun(plain, 3);
    run.floor = 4;
    run.cleared = true;
    descend(run);
    return run;
  };

  it("is laid out from the seed: spills clear of the start, and microwaves in corners", () => {
    const run = kitchen();
    expect(run).toMatchObject({ floor: 5, stage: "kitchen" });
    const spills = run.hazards.filter((hazard) => hazard.kind === "spill");
    expect(spills).toHaveLength(KITCHEN.spills);
    expect(run.hazards.filter((hazard) => hazard.kind === "microwave")).toHaveLength(KITCHEN.microwaves);
    for (const spill of spills) expect(Math.hypot(spill.x - run.hero.x, spill.y - run.hero.y)).toBeGreaterThanOrEqual(KITCHEN.clearRadius);
    expect(kitchen().hazards).toEqual(run.hazards);
    expect(createRun(plain, 3).hazards).toEqual([]);
  });

  it("slows the hero in a spill, and only there", () => {
    const run = kitchen();
    const spill = run.hazards.find((hazard) => hazard.kind === "spill")!;
    run.hazards = [spill];
    run.hero.x = spill.x;
    run.hero.y = spill.y;
    step(run, { dx: 1, dy: 0 });
    const slowed = run.hero.x - spill.x;
    run.hero.x = 700;
    run.hero.y = 700;
    run.hazards = [];
    step(run, { dx: 1, dy: 0 });
    expect(slowed).toBeCloseTo((run.hero.x - 700) * (1 - KITCHEN.spillSlow), 5);
  });

  it("fires a ring from each microwave on its timer", () => {
    const run = kitchen();
    run.hazards = run.hazards.filter((hazard) => hazard.kind === "microwave").slice(0, 1);
    run.hazards[0].timer = 0.01;
    step(run, { dx: 0, dy: 0 });
    step(run, { dx: 0, dy: 0 });
    expect(run.foeShots.filter((shot) => shot.from === "microwave")).toHaveLength(KITCHEN.ring);
    expect(run.hazards[0].timer).toBeGreaterThan(KITCHEN.microwaveEvery - 1);
  });

  it("brings its own boss after the horde, and pays more gold", () => {
    const run = kitchen();
    run.time = FLOOR_PLAN[4].horde - 1;
    play(run, FLOOR_PLAN[4].horde + 1);
    const monitor = run.foes.find((foe) => foe.kind === "lunchMonitor");
    expect(monitor?.boss).toBe(true);
    expect(run.bossId).toBe(monitor?.id);
    expect(run.foes.some((foe) => foe.kind === "middleManager")).toBe(false);
    expect(STAGES.kitchen.gold).toBeGreaterThan(1);
  });

  it("is not where an interview is held", () => {
    expect(createRun(plain, 1, 1, { boss: "recruiter", candidateId: 4 })).toMatchObject({ stage: "openSpace", floor: 1, hazards: [] });
  });

  it("is reached only by taking the stairs from a cleared floor", () => {
    const run = createRun(plain, 3);
    run.floor = 4;
    expect(descend(run)).toBe(false);
    run.cleared = true;
    expect(descend(run)).toBe(true);
    expect(run).toMatchObject({ floor: 5, stage: "kitchen", cleared: false, bossId: null, bossDone: false });
    expect(run.foes).toEqual([]);
  });
});

describe("perks in a run", () => {
  const withPerks = (...perks: Coworker["perks"]) => createRun({ ...plain, perks }, 5);

  it("start the run with a passive: coffee, gym, sneakers or mentor", () => {
    expect(withPerks("coffeeRun").passives).toEqual({ coffee: 1 });
    expect(withPerks("coffeeRun").numbers.cooldown).toBeLessThan(HERO_BASE.cooldown);
    expect(withPerks("freshSneakers").numbers.speed).toBeGreaterThan(HERO_BASE.speed);
    expect(withPerks("mentorship").numbers.xp).toBeGreaterThan(1);
    const gym = withPerks("gymPass");
    expect(gym.numbers.maxHp).toBeGreaterThan(HERO_BASE.maxHp);
    expect(gym.hero.hp).toBe(gym.numbers.maxHp);
  });

  it("raise the signature weapon with overtime, and the offers with the corner office", () => {
    expect(withPerks("overtime").weapons[0].level).toBe(2);
    expect(withPerks().weapons[0].level).toBe(1);
    const run = withPerks("cornerOffice");
    run.queuedPicks = 1;
    run.xp = xpToNext(1);
    run.gems.push({ id: 900, x: run.hero.x, y: run.hero.y, value: 5000, pulled: false });
    step(run, { dx: 0, dy: 0 });
    expect(run.picks).toHaveLength(PICKS_OFFERED + 1);
  });

  it("let the hero get up once, with a few seconds of grace, with the second wind", () => {
    const run = withPerks("secondWind");
    run.hero.hp = 0.001;
    // A foe too tough for the hero's weapons to clear before it touches them.
    run.foes.push({ id: 999, kind: "replyAll", boss: false, x: run.hero.x, y: run.hero.y, hp: 1e9, maxHp: 1e9, radius: 8, speed: 0, touch: 1e6, xp: 0, gold: 0, pushX: 0, pushY: 0, slow: 0, timer: 0, cycles: 0, charge: 0, chargeX: 0, chargeY: 0, duckCooldown: 0, hurt: 0 });
    step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("playing");
    expect(run.revive).toBe(false);
    expect(run.hero.hp).toBeGreaterThan(run.numbers.maxHp * (SECOND_WIND.hp - 0.05));
    for (let tick = 0; tick < 60; tick += 1) step(run, { dx: 0, dy: 0 });
    expect(run.status).toBe("playing");
    expect(run.hero.hp).toBeGreaterThan(run.numbers.maxHp * (SECOND_WIND.hp - 0.05));
  });
});

describe("the server room", () => {
  /** Floor 9, reached by descending from a cleared floor 8. */
  const room = () => {
    const run = createRun(plain, 4);
    run.floor = 8;
    run.cleared = true;
    descend(run);
    return run;
  };
  const stand = (run: Run, vent: Run["hazards"][number]) => {
    run.hazards = [vent];
    run.hero.x = vent.x;
    run.hero.y = vent.y;
  };

  it("is laid out from the seed: vents clear of the start, quiet to begin with and staggered", () => {
    const run = room();
    expect(run.hazards).toHaveLength(SERVER_ROOM.vents);
    for (const vent of run.hazards) {
      expect(vent.kind).toBe("vent");
      expect(vent.active).toBe(0);
      expect(Math.hypot(vent.x - run.hero.x, vent.y - run.hero.y)).toBeGreaterThanOrEqual(SERVER_ROOM.clearRadius);
    }
    expect(new Set(run.hazards.map((vent) => vent.timer)).size).toBe(SERVER_ROOM.vents);
    expect(room().hazards).toEqual(run.hazards);
  });

  it("blasts after its timer, for its burst, then goes quiet", () => {
    const run = room();
    const vent = run.hazards[0];
    run.hazards = [vent];
    vent.timer = 0.02;
    run.hero.x = 20;
    run.hero.y = 20;
    for (let tick = 0; tick < 3; tick += 1) step(run, { dx: 0, dy: 0 });
    expect(vent.active).toBeGreaterThan(0);
    expect(vent.timer).toBeGreaterThan(SERVER_ROOM.every - 1);
    for (let tick = 0; tick < Math.ceil(SERVER_ROOM.burst * 60) + 2; tick += 1) step(run, { dx: 0, dy: 0 });
    expect(vent.active).toBe(0);
  });

  it("hurts the hero standing in a blast, and only then", () => {
    const run = room();
    const vent = { ...run.hazards[0], timer: 50, active: 0.5 };
    stand(run, vent);
    run.foes = [];
    const before = run.hero.hp;
    step(run, { dx: 0, dy: 0 });
    expect(before - run.hero.hp).toBeGreaterThan(0);
    expect(run.lastHitBy).toBe("vent");
    vent.active = 0;
    const quiet = run.hero.hp;
    step(run, { dx: 0, dy: 0 });
    expect(run.hero.hp).toBe(quiet);
  });

  it("brings the sysadmin, who sends fans of pings", () => {
    // Floor 10 is the plan's second server-room floor, and its boss is the sysadmin.
    const run = room();
    run.cleared = true;
    descend(run);
    expect(run).toMatchObject({ floor: 10, stage: "serverRoom" });
    run.time = FLOOR_PLAN[9].horde - 1;
    play(run, FLOOR_PLAN[9].horde + 1);
    const admin = run.foes.find((foe) => foe.kind === "sysadmin");
    expect(admin).toBeDefined();
    expect(run.foes.some((foe) => foe.kind === "middleManager" || foe.kind === "lunchMonitor")).toBe(false);
    const shots = run.foeShots.filter((shot) => shot.from === "sysadmin").length;
    expect(shots % PING.fan).toBe(0);
    expect(STAGES.serverRoom.gold).toBeGreaterThan(STAGES.kitchen.gold);
  });
});
