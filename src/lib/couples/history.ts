import type { CouplesStorage } from "./storage";
import type { CouplesQuestion } from "./types";

/**
 * What a couple has already seen, and what they never want to see again.
 *
 * A couple that plays every day goes through a theme quickly, so the deal has
 * to remember across days: unseen cards come first, then the ones seen longest
 * ago. Cards are identified by a hash of their text, not by their position in a
 * file, so editing or culling a theme never scrambles the history.
 */

export const HISTORY_KEY = "lab:couples:history:v1";

export interface CouplesHistory {
  /** Counts every card shown; a card's value is the count when it was last shown. */
  seq: number;
  seen: Record<string, number>;
  /** Cards the couple asked never to see again. */
  hidden: string[];
}

export function emptyHistory(): CouplesHistory {
  return { seq: 0, seen: {}, hidden: [] };
}

/**
 * A short stable key for a card: its game plus a 32-bit hash of its prompt and
 * buttons. «ИлиТо» cards share lead-ins ("Что хуже?") and differ by their two
 * options, so the options are part of what makes a card itself.
 */
export function cardKey(card: Pick<CouplesQuestion, "game" | "prompt"> & { options?: readonly string[] }): string {
  const text = `${card.prompt}|${(card.options ?? []).join("|")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${card.game}:${(hash >>> 0).toString(36)}`;
}

export function normalizeHistory(raw: unknown): CouplesHistory {
  const history = emptyHistory();
  if (!raw || typeof raw !== "object") return history;
  const stored = raw as { seq?: unknown; seen?: unknown; hidden?: unknown };
  if (stored.seen && typeof stored.seen === "object") {
    for (const [key, value] of Object.entries(stored.seen as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) history.seen[key] = Math.floor(value);
    }
  }
  if (Array.isArray(stored.hidden)) {
    history.hidden = [...new Set(stored.hidden.filter((key): key is string => typeof key === "string"))];
  }
  const highest = Math.max(0, ...Object.values(history.seen));
  history.seq = typeof stored.seq === "number" && Number.isFinite(stored.seq) ? Math.max(Math.floor(stored.seq), highest) : highest;
  return history;
}

export function readHistory(storage?: CouplesStorage): CouplesHistory {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const value = target?.getItem(HISTORY_KEY);
    return value ? normalizeHistory(JSON.parse(value)) : emptyHistory();
  } catch {
    return emptyHistory();
  }
}

export function writeHistory(history: CouplesHistory, storage?: CouplesStorage): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    target?.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Remembering is a nicety; never break a page over it.
  }
}

export function markSeen(history: CouplesHistory, key: string): CouplesHistory {
  const seq = history.seq + 1;
  return { ...history, seq, seen: { ...history.seen, [key]: seq } };
}

export function hideCard(history: CouplesHistory, key: string): CouplesHistory {
  return history.hidden.includes(key) ? history : { ...history, hidden: [...history.hidden, key] };
}

export function restoreHidden(history: CouplesHistory): CouplesHistory {
  return { ...history, hidden: [] };
}

/** The pool without the cards the couple turned off. */
export function withoutHidden(pool: readonly CouplesQuestion[], history: CouplesHistory): CouplesQuestion[] {
  if (history.hidden.length === 0) return [...pool];
  const hidden = new Set(history.hidden);
  return pool.filter((card) => !hidden.has(cardKey(card)));
}

/** Lower is dealt sooner: never seen (-1), then the card seen longest ago. */
export function rankOf(history: CouplesHistory): (card: CouplesQuestion) => number {
  return (card) => history.seen[cardKey(card)] ?? -1;
}
