import assert from "node:assert/strict";
import { ARMOR_FLOOR, FOES, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import type { Foe, FoeKind, Game, Shot } from "../../../src/lib/kingsroad/sim/types";
import type { Engine } from "./policy";
import type { Variant } from "./variant";

/** Synthetic collision fixtures only; benchmark runs never alter gold, speed, HP or spawn schedules. */
export function verifyPiercing(sim: Engine, variant: Variant) {
  const limit = variant === "three-hit" ? 3 : 6;
  function quiet(): Game {
    const game = sim.createGame("meadow", 19);
    game.status = "playing"; game.wave = 1; game.nextWaveIn = 999;
    return game;
  }
  function foe(id: number, kind: FoeKind = "grunt", distance = 100): Foe {
    const def = FOES[kind];
    return { id, kind, route: def.flying ? { air: { fromX: 180 } } : { road: 0 }, distance, lane: 0, facing: 0,
      slow: 0, summonTimer: 11, markLeft: 0, x: 0, y: 0, radius: def.radius, speed: 0, flying: def.flying,
      hp: 1000, maxHp: 1000, slowLeft: 0, burnLeft: 0, flash: 0, phase: 0 };
  }
  function bolt(game: Game, damage: number): Shot {
    const target = game.foes[0];
    return { id: 900, kind: "ballista", x: target.x, y: target.y - TOWERS.ballista.shotSpeed * sim.STEP,
      fromX: target.x, fromY: target.y - 20, toX: target.x, toY: target.y + 460, targetId: 0,
      t: 0, duration: 0, life: 1, damage, splash: 0, slow: 0, burn: 0, mark: 0, air: true, hitIds: [] };
  }
  let simultaneousFixtures = 0;
  for (const kind of Object.keys(FOES) as FoeKind[]) for (const level of [1, 2, 3]) {
    const game = quiet(); game.foes = Array.from({ length: 6 }, (_, i) => foe(100 + i, kind));
    sim.step(game, 0); // Position stationary fixture targets using the actual road/air geometry.
    const damage = TOWERS.ballista.levels[level - 1].damage, shot = bolt(game, damage);
    game.shots = [shot]; const rng = game.rng;
    sim.step(game, sim.STEP);
    // The bulwark variant adds a capped foe to this table; its shield bounds what any one contact can deal.
    const cap = (FOES[kind] as unknown as { hitCap?: number }).hitCap;
    const expected = Math.min(Math.max(damage * ARMOR_FLOOR, damage - FOES[kind].armor), cap ?? Infinity);
    assert.equal(shot.hitIds.length, limit, `${kind}/L${level}: simultaneous contact count`);
    assert.equal(new Set(shot.hitIds).size, limit);
    game.foes.forEach((f, index) => assert.equal(f.hp, index < limit ? 1000 - expected : 1000));
    assert.equal(game.shots.length, variant === "three-hit" ? 0 : 1, "retire on third contact, not next tick");
    assert.equal(game.rng, rng, "collision-limit logic must not consume RNG");
    simultaneousFixtures++;
  }
  // Separate ticks must share one lifetime budget; an earlier enemy cannot be hit twice.
  const sequential = quiet(); sequential.foes = [40, 75, 110, 145].map((d, i) => foe(200 + i, "grunt", d));
  sim.step(sequential, 0); const traveling = bolt(sequential, 32); sequential.shots = [traveling];
  for (let i = 0; i < 20; i++) sim.step(sequential, sim.STEP);
  assert.equal(traveling.hitIds.length, variant === "three-hit" ? 3 : 4);
  assert.equal(new Set(traveling.hitIds).size, traveling.hitIds.length);
  assert.equal(sequential.foes[3].hp, variant === "three-hit" ? 1000 : 968);

  // A valid in-flight bolt with two prior hits retains exactly one remaining contact in the experiment.
  const resumed = quiet(); resumed.foes = Array.from({ length: 6 }, (_, i) => foe(300 + i));
  sim.step(resumed, 0); const prior = bolt(resumed, 32);
  prior.hitIds = [300, 301]; resumed.shots = [prior]; sim.step(resumed, sim.STEP);
  assert.equal(prior.hitIds.length, limit);
  assert.equal(resumed.foes[0].hp, 1000); assert.equal(resumed.foes[1].hp, 1000);
  assert.equal(resumed.foes[2].hp, 968); assert.equal(resumed.foes[3].hp, variant === "three-hit" ? 1000 : 968);

  // Dead foes are ignored, rather than consuming penetration budget.
  const dead = quiet(); dead.foes = Array.from({ length: 6 }, (_, i) => foe(400 + i)); dead.foes[0].hp = 0;
  sim.step(dead, 0); const living = bolt(dead, 32); dead.shots = [living]; sim.step(dead, sim.STEP);
  assert.equal(living.hitIds.length, variant === "three-hit" ? 3 : 5);
  assert(!living.hitIds.includes(400));
  return { simultaneousFixtures, kinds: Object.keys(FOES), levels: [1, 2, 3], sequential: true, priorHits: true, deadSkipped: true };
}
