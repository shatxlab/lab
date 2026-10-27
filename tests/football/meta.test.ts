import { describe, expect, it } from "vitest";
import {
  defaultSave,
  FOOTBALL_STORAGE_KEY,
  friendlySides,
  LEVEL_STRENGTH,
  normalizeSave,
  readSave,
  recordMatch,
  writeSave,
  type FootballStorage,
} from "@/lib/football/meta";
import { strengthOf } from "@/lib/football/sim/squad";

function memoryStorage(): FootballStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe("football save", () => {
  it("starts empty", () => {
    const save = defaultSave();
    expect(save.kit).toBe(0);
    expect(save.records.league).toEqual({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
  });

  it("records wins, draws and defeats and the goals in them", () => {
    let save = defaultSave();
    save = recordMatch(save, "derby", 3, 1);
    save = recordMatch(save, "derby", 2, 2);
    save = recordMatch(save, "derby", 0, 4);
    expect(save.records.derby).toEqual({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 7 });
    expect(save.records.park.played).toBe(0);
  });

  it("keeps what it can read from a damaged payload", () => {
    const save = normalizeSave({ kit: 99, records: { park: { played: "x", won: 3, lost: -2 }, league: 7 } });
    expect(save.kit).toBe(0);
    expect(save.records.park).toEqual({ played: 0, won: 3, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(save.records.league.played).toBe(0);
    expect(normalizeSave(null)).toEqual(defaultSave());
    expect(normalizeSave({ kit: 3 }).kit).toBe(3);
  });

  it("round-trips through storage, and shrugs off garbage and a missing store", () => {
    const storage = memoryStorage();
    const save = recordMatch({ ...defaultSave(), kit: 4 }, "park", 1, 0);
    writeSave(save, storage);
    expect(readSave(storage)).toEqual(save);
    storage.data.set(FOOTBALL_STORAGE_KEY, "{not json");
    expect(readSave(storage)).toEqual(defaultSave());
    expect(readSave(undefined)).toEqual(defaultSave());
    expect(() => writeSave(save, undefined)).not.toThrow();
  });
});

describe("friendly sides", () => {
  it("put the rival in a different shirt and scale their strength with the level", () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const [home, away] = friendlySides(seed, "league", 2, "Rivals", "Us");
      expect(away.kit).not.toBe(home.kit);
      expect(home.name).toBe("Us");
      expect(away.players[0].id).toBeGreaterThanOrEqual(100);
    }
    const mean = (level: "park" | "league" | "derby") =>
      Array.from({ length: 20 }, (_, seed) => strengthOf(friendlySides(seed, level, 0, "R", "U")[1])).reduce((a, b) => a + b, 0) / 20;
    expect(mean("park")).toBeLessThan(mean("league"));
    expect(mean("league")).toBeLessThan(mean("derby"));
    expect(LEVEL_STRENGTH.park).toBeLessThan(LEVEL_STRENGTH.derby);
  });
});
