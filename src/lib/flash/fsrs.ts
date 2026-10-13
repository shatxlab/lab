/**
 * FSRS-lite: the FSRS-4.5 memory model with its published default weights and
 * no learning steps. A card carries two numbers — stability (days until recall
 * drops to 90%) and difficulty (1 easy … 10 hard) — and every review updates
 * both. Pure math, no dates: callers pass elapsed days.
 */

/** 1 = again, 2 = hard, 3 = good, 4 = easy. */
export type Grade = 1 | 2 | 3 | 4;

export interface Memory {
  stability: number;
  difficulty: number;
}

/** FSRS-4.5 default parameters. */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81;
const MIN_STABILITY = 0.1;
export const MAX_INTERVAL_DAYS = 3650;

const clampDifficulty = (value: number) => Math.min(10, Math.max(1, value));

/** Chance of recalling the card `elapsedDays` after its last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;
}

/** Whole days until recall is expected to fall to `retention`. */
export function intervalDays(stability: number, retention = 0.9): number {
  const days = (stability / FACTOR) * (retention ** (1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
}

/** The memory of a card after its very first review. */
export function firstReview(grade: Grade): Memory {
  return {
    stability: Math.max(MIN_STABILITY, W[grade - 1]!),
    difficulty: clampDifficulty(W[4] - (grade - 3) * W[5]),
  };
}

/** The memory after reviewing a card that was last seen `elapsedDays` ago. */
export function nextReview(memory: Memory, elapsedDays: number, grade: Grade): Memory {
  const { stability: s, difficulty: d } = memory;
  const r = retrievability(elapsedDays, s);

  // Difficulty drifts with the grade, pulled back toward the "good" baseline.
  const drifted = d - W[6] * (grade - 3);
  const difficulty = clampDifficulty(W[7] * firstReview(3).difficulty + (1 - W[7]) * drifted);

  if (grade === 1) {
    const forgotten = W[11] * difficulty ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r));
    return { stability: Math.max(MIN_STABILITY, Math.min(forgotten, s)), difficulty };
  }
  const hard = grade === 2 ? W[15] : 1;
  const easy = grade === 4 ? W[16] : 1;
  const growth = Math.exp(W[8]) * (11 - difficulty) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1);
  return { stability: s * (1 + growth * hard * easy), difficulty };
}
