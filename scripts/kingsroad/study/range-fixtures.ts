import assert from "node:assert/strict";
import { FOES, GATE, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import { roadWithin } from "../../../src/lib/kingsroad/sim/path";
import type { Foe } from "../../../src/lib/kingsroad/sim/types";
import { plotOrder, type Engine } from "./policy";
import { expectedRanges, STOCK_BALLISTA_RANGES, type Variant } from "./variant";

/** Synthetic stationary targets isolate the real target-selection and bolt-flight boundaries. */
export function verifyRange(sim: Engine, variant: Variant) {
  const ranges = expectedRanges(variant);
  assert.deepEqual(TOWERS.ballista.levels.map(l => l.range), ranges);
  let acquisitionFixtures = 0;
  for (const level of [1, 2, 3]) for (const kind of ["grunt", "bat"] as const) for (const inside of [true, false]) {
    const game = sim.createGame("meadow", 19); game.gold = 20_000;
    assert(sim.build(game, 3, "ballista"));
    for (let i = 1; i < level; i++) assert(sim.upgrade(game, 3));
    game.status = "playing"; game.wave = 1; game.nextWaveIn = 999;
    const tower = sim.towerOn(game, 3)!;
    assert.equal(sim.levelOf(tower).range, ranges[level - 1]);
    // Meadow plot 3 is (110,225); its first road segment is x=70, y=-24..150.
    const distanceFromPlot = ranges[level - 1] + FOES[kind].radius * 0.5 + (inside ? -0.25 : 0.25);
    const y = 225 - Math.sqrt(distanceFromPlot ** 2 - 40 ** 2);
    assert(y >= -24 && y <= 150);
    const t = (y + 10) / (GATE.y + 10); // Existing air route starts at y=-10.
    const fromX = (70 - GATE.x * t) / (1 - t);
    const airDistance = Math.hypot(GATE.x - fromX, GATE.y + 10) * t;
    const distance = kind === "bat" ? airDistance : y + 24;
    const foe: Foe = { id: 999, kind, route: kind === "bat" ? { air: { fromX } } : { road: 0 }, distance,
      lane: 0, phase: kind === "bat" ? -distance / 18 : 0, facing: 0, slow: 0, summonTimer: 11, markLeft: 0,
      x: 0, y: 0, radius: FOES[kind].radius, speed: 0, flying: FOES[kind].flying, hp: 1000, maxHp: 1000,
      slowLeft: 0, burnLeft: 0, flash: 0 };
    game.foes = [foe]; const rng = game.rng;
    sim.step(game, 0);
    assert(Math.abs(Math.hypot(foe.x - 110, foe.y - 225) - distanceFromPlot) < 1e-8);
    assert.equal(game.shots.length, inside ? 1 : 0, `${kind}/L${level}/${inside}: actual acquisition boundary`);
    if (inside) {
      const shot = game.shots[0], def = TOWERS.ballista.levels[level - 1];
      assert.equal(shot.damage, def.damage); assert.equal(shot.air, true);
      assert.equal(shot.life, def.range * 1.15 / 460);
      assert.equal(tower.reloadLeft, def.reload);
      const x = shot.x, y = shot.y, life = shot.life;
      sim.step(game, sim.STEP);
      assert(Math.abs(Math.hypot(shot.x - x, shot.y - y) - 460 * sim.STEP) < 1e-8);
      assert(Math.abs(shot.life - (life - sim.STEP)) < 1e-8);
    }
    assert.equal(game.rng, rng, "target selection/bolt flight must not add RNG calls");
    acquisitionFixtures++;
  }
  const changedRankMaps: string[] = [];
  for (const map of MAPS) {
    const game = sim.createGame(map.id, 1);
    const expected = map.plots.map((p, i) => ({ i, score: map.roads.reduce((s, r) => s + roadWithin(r, p.x, p.y, STOCK_BALLISTA_RANGES[0]), 0) }))
      .sort((a, b) => b.score - a.score || a.i - b.i).map(p => p.i);
    assert.deepEqual(plotOrder(game, "ballista", "baseline-coverage"), expected, "fixed control must retain stock plot order");
    if (JSON.stringify(plotOrder(game, "ballista", "coverage")) !== JSON.stringify(expected)) changedRankMaps.push(map.id);
    for (const kind of ["archer", "catapult", "frost"] as const) assert.deepEqual(plotOrder(game, kind, "coverage"), plotOrder(game, kind, "baseline-coverage"));
  }
  if (variant === "range-80") assert(changedRankMaps.length > 0, "adaptive bot ranking must actually use reduced range");
  else assert.equal(changedRankMaps.length, 0);
  return { ranges, acquisitionFixtures, groundAndAir: true, projectileSpeed: 460, lifetimeFactor: 1.15, fixedRankMaps: MAPS.length, changedRankMaps };
}
