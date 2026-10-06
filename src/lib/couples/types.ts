/** Shared types for the couples game suite («Игры для пар» / "Games for couples"). */

export type GameId = "norm" | "either" | "who";

/** Languages the game ships content and UI for. */
export type Lang = "en" | "ru";

/** A string localized into every shipped language. */
export type LocalizedText = Record<Lang, string>;

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
  name: LocalizedText;
  tagline: LocalizedText;
  description: LocalizedText;
  gradient: string;
  accent: string;
}

export interface ThemeDef {
  id: ThemeId;
  emoji: string;
  name: LocalizedText;
  tagline: LocalizedText;
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
  /** Language of the prompts and the interface. */
  lang: Lang;
  mode: Mode;
  theme: ThemeId | "all";
  count: number;
  names: [string, string];
  sound: boolean;
}
