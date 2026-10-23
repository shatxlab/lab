import { describe, expect, it } from "vitest";

import { BASE, ENEMIES, TOWER, WALL_HP } from "@/lib/tower/sim/balance";
import { aimAt, castVolley, chooseUpgrade, createRun, giveUp, holdFire, stats, step, STEP } from "@/lib/tower/sim/run";
import { towerStats } from "@/lib/tower/sim/stats";
import { emptyPerks, emptyUpgrades } from "@/lib/tower/sim/upgrades";
import type { Enemy, EnemyKind, Run, UpgradeId } from "@/lib/tower/sim/types";

function enemyAt(run: Run, x: number, y: number, kind: EnemyKind = "grunt", overrides: Partial<Enemy> = {}): Enemy {
  const def = ENEMIES[kind];
  const enemy: Enemy = {
    id: run.nextId++,
    kind,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    speed: def.speed,
    flying: def.flying,
    damage: def.damage,
    attackEvery: def.attackEvery,
    attackTimer: def.attackEvery / 2,
    burnLeft: 0,
    burnDps: 0,
    slowLeft: 0,
    slow: 0,
    summonTimer: 99,
    flash: 0,
    phase: 0,
    ...overrides,
  };
  run.enemies.push(enemy);
  return enemy;
}

function runFor(run: Run, seconds: number): void {
  for (let tick = 0; tick < seconds / STEP; tick += 1) step(run, STEP);
}

/** A run with the first wave's schedule emptied, so a test controls every enemy. */
function quietRun(seed = 1): Run {
  const run = createRun(seed);
  run.spawns = [];
  return run;
}

/** Get `run` to the upgrade picker offering `id`. */
function offer(run: Run, id: UpgradeId): void {
  run.phase = "choosing";
  run.picksLeft = 1;
  run.choices = [id];
}

describe("createRun", () => {
  it("starts wave 1 at full health", () => {
    const run = createRun(5);
    expect(run.phase).toBe("playing");
    expect(run.wave).toBe(1);
    expect(run.hp).toBe(BASE.maxHp);
    expect(run.spawns.length).toBeGreaterThan(0);
  });

  it("opens on the upgrade picker with a head start", () => {
    const run = createRun(5, { ...emptyPerks(), headStart: 2 });
    expect(run.phase).toBe("choosing");
    expect(run.wave).toBe(0);
    expect(run.picksLeft).toBe(2);
    expect(new Set(run.choices).size).toBe(3);
    chooseUpgrade(run, run.choices[0]);
    expect(run.phase).toBe("choosing");
    chooseUpgrade(run, run.choices[0]);
    expect(run.phase).toBe("playing");
    expect(run.wave).toBe(1);
  });
});

describe("step", () => {
  it("shoots down an enemy it's aimed at, clears the wave and offers upgrades", () => {
    const run = quietRun();
    enemyAt(run, TOWER.x, TOWER.y - 120);
    aimAt(run, TOWER.x, TOWER.y - 50);
    runFor(run, 5);
    expect(run.kills).toBe(1);
    expect(run.phase).toBe("choosing");
    expect(run.choices).toHaveLength(3);
    expect(run.gold).toBe(ENEMIES.grunt.gold + 2);
  });

  it("only shoots while the player holds, and only as far as the bow reaches", () => {
    const run = quietRun();
    const far = enemyAt(run, TOWER.x, TOWER.y - 300, "grunt", { speed: 0 });
    runFor(run, 1);
    expect(run.arrows).toHaveLength(0);
    aimAt(run, far.x, far.y);
    runFor(run, 2);
    expect(run.arrows.length).toBeGreaterThan(0);
    expect(far.hp).toBe(far.maxHp);
    holdFire(run);
    runFor(run, 1);
    expect(run.arrows).toHaveLength(0);
  });

  it("shoots along the aim and fans multishot out around it", () => {
    const run = quietRun();
    enemyAt(run, TOWER.x, 10, "grunt", { speed: 0 });
    run.upgrades.multishot = 2;
    aimAt(run, TOWER.x + 100, TOWER.y);
    step(run, STEP);
    const angles = run.arrows.map((arrow) => Math.atan2(arrow.vy, arrow.vx)).sort((a, b) => a - b);
    expect(angles).toHaveLength(3);
    expect(angles[1]).toBeCloseTo(0);
    expect(angles[0]).toBeCloseTo(-angles[2]);
    expect(angles[2]).toBeGreaterThan(0);
  });

  it("lets enemies at the wall wear it down until the run ends", () => {
    const run = quietRun();
    run.reloadLeft = Infinity;
    enemyAt(run, TOWER.x + 60, TOWER.y, "brute");
    runFor(run, 4);
    expect(run.hp).toBeLessThan(BASE.maxHp);
    runFor(run, 60);
    expect(run.phase).toBe("over");
    expect(run.hp).toBe(0);
    const frozen = JSON.stringify(run);
    step(run, STEP);
    expect(JSON.stringify(run)).toBe(frozen);
  });

  it("repairs the wall with masons", () => {
    const run = quietRun();
    run.upgrades.regen = 2;
    run.hp = 50;
    enemyAt(run, TOWER.x, TOWER.y - 300, "grunt", { speed: 0 });
    runFor(run, 1);
    expect(run.hp).toBeCloseTo(52, 1);
  });

  it("sets enemies burning and slows them with frost", () => {
    const run = quietRun();
    run.upgrades.fire = 1;
    run.upgrades.frost = 1;
    const brute = enemyAt(run, TOWER.x, TOWER.y - 100, "brute", { speed: 0 });
    aimAt(run, brute.x, brute.y);
    runFor(run, 0.5);
    expect(brute.burnLeft).toBeGreaterThan(0);
    expect(brute.slow).toBeCloseTo(0.15);
  });

  it("lets a boss call in grunts", () => {
    const run = quietRun();
    run.reloadLeft = Infinity;
    enemyAt(run, TOWER.x, 20, "boss", { summonTimer: 0.1 });
    runFor(run, 0.2);
    expect(run.enemies.filter((enemy) => enemy.kind === "grunt")).toHaveLength(2);
  });
});

describe("castVolley", () => {
  it("rains arrows on the spot, then has to reload", () => {
    const run = quietRun();
    run.reloadLeft = Infinity;
    const target = enemyAt(run, 60, 120, "brute", { speed: 0 });
    expect(castVolley(run, 60, 120)).toBe(true);
    expect(run.volleys).toHaveLength(BASE.volleyArrows);
    expect(castVolley(run, 60, 120)).toBe(false);
    runFor(run, 1.5);
    expect(run.volleys).toHaveLength(0);
    expect(target.hp).toBeLessThan(target.maxHp);
    runFor(run, BASE.volleyCooldown);
    expect(castVolley(run, 60, 120)).toBe(true);
  });

  it("leaves caltrops behind only with the upgrade", () => {
    const plain = quietRun();
    plain.reloadLeft = Infinity;
    enemyAt(plain, TOWER.x, 10, "grunt", { speed: 0 });
    castVolley(plain, 300, 600);
    runFor(plain, 1.5);
    expect(plain.caltrops).toHaveLength(0);

    const spiked = quietRun();
    spiked.reloadLeft = Infinity;
    spiked.upgrades.caltrops = 1;
    enemyAt(spiked, TOWER.x, 10, "grunt", { speed: 0 });
    castVolley(spiked, 300, 600);
    runFor(spiked, 1.5);
    expect(spiked.caltrops).toHaveLength(BASE.volleyArrows);
  });

  it("slows walkers crossing caltrops but not bats", () => {
    const run = quietRun();
    run.reloadLeft = Infinity;
    run.upgrades.caltrops = 3;
    const walker = enemyAt(run, 40, 100, "grunt");
    const bat = enemyAt(run, 40, 100, "bat", { speed: ENEMIES.grunt.speed });
    run.caltrops.push({ id: run.nextId++, x: 40, y: 100, angle: 0, life: 10 });
    const start = { x: walker.x, y: walker.y };
    step(run, STEP);
    const walked = Math.hypot(walker.x - start.x, walker.y - start.y);
    expect(walked).toBeCloseTo(walker.speed * STEP * (1 - stats(run).caltropSlow), 5);
    expect(Math.hypot(bat.x - start.x, bat.y - start.y)).toBeGreaterThan(walked);
  });

  it("does nothing outside a wave", () => {
    const run = quietRun();
    giveUp(run);
    expect(castVolley(run, 100, 100)).toBe(false);
  });
});

describe("chooseUpgrade", () => {
  it("levels the upgrade and starts the next wave", () => {
    const run = quietRun();
    offer(run, "multishot");
    expect(chooseUpgrade(run, "reload")).toBe(false);
    expect(chooseUpgrade(run, "multishot")).toBe(true);
    expect(run.upgrades.multishot).toBe(1);
    expect(run.phase).toBe("playing");
    expect(run.wave).toBe(2);
  });

  it("repairs the wall when it's raised", () => {
    const run = quietRun();
    run.hp = 40;
    offer(run, "wall");
    chooseUpgrade(run, "wall");
    expect(stats(run).maxHp).toBe(BASE.maxHp + WALL_HP);
    expect(run.hp).toBe(40 + WALL_HP);
  });

  it("skips the picker once every upgrade is maxed", () => {
    const run = quietRun();
    for (const id of Object.keys(run.upgrades) as UpgradeId[]) run.upgrades[id] = 99;
    run.upgrades.damage = 0;
    offer(run, "damage");
    chooseUpgrade(run, "damage");
    expect(run.phase).toBe("playing");
    run.spawns = [];
    run.enemies = [];
    run.upgrades.damage = 99;
    step(run, STEP);
    expect(run.phase).toBe("playing");
    expect(run.wave).toBe(3);
  });
});

describe("towerStats", () => {
  it("stacks upgrades and perks", () => {
    const upgrades = { ...emptyUpgrades(), damage: 2, reload: 1, multishot: 2, volleyCooldown: 3 };
    const perks = { ...emptyPerks(), fletching: 1, fortify: 2, tactics: 3 };
    const tower = towerStats(upgrades, perks);
    expect(tower.damage).toBeCloseTo(BASE.damage * 1.5 * 1.08);
    expect(tower.reload).toBeCloseTo(BASE.reload * 0.88);
    expect(tower.multishot).toBe(3);
    expect(tower.maxHp).toBe(BASE.maxHp + 30);
    expect(tower.volleyCooldown).toBe(2);
  });
});

describe("determinism", () => {
  it("plays the same run twice from the same seed and inputs", () => {
    const play = () => {
      const run = createRun(1234);
      for (let tick = 0; tick < 60 * 90 && run.phase !== "over"; tick += 1) {
        if (run.phase === "choosing") chooseUpgrade(run, run.choices[0]);
        if (tick % 10 === 0 && run.enemies[0]) aimAt(run, run.enemies[0].x, run.enemies[0].y);
        if (tick % 200 === 0 && run.enemies[0]) castVolley(run, run.enemies[0].x, run.enemies[0].y);
        step(run, STEP);
      }
      return JSON.stringify(run);
    };
    expect(play()).toBe(play());
  });
});
