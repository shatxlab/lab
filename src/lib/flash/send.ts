/** The shape of a deck travelling by "Send to phone": compact, no schedule. */

import { MAX_CARDS_PER_DECK, MAX_FIELD_LENGTH, MAX_NAME_LENGTH, MAX_TAGS, type Deck } from "@/lib/flash/model";
import type { ParsedCard } from "@/lib/flash/parse";

export const FLASH_SEND_KIND = "flashdeck";

/** `{ n: name, c: [[front, back, "tag tag"?], …] }` — the schedule stays behind; the phone starts fresh. */
export function deckToSend(deck: Deck): unknown {
  return {
    n: deck.name,
    c: deck.cards.map((card) => (card.tags.length > 0 ? [card.front, card.back, card.tags.join(" ")] : [card.front, card.back])),
  };
}

const isText = (value: unknown): value is string => typeof value === "string";

/** Validate whatever arrived; returns null unless at least one usable card is inside. */
export function parseDeckSend(data: unknown): { name: string; cards: ParsedCard[] } | null {
  if (!data || typeof data !== "object") return null;
  const input = data as { n?: unknown; c?: unknown };
  if (!Array.isArray(input.c)) return null;
  const cards: ParsedCard[] = [];
  for (const item of input.c.slice(0, MAX_CARDS_PER_DECK)) {
    if (!Array.isArray(item) || !isText(item[0]) || !isText(item[1])) continue;
    const front = item[0].trim().slice(0, MAX_FIELD_LENGTH);
    const back = item[1].trim().slice(0, MAX_FIELD_LENGTH);
    if (!front || !back) continue;
    const tags = isText(item[2]) ? item[2].split(/[,;\s]+/).filter(Boolean).slice(0, MAX_TAGS) : [];
    cards.push({ front, back, tags });
  }
  if (cards.length === 0) return null;
  return { name: (isText(input.n) ? input.n.trim() : "").slice(0, MAX_NAME_LENGTH) || "Deck", cards };
}
