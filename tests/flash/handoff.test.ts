import { describe, expect, it } from "vitest";

import { isLabKey } from "@/lib/apps/backup";
import { FLASH_HANDOFF_KEY, HANDOFF_TTL_MS, MAX_HANDOFF_CHARS, deckNameFromFile, takeHandoff, writeHandoff } from "@/lib/flash/handoff";

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("flash handoff", () => {
  it("is collected once, and gone afterwards", () => {
    const storage = memory();
    expect(writeHandoff({ name: "words.csv", text: "a,b" }, 1000, storage)).toBe(true);
    expect(takeHandoff(2000, storage)).toEqual({ name: "words.csv", text: "a,b" });
    expect(takeHandoff(2000, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("goes stale after ten minutes, and is removed even then", () => {
    const storage = memory();
    writeHandoff({ name: "x", text: "y" }, 0, storage);
    expect(takeHandoff(HANDOFF_TTL_MS + 1, storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("ignores a handoff dated in the far future", () => {
    const storage = memory();
    writeHandoff({ name: "x", text: "y" }, 10 * HANDOFF_TTL_MS, storage);
    expect(takeHandoff(0, storage)).toBeNull();
  });

  it("refuses text that is too big, and storage that throws", () => {
    expect(writeHandoff({ name: "x", text: "a".repeat(MAX_HANDOFF_CHARS + 1) }, 0, memory())).toBe(false);
    const full = { ...memory(), setItem: () => { throw new Error("quota"); } };
    expect(writeHandoff({ name: "x", text: "y" }, 0, full)).toBe(false);
    expect(writeHandoff({ name: "x", text: "y" }, 0, undefined)).toBe(false);
  });

  it("survives corrupt data", () => {
    const storage = memory();
    storage.setItem(FLASH_HANDOFF_KEY, "{nope");
    expect(takeHandoff(0, storage)).toBeNull();
    storage.setItem(FLASH_HANDOFF_KEY, JSON.stringify({ text: 5, at: 0 }));
    expect(takeHandoff(0, storage)).toBeNull();
    expect(takeHandoff(0, undefined)).toBeNull();
  });

  it("is never part of the settings backup", () => {
    expect(isLabKey(FLASH_HANDOFF_KEY)).toBe(false);
  });

  it("names the deck after the file", () => {
    expect(deckNameFromFile("spanish_verbs.csv")).toBe("spanish verbs");
    expect(deckNameFromFile("notes")).toBe("notes");
    expect(deckNameFromFile("a.b.tsv")).toBe("a.b");
  });
});
