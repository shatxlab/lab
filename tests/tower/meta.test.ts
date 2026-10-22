import { describe, expect, it } from "vitest";

import { bankRun, buyPerk, defaultSave, normalizeSave, perkCost, readSave, TOWER_STORAGE_KEY, writeSave } from "@/lib/tower/meta";
import { PERKS } from "@/lib/tower/sim/balance";
import { createRun } from "@/lib/tower/sim/run";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("normalizeSave", () => {
  it("falls back field by field", () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    const save = normalizeSave({ gold: 12.7, best: -3, runs: "x", perks: { fortify: 99, tactics: 1, bogus: 4 } });
    expect(save.gold).toBe(12);
    expect(save.best).toBe(0);
    expect(save.runs).toBe(0);
    expect(save.perks).toEqual({ fortify: PERKS.fortify.max, fletching: 0, tactics: 1, headStart: 0 });
  });
});

describe("storage", () => {
  it("round-trips and survives garbage", () => {
    const storage = memoryStorage();
    expect(readSave(storage)).toEqual(defaultSave());
    const save = { ...defaultSave(), gold: 40, best: 7 };
    writeSave(save, storage);
    expect(readSave(storage)).toEqual(save);
    storage.data.set(TOWER_STORAGE_KEY, "{not json");
    expect(readSave(storage)).toEqual(defaultSave());
  });
});

describe("perks", () => {
  it("costs more each level and stops at the max", () => {
    const save = { ...defaultSave(), gold: 1000 };
    expect(perkCost(save.perks, "fortify")).toBe(15);
    const once = buyPerk(save, "fortify")!;
    expect(once.gold).toBe(985);
    expect(once.perks.fortify).toBe(1);
    expect(perkCost(once.perks, "fortify")).toBe(30);
    const maxed = { ...save, perks: { ...save.perks, headStart: PERKS.headStart.max } };
    expect(perkCost(maxed.perks, "headStart")).toBeNull();
    expect(buyPerk(maxed, "headStart")).toBeNull();
  });

  it("can't be bought without the gold", () => {
    expect(buyPerk({ ...defaultSave(), gold: 10 }, "fortify")).toBeNull();
  });
});

describe("bankRun", () => {
  it("adds the run's gold and keeps the best wave", () => {
    const run = createRun(1);
    run.wave = 6;
    run.gold = 25;
    const save = bankRun({ ...defaultSave(), gold: 5, best: 9 }, run);
    expect(save).toMatchObject({ gold: 30, best: 9, runs: 1 });
    expect(bankRun(defaultSave(), run).best).toBe(6);
  });
});
