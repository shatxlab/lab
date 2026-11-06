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
  /** Receipts are written atomically with gold/runs; never prune them and allow an old result to pay twice. */
  settledRunIds: string[];
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
  return { gold: 0, best: 0, runs: 0, perks: emptyPerks(), settledRunIds: [] };
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
  if (Array.isArray(candidate.settledRunIds)) save.settledRunIds = [...new Set(candidate.settledRunIds.filter(validRunId))];
  return save;
}

/** Stable identity belongs to the checkpoint, not the random seed (seeds can repeat). */
export function validRunId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Settlement must distinguish a fresh save from an unreadable one: never overwrite unknown receipts. */
export function readSaveState(storage: TowerStorage | undefined = storageOrUndefined()): { save: TowerSave; readable: boolean } {
  try {
    if (!storage) return { save: defaultSave(), readable: false };
    const raw = storage.getItem(TOWER_STORAGE_KEY);
    if (raw === null) return { save: defaultSave(), readable: true };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { save: defaultSave(), readable: false };
    const receipts = parsed.settledRunIds;
    const readable = receipts === undefined || (Array.isArray(receipts) && receipts.every(validRunId));
    return { save: normalizeSave(parsed), readable };
  } catch {
    return { save: defaultSave(), readable: false };
  }
}

export function readSave(storage: TowerStorage | undefined = storageOrUndefined()): TowerSave {
  return readSaveState(storage).save;
}

export function writeSave(save: TowerSave, storage: TowerStorage | undefined = storageOrUndefined()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(TOWER_STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
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

/** Pure reward calculation. Persist finished runs through snapshot.settleRun, which also writes an idempotency receipt. */
export function bankRun(save: TowerSave, run: Run): TowerSave {
  return { ...save, gold: save.gold + run.gold, best: Math.max(save.best, run.wave), runs: save.runs + 1 };
}
