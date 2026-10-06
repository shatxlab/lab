import type { CrosswordState } from "./game";
import type { BuiltPuzzle } from "./types";

/** Versioned key for saved crossword progress. */
export const CROSSWORD_STORAGE_KEY = "lab:crossword:v1";

/** Any grid letter across shipped languages: А-Я or A-Z. */
const ANY_GRID_LETTER = /^[A-ZА-Я]$/;

export interface StoredPuzzleProgress {
  values: Record<string, string>;
  revealed: string[];
  elapsed: number;
  completed: boolean;
}

export type StoredCrosswordState = Record<string, StoredPuzzleProgress>;

export interface CrosswordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function storageOrUndefined(): CrosswordStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const CELL_KEY = /^\d+:\d+$/;

function sanitizeProgress(raw: unknown): StoredPuzzleProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const values: Record<string, string> = {};
  let count = 0;
  if (candidate.values && typeof candidate.values === "object") {
    for (const [key, value] of Object.entries(candidate.values as Record<string, unknown>)) {
      if (!CELL_KEY.test(key) || typeof value !== "string") continue;
      const letter = value.toUpperCase().replace("Ё", "Е");
      if (!ANY_GRID_LETTER.test(letter)) continue;
      values[key] = letter;
      count += 1;
      if (count >= 400) break;
    }
  }
  const revealed = Array.isArray(candidate.revealed)
    ? candidate.revealed.filter((key): key is string => typeof key === "string" && CELL_KEY.test(key)).slice(0, 400)
    : [];
  const elapsed = typeof candidate.elapsed === "number" && Number.isFinite(candidate.elapsed)
    ? Math.max(0, Math.min(candidate.elapsed, 60 * 60 * 24))
    : 0;
  return { values, revealed, elapsed, completed: candidate.completed === true };
}

export function normalizeCrosswordState(raw: unknown): StoredCrosswordState {
  if (!raw || typeof raw !== "object") return {};
  const out: StoredCrosswordState = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const progress = sanitizeProgress(value);
    if (progress) out[id] = progress;
  }
  return out;
}

export function readCrosswordState(
  storage: CrosswordStorage | undefined = storageOrUndefined(),
): StoredCrosswordState {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CROSSWORD_STORAGE_KEY);
    if (!raw) return {};
    return normalizeCrosswordState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeCrosswordState(
  state: StoredCrosswordState,
  storage: CrosswordStorage | undefined = storageOrUndefined(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CROSSWORD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Progress is a convenience; never let quota errors break play.
  }
}

/** Snapshot the in-memory game state for one puzzle. */
export function toStoredProgress(state: CrosswordState, completed: boolean): StoredPuzzleProgress {
  return {
    values: state.values,
    revealed: state.revealed,
    elapsed: state.elapsed,
    completed,
  };
}

/** Apply saved progress to a freshly built puzzle. */
export function applyStoredProgress(state: CrosswordState, progress: StoredPuzzleProgress | undefined): CrosswordState {
  if (!progress) return state;
  return {
    ...state,
    values: progress.values,
    revealed: progress.revealed,
    elapsed: progress.elapsed,
  };
}

/** Merge one puzzle's progress into the whole store (pure, for callers/tests). */
export function withPuzzleProgress(
  store: StoredCrosswordState,
  puzzleId: string,
  progress: StoredPuzzleProgress,
): StoredCrosswordState {
  return { ...store, [puzzleId]: progress };
}

export function progressFor(
  store: StoredCrosswordState,
  built: BuiltPuzzle,
): StoredPuzzleProgress | undefined {
  return store[built.puzzle.id];
}

