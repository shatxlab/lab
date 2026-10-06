import { cellAt, cellKey, entryById, normalizeLetter, RUSSIAN_LETTER } from "./grid";
import type { BuiltPuzzle, CellRef, Direction, PlacedEntry } from "./types";

export interface Cursor {
  row: number;
  col: number;
  dir: Direction;
}

export interface CrosswordState {
  values: Record<string, string>;
  cursor: Cursor;
  /** Cell keys filled in by the hint button. */
  revealed: string[];
  /** Whether the last action was "check" (wrong cells get flagged). */
  checked: boolean;
  elapsed: number;
}

export type CrosswordAction =
  | { type: "select"; row: number; col: number }
  | { type: "selectEntry"; id: string }
  | { type: "setDirection"; dir: Direction }
  | { type: "toggleDirection" }
  | { type: "type"; letters: string[] }
  | { type: "backspace" }
  | { type: "move"; dr: number; dc: number }
  | { type: "nextEntry"; step: 1 | -1 }
  | { type: "reveal" }
  | { type: "check" }
  | { type: "clear" }
  | { type: "reset" }
  | { type: "tick" };

/** ЙЦУКЕН mapping so a Latin physical keyboard still types Russian letters. */
export const LATIN_TO_CYRILLIC: Record<string, string> = {
  q: "Й", w: "Ц", e: "У", r: "К", t: "Е", y: "Н", u: "Г", i: "Ш", o: "Щ", p: "З",
  "[": "Х", "]": "Ъ",
  a: "Ф", s: "Ы", d: "В", f: "А", g: "П", h: "Р", j: "О", k: "Л", l: "Д",
  ";": "Ж", "'": "Э",
  z: "Я", x: "Ч", c: "С", v: "М", b: "И", n: "Т", m: "Ь",
  ",": "Б", ".": "Ю",
};

/** Turn raw keyboard/paste text into accepted uppercase Russian letters. */
export function parseInput(text: string): string[] {
  const letters: string[] = [];
  for (const char of text) {
    const upper = char.toUpperCase();
    if (upper === "Ё") {
      letters.push("Е");
    } else if (RUSSIAN_LETTER.test(upper)) {
      letters.push(upper);
    } else {
      const mapped = LATIN_TO_CYRILLIC[char.toLowerCase()];
      if (mapped) letters.push(mapped);
    }
  }
  return letters;
}

export function initialState(built: BuiltPuzzle): CrosswordState {
  const first = built.entries[0];
  return {
    values: {},
    cursor: first ? { row: first.row, col: first.col, dir: first.dir } : { row: 0, col: 0, dir: "across" },
    revealed: [],
    checked: false,
    elapsed: 0,
  };
}

/** `mm:ss` for the elapsed clock. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function valueAt(values: Record<string, string>, cell: CellRef): string {
  return values[cellKey(cell.row, cell.col)] ?? "";
}

export function entryWord(entry: PlacedEntry, values: Record<string, string>): string {
  return entry.cells.map((cell) => valueAt(values, cell)).join("");
}

export function isEntryFilled(entry: PlacedEntry, values: Record<string, string>): boolean {
  return entry.cells.every((cell) => valueAt(values, cell) !== "");
}

export function isEntryCorrect(entry: PlacedEntry, values: Record<string, string>): boolean {
  return entry.cells.every((cell, index) => valueAt(values, cell) === entry.answer[index]);
}

/** True when the cell belongs to a word that is already solved correctly. */
export function isCellLocked(
  built: BuiltPuzzle,
  values: Record<string, string>,
  row: number,
  col: number,
): boolean {
  const cell = built.cells[row * built.cols + col];
  if (!cell) return false;
  const across = entryById(built, cell.across);
  const down = entryById(built, cell.down);
  return Boolean((across && isEntryCorrect(across, values)) || (down && isEntryCorrect(down, values)));
}

export function solvedEntryIds(built: BuiltPuzzle, values: Record<string, string>): Set<string> {
  const solved = new Set<string>();
  for (const entry of built.entries) {
    if (isEntryCorrect(entry, values)) solved.add(entry.id);
  }
  return solved;
}

export function isPuzzleSolved(built: BuiltPuzzle, values: Record<string, string>): boolean {
  return built.entries.every((entry) => isEntryCorrect(entry, values));
}

export function progress(built: BuiltPuzzle, values: Record<string, string>) {
  let solved = 0;
  let filled = 0;
  for (const entry of built.entries) {
    if (isEntryCorrect(entry, values)) solved += 1;
    if (isEntryFilled(entry, values)) filled += 1;
  }
  return { solved, filled, total: built.entries.length };
}

/** Cell keys whose filled letter disagrees with the solution. */
export function wrongCells(built: BuiltPuzzle, values: Record<string, string>): Set<string> {
  const wrong = new Set<string>();
  for (const cell of built.cells) {
    if (cell.isBlack) continue;
    const key = cellKey(cell.row, cell.col);
    const value = values[key];
    if (value && value !== cell.solution) wrong.add(key);
  }
  return wrong;
}

export function cellAtCursor(built: BuiltPuzzle, cursor: Cursor) {
  return built.cells[cursor.row * built.cols + cursor.col];
}

/** The entry the cursor is currently editing for the active direction. */
export function activeEntry(built: BuiltPuzzle, cursor: Cursor): PlacedEntry | undefined {
  const cell = cellAtCursor(built, cursor);
  if (!cell) return undefined;
  const id = cursor.dir === "across" ? cell.across : cell.down;
  return entryById(built, id);
}

function indexOfEntry(built: BuiltPuzzle, entry: PlacedEntry | undefined): number {
  if (!entry) return -1;
  return built.entries.findIndex((candidate) => candidate.id === entry.id);
}

export function nextInEntry(entry: PlacedEntry, cursor: Cursor): CellRef | null {
  const index = entry.cells.findIndex((cell) => cell.row === cursor.row && cell.col === cursor.col);
  if (index < 0) return null;
  return entry.cells[index + 1] ?? null;
}

export function prevInEntry(entry: PlacedEntry, cursor: Cursor): CellRef | null {
  const index = entry.cells.findIndex((cell) => cell.row === cursor.row && cell.col === cursor.col);
  if (index <= 0) return null;
  return entry.cells[index - 1] ?? null;
}

/** Move the cursor to the next (or previous) entry, wrapping around. */
export function stepEntry(built: BuiltPuzzle, cursor: Cursor, step: 1 | -1): Cursor {
  const current = activeEntry(built, cursor);
  const total = built.entries.length;
  if (total === 0) return cursor;
  let index = indexOfEntry(built, current);
  if (index < 0) index = 0;
  const next = built.entries[(index + step + total) % total];
  return { row: next.row, col: next.col, dir: next.dir };
}

/** Move one white cell in a direction, falling back to the next entry's start. */
export function stepCell(built: BuiltPuzzle, cursor: Cursor, dr: number, dc: number): Cursor {
  const dir: Direction = dc !== 0 ? "across" : "down";
  const forward = dr + dc > 0;
  let row = cursor.row + dr;
  let col = cursor.col + dc;
  while (row >= 0 && col >= 0 && row < built.rows && col < built.cols) {
    const cell = built.cells[row * built.cols + col];
    const hasEntry = dir === "across" ? cell.across !== null : cell.down !== null;
    if (!cell.isBlack && hasEntry) return { row, col, dir };
    row += dr;
    col += dc;
  }

  // Fall through to the neighbouring entry in the same axis for pleasant
  // arrow-key behaviour at word boundaries.
  const axis = built.entries.filter((entry) => entry.dir === dir);
  const ahead = axis.filter((entry) =>
    forward
      ? entry.row > cursor.row || (entry.row === cursor.row && entry.col > cursor.col)
      : entry.row < cursor.row || (entry.row === cursor.row && entry.col < cursor.col),
  );
  const pick = ahead[0] ?? (forward ? axis[0] : axis[axis.length - 1]);
  if (!pick) return cursor;
  return { row: pick.row, col: pick.col, dir: pick.dir };
}

function setLetter(
  state: CrosswordState,
  key: string,
  letter: string,
): CrosswordState {
  if (!letter) return state;
  return {
    ...state,
    values: { ...state.values, [key]: letter },
    revealed: state.revealed.filter((revealedKey) => revealedKey !== key),
    checked: false,
  };
}

/** Advance after a letter lands: the next unlocked cell, or stay put. */
function advanceAfterType(built: BuiltPuzzle, state: CrosswordState): Cursor {
  const entry = activeEntry(built, state.cursor);
  if (!entry) return state.cursor;
  let cell = nextInEntry(entry, state.cursor);
  // Skip cells already fixed by a solved crossing word.
  while (cell && isCellLocked(built, state.values, cell.row, cell.col)) {
    cell = nextInEntry(entry, { ...cell, dir: entry.dir });
  }
  return cell ? { ...cell, dir: entry.dir } : state.cursor;
}

/** The next entry after `from` that is not solved yet, wrapping around. */
export function nextUnsolvedEntry(
  built: BuiltPuzzle,
  values: Record<string, string>,
  from: PlacedEntry | undefined,
): PlacedEntry | undefined {
  const total = built.entries.length;
  if (total === 0) return undefined;
  const start = indexOfEntry(built, from);
  for (let step = 1; step <= total; step += 1) {
    const entry = built.entries[(start + step + total) % total];
    if (!isEntryCorrect(entry, values)) return entry;
  }
  return undefined;
}

export function crosswordReducer(
  built: BuiltPuzzle,
  state: CrosswordState,
  action: CrosswordAction,
): CrosswordState {
  switch (action.type) {
    case "select": {
      const cell = built.cells[action.row * built.cols + action.col];
      if (!cell || cell.isBlack) return state;
      const current = activeEntry(built, state.cursor);
      const insideCurrent =
        current?.cells.some((candidate) => candidate.row === action.row && candidate.col === action.col) ?? false;
      if (insideCurrent) {
        // Tapping within the word you are already solving keeps its direction.
        return { ...state, cursor: { row: action.row, col: action.col, dir: state.cursor.dir } };
      }
      // Tapping elsewhere picks a direction deterministically: a word that
      // *starts* on this cell wins, then the only available axis, then across.
      const across = entryById(built, cell.across);
      const down = entryById(built, cell.down);
      const startsHere = (entry: typeof across) =>
        entry ? entry.row === action.row && entry.col === action.col : false;
      let dir: Direction;
      if (startsHere(across) && !startsHere(down)) dir = "across";
      else if (startsHere(down) && !startsHere(across)) dir = "down";
      else if (cell.across && !cell.down) dir = "across";
      else if (cell.down && !cell.across) dir = "down";
      else dir = cell.across ? "across" : "down";
      return { ...state, cursor: { row: action.row, col: action.col, dir } };
    }

    case "selectEntry": {
      const entry = entryById(built, action.id);
      if (!entry) return state;
      return { ...state, cursor: { row: entry.row, col: entry.col, dir: entry.dir } };
    }

    case "setDirection": {
      const cell = cellAtCursor(built, state.cursor);
      if (!cell) return state;
      const available = action.dir === "across" ? cell.across : cell.down;
      if (!available) return state;
      return { ...state, cursor: { ...state.cursor, dir: action.dir } };
    }

    case "toggleDirection": {
      const cell = cellAtCursor(built, state.cursor);
      if (!cell || cell.across === null || cell.down === null) return state;
      return { ...state, cursor: { ...state.cursor, dir: state.cursor.dir === "across" ? "down" : "across" } };
    }

    case "type": {
      let next = state;
      for (const letter of action.letters) {
        const entry = activeEntry(built, next.cursor);
        if (!entry) continue;
        const key = cellKey(next.cursor.row, next.cursor.col);
        // Solved words are read-only: ignore the letter but keep moving on.
        const locked = isCellLocked(built, next.values, next.cursor.row, next.cursor.col);
        const wasSolved = isEntryCorrect(entry, next.values);
        if (!locked) next = setLetter(next, key, normalizeLetter(letter));
        next = { ...next, cursor: advanceAfterType(built, next) };
        // Completing a word hands the cursor to the next unsolved word.
        if (!wasSolved && isEntryCorrect(entry, next.values)) {
          const target = nextUnsolvedEntry(built, next.values, entry);
          if (target) next = { ...next, cursor: { row: target.row, col: target.col, dir: target.dir } };
        }
      }
      return next;
    }

    case "backspace": {
      const cell = cellAtCursor(built, state.cursor);
      const key = cellKey(state.cursor.row, state.cursor.col);
      const locked = cell ? isCellLocked(built, state.values, cell.row, cell.col) : false;
      if (state.values[key] && !locked) {
        const values = { ...state.values };
        delete values[key];
        return { ...state, values, revealed: state.revealed.filter((k) => k !== key), checked: false };
      }
      const entry = activeEntry(built, state.cursor);
      if (!entry) return state;
      let previous = prevInEntry(entry, state.cursor);
      while (previous && isCellLocked(built, state.values, previous.row, previous.col)) {
        previous = prevInEntry(entry, { ...previous, dir: entry.dir });
      }
      if (!previous) return state;
      const prevKey = cellKey(previous.row, previous.col);
      const values = { ...state.values };
      delete values[prevKey];
      return {
        ...state,
        values,
        revealed: state.revealed.filter((k) => k !== prevKey),
        checked: false,
        cursor: { ...previous, dir: entry.dir },
      };
    }

    case "move": {
      return { ...state, cursor: stepCell(built, state.cursor, action.dr, action.dc) };
    }

    case "nextEntry": {
      return { ...state, cursor: stepEntry(built, state.cursor, action.step) };
    }

    case "reveal": {
      const cell = cellAtCursor(built, state.cursor);
      if (!cell || cell.isBlack) return state;
      const entry = activeEntry(built, state.cursor);
      if (!entry) return state;
      const index = entry.cells.findIndex((candidate) => candidate.row === cell.row && candidate.col === cell.col);
      // Hints target the cursor, or the next editable cell when it sits on a
      // crossing that a solved word already fixed.
      const editable = entry.cells.filter(
        (candidate) => !isCellLocked(built, state.values, candidate.row, candidate.col),
      );
      const target =
        editable.find((candidate) => entry.cells.indexOf(candidate) >= index) ?? editable[0];
      if (!target) return state;
      const solution = cellAt(built, target.row, target.col)?.solution ?? "";
      if (!solution) return state;
      const key = cellKey(target.row, target.col);
      const next = setLetter(state, key, solution);
      const revealed = next.revealed.includes(key) ? next.revealed : [...next.revealed, key];
      return { ...next, revealed, cursor: advanceAfterType(built, { ...next, revealed }) };
    }

    case "check":
      return { ...state, checked: true };

    case "clear":
      return { ...state, values: {}, revealed: [], checked: false };

    case "reset":
      return initialState(built);

    case "tick":
      return { ...state, elapsed: state.elapsed + 1 };

    default:
      return state;
  }
}
