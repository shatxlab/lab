/**
 * Decks, cards and the pure operations on them. Everything takes the current
 * day as a number (local days since the epoch) so the schedule is testable and
 * unaffected by the clock.
 */

import { firstReview, intervalDays, nextReview, type Grade } from "@/lib/flash/fsrs";

export const MAX_DECKS = 100;
export const MAX_CARDS_PER_DECK = 5000;
export const MAX_FIELD_LENGTH = 4000;
export const MAX_NAME_LENGTH = 80;
export const MAX_TAGS = 12;
/** Review log entries kept for the streak; older days are dropped. */
export const LOG_DAYS = 800;

export interface Card {
  id: string;
  front: string;
  back: string;
  tags: string[];
  /** Times graded; 0 means the card is new. */
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  /** Day the card is next due (meaningful once reps > 0). */
  due: number;
  /** Day of the last review (meaningful once reps > 0). */
  last: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: Card[];
  created: number;
}

export interface FlashSettings {
  /** How many new cards a deck introduces per day. */
  newPerDay: number;
  /** Target recall at the moment a card comes due. */
  retention: number;
  sound: boolean;
}

export interface FlashStore {
  decks: Deck[];
  /** Reviews per day, keyed by day number. */
  log: Record<string, number>;
  /** New cards introduced today, per deck; resets when the day changes. */
  introduced: { day: number; byDeck: Record<string, number> };
  settings: FlashSettings;
}

export const DEFAULT_SETTINGS: FlashSettings = { newPerDay: 20, retention: 0.9, sound: true };

export function emptyStore(): FlashStore {
  return { decks: [], log: {}, introduced: { day: 0, byDeck: {} }, settings: { ...DEFAULT_SETTINGS } };
}

/** Local calendar day as an integer, so "tomorrow" follows the user's midnight. */
export function localDay(date: Date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createCard(input: { front: string; back: string; tags?: string[] }): Card {
  return {
    id: newId(),
    front: input.front.slice(0, MAX_FIELD_LENGTH),
    back: input.back.slice(0, MAX_FIELD_LENGTH),
    tags: (input.tags ?? []).slice(0, MAX_TAGS),
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: 0,
    due: 0,
    last: 0,
  };
}

export function createDeck(name: string, cards: Card[] = []): Deck {
  return { id: newId(), name: name.trim().slice(0, MAX_NAME_LENGTH) || "Deck", cards: cards.slice(0, MAX_CARDS_PER_DECK), created: Date.now() };
}

export const isNew = (card: Card): boolean => card.reps === 0;
export const isDue = (card: Card, day: number): boolean => card.reps > 0 && card.due <= day;

/** The card after one graded review today. */
export function gradeCard(card: Card, grade: Grade, day: number, retention: number): Card {
  const memory = isNew(card)
    ? firstReview(grade)
    : nextReview({ stability: card.stability, difficulty: card.difficulty }, Math.max(0, day - card.last), grade);
  return {
    ...card,
    ...memory,
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 1 && !isNew(card) ? 1 : 0),
    last: day,
    due: day + intervalDays(memory.stability, retention),
  };
}

/** Days until the card returns for each grade — what the answer buttons show. */
export function previewIntervals(card: Card, day: number, retention: number): Record<Grade, number> {
  const out = {} as Record<Grade, number>;
  for (const grade of [1, 2, 3, 4] as const) out[grade] = gradeCard(card, grade, day, retention).due - day;
  return out;
}

function newAllowance(store: FlashStore, deckId: string, day: number): number {
  const used = store.introduced.day === day ? (store.introduced.byDeck[deckId] ?? 0) : 0;
  return Math.max(0, store.settings.newPerDay - used);
}

export interface DeckCounts {
  due: number;
  fresh: number;
  total: number;
}

export function deckCounts(deck: Deck, store: FlashStore, day: number): DeckCounts {
  const due = deck.cards.filter((card) => isDue(card, day)).length;
  const fresh = Math.min(deck.cards.filter(isNew).length, newAllowance(store, deck.id, day));
  return { due, fresh, total: deck.cards.length };
}

/** Today's session: overdue cards first (most overdue earliest), then the new-card allowance. */
export function studyQueue(deck: Deck, store: FlashStore, day: number): Card[] {
  const due = deck.cards.filter((card) => isDue(card, day)).sort((a, b) => a.due - b.due);
  const fresh = deck.cards.filter(isNew).slice(0, newAllowance(store, deck.id, day));
  return [...due, ...fresh];
}

/** Cram: every card once, shuffled, with no effect on the schedule. */
export function cramQueue(deck: Deck, random: () => number = Math.random): Card[] {
  const cards = [...deck.cards];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

/** Fold one graded review into the store: the card, today's log and the new-card count. */
export function recordReview(store: FlashStore, deckId: string, cardId: string, grade: Grade, day: number): FlashStore {
  const deck = store.decks.find((item) => item.id === deckId);
  const card = deck?.cards.find((item) => item.id === cardId);
  if (!deck || !card) return store;

  const graded = gradeCard(card, grade, day, store.settings.retention);
  const sameDay = store.introduced.day === day;
  const byDeck = sameDay ? { ...store.introduced.byDeck } : {};
  if (isNew(card)) byDeck[deckId] = (byDeck[deckId] ?? 0) + 1;

  const log: Record<string, number> = { ...store.log };
  log[day] = (log[day] ?? 0) + 1;
  for (const key of Object.keys(log)) if (Number(key) < day - LOG_DAYS) delete log[key];

  return {
    ...store,
    decks: store.decks.map((item) => (item === deck ? { ...deck, cards: deck.cards.map((c) => (c === card ? graded : c)) } : item)),
    log,
    introduced: { day, byDeck },
  };
}

/** Consecutive days with at least one review, ending today (or yesterday, if today has none yet). */
export function streak(log: Record<string, number>, day: number): number {
  let cursor = (log[day] ?? 0) > 0 ? day : day - 1;
  let count = 0;
  while ((log[cursor] ?? 0) > 0) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

export interface Summary {
  /** Reviews due plus new cards still allowed today, across all decks. */
  due: number;
  streak: number;
  /** Cards graded at least once. */
  learned: number;
}

export function summarize(store: FlashStore, day: number): Summary {
  let due = 0;
  let learned = 0;
  for (const deck of store.decks) {
    const counts = deckCounts(deck, store, day);
    due += counts.due + counts.fresh;
    learned += deck.cards.filter((card) => !isNew(card)).length;
  }
  return { due, streak: streak(store.log, day), learned };
}
