import { describe, expect, it } from "vitest";

import { ENEMIES } from "@/lib/tower/sim/balance";
import { createRun, giveUp, step, STEP } from "@/lib/tower/sim/run";
import { buildSpawns, waveRoster } from "@/lib/tower/sim/waves";
import type { EnemyKind } from "@/lib/tower/sim/types";
import { enemiesLeft, incomingRoster } from "@/lib/tower/wave-intel";

describe("incomingRoster", () => {
  it("reads the same counts the wave definitions produce, in unlock order", () => {
    for (let wave = 1; wave <= 40; wave += 1) {
      const roster = waveRoster(wave);
      const preview = incomingRoster(wave);
      expect(preview.map(([kind]) => kind)).toEqual(
        (["grunt", "runner", "brute", "bat", "boss"] as EnemyKind[]).filter((kind) => roster[kind] > 0),
      );
      for (const [kind, count] of preview) expect(count).toBe(roster[kind]);
      expect(preview.reduce((sum, [, count]) => sum + count, 0)).toBeGreaterThan(0);
    }
  });

  it.each([1, 7, 445, 90210])("matches what buildSpawns actually schedules (seed %i)", (seed) => {
    for (let wave = 1; wave <= 25; wave += 1) {
      const scheduled = new Map<EnemyKind, number>();
      for (const spawn of buildSpawns(wave, { rng: seed })) scheduled.set(spawn.kind, (scheduled.get(spawn.kind) ?? 0) + 1);
      const preview = new Map(incomingRoster(wave));
      expect(Object.fromEntries(scheduled)).toEqual(Object.fromEntries(preview));
    }
  });
});

describe("enemiesLeft", () => {
  it("counts the spawn queue plus everyone already on the field", () => {
    const run = createRun(3);
    expect(enemiesLeft(run)).toBe(run.spawns.length);
    const queued = run.spawns.length;
    for (let tick = 0; tick < Math.floor(2 / STEP); tick += 1) step(run, STEP);
    const onField = run.enemies.length;
    expect(enemiesLeft(run)).toBe(run.spawns.length + onField);
    expect(run.spawns.length).toBeLessThan(queued);
  });

  it("reaches zero exactly when the field and queue are clear", () => {
    const run = createRun(11);
    run.spawns = [];
    run.enemies = [];
    expect(enemiesLeft(run)).toBe(0);
    expect(run.enemies.length).toBe(0);
    expect(Object.keys(ENEMIES)).toHaveLength(5);
    giveUp(run);
  });
});
