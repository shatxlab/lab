import { describe, expect, it } from "vitest";

import { KINGSROAD_STORAGE_KEY, readSave, recordWin, defaultSave, writeSave } from "@/lib/kingsroad/meta";
import { build, callWave, castVolley, createGame, leadFoe, step, STEP, upgrade } from "@/lib/kingsroad/sim/game";
import { MAPS } from "@/lib/kingsroad/sim/maps";
import type { Game } from "@/lib/kingsroad/sim/types";
import { clearRun, normalizeRun, readRun, RUN_STORAGE_KEY, RUN_VERSION, settleRun, writeRun, type RunStorage } from "@/lib/kingsroad/snapshot";

function storage(): RunStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}

/** Real late-wave state, including branches, queued spawns and live projectiles. */
function activeGame(): Game {
  const game = createGame("watch", 912);
  game.gold = 50_000;
  const kinds = ["archer", "archer", "catapult", "frost", "ballista"] as const;
  for (let plot = 0; plot < MAPS.find((map) => map.id === "watch")!.plots.length; plot += 1) {
    const kind = kinds[plot % kinds.length];
    build(game, plot, kind);
    upgrade(game, plot);
    upgrade(game, plot, kind === "archer" ? plot % 2 ? "lune" : "fire" : undefined);
  }
  game.wave = 11;
  callWave(game);
  for (let tick = 0; tick < 1200 && game.shots.length === 0; tick += 1) step(game, STEP);
  const target = leadFoe(game)!;
  castVolley(game, target.x, target.y);
  return game;
}

function envelope(game: Game) { return JSON.parse(JSON.stringify({ version: RUN_VERSION, game })); }

describe("KingsRoad active-run checkpoints", () => {
  it("round-trips every map's setup without altering campaign progress", () => {
    const store = storage();
    writeSave(recordWin(defaultSave(), "meadow", 2), store);
    const campaign = store.getItem(KINGSROAD_STORAGE_KEY);
    for (const map of MAPS) {
      const game = createGame(map.id, 5);
      build(game, 0, "archer");
      expect(writeRun(game, store)).toBe(true);
      expect(readRun(store)).toEqual(game);
    }
    expect(store.getItem(KINGSROAD_STORAGE_KEY)).toBe(campaign);
  });

  it("preserves exact mid-wave state and deterministically continues after JSON", () => {
    const game = activeGame();
    expect(game.shots.length).toBeGreaterThan(0);
    expect(game.foes.length).toBeGreaterThan(0);
    expect(game.spawns.length).toBeGreaterThan(0);
    expect(game.volleys.length).toBeGreaterThan(0);
    expect(game.towers.some((tower) => tower.branch === "fire")).toBe(true);
    expect(game.towers.some((tower) => tower.branch === "lune")).toBe(true);
    const store = storage();
    writeRun(game, store);
    const restored = readRun(store)!;
    expect(restored).toEqual(game);
    for (let tick = 0; tick < 1200; tick += 1) {
      if (tick === 300) { castVolley(game, 200, 300); castVolley(restored, 200, 300); }
      step(game, STEP);
      step(restored, STEP);
    }
    expect(restored).toEqual(game);
  });

  it.each([
    (save: any) => { save.version += 1; },
    (save: any) => { save.game.map = "unknown"; },
    (save: any) => { save.game.status = "paused"; },
    (save: any) => { save.game.rng = NaN; },
    (save: any) => { save.game.wave = 999; },
    (save: any) => { save.game.towers[0].kind = "unknown"; },
    (save: any) => { save.game.towers[0].plot = 999; },
    (save: any) => { save.game.towers[0].level = 9; },
    (save: any) => { save.game.towers[0].branch = "unknown"; },
    (save: any) => { save.game.towers.push({ ...save.game.towers[0], id: save.game.nextId++ }); },
    (save: any) => { save.game.foes[0].route = { road: 999 }; },
    (save: any) => { delete save.game.foes[0].markLeft; },
    (save: any) => { save.game.shots[0].hitIds = ["bad"]; },
    (save: any) => { save.game.volleys[0].duration = 0; },
    (save: any) => { save.game.effects[0].kind = "unknown"; },
    (save: any) => { save.game.spawns[0].road = -1; },
    (save: any) => { save.game.foes[0].id = save.game.towers[0].id; },
    (save: any) => { save.game.nextId = 1; },
    (save: any) => { save.game.foes = [null]; },
    (save: any) => { save.game.spawns.reverse(); },
  ])("rejects malformed nested state (%#)", (damage) => {
    const raw = envelope(activeGame());
    damage(raw);
    expect(normalizeRun(raw)).toBeNull();
  });

  it("ignores and clears corrupt JSON, null, and incompatible saves without touching stars", () => {
    const store = storage();
    writeSave(recordWin(defaultSave(), "meadow", 3), store);
    for (const raw of ["{bad", "null", "[]", JSON.stringify({ version: 100, game: createGame("meadow", 1) })]) {
      store.setItem(RUN_STORAGE_KEY, raw);
      expect(readRun(store)).toBeNull();
      expect(store.getItem(RUN_STORAGE_KEY)).toBeNull();
      expect(readSave(store).stars.meadow).toBe(3);
    }
  });

  it("handles unavailable storage and full quota without throwing", () => {
    const broken: RunStorage = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("quota"); }, removeItem: () => { throw Error("blocked"); } };
    expect(readRun(broken)).toBeNull();
    expect(writeRun(createGame("meadow", 1), broken)).toBe(false);
    expect(clearRun(broken)).toBe(false);
  });

  it("overwrites a stale checkpoint if deletion fails but writes work", () => {
    const store = storage();
    writeRun(createGame("meadow", 1), store);
    store.removeItem = () => { throw Error("cannot remove"); };
    expect(clearRun(store)).toBe(true);
    expect(readRun(store)).toBeNull();
  });
});

describe("terminal-run recovery", () => {
  function won(): Game {
    return { ...createGame("meadow", 1), status: "won", wave: MAPS[0].waves, lives: 20 };
  }

  it("settles stars idempotently and clears the terminal checkpoint", () => {
    const store = storage();
    const game = won();
    expect(settleRun(game, store)).toMatchObject({ newBest: true, persisted: true });
    const once = readSave(store);
    expect(once.stars.meadow).toBe(3);
    expect(readRun(store)).toBeNull();
    expect(settleRun(game, store)).toMatchObject({ newBest: false, persisted: true, save: once });
  });

  it("recovers a crash after journaling the win but before writing campaign progress", () => {
    const store = storage();
    writeRun(won(), store);
    const terminal = readRun(store)!;
    expect(terminal.status).toBe("won");
    expect(settleRun(terminal, store).persisted).toBe(true);
    expect(readSave(store).stars.meadow).toBe(3);
    expect(readRun(store)).toBeNull();
  });

  it("recovers a crash after writing stars but before clearing the journal", () => {
    const store = storage();
    writeSave(recordWin(defaultSave(), "meadow", 3), store);
    const weakerWin = { ...won(), lives: 5 };
    writeRun(weakerWin, store);
    expect(settleRun(readRun(store)!, store).save.stars.meadow).toBe(3);
    expect(readRun(store)).toBeNull();
  });

  it("keeps the terminal journal if campaign storage fails, and retries safely", () => {
    const store = storage();
    const set = store.setItem;
    store.setItem = (key, value) => { if (key === KINGSROAD_STORAGE_KEY) throw Error("quota"); set(key, value); };
    expect(settleRun(won(), store).persisted).toBe(false);
    expect(readRun(store)?.status).toBe("won");
    store.setItem = set;
    expect(settleRun(readRun(store)!, store).persisted).toBe(true);
    expect(readSave(store).stars.meadow).toBe(3);
    expect(readRun(store)).toBeNull();
  });

  it("cleans up losses, including surrender before wave 1, without campaign changes", () => {
    const store = storage();
    writeSave(recordWin(defaultSave(), "meadow", 2), store);
    const game: Game = { ...createGame("meadow", 1), status: "lost" };
    writeRun(game, store);
    expect(readRun(store)).toEqual(game);
    expect(settleRun(game, store).persisted).toBe(true);
    expect(readSave(store).stars.meadow).toBe(2);
    expect(readRun(store)).toBeNull();
  });
});
