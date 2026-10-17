import { shuffle } from "./questions";
import type { CouplesQuestion } from "./types";

export interface Session {
  /** The cards for this run, in play order. */
  cards: CouplesQuestion[];
  /** Ids already shown, so a re-deal can avoid repeating a session's cards. */
  used: Set<string>;
}

/**
 * Order cards so themes take turns. Themes can differ a lot in size (a curated
 * theme has dozens of cards, a generated one hundreds), and a plain shuffle of
 * a mixed pool would almost never surface the small ones.
 */
function interleaveByTheme(cards: readonly CouplesQuestion[], rng: () => number): CouplesQuestion[] {
  const buckets = new Map<string, CouplesQuestion[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.theme);
    if (bucket) bucket.push(card);
    else buckets.set(card.theme, [card]);
  }
  const queues = shuffle([...buckets.keys()], rng).map((theme) => buckets.get(theme) ?? []);
  const out: CouplesQuestion[] = [];
  for (let round = 0; out.length < cards.length; round += 1) {
    for (const queue of queues) {
      if (round < queue.length) out.push(queue[round]);
    }
  }
  return out;
}

/**
 * Deal `count` distinct cards from `pool`. A runtime shuffle means every
 * session shows different prompts, and the first pass takes at most one card
 * per `group` (seed predicate) so the same base never repeats with a different
 * adjunct. Themes take turns, so a mixed deck gives each theme an equal share.
 * The second pass tops up with the remaining cards if there aren't
 * enough distinct groups for the requested count.
 */
export function dealSession(
  pool: readonly CouplesQuestion[],
  count: number,
  rng: () => number = Math.random,
): Session {
  const target = Math.max(0, Math.min(count, pool.length));
  const shuffled = interleaveByTheme(shuffle(pool, rng), rng);
  const cards: CouplesQuestion[] = [];
  const picked = new Set<string>();
  const groups = new Set<string>();

  for (const card of shuffled) {
    if (cards.length >= target) break;
    if (groups.has(card.group)) continue;
    groups.add(card.group);
    picked.add(card.id);
    cards.push(card);
  }
  for (const card of shuffled) {
    if (cards.length >= target) break;
    if (picked.has(card.id)) continue;
    picked.add(card.id);
    cards.push(card);
  }

  return { cards, used: picked };
}

/** A new deal that avoids cards already seen, falling back to the full pool. */
export function redealSession(
  pool: readonly CouplesQuestion[],
  count: number,
  used: ReadonlySet<string>,
  rng: () => number = Math.random,
): Session {
  const fresh = pool.filter((card) => !used.has(card.id));
  const source = fresh.length >= count ? fresh : pool;
  return dealSession(source, count, rng);
}
