import { describe, expect, it } from "vitest";

import { ARMOR_FLOOR, BURN, FOES, HEAL_RANGE, MARK } from "@/lib/kingsroad/sim/balance";
import { createGame, step, STEP } from "@/lib/kingsroad/sim/game";
import type { Foe, FoeKind, Game } from "@/lib/kingsroad/sim/types";

/** The Long Watch's third road is straight at x=180, so ground/air targets can share a test location. */
function scene(): Game {
  return { ...createGame("watch", 99), status: "playing", wave: 7, spawns: [{ kind: "grunt", at: 9999, road: 2 }] };
}
function enemy(game: Game, kind: FoeKind, distance?: number): Foe {
  const def = FOES[kind];
  const foe: Foe = {
    id: game.nextId++, kind, route: def.flying ? { air: { fromX: 180 } } : { road: 2 },
    distance: distance ?? (def.flying ? 110 : 124), lane: 0, facing: Math.PI / 2,
    x: 180, y: 100, radius: def.radius, speed: 0, flying: def.flying, hp: 1000, maxHp: 1000,
    slowLeft: 0, slow: 0, burnLeft: 0, markLeft: 0, flash: 0,
    phase: def.flying ? -110 / 18 : 0, summonTimer: 9999,
  };
  game.foes.push(foe);
  return foe;
}

describe("combat contracts explained by the enemy guide", () => {
  it("heals nearby flying allies but neither itself nor warlords, and not allies beyond the healing range", () => {
    const game = scene(), healer = enemy(game, "healer"), boss = enemy(game, "boss");
    const allies = [enemy(game, "grunt"), enemy(game, "bat"), enemy(game, "gargoyle")];
    const far = enemy(game, "grunt", 124 + HEAL_RANGE + 10);
    for (const foe of game.foes) foe.hp = 500;
    step(game, STEP);
    expect(healer.hp).toBe(500);
    expect(boss.hp).toBe(500);
    expect(far.hp).toBe(500);
    for (const ally of allies) expect(ally.hp).toBeCloseTo(500 + ally.maxHp * FOES.healer.heal * STEP);
  });

  it("allows healers to heal each other, without treating their own healing as self-regeneration", () => {
    const game = scene(), first = enemy(game, "healer"), second = enemy(game, "healer");
    first.hp = second.hp = 500;
    step(game, STEP);
    const healed = 1000 * FOES.healer.heal * STEP;
    expect(first.hp).toBeCloseTo(500 + healed);
    expect(second.hp).toBeCloseTo(500 + healed);
  });

  it("burning bypasses armor and is amplified by a Lune mark", () => {
    const game = scene(), knight = enemy(game, "knight"), grunt = enemy(game, "grunt");
    for (const foe of [knight, grunt]) { foe.burnLeft = 1; foe.markLeft = 1; }
    step(game, STEP);
    const burn = BURN.dps * (1 + MARK.bonus) * STEP;
    expect(knight.hp).toBeCloseTo(1000 - burn);
    expect(grunt.hp).toBeCloseTo(knight.hp);
  });

  it("volley splash can hit ground and flying enemies, and armor reduces each impact", () => {
    const game = scene(), foes = [enemy(game, "grunt"), enemy(game, "bat"), enemy(game, "knight"), enemy(game, "gargoyle")];
    const damage = 50;
    game.volleys.push({ id: game.nextId++, fromX: 180, fromY: 572, toX: 180, toY: 100, t: 0.999, duration: 0.1, damage });
    step(game, STEP);
    for (const foe of foes) expect(foe.hp).toBeCloseTo(1000 - Math.max(damage * ARMOR_FLOOR, damage - FOES[foe.kind].armor));
  });

  it("catapult splash stays ground-only even when a bat and gargoyle overlap the landing", () => {
    const game = scene(), ground = enemy(game, "grunt"), flyers = [enemy(game, "bat"), enemy(game, "gargoyle")];
    game.shots.push({ id: game.nextId++, kind: "catapult", x: 180, y: 100, fromX: 180, fromY: 120,
      toX: 180, toY: 100, targetId: 0, t: 0.999, duration: 0.1, life: 0, damage: 50,
      splash: 30, slow: 0, burn: 0, mark: 0, air: false, hitIds: [],
    });
    step(game, STEP);
    expect(ground.hp).toBe(950);
    for (const flyer of flyers) expect(flyer.hp).toBe(1000);
  });
});
