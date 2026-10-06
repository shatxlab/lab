import { describe, expect, it } from "vitest";

import { cellKey, buildPuzzle } from "@/lib/crossword/grid";
import {
  crosswordReducer,
  initialState,
  isPuzzleSolved,
  parseInput,
  progress,
  solvedEntryIds,
  stepCell,
  wrongCells,
  type CrosswordState,
} from "@/lib/crossword/game";
import { WALK_PUZZLE, WARMUP_PUZZLE } from "./fixture";

const warmup = buildPuzzle(WARMUP_PUZZLE);
const walk = buildPuzzle(WALK_PUZZLE);

function type(state: CrosswordState, word: string): CrosswordState {
  return crosswordReducer(warmup, state, { type: "type", letters: parseInput(word) });
}

function solutionValues() {
  const values: Record<string, string> = {};
  for (const cell of warmup.cells) {
    if (!cell.isBlack) values[cellKey(cell.row, cell.col)] = cell.solution;
  }
  return values;
}

describe("parseInput", () => {
  it("accepts Cyrillic and folds Ё to Е", () => {
    expect(parseInput("Школа")).toEqual(["Ш", "К", "О", "Л", "А"]);
    expect(parseInput("ёЁ")).toEqual(["Е", "Е"]);
  });

  it("maps a Latin keyboard onto ЙЦУКЕН", () => {
    expect(parseInput("rjnf")).toEqual(["К", "О", "Т", "А"]);
    expect(parseInput("ab")).toEqual(["Ф", "И"]);
  });

  it("drops characters with no Russian equivalent", () => {
    expect(parseInput("1 2 #")).toEqual([]);
  });
});

describe("crosswordReducer", () => {
  it("starts on the first entry", () => {
    expect(initialState(warmup).cursor).toEqual({ row: 0, col: 0, dir: "across" });
  });

  it("fills a word, marks it solved and hands off to the next word", () => {
    const state = type(initialState(warmup), "Школа");
    expect(state.values["0:0"]).toBe("Ш");
    expect(state.values["0:4"]).toBe("А");
    expect(solvedEntryIds(warmup, state.values).has("across-0-0")).toBe(true);
    expect(progress(warmup, state.values).solved).toBe(1);
    // Once a word is solved the cursor moves to the next unsolved word's start
    // and the solved cells become read-only.
    expect(state.cursor).toEqual({ row: 0, col: 2, dir: "down" });
  });

  it("never overwrites a solved word, even through a crossing", () => {
    let state = type(initialState(warmup), "Школа");
    // The cursor is on ОЗЕРО's opening О, which ШКОЛА already fixed.
    state = type(state, "Я");
    expect(state.values["0:2"]).toBe("О");
    state = type(state, "З");
    expect(state.values["1:2"]).toBe("З");
  });

  it("does not shift a word whose opening letter was filled by a crossing", () => {
    let state = type(initialState(warmup), "Школа");
    state = type(state, "Озеро");
    expect(state.values["0:2"]).toBe("О");
    expect(state.values["1:2"]).toBe("З");
    expect(state.values["2:2"]).toBe("Е");
    expect(state.values["3:2"]).toBe("Р");
    expect(state.values["4:2"]).toBe("О");
    expect(solvedEntryIds(warmup, state.values).has("down-0-2")).toBe(true);
  });

  it("does not mark a wrong word as solved", () => {
    const state = type(initialState(warmup), "Школп");
    expect(solvedEntryIds(warmup, state.values).size).toBe(0);
    expect(progress(warmup, state.values).solved).toBe(0);
  });

  it("backspaces the current letter, or the previous one when empty", () => {
    let state = type(initialState(warmup), "Ш");
    expect(state.cursor).toEqual({ row: 0, col: 1, dir: "across" });
    state = crosswordReducer(warmup, state, { type: "backspace" });
    expect(state.values["0:0"]).toBeUndefined();
    expect(state.cursor).toEqual({ row: 0, col: 0, dir: "across" });
    // Nothing before the first cell: state is unchanged.
    expect(crosswordReducer(warmup, state, { type: "backspace" })).toBe(state);
  });

  it("toggles direction only on a shared cell", () => {
    let state = crosswordReducer(warmup, initialState(warmup), { type: "select", row: 0, col: 2 });
    expect(state.cursor.dir).toBe("across");
    state = crosswordReducer(warmup, state, { type: "toggleDirection" });
    expect(state.cursor.dir).toBe("down");

    const acrossOnly = crosswordReducer(warmup, initialState(warmup), { type: "select", row: 0, col: 0 });
    expect(crosswordReducer(warmup, acrossOnly, { type: "toggleDirection" }).cursor.dir).toBe("across");
  });

  it("chooses the tapped word's axis deterministically", () => {
    // From a down word, tapping the start of an across word selects across.
    let state = crosswordReducer(walk, initialState(walk), { type: "selectEntry", id: "down-2-3" });
    state = crosswordReducer(walk, state, { type: "select", row: 3, col: 0 });
    expect(state.cursor).toEqual({ row: 3, col: 0, dir: "across" });

    // From an across word, tapping a down-only start selects down.
    let across = crosswordReducer(walk, initialState(walk), { type: "selectEntry", id: "across-3-0" });
    across = crosswordReducer(walk, across, { type: "select", row: 1, col: 0 });
    expect(across.cursor).toEqual({ row: 1, col: 0, dir: "down" });
  });

  it("ignores taps on black cells", () => {
    const state = crosswordReducer(warmup, initialState(warmup), { type: "select", row: 0, col: 5 });
    expect(state.cursor).toEqual({ row: 0, col: 0, dir: "across" });
  });

  it("reveals the correct letter and records the hint", () => {
    const state = crosswordReducer(warmup, initialState(warmup), { type: "reveal" });
    expect(state.values["0:0"]).toBe("Ш");
    expect(state.revealed).toContain("0:0");
    expect(state.cursor).toEqual({ row: 0, col: 1, dir: "across" });
  });

  it("hints the next editable letter when the cursor sits on a solved crossing", () => {
    let state = type(initialState(warmup), "Школа");
    state = crosswordReducer(warmup, state, { type: "reveal" });
    expect(state.values["0:2"]).toBe("О");
    expect(state.values["1:2"]).toBe("З");
    expect(state.revealed).toContain("1:2");
  });

  it("hops to the next word at a word boundary", () => {
    let state = crosswordReducer(warmup, initialState(warmup), { type: "select", row: 0, col: 4 });
    state = crosswordReducer(warmup, state, { type: "move", dr: 0, dc: 1 });
    expect(state.cursor).toEqual({ row: 2, col: 1, dir: "across" });
  });

  it("steps through entries with wraparound", () => {
    const next = crosswordReducer(warmup, initialState(warmup), { type: "nextEntry", step: 1 });
    expect(next.cursor).toEqual({ row: 0, col: 2, dir: "down" });
    const back = crosswordReducer(warmup, next, { type: "nextEntry", step: -1 });
    expect(back.cursor).toEqual({ row: 0, col: 0, dir: "across" });
  });

  it("clears letters and hints", () => {
    let state = type(initialState(warmup), "Школа");
    state = crosswordReducer(warmup, state, { type: "clear" });
    expect(state.values).toEqual({});
    expect(state.revealed).toEqual([]);
  });
});

describe("crossword helpers", () => {
  it("detects a full, correct board", () => {
    const values = solutionValues();
    expect(isPuzzleSolved(warmup, values)).toBe(true);
    expect(progress(warmup, values)).toEqual({ solved: warmup.entries.length, filled: warmup.entries.length, total: warmup.entries.length });
  });

  it("flags filled letters that disagree with the solution", () => {
    const values = solutionValues();
    values["0:0"] = "Б";
    expect(wrongCells(warmup, values).has("0:0")).toBe(true);
    expect(wrongCells(warmup, values).size).toBe(1);
  });

  it("steps to the next white cell and skips black squares", () => {
    const cursor = stepCell(warmup, { row: 0, col: 2, dir: "across" }, 0, 1);
    expect(cursor).toEqual({ row: 0, col: 3, dir: "across" });
  });

  it("never strands the cursor on a cell without a word in that direction", () => {
    const cursor = stepCell(warmup, { row: 0, col: 1, dir: "down" }, 1, 0);
    const cell = warmup.cells[cursor.row * warmup.cols + cursor.col];
    expect(cursor.dir).toBe("down");
    expect(cell.down).not.toBeNull();
  });
});
