import assert from "node:assert/strict";
import { FOES, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import { MAPS } from "../../../src/lib/kingsroad/sim/maps";
import type { Foe, FoeKind, Game } from "../../../src/lib/kingsroad/sim/types";
import type { Engine } from "./policy";
import type { Variant } from "./variant";

/** The shielded-foe fixture: any single blow counts for at most the cap; uncapped foes take full damage. Study only.
 * The bulwark exists only inside the variant bundle, so this file deliberately widens the shipping types with casts. */
type BulwarkFoeDef = { hitCap?: number; radius: number };
export function verifyBulwark(sim: Engine, variant: Variant) {
  if (variant !== "bulwark") return null;
  const foes = FOES as unknown as Record<string, BulwarkFoeDef>;
  const cap = foes.bulwark.hitCap ?? Infinity;
  assert.equal(cap, 12);
  const kind = (name: string) => name as unknown as FoeKind;
  function foe(id: number, name: "bulwark" | "grunt"): Foe {
    const def = foes[name];
    return { id, kind: kind(name), route: { road: 0 }, distance: 100, lane: 0, facing: 0, slow: 0, summonTimer: 11, markLeft: 0,
      x: 0, y: 0, radius: def.radius, speed: 0, flying: false, hp: 1000, maxHp: 1000, slowLeft: 0, burnLeft: 0, flash: 0, phase: 0 };
  }
  const isBulwark = (f: Foe) => (f.kind as unknown as string) === "bulwark";
  function quiet(): Game {
    const game = sim.createGame("meadow", 19);
    game.status = "playing"; game.wave = 1; game.nextWaveIn = 999;
    return game;
  }
  const plot = 1; // meadow's second plot, away from the gate
  const center = MAPS.find(m => m.id === "meadow")!.plots[plot];
  // A level-3 ballista: one 95-damage bolt.
  let game = quiet(); game.gold = 50_000;
  assert(sim.build(game, plot, "ballista"));
  for (let i = 1; i < 3; i++) assert(sim.upgrade(game, plot));
  game.foes.push({ ...foe(1, "bulwark"), x: center.x, y: center.y }, { ...foe(2, "grunt"), x: center.x, y: center.y + 24 });
  for (let i = 0; i < 400 && (game.foes[0].hp === 1000 || game.foes[1].hp === 1000); i++) sim.step(game, 1 / 60);
  const bulwark = game.foes.find(isBulwark)!, grunt = game.foes.find(f => !isBulwark(f))!;
  assert.equal(bulwark.hp, 1000 - cap, "a capped foe takes exactly the cap from a 95-damage bolt");
  assert.equal(grunt.hp, 905, "an uncapped foe takes the full bolt");
  // A level-3 frost stone: 8 damage, under the cap, so nothing is lost.
  game = quiet(); game.gold = 50_000;
  assert(sim.build(game, plot, "frost"));
  for (let i = 1; i < 3; i++) assert(sim.upgrade(game, plot));
  game.foes.push({ ...foe(1, "bulwark"), x: center.x, y: center.y });
  for (let i = 0; i < 400 && game.foes[0].hp === 1000; i++) sim.step(game, 1 / 60);
  assert.ok(game.foes[0].hp < 1000 - TOWERS.frost.levels[2].damage + 0.01, "an under-cap shot loses nothing to the shield");
  assert.ok(game.foes[0].slow > 0, "the slow still applies through the shield");
  return { hitCap: cap, boltCappedTo: 1000 - bulwark.hp, gruntFullDamage: 1000 - grunt.hp, underCapShotKept: true };
}
