import { describe, expect, it } from "vitest";

import { MAX_CARDS_PER_DECK, MAX_DECKS, emptyStore, recordReview } from "@/lib/flash/model";
import { addCards, addDeck, removeCard, removeDeck, renameDeck, updateCard } from "@/lib/flash/ops";

const draft = (front: string, back = "b") => ({ front, back, tags: [] });

describe("flash ops", () => {
  it("adds a deck, optionally with imported cards", () => {
    const { store, deck } = addDeck(emptyStore(), "  Spanish  ", [{ front: "hola", back: "hello", tags: ["a"] }]);
    expect(deck!.name).toBe("Spanish");
    expect(store.decks[0]!.cards).toHaveLength(1);
  });

  it("refuses a deck past the limit", () => {
    let store = emptyStore();
    for (let i = 0; i < MAX_DECKS; i += 1) store = addDeck(store, `d${i}`).store;
    const over = addDeck(store, "one more");
    expect(over.deck).toBeNull();
    expect(over.store).toBe(store);
  });

  it("renames, ignoring blank names", () => {
    const { store, deck } = addDeck(emptyStore(), "A");
    expect(renameDeck(store, deck!.id, "B").decks[0]!.name).toBe("B");
    expect(renameDeck(store, deck!.id, "   ")).toBe(store);
  });

  it("adds cards, trimming and skipping incomplete drafts", () => {
    const { store, deck } = addDeck(emptyStore(), "A");
    const result = addCards(store, deck!.id, [draft("  one ", " 1 "), draft(""), draft("two", "  ")]);
    expect(result.added).toBe(1);
    expect(result.store.decks[0]!.cards[0]).toMatchObject({ front: "one", back: "1" });
  });

  it("stops at the per-deck card limit", () => {
    const { store, deck } = addDeck(emptyStore(), "A");
    const many = Array.from({ length: MAX_CARDS_PER_DECK + 5 }, (_, i) => draft(`q${i}`));
    const result = addCards(store, deck!.id, many);
    expect(result.added).toBe(MAX_CARDS_PER_DECK);
    expect(addCards(result.store, deck!.id, [draft("x")]).added).toBe(0);
  });

  it("edits text but keeps the schedule", () => {
    let { store, deck } = addDeck(emptyStore(), "A", [{ front: "q", back: "a", tags: [] }]);
    const id = deck!.cards[0]!.id;
    store = recordReview(store, deck!.id, id, 3, 100);
    const edited = updateCard(store, deck!.id, id, { front: "q2", back: "a2", tags: [" x "] });
    expect(edited.decks[0]!.cards[0]).toMatchObject({ front: "q2", back: "a2", tags: ["x"], reps: 1, due: 104 });
    expect(updateCard(store, deck!.id, id, draft("", "a"))).toBe(store);
  });

  it("removes a card and a deck, forgetting the deck's new-card count", () => {
    let { store, deck } = addDeck(emptyStore(), "A", [{ front: "q", back: "a", tags: [] }]);
    const id = deck!.cards[0]!.id;
    store = recordReview(store, deck!.id, id, 3, 100);
    expect(removeCard(store, deck!.id, id).decks[0]!.cards).toEqual([]);
    const gone = removeDeck(store, deck!.id);
    expect(gone.decks).toEqual([]);
    expect(gone.introduced.byDeck).toEqual({});
  });
});
