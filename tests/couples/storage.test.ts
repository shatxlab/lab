import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAMES,
  defaultSettings,
  effectiveNames,
  normalizeCouplesState,
  readCouplesState,
  withSessionStats,
  withLanguage,
  writeCouplesState,
  type CouplesStorage,
} from "@/lib/couples/storage";

function memoryStorage(): CouplesStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("couples storage", () => {
  it("starts from sane defaults", () => {
    const settings = defaultSettings();
    expect(settings.game).toBe("norm");
    expect(settings.mode).toBe("match");
    expect(settings.theme).toBe("all");
    expect(settings.count).toBe(20);
    expect(settings.lang).toBe("ru");
    expect(settings.names).toEqual([...DEFAULT_NAMES.ru]);
    expect(settings.sound).toBe(true);
  });

  it("validates a stored payload field by field", () => {
    const normalized = normalizeCouplesState({
      settings: {
        game: "either",
        mode: "together",
        theme: "food",
        count: 30,
        names: ["  Аня  ", ""],
        sound: false,
      },
      stats: { games: 3, cards: 25, matches: 20 },
    });
    expect(normalized?.settings).toEqual({
      game: "either",
      lang: "ru",
      mode: "together",
      theme: "food",
      count: 30,
      names: ["Аня", "Игрок 2"],
      sound: false,
    });
    expect(normalized?.stats).toEqual({ games: 3, cards: 25, matches: 20 });
  });

  it("ignores bad values and unknown themes", () => {
    const normalized = normalizeCouplesState({
      settings: { game: "nope", mode: "x", theme: "space", count: 7, names: "nope", sound: "no" },
      stats: { games: -4, cards: "x" },
    });
    expect(normalized?.settings.game).toBe("norm");
    expect(normalized?.settings.theme).toBe("all");
    expect(normalized?.settings.count).toBe(20);
    expect(normalized?.stats).toEqual({ games: 0, cards: 0, matches: 0 });
  });

  it("rejects non-objects", () => {
    expect(normalizeCouplesState(null)).toBeNull();
    expect(normalizeCouplesState("x")).toBeNull();
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const state = { settings: defaultSettings(), stats: { games: 1, cards: 10, matches: 4 } };
    writeCouplesState(state, storage);
    expect(readCouplesState(storage)).toEqual(state);
  });

  it("returns null for missing or broken storage", () => {
    expect(readCouplesState(memoryStorage())).toBeNull();
    const storage = memoryStorage();
    storage.setItem("lab:couples:v1", "{not json");
    expect(readCouplesState(storage)).toBeNull();
  });

  it("accumulates session stats", () => {
    const next = withSessionStats({ games: 2, cards: 30, matches: 20 }, 10, 6);
    expect(next).toEqual({ games: 3, cards: 40, matches: 26 });
  });

  it("falls back to default names for blanks", () => {
    expect(effectiveNames(["  ", "Борис"])).toEqual(["Игрок 1", "Борис"]);
  });
});

describe("withLanguage", () => {
  it("moves default partner names to the new language", () => {
    const en = defaultSettings("en");
    const ru = withLanguage(en, "ru");
    expect(ru.lang).toBe("ru");
    expect(ru.names).toEqual([...DEFAULT_NAMES.ru]);
    expect(withLanguage(ru, "en").names).toEqual([...DEFAULT_NAMES.en]);
  });

  it("keeps names the couple typed", () => {
    const settings = { ...defaultSettings("en"), names: ["Anna", "Player 2"] as [string, string] };
    expect(withLanguage(settings, "ru").names).toEqual(["Anna", DEFAULT_NAMES.ru[1]]);
  });

  it("returns the same settings when the language does not change", () => {
    const settings = defaultSettings("ru");
    expect(withLanguage(settings, "ru")).toBe(settings);
  });
});

