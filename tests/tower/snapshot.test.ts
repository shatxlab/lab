import { describe, expect, it } from "vitest";

import { bankRun, buyPerk, defaultSave, normalizeSave, readSave, readSaveState, TOWER_STORAGE_KEY, writeSave } from "@/lib/tower/meta";
import { createCheckpoint, clearRun, normalizeRun, readRun, readRunState, RUN_STORAGE_KEY, settleRun, writeRun, type RunCheckpoint, type RunStorage } from "@/lib/tower/snapshot";
import { aimAt, castVolley, chooseUpgrade, createRun, giveUp, step, STEP } from "@/lib/tower/sim/run";
import { emptyPerks } from "@/lib/tower/sim/upgrades";
import { richRun } from "./fixtures";

function storage(): RunStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}
const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function ended(id = "finished-one", fell = false): RunCheckpoint {
  const checkpoint = createCheckpoint(createRun(99));
  checkpoint.id = id;
  checkpoint.run.gold = 37;
  checkpoint.run.wave = 8;
  if (fell) checkpoint.run.hp = 0;
  giveUp(checkpoint.run);
  return checkpoint;
}

describe("Lone Tower checkpoints", () => {
  it("gives each new run a distinct identity even when seeds match", () => {
    expect(createCheckpoint(createRun(1)).id).not.toBe(createCheckpoint(createRun(1)).id);
  });

  it.each([0, 1, 2, 3])("round-trips every head-start stage (%i picks) and the ordered offers", (headStart) => {
    const run = createRun(2, { ...emptyPerks(), headStart });
    const store = storage();
    do {
      const checkpoint = createCheckpoint(run);
      expect(writeRun(checkpoint, store)).toBe(true);
      expect(readRun(store)).toEqual(checkpoint);
      if (run.phase === "choosing") chooseUpgrade(run, run.choices[0]);
      else break;
    } while (true);
  });

  it("preserves every mid-wave entity, status timer, upgrade/perk, held input and RNG exactly", () => {
    const checkpoint = createCheckpoint(richRun());
    const run = checkpoint.run;
    expect(run.enemies.some((enemy) => enemy.kind === "boss")).toBe(true);
    expect(run.enemies.some((enemy) => enemy.burnLeft > 0 && enemy.slowLeft > 0)).toBe(true);
    for (const list of [run.enemies, run.arrows, run.volleys, run.caltrops, run.effects, run.spawns]) expect(list.length).toBeGreaterThan(0);
    const store = storage();
    writeRun(checkpoint, store);
    expect(readRun(store)).toEqual(checkpoint);
    expect(normalizeRun(json(checkpoint))).toEqual(checkpoint);
  });

  it.each([1, 445, 912, 167])("continues deterministically after serialization (seed %i)", (seed) => {
    const run = richRun(seed);
    const copy = normalizeRun(json(createCheckpoint(run)))!.run;
    for (let tick = 0; tick < 1800; tick += 1) {
      if (tick % 80 === 0) { aimAt(run, 90, 350); aimAt(copy, 90, 350); }
      if (tick % 400 === 0) { castVolley(run, 100, 300); castVolley(copy, 100, 300); }
      if (run.phase === "choosing") { const choice = run.choices[0]; chooseUpgrade(run, choice); chooseUpgrade(copy, choice); }
      step(run, STEP); step(copy, STEP);
    }
    expect(copy).toEqual(run);
  });

  it("preserves a between-wave picker and produces the same next wave after the same pick", () => {
    const run = createRun(42);
    run.spawns = [];
    step(run, STEP);
    expect(run.phase).toBe("choosing");
    const restored = normalizeRun(json(createCheckpoint(run)))!.run;
    expect(restored.choices).toEqual(run.choices);
    chooseUpgrade(restored, restored.choices[0]);
    chooseUpgrade(run, run.choices[0]);
    expect(restored).toEqual(run);
  });

  it.each([
    (save: any) => { save.version = 999; },
    (save: any) => { save.id = "bad id"; },
    (save: any) => { save.run.phase = "paused"; },
    (save: any) => { save.run.rng = NaN; },
    (save: any) => { save.run.waveTime = -1; },
    (save: any) => { save.run.wave = 1e12; },
    (save: any) => { save.run.hp = 10000; },
    (save: any) => { save.run.hp = 0; },
    (save: any) => { delete save.run.upgrades.fire; },
    (save: any) => { save.run.perks.fortify = 11; },
    (save: any) => { save.run.choices = ["unknown"]; },
    (save: any) => { save.run.phase = "choosing"; },
    (save: any) => { save.run.enemies[0].kind = "unknown"; },
    (save: any) => { save.run.enemies[0].flying = !save.run.enemies[0].flying; },
    (save: any) => { save.run.enemies[0].attackEvery = 0; },
    (save: any) => { delete save.run.enemies[0].summonTimer; },
    (save: any) => { save.run.arrows[0].hitIds = [null]; },
    (save: any) => { save.run.arrows[0].id = save.run.enemies[0].id; },
    (save: any) => { save.run.arrows[0].ricochetLeft = 99; },
    (save: any) => { save.run.volleys[0].duration = 0; },
    (save: any) => { delete save.run.caltrops[0].angle; },
    (save: any) => { save.run.effects[0].kind = "unknown"; },
    (save: any) => { save.run.spawns.reverse(); },
    (save: any) => { save.run.spawns[0].kind = "unknown"; },
    (save: any) => { save.run.nextId = 1; },
    (save: any) => { save.run.enemies = [null]; },
  ])("rejects malformed nested state (%#)", (damage) => {
    const raw = json(createCheckpoint(richRun()));
    damage(raw);
    expect(normalizeRun(raw)).toBeNull();
  });

  it("drops corrupt/incompatible checkpoints without affecting permanent progress", () => {
    const store = storage();
    const save = { ...defaultSave(), gold: 80, best: 9, runs: 2 };
    writeSave(save, store);
    for (const raw of ["{broken", "null", "[]", JSON.stringify({ ...createCheckpoint(createRun(1)), version: 999 })]) {
      store.setItem(RUN_STORAGE_KEY, raw);
      expect(readRun(store)).toBeNull();
      expect(store.getItem(RUN_STORAGE_KEY)).toBeNull();
      expect(readSave(store)).toEqual(save);
    }
  });

  it("does not erase an existing checkpoint when reads alone are blocked", () => {
    const store = storage(), checkpoint = createCheckpoint(createRun(1));
    writeRun(checkpoint, store);
    const get = store.getItem;
    store.getItem = () => { throw Error("cannot read"); };
    expect(readRunState(store)).toEqual({ checkpoint: null, readable: false });
    expect(readRun(store)).toBeNull();
    store.getItem = get;
    expect(readRun(store)).toEqual(checkpoint);
  });

  it("reports storage failures without throwing and can overwrite when deletion is blocked", () => {
    const store = storage();
    const checkpoint = createCheckpoint(createRun(1));
    writeRun(checkpoint, store);
    store.removeItem = () => { throw Error("blocked"); };
    expect(clearRun(store)).toBe(true);
    expect(readRun(store)).toBeNull();
    store.getItem = () => { throw Error("blocked"); };
    store.setItem = () => { throw Error("quota"); };
    expect(readRun(store)).toBeNull();
    expect(writeRun(checkpoint, store)).toBe(false);
    expect(clearRun(store)).toBe(false);
  });
});

describe("exactly-once additive reward settlement", () => {
  it.each([false, true])("banks death/retreat once and cleans up (fell %s)", (fell) => {
    const store = storage(), checkpoint = ended("run-one", fell);
    const before = { ...defaultSave(), gold: 20, best: 10, runs: 3 };
    writeSave(before, store);
    writeRun(checkpoint, store);
    expect(readRun(store)).toEqual(checkpoint);
    const settled = settleRun(checkpoint, store);
    expect(settled).toMatchObject({ persisted: true, newBest: false, save: { gold: 57, best: 10, runs: 4, settledRunIds: [checkpoint.id] } });
    expect(readRun(store)).toBeNull();
    expect(settleRun(checkpoint, store).save).toEqual(settled.save);
    expect(readSave(store)).toEqual(settled.save);
  });

  it("recovers a crash after journaling but before the atomic reward/receipt write", () => {
    const store = storage(), checkpoint = ended();
    writeRun(checkpoint, store);
    expect(readSave(store).gold).toBe(0);
    expect(settleRun(readRun(store)!, store).persisted).toBe(true);
    expect(readSave(store)).toMatchObject({ gold: 37, best: 8, runs: 1, settledRunIds: [checkpoint.id] });
  });

  it("recovers a crash after writing the receipt but before clearing the journal", () => {
    const store = storage(), checkpoint = ended();
    const paid = { ...bankRun(defaultSave(), checkpoint.run), settledRunIds: [checkpoint.id] };
    writeRun(checkpoint, store);
    writeSave(paid, store);
    expect(settleRun(readRun(store)!, store).save).toEqual(paid);
    expect(readRun(store)).toBeNull();
  });

  it("keeps a terminal journal and unchanged meta on quota failure, then retries once", () => {
    const store = storage(), checkpoint = ended();
    const before = { ...defaultSave(), gold: 10, runs: 2 };
    writeSave(before, store);
    const set = store.setItem;
    store.setItem = (key, value) => { if (key === TOWER_STORAGE_KEY) throw Error("quota"); set(key, value); };
    expect(settleRun(checkpoint, store).persisted).toBe(false);
    expect(readSave(store)).toEqual(before);
    expect(readRun(store)?.run.phase).toBe("over");
    store.setItem = set;
    expect(settleRun(readRun(store)!, store).persisted).toBe(true);
    expect(readSave(store)).toMatchObject({ gold: 47, runs: 3 });
    settleRun(checkpoint, store);
    expect(readSave(store)).toMatchObject({ gold: 47, runs: 3 });
  });

  it("can bank even if the terminal journal write fails, with an atomic receipt guarding the old active snapshot", () => {
    const store = storage(), checkpoint = ended();
    checkpoint.run.phase = "playing";
    writeRun(checkpoint, store);
    checkpoint.run.phase = "over";
    const set = store.setItem;
    store.setItem = (key, value) => { if (key === RUN_STORAGE_KEY) throw Error("quota"); set(key, value); };
    store.removeItem = () => { throw Error("blocked"); };
    expect(settleRun(checkpoint, store).persisted).toBe(true);
    expect(readRun(store)?.run.phase).toBe("playing");
    expect(readSave(store).settledRunIds).toContain(checkpoint.id);
    expect(settleRun(checkpoint, store).save.gold).toBe(37);
  });

  it("does not erase a newer checkpoint or repay an old result after other runs and perk purchases", () => {
    const store = storage(), first = ended("first"), second = ended("second");
    settleRun(first, store);
    settleRun(second, store);
    const bought = buyPerk(readSave(store), "fortify")!;
    writeSave(bought, store);
    const current = createCheckpoint(createRun(1, bought.perks));
    writeRun(current, store);
    expect(settleRun(first, store).save).toEqual(bought);
    expect(readRun(store)).toEqual(current);
    expect(readSave(store)).toMatchObject({ gold: 54, runs: 2, settledRunIds: ["first", "second"], perks: { fortify: 1 } });
  });

  it.each(["{bad", "null", JSON.stringify({ gold: 90, settledRunIds: "lost" }), JSON.stringify({ gold: 90, settledRunIds: [null] })])("never overwrites unreadable meta or unknown receipts (%s)", (raw) => {
    const store = storage(), checkpoint = ended();
    store.setItem(TOWER_STORAGE_KEY, raw);
    expect(readSaveState(store).readable).toBe(false);
    expect(settleRun(checkpoint, store).persisted).toBe(false);
    expect(store.getItem(TOWER_STORAGE_KEY)).toBe(raw);
    expect(readRun(store)?.run.phase).toBe("over");
  });

  it("does not mistake blocked reads for a fresh account, but keeps the result journal", () => {
    const store = storage(), checkpoint = ended();
    writeSave({ ...defaultSave(), gold: 50 }, store);
    const get = store.getItem;
    store.getItem = (key) => { if (key === TOWER_STORAGE_KEY) throw Error("blocked"); return get(key); };
    expect(settleRun(checkpoint, store).persisted).toBe(false);
    expect(readRun(store)?.run.phase).toBe("over");
    store.getItem = get;
    expect(readSave(store).gold).toBe(50);
    expect(settleRun(checkpoint, store).save.gold).toBe(87);
  });

  it("migrates legacy meta with unchanged gold/best/runs/perks and adds empty receipts", () => {
    const save = normalizeSave({ gold: 35, best: 9, runs: 4, perks: { fortify: 2, headStart: 1 } });
    expect(save).toMatchObject({ gold: 35, best: 9, runs: 4, perks: { fortify: 2, headStart: 1 }, settledRunIds: [] });
    expect(normalizeSave({ ...save, settledRunIds: ["one", "one", 42] }).settledRunIds).toEqual(["one"]);
  });

  it("refuses to bank a nonterminal run", () => {
    const store = storage();
    expect(settleRun(createCheckpoint(createRun(1)), store).persisted).toBe(false);
    expect(readSave(store)).toEqual(defaultSave());
    expect(store.data.size).toBe(0);
  });
});
