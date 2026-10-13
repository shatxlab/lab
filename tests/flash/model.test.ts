import { describe, expect, it } from "vitest";

import {
  cramQueue,
  createCard,
  createDeck,
  deckCounts,
  emptyStore,
  gradeCard,
  localDay,
  previewIntervals,
  recordReview,
  streak,
  studyQueue,
  summarize,
  type FlashStore,
} from "@/lib/flash/model";

const DAY = 20_000;

function storeWith(count: number, newPerDay = 20): { store: FlashStore; deckId: string } {
  const deck = createDeck("Verbs", Array.from({ length: count }, (_, i) => createCard({ front: `q${i}`, back: `a${i}` })));
  const store = emptyStore();
  store.decks = [deck];
  store.settings.newPerDay = newPerDay;
  return { store, deckId: deck.id };
}

describe("localDay", () => {
  it("counts local calendar days, not UTC ones", () => {
    const a = new Date(2026, 9, 13, 0, 5);
    const b = new Date(2026, 9, 13, 23, 55);
    const c = new Date(2026, 9, 14, 0, 5);
    expect(localDay(a)).toBe(localDay(b));
    expect(localDay(c)).toBe(localDay(a) + 1);
  });
});

describe("gradeCard", () => {
  it("schedules a new card from its first grade", () => {
    const card = gradeCard(createCard({ front: "a", back: "b" }), 3, DAY, 0.9);
    expect(card).toMatchObject({ reps: 1, lapses: 0, last: DAY, due: DAY + 4 });
  });

  it("counts a lapse only for a card that was already learned", () => {
    const fresh = gradeCard(createCard({ front: "a", back: "b" }), 1, DAY, 0.9);
    expect(fresh.lapses).toBe(0);
    const lapsed = gradeCard(gradeCard(createCard({ front: "a", back: "b" }), 3, DAY, 0.9), 1, DAY + 4, 0.9);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(2);
  });

  it("previews the days each answer button would schedule", () => {
    expect(previewIntervals(createCard({ front: "a", back: "b" }), DAY, 0.9)).toEqual({ 1: 1, 2: 1, 3: 4, 4: 14 });
  });
});

describe("queues and counts", () => {
  it("offers only the new-card allowance of an untouched deck", () => {
    const { store, deckId } = storeWith(30, 20);
    const deck = store.decks.find((d) => d.id === deckId)!;
    expect(deckCounts(deck, store, DAY)).toEqual({ due: 0, fresh: 20, total: 30 });
    expect(studyQueue(deck, store, DAY)).toHaveLength(20);
  });

  it("puts overdue cards first, most overdue earliest, then new ones", () => {
    let { store, deckId } = storeWith(4, 10);
    const [a, b] = store.decks[0]!.cards;
    store = recordReview(store, deckId, a!.id, 3, DAY - 10);
    store = recordReview(store, deckId, b!.id, 3, DAY - 20);
    const queue = studyQueue(store.decks[0]!, store, DAY);
    expect(queue.map((card) => card.front)).toEqual(["q1", "q0", "q2", "q3"]);
  });

  it("does not offer cards that are not yet due", () => {
    let { store, deckId } = storeWith(1);
    store = recordReview(store, deckId, store.decks[0]!.cards[0]!.id, 4, DAY);
    expect(studyQueue(store.decks[0]!, store, DAY + 1)).toEqual([]);
    expect(studyQueue(store.decks[0]!, store, DAY + 14)).toHaveLength(1);
  });

  it("uses up the new allowance as new cards are first graded, and resets it tomorrow", () => {
    let { store, deckId } = storeWith(5, 2);
    for (const card of studyQueue(store.decks[0]!, store, DAY)) store = recordReview(store, deckId, card.id, 1, DAY);
    // Both "again" cards are due the next day; the allowance for today is spent.
    expect(deckCounts(store.decks[0]!, store, DAY)).toMatchObject({ fresh: 0 });
    expect(deckCounts(store.decks[0]!, store, DAY + 1)).toMatchObject({ due: 2, fresh: 2 });
  });

  it("shuffles for cram without touching the originals", () => {
    const { store } = storeWith(10);
    const deck = store.decks[0]!;
    const before = deck.cards.map((card) => card.id);
    const cram = cramQueue(deck, () => 0);
    expect(cram.map((card) => card.id).sort()).toEqual([...before].sort());
    expect(cram.map((card) => card.id)).not.toEqual(before);
    expect(deck.cards.map((card) => card.id)).toEqual(before);
  });
});

describe("recordReview", () => {
  it("updates the card, today's log and ignores unknown ids", () => {
    const { store, deckId } = storeWith(1);
    const card = store.decks[0]!.cards[0]!;
    const next = recordReview(store, deckId, card.id, 3, DAY);
    expect(next.decks[0]!.cards[0]).toMatchObject({ reps: 1, due: DAY + 4 });
    expect(next.log[DAY]).toBe(1);
    expect(next.introduced).toEqual({ day: DAY, byDeck: { [deckId]: 1 } });
    expect(store.decks[0]!.cards[0]!.reps).toBe(0); // the old store is untouched
    expect(recordReview(store, "nope", card.id, 3, DAY)).toBe(store);
    expect(recordReview(store, deckId, "nope", 3, DAY)).toBe(store);
  });
});

describe("streak and summary", () => {
  it("counts consecutive days, surviving an unfinished today", () => {
    const log = { [DAY]: 3, [DAY - 1]: 1, [DAY - 2]: 5, [DAY - 4]: 2 };
    expect(streak(log, DAY)).toBe(3);
    expect(streak({ [DAY - 1]: 1, [DAY - 2]: 1 }, DAY)).toBe(2);
    expect(streak({ [DAY - 2]: 1 }, DAY)).toBe(0);
    expect(streak({}, DAY)).toBe(0);
  });

  it("sums due, streak and learned over every deck", () => {
    let { store, deckId } = storeWith(3, 5);
    store = recordReview(store, deckId, store.decks[0]!.cards[0]!.id, 3, DAY - 1);
    const summary = summarize(store, DAY);
    expect(summary).toEqual({ due: 0 + 2, streak: 1, learned: 1 });
  });
});
