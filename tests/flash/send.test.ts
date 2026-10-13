import { describe, expect, it } from "vitest";

import { createCard, createDeck } from "@/lib/flash/model";
import { FLASH_SEND_KIND, deckToSend, parseDeckSend } from "@/lib/flash/send";
import { decodeSend, encodeSend } from "@/lib/send/codec";

describe("flash deck send mapping", () => {
  it("round-trips a deck through the codec, dropping the schedule", () => {
    const deck = createDeck("Español", [
      { ...createCard({ front: "hola", back: "hello", tags: ["a", "b"] }), reps: 4, stability: 9, due: 100 },
      createCard({ front: "adiós", back: "bye" }),
    ]);
    const encoded = encodeSend(FLASH_SEND_KIND, deckToSend(deck));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const received = parseDeckSend(decodeSend(encoded.fragment)!.data);
    expect(received).toEqual({
      name: "Español",
      cards: [
        { front: "hola", back: "hello", tags: ["a", "b"] },
        { front: "adiós", back: "bye", tags: [] },
      ],
    });
  });

  it.each([
    ["null", null],
    ["a string", "deck"],
    ["no cards array", { n: "x" }],
    ["no usable cards", { n: "x", c: [[1, 2], ["only front"], ["", "empty front"], "junk"] }],
  ])("rejects %s", (_name, data) => {
    expect(parseDeckSend(data)).toBeNull();
  });

  it("keeps the usable cards, trims text and falls back to a default name", () => {
    expect(parseDeckSend({ c: [["  q  ", " a ", "t1, t2"], ["bad"], [7, "x"]] })).toEqual({
      name: "Deck",
      cards: [{ front: "q", back: "a", tags: ["t1", "t2"] }],
    });
  });

  it("caps oversized names and fields", () => {
    const parsed = parseDeckSend({ n: "n".repeat(500), c: [["q".repeat(9000), "a"]] })!;
    expect(parsed.name).toHaveLength(80);
    expect(parsed.cards[0]!.front).toHaveLength(4000);
  });
});
