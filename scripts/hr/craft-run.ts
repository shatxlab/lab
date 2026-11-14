import { createRun, choose, descend, step } from "@/lib/hr/sim/run";
import type { Coworker } from "@/lib/roster/types";
export { createRun, choose, descend, step };

export function craftClearedRun(coworker: Coworker): string {
  const run = createRun(coworker, 42, 1);
  let tick = 0;
  while (run.status === "playing" && !run.bossDone && run.time < 120) {
    if (run.picks) { choose(run, 0); continue; }
    step(run, { dx: Math.cos(tick / 300), dy: Math.sin(tick / 300) });
    tick += 1;
  }
  const boss = run.foes.find((foe) => foe.id === run.bossId);
  if (boss) boss.hp = 0;
  step(run, { dx: 0, dy: 0 });
  if (!run.cleared) throw new Error("the crafted run is not cleared");
  return JSON.stringify(run);
}
