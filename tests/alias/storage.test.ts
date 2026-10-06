import { describe, expect, it, vi } from "vitest";

import {
  ALIAS_STORAGE_KEY,
  defaultAliasState,
  normalizeAliasState,
  readAliasState,
  writeAliasState,
} from "@/lib/alias/storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    values,
  };
}

describe("alias persistence", () => {
  it("returns defaults for an empty payload", () => {
    const state = normalizeAliasState({});
    expect(state?.settings.lang).toBe("en");
    expect(state?.teams).toEqual([]);
  });

  it("rejects values that are not an object", () => {
    expect(normalizeAliasState(null)).toBeNull();
    expect(normalizeAliasState("nope")).toBeNull();
  });

  it("keeps valid stored values and repairs invalid ones", () => {
    const state = normalizeAliasState({
      settings: {
        lang: "ru",
        themeId: "food",
        roundSeconds: 90,
        targetScore: 70,
        skipPenalty: 2,
        sound: false,
      },
      teams: [{ name: "  Лисы  ", color: "#f00" }, { name: "" }, { name: "Медведи" }],
    });

    expect(state).toEqual({
      settings: {
        lang: "ru",
        themeId: "food",
        roundSeconds: 90,
        targetScore: 70,
        skipPenalty: 2,
        sound: false,
      },
      teams: [
        { name: "Лисы", color: "#f00" },
        { name: "Медведи", color: "" },
      ],
    });

    const repaired = normalizeAliasState({
      settings: { lang: "de", themeId: "nope", roundSeconds: 9999, skipPenalty: 9 },
    });
    expect(repaired?.settings.lang).toBe("en");
    expect(repaired?.settings.themeId).toBe("everyday");
    expect(repaired?.settings.roundSeconds).toBe(300);
    expect(repaired?.settings.skipPenalty).toBe(1);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const state = defaultAliasState();
    state.settings.themeId = "art";
    state.teams = [{ name: "Comets", color: "#123456" }];

    writeAliasState(state, storage);
    expect(storage.setItem).toHaveBeenCalledWith(ALIAS_STORAGE_KEY, expect.any(String));
    expect(readAliasState(storage)).toEqual(state);
  });

  it("falls back to null for missing or corrupt data", () => {
    const storage = memoryStorage();
    expect(readAliasState(storage)).toBeNull();

    storage.values.set(ALIAS_STORAGE_KEY, "{ not json");
    expect(readAliasState(storage)).toBeNull();
  });
});
