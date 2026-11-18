import type { Lang } from "../types";
import { conflict as conflictEn } from "./en/conflict";
import { conflict as conflictRu } from "./ru/conflict";
import { food as foodRu } from "./ru/food";
import { friends as friendsRu } from "./ru/friends";
import { future as futureRu } from "./ru/future";
import { habits as habitsRu } from "./ru/habits";
import { home as homeRu } from "./ru/home";
import { money as moneyRu } from "./ru/money";
import { romance as romanceRu } from "./ru/romance";
import { tender as tenderRu } from "./ru/tender";
import { travel as travelRu } from "./ru/travel";
import type { CuratedDeck } from "./types";

export type { CuratedCard, CuratedDeck, CuratedGames } from "./types";

/**
 * Hand-written cards, per language. Add a theme here once its cards are
 * written; until then the theme keeps using the generated vocabulary.
 * Russian is complete; English still has only the pilot theme.
 */
export const CURATED: Record<Lang, CuratedDeck> = {
  en: { conflict: conflictEn },
  ru: {
    conflict: conflictRu,
    home: homeRu,
    romance: romanceRu,
    habits: habitsRu,
    food: foodRu,
    money: moneyRu,
    travel: travelRu,
    friends: friendsRu,
    tender: tenderRu,
    future: futureRu,
  },
};
