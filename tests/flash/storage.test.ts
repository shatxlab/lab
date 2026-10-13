import { describe, expect, it } from "vitest";

import { createCard, createDeck, emptyStore, recordReview } from "@/lib/flash/model";
import { FLASH_STORAGE_KEY, readFlashStore, writeFlashStore, type FlashStorage } from "@/lib/flash/storage";

function memory(initial?: string): FlashStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe("flash storage", () => {
  it("uses a lab: key so the settings backup covers it", () => {
    expect(FLASH_STORAGE_KEY).toBe("lab:flash:v1");
  });

  it("round-trips decks, schedule, log and settings", () => {
    let store = emptyStore();
    const deck = createDeck("Spanish", [createCard({ front: "hola", back: "hello", tags: ["a"] }), createCard({ front: "adiós", back: "bye" })]);
    store.decks = [deck];
    store.settings = { newPerDay: 7, retention: 0.85, sound: false };
    store = recordReview(store, deck.id, deck.cards[0]!.id, 3, 20_000);

    const storage = memory();
    writeFlashStore(store, storage);
    expect(readFlashStore(storage)).toEqual(store);
  });

  it("starts empty on missing, corrupt or wrong-shaped data", () => {
    expect(readFlashStore(memory())).toEqual(emptyStore());
    expect(readFlashStore(memory("{nope"))).toEqual(emptyStore());
    expect(readFlashStore(memory("[1,2]"))).toEqual(emptyStore());
    expect(readFlashStore(undefined)).toEqual(emptyStore());
  });

  it("drops junk cards, repairs duplicate ids and resets cards with no usable memory", () => {
    const raw = {
      decks: [
        {
          id: "d1",
          name: "x".repeat(200),
          cards: [
            { id: "c1", front: "a", back: "b", reps: 3, stability: 5, difficulty: 99, due: 10.7, last: 4, lapses: 1 },
            { id: "c1", front: "dup", back: "id" },
            { id: "c3", front: "no back" },
            "garbage",
            { id: "c4", front: "broken", back: "memory", reps: 5, stability: 0, due: 9 },
          ],
        },
        { id: "d1", name: "same id", cards: [] },
      ],
      settings: { newPerDay: -5, retention: 5, sound: "yes" },
    };
    const store = readFlashStore(memory(JSON.stringify(raw)));
    expect(store.decks).toHaveLength(2);
    expect(store.decks[0]!.name).toHaveLength(80);
    expect(new Set(store.decks.map((d) => d.id)).size).toBe(2);
    const cards = store.decks[0]!.cards;
    expect(cards.map((c) => c.front)).toEqual(["a", "dup", "broken"]);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    expect(cards[0]).toMatchObject({ reps: 3, difficulty: 10, due: 10, lapses: 1 });
    expect(cards[2]).toMatchObject({ reps: 0, stability: 0, due: 0 });
    expect(store.settings).toEqual({ newPerDay: 0, retention: 0.97, sound: true });
  });

  it("never throws when storage refuses writes", () => {
    const storage: FlashStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota");
      },
    };
    expect(() => writeFlashStore(emptyStore(), storage)).not.toThrow();
  });
});
