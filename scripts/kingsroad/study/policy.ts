import * as original from "../../../src/lib/kingsroad/sim/game";
import { ARENA, GATE, MAX_LEVEL, TOWERS } from "../../../src/lib/kingsroad/sim/balance";
import { mapById } from "../../../src/lib/kingsroad/sim/maps";
import { poseAt, roadWithin } from "../../../src/lib/kingsroad/sim/path";
import type { ArcherBranch, Game, TowerKind } from "../../../src/lib/kingsroad/sim/types";

import { STOCK_BALLISTA_RANGES } from "./variant";

export type Engine = typeof original;
export type Strategy = "ballista" | "archer" | "mixed" | "pure-ballista" | "pure-archer" | "ballista-support" | "archer-smart";
export type Economy = "staged" | "spread" | "rush";
export interface Policy {
  strategy: Strategy; economy: Economy; branch: "balanced" | ArcherBranch;
  placement: "coverage" | "lines" | "baseline-coverage" | "archer-role"; volley: boolean; early: boolean; cap: number | null;
}
export interface Purchase { time: number; wave: number; type: "build" | "upgrade"; tower: number; plot: number; kind: TowerKind; cost: number }
export interface Decisions {
  spent: number; purchases: Purchase[]; casts: number; earlyCalls: number; earlyGold: number;
  affordableActionSeconds: number; policyBlockedSeconds: number; noDirectPurchaseSeconds: number;
  lastPurchase: number | null;
}
export function newDecisions(): Decisions {
  return { spent: 0, purchases: [], casts: 0, earlyCalls: 0, earlyGold: 0, affordableActionSeconds: 0, policyBlockedSeconds: 0, noDirectPurchaseSeconds: 0, lastPurchase: null };
}
const PLANS: Record<Strategy, TowerKind[]> = {
  ballista: ["ballista", "ballista", "ballista", "frost"],
  archer: ["archer", "archer", "archer", "frost"],
  mixed: ["archer", "catapult", "archer", "frost", "ballista", "archer", "catapult", "ballista", "frost", "archer", "catapult", "ballista", "archer", "catapult", "frost", "ballista", "archer", "catapult"],
  "ballista-support": ["ballista", "ballista", "archer", "frost"],
  // Role-appropriate Archer plan, predeclared: the frost comes second, when the archers' damage is lowest and slowing buys the most time-in-range.
  "archer-smart": ["archer", "frost", "archer", "archer"],
  "pure-ballista": ["ballista"], "pure-archer": ["archer"],
};
const ranks = new Map<string, number[]>();
/** Bats set off from a random x along the woods edge and fly straight at the gate; the expected flight-line length within range is static geometry, not oracle knowledge. */
const AIR_START_Y = -10;
export function airLaneWithin(x: number, y: number, radius: number): number {
  let total = 0, lines = 0;
  for (let fromX = 35; fromX <= ARENA.width - 35; fromX += 10) {
    const dx = GATE.x - fromX, dy = GATE.y - AIR_START_Y, length = Math.hypot(dx, dy);
    for (let along = 0; along <= length; along += 8) {
      if (Math.hypot(fromX + (dx * along) / length - x, AIR_START_Y + (dy * along) / length - y) <= radius) total += 8;
    }
    lines++;
  }
  return total / lines;
}
/** Coverage-only control; optional long, narrow ray alignment probe for Ballista placement; archer-role adds the air lanes to the Archer's road coverage. */
export function plotOrder(game: Game, kind: TowerKind, placement: Policy["placement"]): number[] {
  const key = `${game.map}/${kind}/${placement}`;
  const cached = ranks.get(key); if (cached) return cached;
  const map = mapById(game.map), range = kind === "ballista" && placement === "baseline-coverage" ? STOCK_BALLISTA_RANGES[0] : TOWERS[kind].levels[0].range;
  const samples = map.roads.flatMap(road => Array.from({ length: Math.floor(road.length / 12) + 1 }, (_, i) => poseAt(road, i * 12)));
  const score = map.plots.map(plot => {
    const coverage = map.roads.reduce((sum, road) => sum + roadWithin(road, plot.x, plot.y, range), 0);
    if (placement === "archer-role" && kind === "archer") return coverage + airLaneWithin(plot.x, plot.y, range);
    if (placement !== "lines" || kind !== "ballista") return coverage;
    const inReach = samples.filter(p => Math.hypot(p.x - plot.x, p.y - plot.y) <= range);
    let aligned = 0;
    for (const aim of inReach) {
      const length = Math.hypot(aim.x - plot.x, aim.y - plot.y); if (!length) continue;
      const dx = (aim.x - plot.x) / length, dy = (aim.y - plot.y) / length;
      const count = samples.filter(p => {
        const x = p.x - plot.x, y = p.y - plot.y, along = x * dx + y * dy;
        return along > 0 && along <= range * 1.15 && Math.abs(x * dy - y * dx) <= 12;
      }).length;
      aligned = Math.max(aligned, count * 12);
    }
    return coverage * (1 + aligned / 200);
  });
  const order = map.plots.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
  ranks.set(key, order); return order;
}

/** Count all legal affordable build/upgrade choices, not only the bot's next requested purchase. */
export function affordableActions(game: Game, sim: Engine = original): number {
  if (game.status !== "ready" && game.status !== "playing") return 0;
  let count = 0;
  const free = mapById(game.map).plots.length - game.towers.length;
  for (const kind of Object.keys(TOWERS) as TowerKind[]) if (game.gold >= sim.buildCost(kind)) count += free;
  for (const tower of game.towers) {
    const cost = sim.upgradeCost(tower);
    if (cost !== null && cost <= game.gold) count += sim.atFork(game, tower) ? 2 : 1;
  }
  return count;
}

/** Fully rebuilding a sold plot is a legal spending option even after every current tower is maxed. */
export function affordableRebuilds(game: Game, sim: Engine = original): number {
  if (game.status !== "ready" && game.status !== "playing") return 0;
  let count = 0;
  for (const tower of game.towers) {
    const funds = game.gold + sim.refundFor(game, tower);
    for (const kind of Object.keys(TOWERS) as TowerKind[]) {
      const otherBranch = kind === "archer" && tower.kind === "archer" && mapById(game.map).archerBranches;
      if (kind === tower.kind && !otherBranch) continue;
      if (funds >= TOWERS[kind].levels.reduce((sum, level) => sum + level.cost, 0)) count++;
    }
  }
  return count;
}

export function decide(game: Game, policy: Policy, d: Decisions, time: number, sim: Engine, frozen = false, beforeArcherFinal?: () => void): void {
  const lead = sim.leadFoe(game);
  if (policy.volley && lead && game.volleyLeft === 0 && sim.castVolley(game, lead.x, lead.y)) d.casts++;
  if (policy.early && game.nextWaveIn !== null && game.foes.length === 0 && game.spawns.length === 0) {
    const before = game.gold;
    if (sim.callWave(game)) { d.earlyCalls++; d.earlyGold += game.gold - before; }
  }
  if (frozen) return;
  const target = policy.economy === "rush" ? MAX_LEVEL : policy.economy === "spread" ? 1 : game.wave < 4 ? 1 : game.wave < 9 ? 2 : MAX_LEVEL;
  // Each successful operation advances a level or fills a plot; this loop cannot buy forever.
  for (;;) {
    const plan = PLANS[policy.strategy], kind = plan[game.towers.length % plan.length];
    // The smart Archer policy ranks archer plots by road plus air-lane coverage; every other kind keeps the chosen mode.
    const placement = policy.strategy === "archer-smart" && kind === "archer" ? "archer-role" : policy.placement;
    const free = plotOrder(game, kind, placement).filter(i => !sim.towerOn(game, i));
    const behind = game.towers.filter(t => t.level < target).sort((a, b) => (sim.upgradeCost(a) ?? 0) - (sim.upgradeCost(b) ?? 0) || a.id - b.id)[0];
    const upgrade = behind ?? (!free.length ? game.towers.filter(t => sim.upgradeCost(t) !== null).sort((a, b) => sim.upgradeCost(a)! - sim.upgradeCost(b)! || a.id - b.id)[0] : undefined);
    if (upgrade) {
      const cost = sim.upgradeCost(upgrade)!;
      if (policy.cap !== null && d.spent + cost > policy.cap) return;
      const ordinal = game.towers.filter(t => t.kind === "archer").findIndex(t => t.id === upgrade.id);
      // Smart Archer forks: lune where fireproof imps march (fire arrows half-hurt and never burn them), fire elsewhere (burn ignores plate).
      const branch = policy.branch === "balanced"
        ? policy.strategy === "archer-smart" ? (mapById(game.map).foes.includes("imp") ? "lune" : "fire") : ordinal % 2 === 0 ? "fire" : "lune"
        : policy.branch;
      if (upgrade.kind === "archer" && upgrade.level === 2 && game.gold >= cost) beforeArcherFinal?.();
      if (!sim.upgrade(game, upgrade.plot, sim.atFork(game, upgrade) ? branch : undefined)) return;
      d.spent += cost; d.lastPurchase = time;
      d.purchases.push({ time, wave: game.wave, type: "upgrade", tower: upgrade.id, plot: upgrade.plot, kind: upgrade.kind, cost });
      continue;
    }
    if (!free.length) return;
    const cost = sim.buildCost(kind);
    if (policy.cap !== null && d.spent + cost > policy.cap) return;
    let plot = free[0];
    // Focus fire: among the best-covered free plots, prefer the one whose range overlaps the standing archers' the most.
    if (policy.strategy === "archer-smart" && kind === "archer" && free.length > 1) {
      const map = mapById(game.map), archers = game.towers.filter(t => t.kind === "archer");
      if (archers.length) {
        const focus = (index: number) => {
          const p = map.plots[index];
          return archers.reduce((sum, tower) => sum + Math.max(0, 2 * TOWERS.archer.levels[0].range - Math.hypot(p.x - map.plots[tower.plot].x, p.y - map.plots[tower.plot].y)), 0);
        };
        plot = free.slice(0, 5).reduce((best, index) => focus(index) > focus(best) ? index : best, free[0]);
      }
    }
    if (!sim.build(game, plot, kind)) return;
    const tower = sim.towerOn(game, plot)!;
    d.spent += cost; d.lastPurchase = time;
    d.purchases.push({ time, wave: game.wave, type: "build", tower: tower.id, plot, kind, cost });
  }
}
