import type { AppLang } from "@/lib/apps/lang";
import { MAX_GUESSES, RECENT_LIMIT, WORD_LENGTH, type GameState, type GameStatus } from "@/lib/wordle/game";
import { WORDS } from "@/lib/wordle/words";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const WORDLE_STORAGE_KEY = "lab:wordle:v1";

export interface LangStats {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  /** distribution[i] = games won on guess i + 1. */
  distribution: number[];
}

export interface WordleSettings {
  hardMode: boolean;
  highContrast: boolean;
  sound: boolean;
}

export interface WordleStore {
  games: Partial<Record<AppLang, GameState>>;
  stats: Record<AppLang, LangStats>;
  recent: Record<AppLang, string[]>;
  settings: WordleSettings;
}

export interface WordleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyStats(): LangStats {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, distribution: Array.from({ length: MAX_GUESSES }, () => 0) };
}

export function defaultStore(): WordleStore {
  return {
    games: {},
    stats: { en: emptyStats(), ru: emptyStats() },
    recent: { en: [], ru: [] },
    settings: { hardMode: false, highContrast: false, sound: true },
  };
}

function storageOrUndefined(): WordleStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function cleanStats(raw: unknown): LangStats {
  const input = (raw ?? {}) as Partial<LangStats>;
  const stats = emptyStats();
  stats.played = count(input.played);
  stats.won = Math.min(count(input.won), stats.played);
  stats.streak = count(input.streak);
  stats.maxStreak = Math.max(count(input.maxStreak), stats.streak);
  if (Array.isArray(input.distribution)) stats.distribution = stats.distribution.map((_, index) => count(input.distribution![index]));
  return stats;
}

function cleanGame(lang: AppLang, raw: unknown): GameState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<GameState>;
  const letters = lang === "ru" ? /^[а-я]{5}$/ : /^[a-z]{5}$/;
  if (typeof input.answer !== "string" || !WORDS[lang].includes(input.answer)) return undefined;
  if (!Array.isArray(input.guesses) || input.guesses.length > MAX_GUESSES) return undefined;
  const guesses = input.guesses.filter((guess): guess is string => typeof guess === "string" && letters.test(guess));
  if (guesses.length !== input.guesses.length) return undefined;

  // Recompute the status instead of trusting it.
  const won = guesses.includes(input.answer);
  const status: GameStatus = won ? "won" : guesses.length >= MAX_GUESSES ? "lost" : "playing";
  // A finished game has no guesses after the winning one.
  const trimmed = won ? guesses.slice(0, guesses.indexOf(input.answer) + 1) : guesses;
  return { answer: input.answer, guesses: trimmed, status };
}

export function readWordleStore(storage: WordleStorage | undefined = storageOrUndefined()): WordleStore {
  const store = defaultStore();
  if (!storage) return store;
  try {
    const raw = JSON.parse(storage.getItem(WORDLE_STORAGE_KEY) ?? "null") as Partial<WordleStore> | null;
    if (!raw || typeof raw !== "object") return store;
    for (const lang of ["en", "ru"] as const) {
      store.stats[lang] = cleanStats(raw.stats?.[lang]);
      const game = cleanGame(lang, raw.games?.[lang]);
      if (game) store.games[lang] = game;
      const recent = raw.recent?.[lang];
      if (Array.isArray(recent)) store.recent[lang] = recent.filter((word): word is string => typeof word === "string" && word.length === WORD_LENGTH).slice(-RECENT_LIMIT);
    }
    const settings = raw.settings;
    store.settings = {
      hardMode: settings?.hardMode === true,
      highContrast: settings?.highContrast === true,
      sound: settings?.sound !== false,
    };
  } catch {
    // Corrupt data: start fresh.
  }
  return store;
}

export function writeWordleStore(store: WordleStore, storage: WordleStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(WORDLE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Progress is a convenience; never break the game over storage.
  }
}

/** Fold a finished game into the lifetime stats (call exactly once per game). */
export function recordResult(stats: LangStats, state: GameState): LangStats {
  if (state.status === "playing") return stats;
  const next: LangStats = { ...stats, distribution: [...stats.distribution], played: stats.played + 1 };
  if (state.status === "won") {
    next.won += 1;
    next.streak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    const index = Math.min(state.guesses.length, MAX_GUESSES) - 1;
    next.distribution[index] = (next.distribution[index] ?? 0) + 1;
  } else {
    next.streak = 0;
  }
  return next;
}
