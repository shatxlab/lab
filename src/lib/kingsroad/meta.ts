import { MAPS } from "./sim/maps";
import type { MapId } from "./sim/types";

/** The best stars won on each road, kept between games. */
export const KINGSROAD_STORAGE_KEY = "lab:kingsroad:v1";

export interface KingsroadSave {
  stars: Record<MapId, number>;
}

export interface KingsroadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): KingsroadStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function defaultSave(): KingsroadSave {
  return { stars: Object.fromEntries(MAPS.map((map) => [map.id, 0])) as Record<MapId, number> };
}

/** Validate a stored payload field by field; anything unreadable falls back to no stars. */
export function normalizeSave(raw: unknown): KingsroadSave {
  const save = defaultSave();
  if (!raw || typeof raw !== "object") return save;
  const stars = (raw as { stars?: unknown }).stars;
  if (!stars || typeof stars !== "object") return save;
  for (const map of MAPS) {
    const value = (stars as Record<string, unknown>)[map.id];
    if (typeof value === "number" && Number.isFinite(value)) save.stars[map.id] = Math.max(0, Math.min(3, Math.floor(value)));
  }
  return save;
}

export function readSave(storage: KingsroadStorage | undefined = storageOrUndefined()): KingsroadSave {
  try {
    const raw = storage?.getItem(KINGSROAD_STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: KingsroadSave, storage: KingsroadStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(KINGSROAD_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or a full quota: progress just isn't kept.
  }
}

/** The first road is always open; each one after opens once the one before it has been won. */
export function isUnlocked(save: KingsroadSave, id: MapId): boolean {
  const index = MAPS.findIndex((map) => map.id === id);
  return index === 0 || (index > 0 && save.stars[MAPS[index - 1].id] > 0);
}

/** The road after this one, if there is one. */
export function nextMap(id: MapId): MapId | null {
  const index = MAPS.findIndex((map) => map.id === id);
  return MAPS[index + 1]?.id ?? null;
}

/** Keep a win's stars if they beat the best so far. */
export function recordWin(save: KingsroadSave, id: MapId, stars: number): KingsroadSave {
  return { stars: { ...save.stars, [id]: Math.max(save.stars[id], stars) } };
}
