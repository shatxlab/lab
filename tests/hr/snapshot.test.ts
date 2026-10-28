import { describe, expect, it } from "vitest";

import { abandon, createRun, step } from "@/lib/hr/sim/run";
import { clearRun, normalizeRun, readRun, RUN_STORAGE_KEY, writeRun } from "@/lib/hr/snapshot";
import { starters } from "@/lib/roster/generate";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("run snapshot", () => {
  it("round-trips a run in progress and forgets it on clear", () => {
    const storage = memoryStorage();
    const run = createRun(starters()[1], 4);
    for (let tick = 0; tick < 600; tick += 1) step(run, { dx: 1, dy: 0 });
    writeRun(run, storage);
    expect(readRun(storage)).toEqual(run);
    clearRun(storage);
    expect(readRun(storage)).toBeNull();
  });

  it("throws away garbage, other versions and finished runs", () => {
    const storage = memoryStorage();
    storage.data.set(RUN_STORAGE_KEY, "{not json");
    expect(readRun(storage)).toBeNull();
    const run = createRun(starters()[0], 1);
    expect(normalizeRun({ ...run, version: run.version + 1 })).toBeNull();
    expect(normalizeRun({ ...run, foes: "lots" })).toBeNull();
    expect(normalizeRun({ ...run, hero: { x: 1 } })).toBeNull();
    abandon(run);
    expect(normalizeRun(run)).toBeNull();
  });
});
