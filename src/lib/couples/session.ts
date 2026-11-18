import type { CouplesQuestion, RoundResult, SkippedRound } from "./types";

/** null means declined; missing values must never become an implicit option 0. */
export type Answer = number | null;

export function isAnswer(value: Answer | undefined): value is number {
  return value === 0 || value === 1;
}

/** Update one slot, retaining later private answers when partner B declines. */
export function withPick(picks: readonly Answer[], position: number, choice: Answer): Answer[] {
  const next = [...picks];
  next[position] = choice;
  return next;
}

export function skippedRound(question: CouplesQuestion): SkippedRound {
  return { question, skipped: true, picks: [], match: false };
}

/** Only mutual answers can leave the private passes. Declines carry no answer or attribution. */
export function matchResults(
  cards: readonly CouplesQuestion[],
  picksA: readonly Answer[],
  picksB: readonly Answer[],
): RoundResult[] {
  return cards.map((question, position) => {
    const a = picksA[position];
    const b = picksB[position];
    return isAnswer(a) && isAnswer(b)
      ? { question, picks: [a, b], match: a === b }
      : skippedRound(question);
  });
}
