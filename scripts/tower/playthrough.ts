// Deterministic Lone Tower bot baseline. It is a repeatable input policy, not proof of human balance or fun.
//
//   npx esbuild scripts/tower/playthrough.ts --bundle --platform=node --format=esm --outfile=/tmp/tower.mjs
//   node /tmp/tower.mjs [seeds] [catapult|frostField|none|all] [waveCap] [verbose|-]
//
// The bot leads the enemy nearest the wall, picks upgrades from one fixed priority list, and casts at the predicted
// cluster covering the most targets. "none" uses identical archery without skill casts. No skill perks are used.

import process from "node:process";
import { ARENA, SKILLS, TOWER, WALL_Y } from "../../src/lib/tower/sim/balance.ts";
import { aimAt, castSkill, chooseUpgrade, createRun, stats, step, STEP } from "../../src/lib/tower/sim/run.ts";
import { emptyPerks } from "../../src/lib/tower/sim/upgrades.ts";
import type { Enemy, Run, SkillId, UpgradeId } from "../../src/lib/tower/sim/types.ts";

const PRIORITY: UpgradeId[] = [
  "damage", "multishot", "skillCooldown", "skillSize", "reload", "range", "fire", "frost",
  "ricochet", "pierce", "wall", "regen", "caltrops", "crit",
];

type Policy = SkillId | "none";

function pick(run: Run, policy: Policy): void {
  while (run.phase === "choosing") {
    const priority = policy === "none" ? PRIORITY.filter((id) => id !== "skillCooldown" && id !== "skillSize") : PRIORITY;
    const offered = priority.find((id) => run.choices.includes(id)) ?? run.choices[0];
    if (!offered) break;
    chooseUpgrade(run, offered);
  }
}

function nextPosition(enemy: Enemy, seconds: number): { x: number; y: number } {
  if (enemy.freezeLeft > 0) return { x: enemy.x, y: enemy.y };
  const dx = enemy.targetX - enemy.x;
  const dy = WALL_Y - enemy.radius - enemy.y;
  const distance = Math.max(1e-6, Math.hypot(dx, dy));
  const slow = enemy.slowLeft > 0 ? enemy.slow : 0;
  const travel = Math.min(distance, enemy.speed * (1 - slow) * seconds);
  return { x: enemy.x + dx / distance * travel, y: enemy.y + dy / distance * travel };
}

function nearestWall(run: Run): Enemy | undefined {
  return run.enemies.reduce<Enemy | undefined>((best, enemy) => !best || enemy.y > best.y ? enemy : best, undefined);
}

function aim(run: Run): void {
  const target = nearestWall(run);
  if (!target) return;
  const distance = Math.hypot(target.x - TOWER.x, target.y - TOWER.y);
  const point = nextPosition(target, distance / stats(run).arrowSpeed);
  aimAt(run, point.x, point.y);
}

function cast(run: Run, policy: Policy): boolean {
  if (policy === "none" || run.skillLeft > 0 || run.enemies.length === 0) return false;
  const lead = SKILLS[run.skill].flight;
  const radius = stats(run).skillRadius;
  let best = { x: 0, y: 0, count: -1 };
  for (const candidate of run.enemies) {
    const center = nextPosition(candidate, lead);
    let count = 0;
    for (const enemy of run.enemies) {
      const point = nextPosition(enemy, lead);
      if (Math.hypot(point.x - center.x, point.y - center.y) <= radius + enemy.radius) count += 1;
    }
    if (count > best.count) best = { ...center, count };
  }
  // Do not obsessively fire into empty space: cast at a crowd or an enemy already close enough to threaten the wall.
  const urgent = nearestWall(run);
  if (best.count < 2 && (!urgent || urgent.y < WALL_Y - 170)) return false;
  return castSkill(run, Math.max(0, Math.min(ARENA.width, best.x)), Math.max(0, Math.min(ARENA.height, best.y)));
}

function play(seed: number, policy: Policy, waveCap: number) {
  const run = createRun(seed, emptyPerks(), policy === "none" ? "catapult" : policy);
  let ticks = 0;
  let casts = 0;
  let outcome = "wave-cap";
  const maxTicks = 60 * 60 * 30;
  while (run.phase !== "over" && ticks < maxTicks) {
    if (run.wave > waveCap) break;
    if (run.phase === "choosing") {
      if (run.wave >= waveCap) break;
      pick(run, policy);
      continue;
    }
    if (ticks % 6 === 0) aim(run);
    if (ticks % 12 === 0 && cast(run, policy)) casts += 1;
    step(run, STEP);
    ticks += 1;
  }
  if (run.phase === "over") outcome = "fell";
  else if (ticks >= maxTicks) outcome = "time-cap";
  return {
    policy, seed, outcome, wave: run.wave, seconds: +(ticks * STEP).toFixed(1), kills: run.kills,
    gold: run.gold, hp: +run.hp.toFixed(1), casts, castsPerMinute: +(casts * 3600 / Math.max(1, ticks)).toFixed(2),
  };
}

const seeds = Math.max(1, Number(process.argv[2] || 30));
const requested = process.argv[3] || "all";
const waveCap = Math.max(1, Number(process.argv[4] || 15));
const verbose = process.argv[5] === "verbose";
const policies: Policy[] = requested === "all" ? ["catapult", "frostField", "none"] : [requested as Policy];
if (!["catapult", "frostField", "none"].includes(requested) && requested !== "all") throw new Error(`Unknown policy ${requested}`);

const results = policies.flatMap((policy) => Array.from({ length: Math.floor(seeds) }, (_, index) => play(index + 1, policy, waveCap)));
if (verbose) for (const row of results) console.log(JSON.stringify(row));
for (const policy of policies) {
  const rows = results.filter((row) => row.policy === policy);
  const average = (key: "wave" | "seconds" | "kills" | "hp" | "casts" | "castsPerMinute") =>
    +(rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2);
  console.log(JSON.stringify({
    policy, runs: rows.length, fell: rows.filter((row) => row.outcome === "fell").length,
    wave: average("wave"), seconds: average("seconds"), kills: average("kills"), hp: average("hp"),
    casts: average("casts"), castsPerMinute: average("castsPerMinute"),
  }));
}
