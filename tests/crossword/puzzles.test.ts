import { describe, expect, it } from "vitest";

import { buildPuzzle, cellKey, entryId } from "@/lib/crossword/grid";
import { CROSSWORD_PUZZLES, getPuzzle } from "@/lib/crossword/puzzles";

const ALL_PUZZLES = [...CROSSWORD_PUZZLES.en, ...CROSSWORD_PUZZLES.ru];
import type { CrosswordPuzzle } from "@/lib/crossword/types";

function cellLetters(puzzle: CrosswordPuzzle) {
  const built = buildPuzzle(puzzle);
  return { built, letters: built.cells.map((cell) => cell.solution) };
}

describe("crossword puzzle data", () => {
  it("ships fifty puzzles per language with unique ids", () => {
    expect(CROSSWORD_PUZZLES.en.length).toBe(50);
    expect(CROSSWORD_PUZZLES.ru.length).toBe(50);
    const ids = ALL_PUZZLES.map((puzzle) => puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
    // English ids are namespaced so saved progress never collides with Russian.
    expect(CROSSWORD_PUZZLES.en.every((puzzle) => puzzle.id.startsWith("en-"))).toBe(true);
  });

  it("builds every puzzle without crossing conflicts", () => {
    for (const puzzle of ALL_PUZZLES) {
      expect(() => buildPuzzle(puzzle)).not.toThrow();
    }
  });

  it("places each answer so its letters match the grid", () => {
    for (const puzzle of ALL_PUZZLES) {
      const { built } = cellLetters(puzzle);
      for (const entry of built.entries) {
        entry.cells.forEach((cell, index) => {
          expect(built.cells[cell.row * built.cols + cell.col].solution).toBe(entry.answer[index]);
        });
      }
    }
  });

  it("numbers entries contiguously from 1 and references both axes", () => {
    for (const puzzle of ALL_PUZZLES) {
      const built = buildPuzzle(puzzle);
      const numbers = built.entries.map((entry) => entry.number);
      expect(numbers.every((n) => n >= 1)).toBe(true);
      expect(built.maxNumber).toBe(new Set(numbers).size);
      expect(built.entries[0].number).toBe(1);
      for (const cell of built.cells) {
        if (!cell.isBlack) {
          expect(cell.across !== null || cell.down !== null).toBe(true);
        } else {
          expect(cell.across).toBeNull();
          expect(cell.down).toBeNull();
        }
      }
    }
  });

  it("gives every white cell a clue-bearing entry on its axis", () => {
    for (const puzzle of ALL_PUZZLES) {
      const built = buildPuzzle(puzzle);
      for (const entry of built.entries) {
        for (const cell of entry.cells) {
          const placed = built.cells[cell.row * built.cols + cell.col];
          const id = entryId(entry);
          if (entry.dir === "across") expect(placed.across).toBe(id);
          else expect(placed.down).toBe(id);
        }
      }
    }
  });

  it("keeps boards dense enough to read as crosswords", () => {
    for (const puzzle of ALL_PUZZLES) {
      const built = buildPuzzle(puzzle);
      const filled = built.cells.filter((cell) => !cell.isBlack).length;
      expect(filled / (built.rows * built.cols)).toBeGreaterThan(0.4);
    }
  });

  it("keeps authored answers free of Ё so the keyboard is unambiguous", () => {
    for (const puzzle of ALL_PUZZLES) {
      for (const entry of puzzle.entries) {
        expect(entry.answer).not.toMatch(/ё|Ё/);
      }
    }
  });

  it("looks puzzles up by stable id", () => {
    const first = ALL_PUZZLES[0];
    expect(getPuzzle(first.id)?.title).toBe(first.title);
    expect(getPuzzle("missing")).toBeUndefined();
  });

  it("uses distinct cell keys for distinct coordinates", () => {
    expect(cellKey(1, 2)).toBe("1:2");
    expect(cellKey(1, 2)).not.toBe(cellKey(2, 1));
  });
});
