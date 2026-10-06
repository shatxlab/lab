import { describe, expect, it } from "vitest";

import { THEME_IDS } from "@/lib/alias/themes";
import type { Lang } from "@/lib/alias/types";
import { WORD_BANKS, dedupeWords, deckSize, poolFor } from "@/lib/alias/words";

/** Every theme must offer at least this many distinct words per language. */
const MIN_WORDS_PER_THEME = 1000;

const LANGS: Lang[] = ["en", "ru"];

describe("alias word banks", () => {
  it("has a theme list for every theme in both languages", () => {
    for (const lang of LANGS) {
      const bank = WORD_BANKS[lang];
      for (const id of THEME_IDS) {
        expect(Array.isArray(bank.themes[id]), `${lang}.${id}`).toBe(true);
      }
    }
  });

  it("keeps every theme list free of duplicates", () => {
    for (const lang of LANGS) {
      const bank = WORD_BANKS[lang];
      for (const id of THEME_IDS) {
        const list = bank.themes[id];
        expect(dedupeWords(list).length, `${lang}.${id}`).toBe(list.length);
      }
    }
  });

  it.each(LANGS)("offers at least 1000 words on every theme (%s)", (lang) => {
    const report: Record<string, number> = {};
    for (const id of THEME_IDS) {
      report[id] = deckSize(lang, id);
    }
    const under = Object.entries(report).filter(([, count]) => count < MIN_WORDS_PER_THEME);
    expect(under, JSON.stringify(report)).toEqual([]);
  });

  it("uses clean, single-token words", () => {
    const clean = /^[A-Za-zА-Яа-яЁё-]+$/;
    for (const lang of LANGS) {
      const bank = WORD_BANKS[lang];
      const all = [bank.core, ...THEME_IDS.map((id) => bank.themes[id])].flat();
      const dirty = all.filter((word) => !clean.test(word));
      expect(dirty, `${lang}: ${dirty.join(", ")}`).toEqual([]);
    }
  });

  it("never repeats a word inside one pool", () => {
    for (const lang of LANGS) {
      for (const id of THEME_IDS) {
        const pool = poolFor(lang, id);
        expect(new Set(pool).size, `${lang}.${id}`).toBe(pool.length);
      }
    }
  });
});
