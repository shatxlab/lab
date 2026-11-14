// Crafts a run JSON per floor, sitting exactly in the boss phase with the hero near the boss, so a browser check
// can screenshot every boss as it is now, not as a playthrough happens to meet it.
//
//   npx esbuild scripts/hr/craft-boss-runs.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr-boss.mjs
//   node /tmp/hr-boss.mjs /tmp/hr-boss-runs.json
//
import fs from "node:fs";
import { starters } from "@/lib/roster/generate";
import { LAST_FLOOR } from "@/lib/hr/sim/balance";
import { choose, createRun, descend, step } from "@/lib/hr/sim/run";
import type { Coworker } from "@/lib/roster/types";

const [intern] = starters();
/** A plain coworker: every stat 10, no quirks, so the run plays on the base numbers. */
const plain: Coworker = { ...intern, quirks: [], stats: { grit: 10, output: 10, hustle: 10, focus: 10, luck: 10 } };

/** Plays to the given floor and stops with its boss out and the hero a comfortable distance away. */
function craftBossRun(floor: number): string {
  const run = createRun(plain, 7, 1);
  let tick = 0;
  const play = (steps: number) => {
    for (let index = 0; index < steps; index += 1) {
      if (run.status !== "playing") return;
      if (run.picks) {
        choose(run, 0);
        continue;
      }
      // A screenshot rig, not an honest run: top the hero up so the wander cannot die.
      run.hero.hp = run.numbers.maxHp;
      step(run, { dx: Math.cos(tick / 240), dy: Math.sin(tick / 240) });
      tick += 1;
    }
  };
  // Skip the earlier floors: wait out each horde until the floor's boss walks in (the hero never dies here), beat
  // it at once, and take the stairs.
  while (run.floor < floor) {
    for (let guard = 0; guard < 120 && !run.foes.some((foe) => foe.id === run.bossId); guard += 1) play(60);
    if (!run.cleared) {
      const boss = run.foes.find((foe) => foe.id === run.bossId);
      if (!boss) throw new Error(`floor ${run.floor}: no boss out`);
      boss.hp = 0;
      step(run, { dx: 0, dy: 0 });
      if (!run.cleared) throw new Error(`floor ${run.floor}: the boss fell but the floor is not cleared`);
    }
    descend(run);
  }
  // Wait out the horde phase so the boss walks in (and, for the immobile ones, walks up) — but no further,
  // or the weapons kill it before the shot.
  for (let guard = 0; guard < 120 && !run.foes.some((foe) => foe.id === run.bossId); guard += 1) play(60);
  const boss = run.foes.find((foe) => foe.id === run.bossId);
  if (!boss) throw new Error(`floor ${floor}: no boss out`);
  // Park the hero just outside the boss's reach so the phase reads on the shot.
  run.hero.x = boss.x;
  run.hero.y = boss.y + boss.radius + 150;
  step(run, { dx: 0, dy: 0 });
  return JSON.stringify(run);
}

const out = process.argv[2] ?? "/tmp/hr-boss-runs.json";
const runs: Record<string, string> = {};
for (let floor = 1; floor <= LAST_FLOOR; floor += 1) runs[String(floor)] = craftBossRun(floor);
fs.writeFileSync(out, JSON.stringify(runs));
console.log(`crafted boss runs for floors 1..${LAST_FLOOR} → ${out}`);
