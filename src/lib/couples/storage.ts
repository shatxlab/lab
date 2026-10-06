import { CARD_COUNTS, DEFAULT_CARD_COUNT, isLang, isThemeId } from "./themes";
import type { CouplesSettings, GameId, Lang, Mode, ThemeId } from "./types";

/** Persisted key for the couples setup and lifetime stats. */
export const COUPLES_STORAGE_KEY = "lab:couples:v1";

/** Default partner names per language. */
export const DEFAULT_NAMES: Record<Lang, readonly [string, string]> = {
  en: ["Player 1", "Player 2"],
  ru: ["Игрок 1", "Игрок 2"],
};

export interface CouplesStats {
  games: number;
  cards: number;
  matches: number;
}

export interface StoredCouplesState {
  settings: CouplesSettings;
  stats: CouplesStats;
}

export interface CouplesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): CouplesStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Fall back to the default names when a field is blank. */
export function effectiveNames(names: readonly [string, string], lang: Lang = "ru"): [string, string] {
  const fallback = DEFAULT_NAMES[lang];
  return [names[0].trim() || fallback[0], names[1].trim() || fallback[1]];
}

export function defaultSettings(lang: Lang = "ru"): CouplesSettings {
  const names = DEFAULT_NAMES[lang];
  return {
    game: "norm",
    lang,
    mode: "match",
    theme: "all",
    count: DEFAULT_CARD_COUNT,
    names: [names[0], names[1]],
    sound: true,
  };
}

const GAME_IDS: readonly GameId[] = ["norm", "either", "who"];

function isGame(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

function isMode(value: unknown): value is Mode {
  return value === "match" || value === "together";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && (CARD_COUNTS as readonly number[]).includes(value);
}

function cleanLang(value: unknown): Lang | null {
  return isLang(value) ? value : null;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 24);
  return trimmed || fallback;
}

function cleanCount(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), 1_000_000));
}

export function normalizeCouplesState(raw: unknown): StoredCouplesState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { settings?: unknown; stats?: unknown };
  const settings = defaultSettings();

  if (candidate.settings && typeof candidate.settings === "object") {
    const stored = candidate.settings as Record<string, unknown>;
    if (isGame(stored.game)) settings.game = stored.game;
    if (isLang(stored.lang)) {
      settings.lang = stored.lang;
      settings.names = [...DEFAULT_NAMES[stored.lang]] as [string, string];
    }
    if (isMode(stored.mode)) settings.mode = stored.mode;
    if (isThemeId(stored.theme)) settings.theme = stored.theme;
    else if (stored.theme === "all") settings.theme = "all";
    if (isCount(stored.count)) settings.count = stored.count;
    if (typeof stored.sound === "boolean") settings.sound = stored.sound;
    if (Array.isArray(stored.names)) {
      settings.names = [
        cleanName(stored.names[0], DEFAULT_NAMES[settings.lang][0]),
        cleanName(stored.names[1], DEFAULT_NAMES[settings.lang][1]),
      ];
    }
  }

  const stats: CouplesStats = { games: 0, cards: 0, matches: 0 };
  if (candidate.stats && typeof candidate.stats === "object") {
    const stored = candidate.stats as Record<string, unknown>;
    stats.games = cleanCount(stored.games, 0);
    stats.cards = cleanCount(stored.cards, 0);
    stats.matches = cleanCount(stored.matches, 0);
  }

  return { settings, stats };
}

export function readCouplesState(
  storage: CouplesStorage | undefined = storageOrUndefined(),
): StoredCouplesState | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(COUPLES_STORAGE_KEY);
    if (!value) return null;
    return normalizeCouplesState(JSON.parse(value));
  } catch {
    return null;
  }
}

export function writeCouplesState(
  state: StoredCouplesState,
  storage: CouplesStorage | undefined = storageOrUndefined(),
): void {
  if (!storage) return;
  try {
    storage.setItem(COUPLES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A preference is never worth breaking a page over.
  }
}

/** Merge a finished session into the lifetime stats (pure, for tests). */
export function withSessionStats(
  stats: CouplesStats,
  cards: number,
  matches: number,
): CouplesStats {
  return {
    games: stats.games + 1,
    cards: stats.cards + Math.max(0, cards),
    matches: stats.matches + Math.max(0, matches),
  };
}

export function themeLabel(theme: ThemeId | "all", allLabel: string, nameOf: (id: ThemeId) => string): string {
  return theme === "all" ? allLabel : nameOf(theme);
}
