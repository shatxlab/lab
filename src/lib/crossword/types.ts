/**
 * Crossword domain types.
 *
 * A puzzle is authored as a sparse list of entries (answer + clue + anchor +
 * direction). The grid, numbering and per-cell references are *derived* by
 * `buildPuzzle`, so hand-written data can never drift from the rendered grid.
 */

export type Direction = "across" | "down";

/** Authored entry: where an answer starts and how it is clued. */
export interface PuzzleEntry {
  answer: string;
  clue: string;
  row: number;
  col: number;
  dir: Direction;
}

/** Authored puzzle. `entries` positions are 0-indexed. */
export interface CrosswordPuzzle {
  id: string;
  title: string;
  subtitle: string;
  /** One of the difficulty labels used by the picker. */
  difficulty: "easy" | "medium" | "hard";
  rows: number;
  cols: number;
  entries: PuzzleEntry[];
}

/** A reference to a single grid position. */
export interface CellRef {
  row: number;
  col: number;
}

/** An entry after placement: stable id, crossword number and ordered cells. */
export interface PlacedEntry extends PuzzleEntry {
  id: string;
  number: number;
  cells: CellRef[];
}

/** A rendered grid cell. `solution` is the correct letter ("" when black). */
export interface CrosswordCell {
  row: number;
  col: number;
  solution: string;
  number: number | null;
  /** Entry id of the across word containing this cell, if any. */
  across: string | null;
  /** Entry id of the down word containing this cell, if any. */
  down: string | null;
  isBlack: boolean;
}

/** A puzzle ready for rendering and play. */
export interface BuiltPuzzle {
  puzzle: CrosswordPuzzle;
  rows: number;
  cols: number;
  cells: CrosswordCell[];
  entries: PlacedEntry[];
  across: PlacedEntry[];
  down: PlacedEntry[];
  /** Numbering: first number is 1 and it is contiguous. */
  maxNumber: number;
}
