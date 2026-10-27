import { makeSide } from "./sim/squad";
import type { Side } from "./sim/types";

/** How hard the other side is: the strength of its squad, against your own. */
export type Level = "park" | "league" | "derby";
export const LEVELS: readonly Level[] = ["park", "league", "derby"];
export const LEVEL_STRENGTH: Record<Level, number> = { park: 3.5, league: 5, derby: 5.8 };

/** Your own squad's strength until there's a squad to build. */
export const HOME_STRENGTH = 5;

export const FOOTBALL_STORAGE_KEY = "lab:football:v1";

export interface Tally {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface FootballSave {
  /** The club colours picked last time. */
  kit: number;
  records: { [level in Level]: Tally };
}

export interface FootballStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): FootballStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const blank = (): Tally => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });

export function defaultSave(): FootballSave {
  return { kit: 0, records: { park: blank(), league: blank(), derby: blank() } };
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/** Validate a stored payload field by field; anything unreadable falls back to a fresh start. */
export function normalizeSave(raw: unknown, kits = 8): FootballSave {
  const save = defaultSave();
  if (!raw || typeof raw !== "object") return save;
  const { kit, records } = raw as { kit?: unknown; records?: unknown };
  if (typeof kit === "number" && Number.isInteger(kit) && kit >= 0 && kit < kits) save.kit = kit;
  if (records && typeof records === "object") {
    for (const level of LEVELS) {
      const stored = (records as { [key: string]: unknown })[level];
      if (!stored || typeof stored !== "object") continue;
      const r = stored as { [key in keyof Tally]?: unknown };
      save.records[level] = {
        played: count(r.played),
        won: count(r.won),
        drawn: count(r.drawn),
        lost: count(r.lost),
        goalsFor: count(r.goalsFor),
        goalsAgainst: count(r.goalsAgainst),
      };
    }
  }
  return save;
}

export function readSave(storage: FootballStorage | undefined = storageOrUndefined()): FootballSave {
  try {
    const raw = storage?.getItem(FOOTBALL_STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: FootballSave, storage: FootballStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(FOOTBALL_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or a full quota: the record just isn't kept.
  }
}

export function recordMatch(save: FootballSave, level: Level, goalsFor: number, goalsAgainst: number): FootballSave {
  const before = save.records[level];
  const after: Tally = {
    played: before.played + 1,
    won: before.won + (goalsFor > goalsAgainst ? 1 : 0),
    drawn: before.drawn + (goalsFor === goalsAgainst ? 1 : 0),
    lost: before.lost + (goalsFor < goalsAgainst ? 1 : 0),
    goalsFor: before.goalsFor + goalsFor,
    goalsAgainst: before.goalsAgainst + goalsAgainst,
  };
  return { ...save, records: { ...save.records, [level]: after } };
}

/** The two sides of a friendly: yours in your colours, theirs in colours that aren't. */
export function friendlySides(seed: number, level: Level, kit: number, rivalName: string, homeName: string): [Side, Side] {
  const rivalKit = (kit + 1 + (seed % 7)) % 8;
  return [makeSide(seed, homeName, kit, HOME_STRENGTH), makeSide(seed + 1, rivalName, rivalKit, LEVEL_STRENGTH[level], 100)];
}
