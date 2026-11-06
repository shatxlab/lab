import { describe, expect, it } from "vitest";

import { crosswordReducer, initialState } from "@/lib/crossword/game";
import { buildPuzzle } from "@/lib/crossword/grid";
import { WARMUP_PUZZLE } from "./fixture";
import {
  applyStoredProgress,
  CROSSWORD_STORAGE_KEY,
  normalizeCrosswordState,
  readCrosswordState,
  toStoredProgress,
  withPuzzleProgress,
  writeCrosswordState,
} from "@/lib/crossword/storage";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    entries: () => Object.fromEntries(map),
  };
}

describe("crossword storage", () => {
  it("keeps valid letters and drops everything else", () => {
    const normalized = normalizeCrosswordState({
      warmup: {
        values: { "0:0": "ш", "1:1": "!", "2:2": "Ё", bad: "А" },
        revealed: ["0:0", "nope", 5],
        elapsed: 42.7,
        completed: true,
      },
    });
    expect(normalized.warmup.values).toEqual({ "0:0": "Ш", "2:2": "Е" });
    expect(normalized.warmup.revealed).toEqual(["0:0"]);
    expect(normalized.warmup.elapsed).toBe(42.7);
    expect(normalized.warmup.completed).toBe(true);
  });

  it("clamps absurd elapsed times and ignores junk payloads", () => {
    expect(normalizeCrosswordState(null)).toEqual({});
    expect(normalizeCrosswordState({ x: 4 })).toEqual({});
    const clamped = normalizeCrosswordState({ a: { elapsed: -10 }, b: { elapsed: 1e9 } });
    expect(clamped.a.elapsed).toBe(0);
    expect(clamped.b.elapsed).toBe(60 * 60 * 24);
  });

  it("round-trips through a storage like localStorage", () => {
    const storage = fakeStorage();
    const store = withPuzzleProgress({}, "warmup", {
      values: { "0:0": "Ш" },
      revealed: [],
      assistanceCount: 0,
      elapsed: 5,
      completed: false,
    });
    writeCrosswordState(store, storage);
    expect(storage.entries()).toHaveProperty(CROSSWORD_STORAGE_KEY);
    expect(readCrosswordState(storage).warmup.values).toEqual({ "0:0": "Ш" });
  });

  it("migrates legacy marker counts as a lower bound and sanitizes explicit counts", () => {
    const legacy = { revealed: ["0:0", "0:0", "0:1"] };
    const normalized = normalizeCrosswordState({
      legacy,
      oldCleared: { revealed: [] },
      current: { ...legacy, assistanceCount: 7 },
      invalid: { ...legacy, assistanceCount: -3 },
      nonfinite: { ...legacy, assistanceCount: Infinity },
      fractional: { assistanceCount: 4.8 },
    });
    expect(normalized.legacy.assistanceCount).toBe(2);
    expect(normalized.oldCleared.assistanceCount).toBe(0);
    expect(normalized.current.assistanceCount).toBe(7);
    expect(normalized.invalid.assistanceCount).toBe(2);
    expect(normalized.nonfinite.assistanceCount).toBe(2);
    expect(normalized.fractional.assistanceCount).toBe(4);
  });

  it("round-trips assistance after clearing all highlight markers", () => {
    const built = buildPuzzle(WARMUP_PUZZLE);
    let state = crosswordReducer(built, initialState(built), { type: "reveal" });
    state = crosswordReducer(built, state, { type: "clear" });
    const storage = fakeStorage();
    writeCrosswordState(withPuzzleProgress({}, "warmup", toStoredProgress(state, false)), storage);
    const loaded = applyStoredProgress(initialState(built), readCrosswordState(storage).warmup);
    expect(loaded.assistanceCount).toBe(1);
    expect(loaded.revealed).toEqual([]);
    expect(loaded.values).toEqual({});
  });

  it("returns an empty store for missing or malformed JSON", () => {
    expect(readCrosswordState(fakeStorage())).toEqual({});
    expect(readCrosswordState(fakeStorage({ [CROSSWORD_STORAGE_KEY]: "{nope" }))).toEqual({});
  });

  it("applies saved progress onto a fresh game state", () => {
    const built = buildPuzzle(WARMUP_PUZZLE);
    const fresh = initialState(built);
    const merged = applyStoredProgress(fresh, {
      values: { "0:0": "Ш" },
      revealed: ["0:0"],
      assistanceCount: 1,
      elapsed: 12,
      completed: false,
    });
    expect(merged.values).toEqual({ "0:0": "Ш" });
    expect(merged.revealed).toEqual(["0:0"]);
    expect(merged.elapsed).toBe(12);
    // A missing entry leaves the fresh state untouched.
    expect(applyStoredProgress(fresh, undefined)).toBe(fresh);
  });

  it("snapshots the live state", () => {
    const built = buildPuzzle(WARMUP_PUZZLE);
    const state = { ...initialState(built), values: { "0:0": "Ш" }, elapsed: 9 };
    expect(toStoredProgress(state, true)).toEqual({
      values: { "0:0": "Ш" },
      revealed: [],
      assistanceCount: 0,
      elapsed: 9,
      completed: true,
    });
  });
});
