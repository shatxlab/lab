import type { AppLang } from "@/lib/apps/lang";
import { WORDS } from "@/lib/wordle/words";

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
/** How many past answers are kept out of the next draw. */
export const RECENT_LIMIT = 60;

export type LetterState = "correct" | "present" | "absent";

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  answer: string;
  guesses: string[];
  status: GameStatus;
}

/** Standard Wordle scoring, including repeated letters (each answer letter is used once). */
export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = Array.from({ length: guess.length }, () => "absent");
  const remaining = new Map<string, number>();

  for (let index = 0; index < guess.length; index += 1) {
    if (guess[index] === answer[index]) {
      result[index] = "correct";
    } else {
      const letter = answer[index]!;
      remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
    }
  }
  for (let index = 0; index < guess.length; index += 1) {
    if (result[index] === "correct") continue;
    const letter = guess[index]!;
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(letter, count - 1);
    }
  }
  return result;
}

const RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/** Best known state per letter across all guesses (drives key colours). */
export function keyStates(guesses: readonly string[], answer: string): Record<string, LetterState> {
  const states: Record<string, LetterState> = {};
  for (const guess of guesses) {
    evaluateGuess(guess, answer).forEach((state, index) => {
      const letter = guess[index]!;
      const known = states[letter];
      if (!known || RANK[state] > RANK[known]) states[letter] = state;
    });
  }
  return states;
}

export type HardModeViolation = { kind: "position"; letter: string; index: number } | { kind: "include"; letter: string };

/**
 * Hard mode: every revealed hint must be used in the next guess — greens stay
 * in place and yellows must appear (as many times as they were revealed).
 */
export function checkHardMode(guess: string, previous: readonly string[], answer: string): HardModeViolation | null {
  const last = previous[previous.length - 1];
  if (last === undefined) return null;
  const evaluation = evaluateGuess(last, answer);
  const required = new Map<string, number>();

  for (let index = 0; index < last.length; index += 1) {
    const state = evaluation[index]!;
    if (state === "correct" && guess[index] !== last[index]) return { kind: "position", letter: last[index]!, index };
    if (state !== "absent") required.set(last[index]!, (required.get(last[index]!) ?? 0) + 1);
  }
  for (const [letter, needed] of required) {
    const have = Array.from(guess).filter((char) => char === letter).length;
    if (have < needed) return { kind: "include", letter };
  }
  return null;
}

export type SubmitError = "short" | "unknown" | "hard-position" | "hard-include";

export interface SubmitOutcome {
  state: GameState;
  error?: { kind: SubmitError; letter?: string; index?: number };
  evaluation?: LetterState[];
}

/** Apply one complete guess to a game. Pure, so it is easy to test and to replay. */
export function submitGuess(
  state: GameState,
  guess: string,
  options: { hardMode: boolean; /** Whether a guess is a real word. Omitted = anything goes (tests). */ isWord?: (guess: string) => boolean },
): SubmitOutcome {
  if (state.status !== "playing") return { state };
  if (Array.from(guess).length !== WORD_LENGTH) return { state, error: { kind: "short" } };
  // Like the original: a non-word is refused before it can reveal anything.
  if (options.isWord && !options.isWord(guess)) return { state, error: { kind: "unknown" } };

  if (options.hardMode) {
    const violation = checkHardMode(guess, state.guesses, state.answer);
    if (violation) {
      return violation.kind === "position"
        ? { state, error: { kind: "hard-position", letter: violation.letter, index: violation.index } }
        : { state, error: { kind: "hard-include", letter: violation.letter } };
    }
  }

  const guesses = [...state.guesses, guess];
  const won = guess === state.answer;
  const status: GameStatus = won ? "won" : guesses.length >= MAX_GUESSES ? "lost" : "playing";
  return { state: { ...state, guesses, status }, evaluation: evaluateGuess(guess, state.answer) };
}

/** A fresh answer that avoids the recent ones; falls back to the whole pool if it must. */
export function pickAnswer(lang: AppLang, recent: readonly string[] = [], random: () => number = secureRandom): string {
  const pool = WORDS[lang];
  const skip = new Set(recent);
  const fresh = pool.filter((word) => !skip.has(word));
  const source = fresh.length > 0 ? fresh : pool;
  return source[Math.floor(random() * source.length)]!;
}

function secureRandom(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoApi.getRandomValues(buffer);
    return buffer[0]! / 2 ** 32;
  }
  return Math.random();
}

export function newGame(lang: AppLang, recent: readonly string[] = [], random?: () => number): GameState {
  return { answer: pickAnswer(lang, recent, random), guesses: [], status: "playing" };
}

const EMOJI: Record<LetterState, string> = { correct: "🟩", present: "🟨", absent: "⬛" };
const EMOJI_HIGH_CONTRAST: Record<LetterState, string> = { correct: "🟧", present: "🟦", absent: "⬛" };

/** Spoiler-free result grid for sharing. */
export function shareText(lang: AppLang, state: GameState, options: { hardMode: boolean; highContrast: boolean }): string {
  const score = state.status === "won" ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const title = `${lang === "ru" ? "Вордли" : "Wordle"} ${lang.toUpperCase()} ${score}${options.hardMode ? "*" : ""}`;
  const palette = options.highContrast ? EMOJI_HIGH_CONTRAST : EMOJI;
  const rows = state.guesses.map((guess) => evaluateGuess(guess, state.answer).map((value) => palette[value]).join(""));
  return [title, "", ...rows].join("\n");
}
