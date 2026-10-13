/** Edits to the store as pure functions; the UI just feeds them to `commit`. */

import {
  MAX_CARDS_PER_DECK,
  MAX_DECKS,
  MAX_FIELD_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TAGS,
  createCard,
  createDeck,
  type Deck,
  type FlashStore,
} from "@/lib/flash/model";
import type { ParsedCard } from "@/lib/flash/parse";

export interface CardDraft {
  front: string;
  back: string;
  tags: string[];
}

/** A draft is usable when both sides have text. */
export const isValidDraft = (draft: CardDraft): boolean => draft.front.trim() !== "" && draft.back.trim() !== "";

const cleanDraft = (draft: CardDraft): CardDraft => ({
  front: draft.front.trim().slice(0, MAX_FIELD_LENGTH),
  back: draft.back.trim().slice(0, MAX_FIELD_LENGTH),
  tags: draft.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, MAX_TAGS),
});

function mapDeck(store: FlashStore, deckId: string, change: (deck: Deck) => Deck): FlashStore {
  return { ...store, decks: store.decks.map((deck) => (deck.id === deckId ? change(deck) : deck)) };
}

/** Adds a deck (and returns it) unless the deck limit is reached. */
export function addDeck(store: FlashStore, name: string, cards: ParsedCard[] = []): { store: FlashStore; deck: Deck | null } {
  if (store.decks.length >= MAX_DECKS) return { store, deck: null };
  const deck = createDeck(name, cards.map(createCard));
  return { store: { ...store, decks: [...store.decks, deck] }, deck };
}

export function renameDeck(store: FlashStore, deckId: string, name: string): FlashStore {
  const next = name.trim().slice(0, MAX_NAME_LENGTH);
  return next ? mapDeck(store, deckId, (deck) => ({ ...deck, name: next })) : store;
}

export function removeDeck(store: FlashStore, deckId: string): FlashStore {
  const byDeck = { ...store.introduced.byDeck };
  delete byDeck[deckId];
  return { ...store, decks: store.decks.filter((deck) => deck.id !== deckId), introduced: { ...store.introduced, byDeck } };
}

/** Appends new cards, stopping at the per-deck limit; reports how many fit. */
export function addCards(store: FlashStore, deckId: string, drafts: CardDraft[]): { store: FlashStore; added: number } {
  const deck = store.decks.find((item) => item.id === deckId);
  if (!deck) return { store, added: 0 };
  const room = Math.max(0, MAX_CARDS_PER_DECK - deck.cards.length);
  const fresh = drafts.map(cleanDraft).filter(isValidDraft).slice(0, room).map(createCard);
  if (fresh.length === 0) return { store, added: 0 };
  return { store: mapDeck(store, deckId, (item) => ({ ...item, cards: [...item.cards, ...fresh] })), added: fresh.length };
}

/** Edits the text of a card; its schedule is kept. */
export function updateCard(store: FlashStore, deckId: string, cardId: string, draft: CardDraft): FlashStore {
  const next = cleanDraft(draft);
  if (!isValidDraft(next)) return store;
  return mapDeck(store, deckId, (deck) => ({ ...deck, cards: deck.cards.map((card) => (card.id === cardId ? { ...card, ...next } : card)) }));
}

export function removeCard(store: FlashStore, deckId: string, cardId: string): FlashStore {
  return mapDeck(store, deckId, (deck) => ({ ...deck, cards: deck.cards.filter((card) => card.id !== cardId) }));
}
