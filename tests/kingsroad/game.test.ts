import { describe, expect, it } from "vitest";

import { FOES, FROST_SECONDS, GATE, START_LIVES, TOWERS, VOLLEY, WAVE_GAP, hpScale, starsFor } from "@/lib/kingsroad/sim/balance";
import {
  build,
  callWave,
  castVolley,
  createGame,
  earlyBonus,
  giveUp,
  refundFor,
  routeLength,
  sell,
  step,
  STEP,
  towerOn,
  upgrade,
  upgradeCost,
} from "@/lib/kingsroad/sim/game";
import { mapById, MAPS } from "@/lib/kingsroad/sim/maps";
import { poseAt } from "@/lib/kingsroad/sim/path";
import { buildSpawns, isBossWave, waveRoster } from "@/lib/kingsroad/sim/waves";
import type { EnemyKind, Foe, Game, Route } from "@/lib/kingsroad/sim/types";

const MEADOW = mapById("meadow");

/** A game already on its first wave with nothing left to come out of the woods, so foes can be placed by hand. */
function quietGame(gold = 10_000): Game {
  const game = createGame("meadow", 1);
  game.gold = gold;
  callWave(game);
  game.spawns = [];
  // Hold the next wave back so it doesn't march in on its own mid-test.
  game.nextWaveIn = 999;
  return game;
}

/** Put a foe on the meadow road, `distance` along it, in the middle of the road. */
function foeAt(game: Game, distance: number, kind: EnemyKind = "grunt", overrides: Partial<Foe> = {}): Foe {
  const def = FOES[kind];
  const route: Route = def.flying ? { air: { fromX: GATE.x } } : { road: 0 };
  const pose = poseAt(MEADOW.roads[0], distance);
  const foe: Foe = {
    id: game.nextId++,
    kind,
    route,
    distance,
    lane: 0,
    facing: pose.angle,
    x: pose.x,
    y: pose.y,
    radius: def.radius,
    speed: def.speed,
    flying: def.flying,
    hp: def.hp,
    maxHp: def.hp,
    slowLeft: 0,
    slow: 0,
    burnLeft: 0,
    flash: 0,
    phase: 0,
    summonTimer: 99,
    ...overrides,
  };
  game.foes.push(foe);
  return foe;
}

function runFor(game: Game, seconds: number): void {
  for (let tick = 0; tick < seconds / STEP; tick += 1) step(game, STEP);
}

/** The distance along the meadow road nearest to a plot. */
function besidePlot(plot: number): number {
  const { x, y } = MEADOW.plots[plot];
  let best = 0;
  for (let along = 0; along < MEADOW.roads[0].length; along += 1) {
    const here = poseAt(MEADOW.roads[0], along);
    const there = poseAt(MEADOW.roads[0], best);
    if (Math.hypot(here.x - x, here.y - y) < Math.hypot(there.x - x, there.y - y)) best = along;
  }
  return best;
}

describe("a new game", () => {
  it("waits for the first wave with the map's gold and a full gate", () => {
    const game = createGame("meadow", 5);
    expect(game).toMatchObject({ status: "ready", wave: 0, gold: MEADOW.startGold, lives: START_LIVES });
    runFor(game, 5);
    expect(game.foes).toHaveLength(0);
    expect(game.wave).toBe(0);
  });

  it("starts marching when the first wave is called", () => {
    const game = createGame("meadow", 5);
    expect(callWave(game)).toBe(true);
    expect(game).toMatchObject({ status: "playing", wave: 1 });
    runFor(game, 1);
    expect(game.foes.length).toBeGreaterThan(0);
  });

  it("replays exactly from the same seed", () => {
    const play = () => {
      const game = createGame("ford", 99);
      build(game, 3, "archer");
      build(game, 6, "catapult");
      callWave(game);
      runFor(game, 40);
      return JSON.stringify(game);
    };
    expect(play()).toBe(play());
  });
});

describe("building", () => {
  it("builds on an empty plot for the tower's price", () => {
    const game = createGame("meadow", 1);
    expect(build(game, 0, "archer")).toBe(true);
    expect(game.gold).toBe(MEADOW.startGold - TOWERS.archer.levels[0].cost);
    expect(towerOn(game, 0)).toMatchObject({ kind: "archer", level: 1 });
  });

  it("won't build on a taken plot, a plot that isn't there, or without the gold", () => {
    const game = createGame("meadow", 1);
    build(game, 0, "archer");
    expect(build(game, 0, "frost")).toBe(false);
    expect(build(game, MEADOW.plots.length, "frost")).toBe(false);
    game.gold = TOWERS.ballista.levels[0].cost - 1;
    expect(build(game, 1, "ballista")).toBe(false);
  });

  it("upgrades a tower to the top level and no further", () => {
    const game = quietGame();
    build(game, 0, "catapult");
    const tower = towerOn(game, 0)!;
    expect(upgradeCost(tower)).toBe(TOWERS.catapult.levels[1].cost);
    expect(upgrade(game, 0)).toBe(true);
    expect(upgrade(game, 0)).toBe(true);
    expect(tower.level).toBe(3);
    expect(upgradeCost(tower)).toBeNull();
    expect(upgrade(game, 0)).toBe(false);
    expect(tower.spent).toBe(TOWERS.catapult.levels.reduce((sum, level) => sum + level.cost, 0));
  });

  it("gives everything back for a tower sold before the first wave, and part of it after", () => {
    const early = createGame("meadow", 1);
    build(early, 0, "archer");
    expect(sell(early, 0)).toBe(true);
    expect(early.gold).toBe(MEADOW.startGold);

    const late = quietGame(500);
    build(late, 0, "archer");
    upgrade(late, 0);
    const tower = towerOn(late, 0)!;
    expect(refundFor(late, tower)).toBe(Math.floor((70 + 60) * 0.6));
    sell(late, 0);
    expect(late.gold).toBe(500 - 130 + 78);
    expect(towerOn(late, 0)).toBeUndefined();
  });
});

describe("waves", () => {
  it("waits for the last of a wave to leave the woods before the next can be called", () => {
    const game = createGame("meadow", 3);
    callWave(game);
    expect(callWave(game)).toBe(false);
    while (game.spawns.length > 0) step(game, STEP);
    step(game, STEP);
    expect(game.nextWaveIn).toBeCloseTo(WAVE_GAP, 1);
  });

  it("pays for every second skipped by calling the next wave early", () => {
    const game = quietGame(0);
    game.nextWaveIn = 9.6;
    expect(earlyBonus(game)).toBe(9);
    expect(callWave(game)).toBe(true);
    expect(game).toMatchObject({ wave: 2, gold: 9, nextWaveIn: null });
  });

  it("sends the next wave on its own when the wait runs out", () => {
    const game = quietGame();
    game.nextWaveIn = 0.5;
    runFor(game, 0.6);
    expect(game.wave).toBe(2);
  });

  it("grows the horde: runners from wave 2, bats every third wave, brutes from wave 4, the warlord last", () => {
    expect(waveRoster(1, MEADOW)).toMatchObject({ runner: 0, bat: 0, brute: 0, boss: 0 });
    expect(waveRoster(2, MEADOW).runner).toBeGreaterThan(0);
    expect(waveRoster(3, MEADOW).bat).toBeGreaterThan(0);
    expect(waveRoster(4, MEADOW).bat).toBe(0);
    expect(waveRoster(4, MEADOW).brute).toBeGreaterThan(0);
    expect(isBossWave(MEADOW.waves, MEADOW)).toBe(true);
    expect(isBossWave(10, mapById("crossroads"))).toBe(true);
    expect(waveRoster(MEADOW.waves - 1, MEADOW).boss).toBe(0);
    expect(hpScale(10)).toBeGreaterThan(hpScale(5) * 1.5);
  });

  it("schedules a wave in time order, every walker on one of the map's roads", () => {
    for (const map of MAPS) {
      const spawns = buildSpawns(map.waves, map, { rng: 4 });
      const roster = waveRoster(map.waves, map);
      expect(spawns).toHaveLength(Object.values(roster).reduce((sum, count) => sum + count, 0));
      for (const [index, spawn] of spawns.entries()) {
        if (index > 0) expect(spawn.at).toBeGreaterThanOrEqual(spawns[index - 1].at);
        expect(spawn.road).toBeGreaterThanOrEqual(0);
        expect(spawn.road).toBeLessThan(map.roads.length);
      }
      expect(spawns[spawns.length - 1].kind).toBe("boss");
    }
  });

  it("sends both of the crossroads' roads", () => {
    const crossroads = mapById("crossroads");
    const roads = new Set<number>();
    for (let wave = 1; wave <= crossroads.waves; wave += 1) for (const spawn of buildSpawns(wave, crossroads, { rng: wave })) roads.add(spawn.road);
    expect(roads).toEqual(new Set([0, 1]));
  });
});

describe("the horde", () => {
  it("walks the road and costs lives at the gate, paying nothing", () => {
    const game = quietGame(0);
    const length = MEADOW.roads[0].length;
    foeAt(game, length - 5, "grunt");
    foeAt(game, length - 5, "brute");
    runFor(game, 1);
    expect(game.foes).toHaveLength(0);
    expect(game.lives).toBe(START_LIVES - FOES.grunt.leak - FOES.brute.leak);
    expect(game.gold).toBe(0);
  });

  it("follows the road's corners", () => {
    const game = quietGame();
    const foe = foeAt(game, 160);
    runFor(game, 1);
    expect(foe.distance).toBeCloseTo(160 + FOES.grunt.speed, 0);
    // The first corner is 174 along: by now it has turned right along the top bend.
    expect(foe.y).toBeCloseTo(150, 0);
    expect(foe.x).toBeGreaterThan(70);
  });

  it("flies bats straight at the gate", () => {
    const game = quietGame();
    const bat = foeAt(game, 0, "bat");
    expect(routeLength(MEADOW, bat)).toBeCloseTo(GATE.y + 10, 0);
    runFor(game, 2);
    // Weaving a little either side of the straight line.
    expect(Math.abs(bat.x - GATE.x)).toBeLessThanOrEqual(10);
    expect(bat.y).toBeGreaterThan(FOES.bat.speed);
  });

  it("brings in footmen around a marching warlord", () => {
    const game = quietGame();
    foeAt(game, 300, "boss", { summonTimer: 0.5 });
    runFor(game, 0.6);
    expect(game.foes.filter((foe) => foe.kind === "grunt")).toHaveLength(2);
  });

  it("ends the game when the lives run out", () => {
    const game = quietGame();
    game.lives = 1;
    foeAt(game, MEADOW.roads[0].length - 1);
    runFor(game, 0.2);
    expect(game).toMatchObject({ status: "lost", lives: 0 });
  });

  it("is beaten once the last wave is cleared", () => {
    const game = quietGame();
    game.wave = MEADOW.waves;
    game.nextWaveIn = null;
    step(game, STEP);
    expect(game.status).toBe("won");
    expect(starsFor(START_LIVES)).toBe(3);
    expect(starsFor(10)).toBe(2);
    expect(starsFor(1)).toBe(1);
  });

  it("lets the player give up", () => {
    const game = quietGame();
    giveUp(game);
    expect(game.status).toBe("lost");
    expect(build(game, 0, "archer")).toBe(false);
  });
});

describe("towers", () => {
  it("archers shoot the foe in range and the kill pays", () => {
    const game = quietGame(0);
    game.towers.push({ id: 900, plot: 1, kind: "archer", level: 1, aim: 0, reloadLeft: 0, sinceShot: 99, spent: 70 });
    const foe = foeAt(game, besidePlot(1), "grunt", { speed: 0, hp: 5 });
    runFor(game, 1);
    expect(foe.hp).toBeLessThanOrEqual(0);
    expect(game.kills).toBe(1);
    expect(game.gold).toBe(FOES.grunt.gold);
  });

  it("ignores foes out of range", () => {
    const game = quietGame();
    build(game, 0, "archer");
    const far = foeAt(game, MEADOW.roads[0].length - 20, "grunt", { speed: 0 });
    runFor(game, 2);
    expect(far.hp).toBe(far.maxHp);
    expect(game.shots).toHaveLength(0);
  });

  it("aims the stone at the foe the catapult can reach, never at a bat", () => {
    const game = quietGame();
    build(game, 4, "catapult");
    // Hovering right over the catapult: the bats' line from the woods to the gate runs straight through its plot.
    const bat = foeAt(game, MEADOW.plots[4].y + 10, "bat", { speed: 0 });
    runFor(game, 3);
    expect(bat.hp).toBe(bat.maxHp);

    const walker = foeAt(game, besidePlot(4), "brute", { speed: 0 });
    runFor(game, 3);
    expect(walker.hp).toBeLessThan(walker.maxHp);
  });

  it("frost slows the target and the foes around it", () => {
    const game = quietGame();
    build(game, 1, "frost");
    const along = besidePlot(1);
    const first = foeAt(game, along, "brute", { speed: 0 });
    const second = foeAt(game, along - 10, "brute", { speed: 0 });
    runFor(game, 1.2);
    for (const foe of [first, second]) {
      expect(foe.slow).toBe(TOWERS.frost.levels[0].slow);
      expect(foe.slowLeft).toBeGreaterThan(FROST_SECONDS - 1.2);
    }
  });

  it("sends a ballista bolt through everything in its line", () => {
    const game = quietGame();
    build(game, 1, "ballista");
    const along = besidePlot(1);
    // A column along the road, the bolt fired down its length.
    const column = [0, 12, 24].map((gap) => foeAt(game, along + 60 + gap, "brute", { speed: 0 }));
    runFor(game, 1);
    expect(column.filter((foe) => foe.hp < foe.maxHp).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the volley", () => {
  it("rains on a spot, then reloads", () => {
    const game = quietGame();
    const foe = foeAt(game, 300, "brute", { speed: 0 });
    expect(castVolley(game, foe.x, foe.y)).toBe(true);
    expect(game.volleys).toHaveLength(VOLLEY.arrows);
    expect(castVolley(game, foe.x, foe.y)).toBe(false);
    runFor(game, 2);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(game.volleyLeft).toBeGreaterThan(VOLLEY.cooldown - 3);
  });

  it("can't be cast before the first wave", () => {
    expect(castVolley(createGame("meadow", 1), 100, 100)).toBe(false);
  });
});
