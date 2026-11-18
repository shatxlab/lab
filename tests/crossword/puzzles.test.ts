import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildPuzzle, cellKey, entryId } from "@/lib/crossword/grid";
import { CROSSWORD_PUZZLES, getPuzzle } from "@/lib/crossword/puzzles";
import type { CrosswordPuzzle } from "@/lib/crossword/types";
import { COMMON_ANSWERS, WORD_BANKS } from "@/lib/crossword/wordbank";

const ALL_PUZZLES = [...CROSSWORD_PUZZLES.en, ...CROSSWORD_PUZZLES.ru];

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

  it.each(["en", "ru"] as const)("progresses through exact 10–50 word targets in %s", (lang) => {
    const puzzles = CROSSWORD_PUZZLES[lang];
    const counts = puzzles.map((puzzle) => puzzle.entries.length);
    expect(counts).toEqual(Array.from({ length: 50 }, (_, i) => 10 + Math.round(i * 40 / 49)));
    expect(counts[0]).toBe(10);
    expect(counts.at(-1)).toBe(50);
    expect(counts.every((count, i) => count >= 10 && count <= 50 && (i === 0 || count >= counts[i - 1]))).toBe(true);
    for (const puzzle of puzzles) {
      const count = puzzle.entries.length;
      expect(puzzle.lang).toBe(lang);
      expect(puzzle.difficulty, puzzle.id).toBe(count <= 15 ? "easy" : count <= 30 ? "medium" : "hard");
    }
    // Category endpoints must be real boards, not labels on underfilled grids.
    for (const [difficulty, first, last, total] of [
      ["easy", 10, 15, 7], ["medium", 16, 30, 19], ["hard", 31, 50, 24],
    ] as const) {
      const category = puzzles.filter((puzzle) => puzzle.difficulty === difficulty);
      expect(category).toHaveLength(total);
      expect(category[0].entries).toHaveLength(first);
      expect(category.at(-1)?.entries).toHaveLength(last);
    }
  });

  it("uses v2 content-addressed ids that cannot collide with any v1 save", () => {
    const legacyIds = new Set(Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(2, "0"))
      .flatMap((index) => [`cw-${index}`, `en-cw-${index}`]));
    for (const lang of ["en", "ru"] as const) {
      CROSSWORD_PUZZLES[lang].forEach((puzzle, index) => {
        const canonical = puzzle.entries.map(({ answer, row, col, dir }) => JSON.stringify([row, col, dir, answer])).sort();
        const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 12);
        const prefix = lang === "en" ? "en-" : "";
        expect(puzzle.id).toBe(`${prefix}cw-v2-${String(index + 1).padStart(2, "0")}-${hash}`);
        expect(legacyIds.has(puzzle.id)).toBe(false);
      });
    }
  });

  it("uses familiar vocabulary for easy boards, not just shorter science terms", () => {
    for (const lang of ["en", "ru"] as const) {
      const common = new Set(COMMON_ANSWERS[lang]);
      expect(common.size).toBe(COMMON_ANSWERS[lang].length);
      for (const answer of common) expect(WORD_BANKS[lang][answer]).toBeTruthy();
      const easy = CROSSWORD_PUZZLES[lang].filter((puzzle) => puzzle.difficulty === "easy");
      for (const puzzle of easy) {
        expect(puzzle.subtitle).toBe(lang === "en" ? "Everyday words" : "Знакомые слова");
        for (const entry of puzzle.entries) expect(common.has(entry.answer), `${puzzle.id}: ${entry.answer}`).toBe(true);
      }
      expect(easy.some((puzzle) => puzzle.entries.some((entry) => entry.answer.length >= 8))).toBe(true);
    }
    expect(COMMON_ANSWERS.en).not.toContain("AXIOM");
    expect(COMMON_ANSWERS.en).toContain("WATERFALL");
    expect(COMMON_ANSWERS.ru).not.toContain("КВАРК");
    expect(COMMON_ANSWERS.ru).toContain("ТЕРМОМЕТР");
  });

  it("never repeats an answer within a puzzle or ships an identical board", () => {
    const boards = new Set<string>();
    for (const puzzle of ALL_PUZZLES) {
      expect(new Set(puzzle.entries.map((entry) => entry.answer)).size, puzzle.id).toBe(puzzle.entries.length);
      for (const entry of puzzle.entries) {
        expect(entry.clue).toBe(WORD_BANKS[puzzle.lang][entry.answer]);
        expect(entry.clue.trim().length).toBeGreaterThan(0);
        expect(entry.answer.length).toBeGreaterThanOrEqual(3);
      }
      const built = buildPuzzle(puzzle);
      const board = JSON.stringify([built.rows, built.cols, built.cells.map((cell) => cell.solution)]);
      expect(boards.has(board), puzzle.id).toBe(false);
      boards.add(board);
    }
  });

  it("connects every entry by true perpendicular crossings", () => {
    for (const puzzle of ALL_PUZZLES) {
      const built = buildPuzzle(puzzle);
      const graph = new Map(built.entries.map((entry) => [entry.id, new Set<string>()]));
      expect(graph.size, puzzle.id).toBe(puzzle.entries.length);
      for (const cell of built.cells) {
        if (cell.across && cell.down) {
          graph.get(cell.across)!.add(cell.down);
          graph.get(cell.down)!.add(cell.across);
        }
      }
      // Every word participates in a crossing; isolated islands are not enough.
      for (const neighbors of graph.values()) expect(neighbors.size, puzzle.id).toBeGreaterThan(0);
      const reached = new Set<string>();
      const queue = [built.entries[0].id];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (reached.has(id)) continue;
        reached.add(id);
        queue.push(...graph.get(id)!);
      }
      expect(reached.size, puzzle.id).toBe(puzzle.entries.length);
    }
  });

  it("clues every maximal touching run exactly once, with no same-axis overlaps", () => {
    for (const puzzle of ALL_PUZZLES) {
      const built = buildPuzzle(puzzle);
      const at = (r: number, c: number) => r >= 0 && c >= 0 && r < built.rows && c < built.cols
        ? built.cells[r * built.cols + c].solution : "";
      const authoredRuns = puzzle.entries.map((entry) => `${entry.dir}:${entry.row}:${entry.col}:${entry.answer.length}`);
      const actualRuns: string[] = [];
      const memberships = new Set<string>();
      for (const entry of built.entries) {
        for (const cell of entry.cells) {
          const membership = `${entry.dir}:${cell.row}:${cell.col}`;
          expect(memberships.has(membership), `${puzzle.id}: ${membership}`).toBe(false);
          memberships.add(membership);
        }
      }
      for (const dir of ["across", "down"] as const) {
        const dr = dir === "down" ? 1 : 0;
        const dc = dir === "across" ? 1 : 0;
        for (let row = 0; row < built.rows; row += 1) {
          for (let col = 0; col < built.cols; col += 1) {
            if (!at(row, col) || at(row - dr, col - dc)) continue;
            let length = 0;
            while (at(row + dr * length, col + dc * length)) length += 1;
            if (length > 1) actualRuns.push(`${dir}:${row}:${col}:${length}`);
          }
        }
      }
      expect(actualRuns.sort(), puzzle.id).toEqual(authoredRuns.sort());
      // Trimmed bounds: no artificial black margins to hide board size.
      expect(built.cells.some((cell) => cell.row === 0 && !cell.isBlack)).toBe(true);
      expect(built.cells.some((cell) => cell.col === 0 && !cell.isBlack)).toBe(true);
      expect(built.cells.some((cell) => cell.row === built.rows - 1 && !cell.isBlack)).toBe(true);
      expect(built.cells.some((cell) => cell.col === built.cols - 1 && !cell.isBlack)).toBe(true);
    }
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
