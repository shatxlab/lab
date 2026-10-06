/**
 * Word-deck helpers.
 *
 * A deck is a queue of words: `deck[0]` is the word on screen. Both guessing
 * and skipping advance the queue, so a word is never shown twice in the same
 * game session until the whole pool has been used. `refillDeck` enforces the
 * session-wide exclusion when the deck eventually runs out.
 */

export type Rng = () => number;

/** Fisher–Yates shuffle; the rng is injectable so tests are deterministic. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/** A fresh, shuffled deck drawn from a theme's word pool. */
export function createDeck(words: readonly string[], rng: Rng = Math.random): string[] {
  return shuffle(words, rng);
}

export function currentWord(deck: readonly string[]): string | null {
  return deck.length > 0 ? deck[0] : null;
}

/** Drop the current word after it has been guessed or skipped. */
export function advanceDeck(deck: readonly string[]): string[] {
  return deck.slice(1);
}

/**
 * Replace an exhausted deck with a fresh shuffle of the pool, leaving out
 * every word already shown this session (`exclude`). If the pool has been
 * fully consumed there is nothing left to avoid, so it falls back to the full
 * pool and a new session cycle begins.
 */
export function refillDeck(
  deck: readonly string[],
  pool: readonly string[],
  exclude?: ReadonlySet<string>,
  rng: Rng = Math.random,
): string[] {
  if (deck.length > 0) return [...deck];
  const available = exclude && exclude.size > 0 ? pool.filter((word) => !exclude.has(word)) : pool;
  const source = available.length > 0 ? available : pool;
  return createDeck(source, rng);
}
