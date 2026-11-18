import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build as bundle } from "esbuild";
import { describe, expect, it } from "vitest";
import * as sim from "@/lib/kingsroad/sim/game";
import { MAPS } from "@/lib/kingsroad/sim/maps";
import type { Foe, Game, Shot, Tower, TowerKind } from "@/lib/kingsroad/sim/types";
import { instrumentSource, studyPlugin } from "../../scripts/kingsroad/study/instrument";
import { affordableActions, affordableRebuilds, decide, newDecisions, plotOrder, type Policy } from "../../scripts/kingsroad/study/policy";
import { play } from "../../scripts/kingsroad/study/runner";
import { beginAudit, finishAudit, observeBurn, observeBurnOwner, observeCast, observeCoverage, observeHeal, observeHit, observeKill, observeLeak, observeRetire, observeShot, observeSlow, observeSpawn } from "../../scripts/kingsroad/study/telemetry";

const policy: Policy = { strategy: "mixed", economy: "staged", branch: "balanced", placement: "coverage", volley: true, early: false, cap: null };
function foe(id: number, hp = 10): Foe {
  return { id, kind: "grunt", route: { road: 0 }, distance: 0, lane: 0, facing: 0, slow: 0, summonTimer: 11, markLeft: 0, x: 70, y: 0, radius: 8, speed: 30, flying: false, hp, maxHp: hp, slowLeft: 0, burnLeft: 0, flash: 0, phase: 0 };
}
function shot(id: number, kind: TowerKind = "ballista"): Shot {
  return { id, kind, x: 0, y: 0, fromX: 0, fromY: 0, toX: 1, toY: 1, targetId: 0, t: 0, duration: 1, life: 1, damage: 8, splash: 0, slow: 0, burn: 0, mark: 0, air: true, hitIds: [] };
}
function tower(kind: TowerKind = "ballista"): Tower {
  return { id: 1, plot: 0, kind, level: 3, aim: 0, reloadLeft: 0, sinceShot: 0, spent: 400 };
}

describe("study observer build isolation", () => {
  it("uses guarded exact anchors without modifying shipping files", () => {
    const path = resolve("src/lib/kingsroad/sim/game.ts"), before = readFileSync(path, "utf8");
    const observed = instrumentSource(before, "/tmp/observer.ts");
    expect(observed).toContain("export const AUDIT_BUILD = true");
    expect(observed).toContain("observeHit(game, source, foe");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(before).not.toContain("observeHit");
  });
  it("fails closed if an anchor disappears or appears twice", () => {
    const before = readFileSync(resolve("src/lib/kingsroad/sim/game.ts"), "utf8");
    expect(() => instrumentSource(before.replace("  game.shots.push(shot);", ""), "x")).toThrow("exactly once");
    expect(() => instrumentSource(before + "\n  game.shots.push(shot);", "x")).toThrow("exactly once");
  });
  it("refuses to report empty audit metrics when run without the builder", () => {
    expect(() => play({ map: "meadow", seed: 1, policy, observe: true })).toThrow("study builder");
  });
  it("proves full state/RNG equivalence, HP conservation, full-run parity and suffix replay in the actual built runner", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "kr-study-test-")), outfile = resolve(dir, "study.mjs");
    try {
      await bundle({ entryPoints: [resolve("scripts/kingsroad/study/cli.ts")], outfile, bundle: true, platform: "node", format: "esm", alias: { "@": resolve("src") }, plugins: [studyPlugin()] });
      const result = JSON.parse(execFileSync(process.execPath, [outfile, "--self-test"], { encoding: "utf8" }));
      expect(result.richEquivalenceSeeds).toEqual([1, 7, 31]);
      expect(result.ticksPerSeed).toBe(12000);
      expect(result.suffixes).toBe(13);
      const out = resolve(dir, "rows.jsonl");
      execFileSync(process.execPath, [outfile, "--maps=meadow", "--seeds=1", "--strategies=ballista,archer,mixed", `--out=${out}`], { encoding: "utf8", stdio: "pipe" });
      const rows = readFileSync(out, "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(Math.abs(row.metrics.ledgerError)).toBeLessThan(0.0001);
        expect(row.goldLedgerError).toBe(0);
        expect(row.opening.time).toBe(120);
        expect(row.checkpoints).toBeUndefined();
        expect(row.lastPurchaseCheckpoint).toBeUndefined();
        expect(row.stateHash).toHaveLength(64);
      }
      expect(() => execFileSync(process.execPath, [outfile, "--made-up"], { stdio: "pipe" })).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30_000);
});

describe("study-only damage accounting", () => {
  it("caps useful damage at remaining HP, separates piercing contacts/overkill and reconciles the HP ledger", () => {
    const game = sim.createGame("meadow", 1), a = beginAudit(game), bolt = shot(10);
    observeShot(game, tower(), bolt);
    const foes = [foe(101, 10), foe(102, 5), foe(103, 5), foe(104, 5)];
    for (const f of foes) { observeSpawn(game, f); observeHit(game, bolt, f, 8, 8, 8, 8); f.hp -= 8; }
    game.foes = foes.filter(f => f.hp > 0);
    observeRetire(game, bolt.id);
    const result = finishAudit(game, a), d = result.bySource.ballista!;
    expect(d.useful).toBe(23); expect(d.overkill).toBe(9);
    expect(d.pierceUseful).toBe(15); expect(d.beyondThirdUseful).toBe(5);
    expect(d.hitHistogram).toEqual({ 4: 1 }); expect(d.pending).toBe(0);
    expect(d.usefulByFoe).toEqual({ grunt: 23 }); expect(result.ledgerError).toBe(0);
  });
  it("attributes burning after the projectile retires, without counting it as another impact", () => {
    const game = sim.createGame("watch", 1), a = beginAudit(game), arrow = shot(10, "archer"), f = foe(101, 20);
    const t = { ...tower("archer"), branch: "fire" as const };
    observeSpawn(game, f); observeShot(game, t, arrow); observeBurnOwner(game, f, arrow);
    observeHit(game, arrow, f, 13, 13, 13, 13); f.hp -= 13;
    observeRetire(game, arrow.id); observeBurn(game, f, 6); f.hp -= 6;
    game.foes = [f];
    const d = finishAudit(game, a).bySource["archer-fire"]!;
    expect(d.useful).toBe(19); expect(d.burnUseful).toBe(6); expect(d.hits).toBe(1);
  });
  it("keeps healing and leak HP separate and reconciles damage with a healed enemy", () => {
    const game = sim.createGame("watch", 1), a = beginAudit(game), bolt = shot(10), f = foe(101);
    observeSpawn(game, f); observeShot(game, tower(), bolt);
    observeHit(game, bolt, f, 8, 8, 8, 8); f.hp -= 8;
    observeHeal(game, 3); f.hp += 3;
    observeLeak(game, f); observeRetire(game, bolt.id);
    const result = finishAudit(game, a);
    expect(result.healed).toBe(3); expect(result.leakedHp).toBe(5);
    expect(result.leaks).toEqual({ grunt: 1 }); expect(result.ledgerError).toBe(0);
  });
  it("separates armor, fireproof loss and the arithmetic marked share without double-counting it", () => {
    const game = sim.createGame("watch", 1), a = beginAudit(game), arrow = shot(10, "archer"), f = foe(101, 100);
    f.markLeft = 1;
    observeSpawn(game, f); observeShot(game, { ...tower("archer"), branch: "fire" }, arrow);
    observeHit(game, arrow, f, 20, 10, 5, 6.75); f.hp -= 6.75;
    game.foes = [f];
    const d = finishAudit(game, a).bySource["archer-fire"]!;
    expect(d.fireproofLost).toBe(10); expect(d.armorLost).toBe(5);
    expect(d.markUsefulShare).toBeCloseTo(1.75); expect(d.useful).toBe(6.75);
  });
  it("does not count still-flying projectiles as misses; retires zero-hit shots explicitly", () => {
    const game = sim.createGame("meadow", 1), a = beginAudit(game);
    observeShot(game, tower(), shot(10)); observeShot(game, tower(), shot(11)); observeRetire(game, 10);
    const d = finishAudit(game, a).bySource.ballista!;
    expect([d.fired, d.retired, d.pending, d.missed]).toEqual([2, 1, 1, 1]);
    expect(d.hitHistogram).toEqual({ 0: 1 });
  });
  it("tracks volley impacts separately from towers", () => {
    const game = sim.createGame("meadow", 1); sim.callWave(game); sim.castVolley(game, 180, 400);
    const a = beginAudit(game), f = foe(101, 20);
    observeSpawn(game, f); observeCast(game, game.volleys); a.time = 10;
    observeHit(game, game.volleys[0], f, 14, 14, 14, 14); f.hp -= 14; game.foes = [f];
    const result = finishAudit(game, a);
    expect(result.volleyCasts).toBe(1); expect(result.lastUsefulVolley).toBe(10);
    expect(result.bySource.volley?.useful).toBe(14); expect(result.byTower).toEqual({});
  });
  it("observes availability and slowing without mutating any game state or RNG", () => {
    const game = sim.createGame("meadow", 1), a = beginAudit(game), t = tower(), before = JSON.stringify(game);
    observeCoverage(game, t, true, 1); observeCoverage(game, t, false, 2); observeSlow(game, 0.5);
    expect(JSON.stringify(game)).toBe(before);
    expect(a.bySource.ballista?.activeSeconds).toBe(3); expect(a.bySource.ballista?.targetSeconds).toBe(1);
    expect(a.bySource.ballista?.readyNoTargetSeconds).toBe(2); expect(a.slowEquivalentSeconds).toBe(0.5);
  });
  it("clears burn-owner tracking on both death and leak", () => {
    for (const cleanup of [observeKill, observeLeak]) {
      const game = sim.createGame("meadow", 1), a = beginAudit(game), f = foe(101), arrow = shot(10, "archer");
      observeShot(game, tower("archer"), arrow); observeBurnOwner(game, f, arrow); cleanup(game, f);
      expect(a.burnOwners.size).toBe(0);
    }
  });
  it("fails loudly for missing hit sources, burn owners and a broken HP ledger", () => {
    const game = sim.createGame("meadow", 1), a = beginAudit(game), f = foe(101);
    expect(() => observeHit(game, shot(10), f, 8, 8, 8, 8)).toThrow("Unregistered");
    expect(() => observeBurn(game, f, 1)).toThrow("Missing burn owner");
    expect(() => observeRetire(game, 10)).toThrow("Missing retiring");
    observeSpawn(game, f); expect(() => finishAudit(game, a)).toThrow("does not reconcile");
  });
  it("does nothing on ordinary unregistered games", () => {
    const game = sim.createGame("meadow", 1), before = JSON.stringify(game), f = foe(101);
    observeHit(game, shot(10), f, 8, 8, 8, 8); observeBurn(game, f, 1); observeRetire(game, 10);
    observeShot(game, tower(), shot(10)); observeSpawn(game, f); observeHeal(game, 1); observeSlow(game, 1);
    expect(JSON.stringify(game)).toBe(before);
  });
});

describe("strategy policy controls and pacing definitions", () => {
  it.each(MAPS.map(m => [m.id] as const))("ranks every plot on %s without modifying the game", (map) => {
    const game = sim.createGame(map, 1), before = JSON.stringify(game);
    for (const kind of ["archer", "catapult", "frost", "ballista"] as const) {
      for (const placement of ["coverage", "lines"] as const) {
        const order = plotOrder(game, kind, placement);
        expect(new Set(order).size).toBe(MAPS.find(m => m.id === map)!.plots.length);
        expect(order).toEqual(plotOrder(game, kind, placement));
      }
    }
    expect(JSON.stringify(game)).toBe(before);
  });
  it.each(["ballista", "archer", "mixed", "pure-ballista", "pure-archer"] as const)("respects the common cumulative budget for %s", (strategy) => {
    const game = sim.createGame("watch", 1), d = newDecisions(); game.gold = 20_000;
    decide(game, { ...policy, strategy, economy: "rush", cap: 1500 }, d, 0, sim);
    expect(d.spent).toBeLessThanOrEqual(1500); expect(d.spent).toBeGreaterThan(1000);
    expect(game.gold + d.spent).toBe(20_000);
  });
  it("freezes purchasing without disabling the existing volley decision", () => {
    const game = sim.createGame("meadow", 1), d = newDecisions(); sim.callWave(game); game.foes.push(foe(100));
    decide(game, policy, d, 0, sim, true);
    expect(d.purchases).toEqual([]); expect(d.casts).toBe(1); expect(game.volleys).toHaveLength(12);
  });
  it("counts fork choices twice, keeps swap choices distinct, and does not invent terminal actions", () => {
    const game = sim.createGame("watch", 1); game.gold = 10000; sim.build(game, 0, "archer"); sim.upgrade(game, 0);
    const freeBuilds = (MAPS.find(m => m.id === "watch")!.plots.length - 1) * 4;
    expect(affordableActions(game)).toBe(freeBuilds + 2);
    sim.upgrade(game, 0, "lune");
    expect(affordableRebuilds(game)).toBe(4);
    game.status = "won";
    expect(affordableActions(game)).toBe(0); expect(affordableRebuilds(game)).toBe(0);
  });
  it("does not confuse a maxed layout with no legal reallocation", () => {
    const game = sim.createGame("meadow", 1), d = newDecisions(); game.gold = 20000;
    decide(game, { ...policy, economy: "rush" }, d, 0, sim);
    expect(affordableActions(game)).toBe(0); expect(affordableRebuilds(game)).toBeGreaterThan(0);
  });
  it("uses early calling only when the field and spawn schedule are empty", () => {
    const game = sim.createGame("meadow", 1), d = newDecisions(); sim.callWave(game);
    game.nextWaveIn = 10; game.spawns = []; game.foes = [foe(100)];
    decide(game, { ...policy, early: true, volley: false }, d, 0, sim, true);
    expect(game.wave).toBe(1); game.foes = [];
    decide(game, { ...policy, early: true, volley: false }, d, 0, sim, true);
    expect(game.wave).toBe(2); expect(d.earlyGold).toBe(10); expect(d.earlyCalls).toBe(1);
  });
  it("repeats the pure plans until every plot is filled, rather than silently ceasing builds", () => {
    const game = sim.createGame("watch", 1), d = newDecisions(); game.gold = 20000;
    decide(game, { ...policy, strategy: "pure-archer", economy: "rush" }, d, 0, sim);
    expect(game.towers).toHaveLength(MAPS.find(m => m.id === "watch")!.plots.length);
    expect(game.towers.every(t => t.level === 3)).toBe(true);
  });
  it("labels an unfinished run as timeout rather than a loss or a win", () => {
    const result = play({ map: "watch", seed: 1, policy, maxTicks: 1 });
    expect(result.status).toBe("timeout"); expect(result.opening).toBeNull();
  });
});
