import { PERK_IDS, PERKS } from "./sim/balance";
import { emptyPerks } from "./sim/upgrades";
import type { PerkId, PerkLevels, Run } from "./sim/types";

/** Gold, best wave and bought perks, kept between runs. */
export const TOWER_STORAGE_KEY = "lab:tower:v1";

export interface TowerSave {
  gold: number;
  best: number;
  runs: number;
  perks: PerkLevels;
}

export interface TowerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): TowerStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function defaultSave(): TowerSave {
  return { gold: 0, best: 0, runs: 0, perks: emptyPerks() };
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Validate a stored payload field by field; anything unreadable falls back to its default. */
export function normalizeSave(raw: unknown): TowerSave {
  const save = defaultSave();
  if (!raw || typeof raw !== "object") return save;
  const candidate = raw as Partial<Record<keyof TowerSave, unknown>>;
  save.gold = count(candidate.gold);
  save.best = count(candidate.best);
  save.runs = count(candidate.runs);
  const perks = candidate.perks && typeof candidate.perks === "object" ? (candidate.perks as Record<string, unknown>) : {};
  for (const id of PERK_IDS) save.perks[id] = Math.min(PERKS[id].max, count(perks[id]));
  return save;
}

export function readSave(storage: TowerStorage | undefined = storageOrUndefined()): TowerSave {
  try {
    const raw = storage?.getItem(TOWER_STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: TowerSave, storage: TowerStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(TOWER_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or a full quota: progress just isn't kept.
  }
}

/** Gold for the next level of a perk, or null once it's maxed. */
export function perkCost(perks: PerkLevels, id: PerkId): number | null {
  const level = perks[id];
  return level >= PERKS[id].max ? null : PERKS[id].cost(level);
}

/** The save after buying a perk level, or null when it's maxed or too expensive. */
export function buyPerk(save: TowerSave, id: PerkId): TowerSave | null {
  const cost = perkCost(save.perks, id);
  if (cost === null || cost > save.gold) return null;
  return { ...save, gold: save.gold - cost, perks: { ...save.perks, [id]: save.perks[id] + 1 } };
}

/** Bank a finished run: its gold, and its wave if it's a new best. */
export function bankRun(save: TowerSave, run: Run): TowerSave {
  return { ...save, gold: save.gold + run.gold, best: Math.max(save.best, run.wave), runs: save.runs + 1 };
}
