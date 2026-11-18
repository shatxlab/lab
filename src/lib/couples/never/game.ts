import en from "./en.json";
import ru from "./ru.json";
import type { Lang } from "../types";
import type { NeverAnswer, NeverCard, NeverDeck } from "./types";

export const NEVER_CARDS = { en, ru } as Record<Lang, readonly NeverCard[]>;
export function neverPool(lang: Lang, deck: NeverDeck): readonly NeverCard[] {
  return NEVER_CARDS[lang].filter(card => deck === "mix" ? card.category !== "closer" : card.category === deck);
}
/** No repeats within a round. No answers or seen-card history go to storage. */
export function dealNever(lang: Lang, deck: NeverDeck, count: number, random: () => number = Math.random): NeverCard[] {
  const pool = [...neverPool(lang, deck)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(pool.length, Math.floor(count) || 15)));
}
export interface NeverState {
  index: number;
  length: number;
  phase: "answer" | "story" | "summary";
  answers: [NeverAnswer | null, NeverAnswer | null];
  explored: number;
  skipped: number;
}
export function initialNever(length: number): NeverState {
  return { index: 0, length, phase: length > 0 ? "answer" : "summary", answers: [null, null], explored: 0, skipped: 0 };
}
export type NeverAction =
  | { type: "answer"; index: number; player: 0 | 1; answer: NeverAnswer }
  | { type: "next" | "skip"; index: number };
export function neverReducer(state: NeverState, action: NeverAction): NeverState {
  if (state.phase === "summary" || action.index !== state.index) return state;
  if (action.type === "answer") {
    if (![0, 1].includes(action.player) || !["have", "never"].includes(action.answer)) return state;
    const answers: NeverState["answers"] = [...state.answers];
    answers[action.player] = action.answer;
    return { ...state, answers, phase: answers.every(Boolean) ? "story" : "answer" };
  }
  if (action.type === "next" && state.phase !== "story") return state;
  const index = state.index + 1;
  return {
    ...state, index, phase: index === state.length ? "summary" : "answer", answers: [null, null],
    explored: state.explored + Number(action.type === "next"), skipped: state.skipped + Number(action.type === "skip"),
  };
}
