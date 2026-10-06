import { EN_WORDS } from "./en";
import { RU_WORDS } from "./ru";

import type { AppLang } from "@/lib/apps/lang";

const split = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Answer pools: the words a game can pick. Guesses are checked against the wider dictionary below. */
export const WORDS: Record<AppLang, readonly string[]> = {
  en: split(EN_WORDS),
  ru: split(RU_WORDS),
};

const dictionaries = new Map<AppLang, Promise<ReadonlySet<string>>>();

/**
 * Every word accepted as a guess in a language (a superset of the answers).
 * The lists are large, so they load on demand and only for the language in play.
 */
export function loadValidWords(lang: AppLang): Promise<ReadonlySet<string>> {
  let pending = dictionaries.get(lang);
  if (!pending) {
    pending = (lang === "ru" ? import("./valid-ru").then((m) => m.VALID_RU) : import("./valid-en").then((m) => m.VALID_EN))
      .then((text) => new Set(split(text)))
      .catch((error) => {
        dictionaries.delete(lang);
        throw error;
      });
    dictionaries.set(lang, pending);
  }
  return pending;
}
