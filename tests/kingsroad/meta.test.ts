import { describe, expect, it } from "vitest";

import { MAPS } from "@/lib/kingsroad/sim/maps";

import {
  defaultSave,
  isUnlocked,
  KINGSROAD_STORAGE_KEY,
  nextMap,
  normalizeSave,
  readSave,
  recordWin,
  writeSave,
  type KingsroadStorage,
} from "@/lib/kingsroad/meta";

function memoryStorage(): KingsroadStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe("kingsroad save", () => {
  it("starts with no stars and only the first road open", () => {
    const save = defaultSave();
    expect(save.stars).toEqual(Object.fromEntries(MAPS.map((map) => [map.id, 0])));
    expect(isUnlocked(save, "meadow")).toBe(true);
    expect(isUnlocked(save, "ford")).toBe(false);
    expect(isUnlocked(save, "crossroads")).toBe(false);
  });

  it("opens each road once the one before it is won", () => {
    const save = recordWin(defaultSave(), "meadow", 1);
    expect(isUnlocked(save, "ford")).toBe(true);
    expect(isUnlocked(save, "crossroads")).toBe(false);
    expect(nextMap("meadow")).toBe("ford");
    expect(nextMap("crossroads")).toBe("switchback");
    expect(nextMap("citadel")).toBe("harvest");
    expect(nextMap("watch")).toBeNull();
  });

  it("keeps the best stars", () => {
    let save = recordWin(defaultSave(), "ford", 2);
    save = recordWin(save, "ford", 1);
    expect(save.stars.ford).toBe(2);
    save = recordWin(save, "ford", 3);
    expect(save.stars.ford).toBe(3);
  });

  it("reads back what it wrote", () => {
    const storage = memoryStorage();
    writeSave(recordWin(defaultSave(), "meadow", 3), storage);
    expect(storage.data.has(KINGSROAD_STORAGE_KEY)).toBe(true);
    expect(readSave(storage).stars.meadow).toBe(3);
  });

  it("shrugs off a damaged or tampered save", () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    expect(normalizeSave({ stars: "lots" })).toEqual(defaultSave());
    expect(normalizeSave({ stars: { meadow: 9, ford: -2, crossroads: 1.7, atlantis: 3 } }).stars).toMatchObject({
      meadow: 3,
      ford: 0,
      crossroads: 1,
      switchback: 0,
    });
    const storage = memoryStorage();
    storage.setItem(KINGSROAD_STORAGE_KEY, "{not json");
    expect(readSave(storage)).toEqual(defaultSave());
  });
});
