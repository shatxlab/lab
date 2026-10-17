import type { Lang } from "../types";
import { conflict as conflictEn } from "./en/conflict";
import { conflict as conflictRu } from "./ru/conflict";
import type { CuratedDeck } from "./types";

export type { CuratedCard, CuratedDeck, CuratedGames } from "./types";

/**
 * Hand-written cards, per language. Add a theme here once its cards are
 * written; until then the theme keeps using the generated vocabulary.
 */
export const CURATED: Record<Lang, CuratedDeck> = {
  en: { conflict: conflictEn },
  ru: { conflict: conflictRu },
};
