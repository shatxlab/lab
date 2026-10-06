/** Shared types for the Russian couples game suite («Игры для пар»). */

export type GameId = "norm" | "either" | "who";

export type ThemeId =
  | "home"
  | "romance"
  | "habits"
  | "food"
  | "money"
  | "travel"
  | "friends"
  | "tender"
  | "future"
  | "conflict";

/**
 * Two ways to play every game:
 * - `match`  — partners answer in secret, one after the other, then see whether
 *              they agreed. The session is scored by agreement.
 * - `together` — partners discuss out loud and cast one shared answer; the
 *                session ends with a recap of their joint picks.
 */
export type Mode = "match" | "together";

/** A playable game. Options are fixed for the game, derived for its questions. */
export interface GameDef {
  id: GameId;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  gradient: string;
  accent: string;
}

export interface ThemeDef {
  id: ThemeId;
  emoji: string;
  name: string;
  tagline: string;
  gradient: string;
  accent: string;
}

/** One prompt ready to show. `options` are the two buttons under it. */
export interface CouplesQuestion {
  id: string;
  game: GameId;
  theme: ThemeId;
  /** Full prompt text. */
  prompt: string;
  options: [string, string];
  /**
   * The underlying seed (a predicate, or the card id for `either`). A deal
   * prefers one card per group so a session doesn't repeat the same base with
   * different manner adjuncts.
   */
  group: string;
}

/** Phases of a single card. */
export type PlayPhase = "voteA" | "handoff" | "voteB" | "reveal" | "voteTogether";

/** One finished card: the question plus each player's option index. */
export interface RoundResult {
  question: CouplesQuestion;
  /** `[a, b]` in match mode, `[joint]` when playing together. */
  picks: number[];
  match: boolean;
}

/** Persisted setup. `theme: "all"` mixes every theme's deck. */
export interface CouplesSettings {
  game: GameId;
  mode: Mode;
  theme: ThemeId | "all";
  count: number;
  names: [string, string];
  sound: boolean;
}
