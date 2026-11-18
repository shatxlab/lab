import type { Lang, ThemeId, WordBank } from "../types";
import { EN_WORDS } from "./en";
import { RU_WORDS } from "./ru";

/** Case-insensitive de-dupe that keeps the first spelling seen. */
export function dedupeWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    const key = word.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

/** Strip duplicates from every authored list once, at module load. */
function normalizeBank(bank: WordBank): WordBank {
  const themes = {} as Record<ThemeId, string[]>;
  for (const id of Object.keys(bank.themes) as ThemeId[]) {
    themes[id] = dedupeWords(bank.themes[id]);
  }
  return { core: dedupeWords(bank.core), themes };
}

export const WORD_BANKS: Record<Lang, WordBank> = {
  en: normalizeBank(EN_WORDS),
  ru: normalizeBank(RU_WORDS),
};

const poolCache = new Map<string, readonly string[]>();

/**
 * The playable pool for a theme: the shared core plus the theme-specific
 * words, de-duplicated. Cached because panels re-read it on every render.
 */
export function poolFor(lang: Lang, themeId: ThemeId): readonly string[] {
  const key = `${lang}:${themeId}`;
  const cached = poolCache.get(key);
  if (cached) return cached;
  const bank = WORD_BANKS[lang];
  const pool = dedupeWords([...bank.core, ...bank.themes[themeId]]);
  poolCache.set(key, pool);
  return pool;
}

/** Number of unique words behind a theme card. */
export function deckSize(lang: Lang, themeId: ThemeId): number {
  return poolFor(lang, themeId).length;
}

export function themeWordCounts(lang: Lang): Record<ThemeId, number> {
  const bank = WORD_BANKS[lang];
  const counts = {} as Record<ThemeId, number>;
  for (const id of Object.keys(bank.themes) as ThemeId[]) {
    counts[id] = deckSize(lang, id);
  }
  return counts;
}

export function bankSize(lang: Lang): number {
  return WORD_BANKS[lang].core.length;
}
