import type {
  BuiltPuzzle,
  CellRef,
  CrosswordCell,
  CrosswordPuzzle,
  PlacedEntry,
  PuzzleEntry,
} from "./types";

/** Uppercase a Russian letter and fold Ё to Е so keyboard/dataset agree. */
export function normalizeLetter(value: string): string {
  return value.replace(/ё/g, "е").replace(/Ё/g, "Е").toUpperCase();
}

export const RUSSIAN_LETTER = /^[А-Я]$/;

/** Fold an authored answer into grid letters. */
export function normalizeAnswer(answer: string): string {
  return normalizeLetter(answer.replace(/\s+/g, ""));
}

export function entryId(entry: Pick<PuzzleEntry, "dir" | "row" | "col">): string {
  return `${entry.dir}-${entry.row}-${entry.col}`;
}

export class PuzzleError extends Error {}

/**
 * Derive the grid, numbering and cell references from authored entries.
 * Throws `PuzzleError` when an answer runs off the board or two crossings
 * disagree — a content bug we want surfaced loudly in tests, not fudged at
 * runtime.
 */
export function buildPuzzle(puzzle: CrosswordPuzzle): BuiltPuzzle {
  const { rows, cols } = puzzle;
  if (rows < 1 || cols < 1) throw new PuzzleError(`puzzle ${puzzle.id}: empty board`);

  const solution = new Array<string>(rows * cols).fill("");
  const acrossAt = new Array<string | null>(rows * cols).fill(null);
  const downAt = new Array<string | null>(rows * cols).fill(null);
  const startNumbers = new Map<number, number>();

  const placedEntries: PlacedEntry[] = [];

  for (const entry of puzzle.entries) {
    const answer = normalizeAnswer(entry.answer);
    if (!answer) throw new PuzzleError(`puzzle ${puzzle.id}: empty answer`);
    if ([...answer].some((letter) => !RUSSIAN_LETTER.test(letter))) {
      throw new PuzzleError(`puzzle ${puzzle.id}: non-Russian answer "${entry.answer}"`);
    }
    const dr = entry.dir === "down" ? 1 : 0;
    const dc = entry.dir === "across" ? 1 : 0;
    const cells: CellRef[] = [];

    for (let i = 0; i < answer.length; i += 1) {
      const row = entry.row + dr * i;
      const col = entry.col + dc * i;
      if (row < 0 || col < 0 || row >= rows || col >= cols) {
        throw new PuzzleError(`puzzle ${puzzle.id}: "${entry.answer}" runs off the board`);
      }
      const index = row * cols + col;
      const existing = solution[index];
      if (existing && existing !== answer[i]) {
        throw new PuzzleError(
          `puzzle ${puzzle.id}: crossing conflict at (${row},${col}) between "${existing}" and "${answer[i]}"`,
        );
      }
      solution[index] = answer[i];
      if (entry.dir === "across") acrossAt[index] = entryId(entry);
      else downAt[index] = entryId(entry);
      cells.push({ row, col });
    }

    placedEntries.push({ ...entry, answer, id: entryId(entry), number: 0, cells });
  }

  // Crossword numbering: scan row-major and number each cell that starts a word.
  const startIndexes = new Set<number>();
  for (const entry of puzzle.entries) startIndexes.add(entry.row * cols + entry.col);
  let counter = 0;
  for (let index = 0; index < rows * cols; index += 1) {
    if (!solution[index]) continue;
    if (startIndexes.has(index)) {
      counter += 1;
      startNumbers.set(index, counter);
    }
  }
  for (const entry of placedEntries) {
    entry.number = startNumbers.get(entry.row * cols + entry.col) ?? 0;
  }

  const cells: CrosswordCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      cells.push({
        row,
        col,
        solution: solution[index],
        number: startNumbers.get(index) ?? null,
        across: acrossAt[index],
        down: downAt[index],
        isBlack: !solution[index],
      });
    }
  }

  const entries = [...placedEntries].sort(
    (a, b) => a.number - b.number || (a.dir === b.dir ? 0 : a.dir === "across" ? -1 : 1),
  );

  return {
    puzzle,
    rows,
    cols,
    cells,
    entries,
    across: entries.filter((entry) => entry.dir === "across"),
    down: entries.filter((entry) => entry.dir === "down"),
    maxNumber: counter,
  };
}

export function cellAt(built: BuiltPuzzle, row: number, col: number): CrosswordCell | undefined {
  if (row < 0 || col < 0 || row >= built.rows || col >= built.cols) return undefined;
  return built.cells[row * built.cols + col];
}

export function entryById(built: BuiltPuzzle, id: string | null | undefined): PlacedEntry | undefined {
  if (!id) return undefined;
  return built.entries.find((entry) => entry.id === id);
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}
