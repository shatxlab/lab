import { describe, expect, it } from "vitest";
import { generatePattern, miniStrings, miniText, scorePattern, splitPayoff, splitTotals, type SplitChoice, type Tile } from "@/lib/couples/mini-games";
import { firstChooser, initialPattern, initialSplit, patternReducer, splitReducer } from "@/lib/couples/mini-session";

function seeded(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const target: Tile[] = [1, 0, 2, 0, 3, 0, 0, 0, 0];

describe("generated Secret Pattern", () => {
  it("generates valid, varied 3×3 grids at each round's intended density", () => {
    const distinct = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const random = seeded(seed);
      for (let round = 0; round < 5; round++) {
        const board = generatePattern(round, random);
        expect(board).toHaveLength(9);
        expect(board.every((tile) => [0, 1, 2, 3].includes(tile))).toBe(true);
        expect(board.filter(Boolean)).toHaveLength([3, 4, 4, 5, 5][round]);
        distinct.add(board.join(""));
      }
    }
    expect(distinct.size).toBeGreaterThan(400);
  });
  it("is deterministic with an injected source and doesn't mutate its inputs", () => {
    expect(generatePattern(2, seeded(42))).toEqual(generatePattern(2, seeded(42)));
    const draft = [...target];
    expect(scorePattern(target, draft)).toEqual({ correct: 3, total: 3, extra: 0, perfect: true });
    expect(draft).toEqual(target);
  });
  it("does not score empty-cell matches as placed tiles", () => {
    expect(scorePattern(target, Array(9).fill(0))).toEqual({ correct: 0, total: 3, extra: 0, perfect: false });
  });
  it("counts extra placements and never labels them perfect", () => {
    const draft = [...target]; draft[1] = 2;
    expect(scorePattern(target, draft)).toEqual({ correct: 3, total: 3, extra: 1, perfect: false });
  });
  it("does not count a right shape in the wrong position", () => {
    expect(scorePattern(target, [2, 0, 1, 0, 3, 0, 0, 0, 0])).toEqual({ correct: 1, total: 3, extra: 0, perfect: false });
  });
  it("keeps the draft through a peek and permits unlimited peeks", () => {
    let state = initialPattern(target);
    state = patternReducer(state, { type: "ready" });
    state = patternReducer(state, { type: "pass" });
    state = patternReducer(state, { type: "ready" });
    state = patternReducer(state, { type: "tool", tile: 3 });
    state = patternReducer(state, { type: "place", cell: 4 });
    const draft = state.draft;
    for (let i = 0; i < 12; i++) {
      state = patternReducer(state, { type: "peek" });
      expect(state.phase).toBe("handoff-peek");
      state = patternReducer(state, { type: "ready" });
      expect(state.phase).toBe("peek");
      state = patternReducer(state, { type: "pass" });
      state = patternReducer(state, { type: "ready" });
      expect(state.draft).toEqual(draft);
    }
    expect(state.peeks).toBe(12);
    state = patternReducer(state, { type: "tool", tile: 0 });
    state = patternReducer(state, { type: "place", cell: 4 });
    expect(state.draft[4]).toBe(0);
  });
  it("ignores invalid-phase actions and invalid cells", () => {
    const start = initialPattern(target);
    for (const action of [
      { type: "place", cell: 1 }, { type: "tool", tile: 2 }, { type: "reveal" }, { type: "pass" },
      { type: "finish" }, { type: "peek" }, { type: "next", target }, { type: "prepare-reveal" },
    ] as const) expect(patternReducer(start, action)).toBe(start);
    let state = patternReducer(patternReducer(patternReducer(start, { type: "ready" }), { type: "pass" }), { type: "ready" });
    for (const cell of [-1, 9, NaN, 0.5]) expect(patternReducer(state, { type: "place", cell })).toBe(state);
    expect(patternReducer(state, { type: "tool", tile: 7 as Tile })).toBe(state);
  });
  it("finishes exactly five rounds, scores once, clears grids, and resets round-local state", () => {
    let state = initialPattern(target);
    for (let i = 0; i < 5; i++) {
      state = patternReducer(state, { type: "ready" });
      state = patternReducer(state, { type: "pass" });
      state = patternReducer(state, { type: "ready" });
      target.forEach((tile, cell) => {
        state = patternReducer(state, { type: "tool", tile });
        state = patternReducer(state, { type: "place", cell });
      });
      state = patternReducer(state, { type: "prepare-reveal" });
      expect(state.results).toHaveLength(i);
      state = patternReducer(state, { type: "reveal" });
      expect(patternReducer(state, { type: "reveal" })).toBe(state);
      expect(state.results).toHaveLength(i + 1);
      if (i < 4) {
        expect(patternReducer(state, { type: "finish" })).toBe(state);
        state = patternReducer(state, { type: "next", target });
        expect(state.draft).toEqual(Array(9).fill(0));
        expect(state.peeks).toBe(0);
      }
    }
    expect(patternReducer(state, { type: "next", target })).toBe(state);
    state = patternReducer(state, { type: "finish" });
    expect(state.phase).toBe("summary");
    expect(state.target).toEqual([]);
    expect(state.draft).toEqual([]);
    expect(state.results.every((r) => r.perfect)).toBe(true);
  });
});

describe("Split or Steal rules", () => {
  it.each([
    ["split", "split", [3, 3]], ["split", "steal", [0, 5]],
    ["steal", "split", [5, 0]], ["steal", "steal", [0, 0]],
  ] as const)("pays %s / %s correctly", (a, b, coins) => {
    expect(splitPayoff(a, b)).toEqual(coins);
  });
  it("alternates first chooser", () => {
    expect(Array.from({ length: 8 }, (_, i) => firstChooser(i))).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });
  it("ignores actions out of sequence and duplicate submissions", () => {
    let state = initialSplit();
    for (const type of ["ready", "reveal", "next", "finish"] as const) expect(splitReducer(state, { type })).toBe(state);
    expect(splitReducer(state, { type: "choose", choice: "split" })).toBe(state);
    state = splitReducer(state, { type: "begin" });
    state = splitReducer(state, { type: "ready" });
    state = splitReducer(state, { type: "choose", choice: "steal" });
    expect(splitReducer(state, { type: "choose", choice: "split" })).toBe(state);
    expect(splitReducer(state, { type: "reveal" })).toBe(state);
  });
  it("keeps choices private until reveal, pays once, attributes alternating choices, and completes eight rounds", () => {
    let state = initialSplit();
    for (let i = 0; i < 8; i++) {
      state = splitReducer(state, { type: "begin" });
      state = splitReducer(state, { type: "ready" });
      state = splitReducer(state, { type: "choose", choice: "steal" });
      expect(state.results).toHaveLength(i);
      state = splitReducer(state, { type: "ready" });
      state = splitReducer(state, { type: "choose", choice: "split" });
      expect(state.phase).toBe("locked");
      expect(state.results).toHaveLength(i);
      state = splitReducer(state, { type: "reveal" });
      expect(state.pending).toEqual([null, null]);
      expect(state.results[i].coins).toEqual(i % 2 ? [0, 5] : [5, 0]);
      expect(splitReducer(state, { type: "reveal" })).toBe(state);
      if (i < 7) {
        expect(splitReducer(state, { type: "finish" })).toBe(state);
        state = splitReducer(state, { type: "next" });
        expect(state.pending).toEqual([null, null]);
      }
    }
    expect(splitTotals(state.results)).toEqual([20, 20]);
    expect(splitReducer(state, { type: "next" })).toBe(state);
    state = splitReducer(state, { type: "finish" });
    expect(state.phase).toBe("summary");
    expect(splitTotals([])).toEqual([0, 0]);
  });
  it.each(["split", "steal"] as SplitChoice[])("supports all-%s matches", (choice) => {
    const coins = splitPayoff(choice, choice);
    expect(splitTotals(Array.from({ length: 8 }, () => ({ choices: [choice, choice], coins })))).toEqual(choice === "split" ? [24, 24] : [0, 0]);
  });
});

describe("mini-game localization", () => {
  it("ships matching nonempty EN/RU UI keys", () => {
    expect(Object.keys(miniStrings("en")).sort()).toEqual(Object.keys(miniStrings("ru")).sort());
    for (const lang of ["en", "ru"] as const) expect(Object.values(miniStrings(lang)).every((value) => value.trim())).toBe(true);
  });
  it("substitutes names literally, including dollar characters", () => {
    expect(miniText("I'm {name}: {count}", { name: "$&<Alex>", count: 2 })).toBe("I'm $&<Alex>: 2");
  });
});
