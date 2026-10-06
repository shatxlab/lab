/** Shared types for the Alias party word-guessing game. */

export type Lang = "en" | "ru";

export type ThemeId =
  | "everyday"
  | "food"
  | "animals"
  | "home"
  | "people"
  | "travel"
  | "sport"
  | "art"
  | "tech"
  | "abstract";

/** A bilingual string keyed by the active game language. */
export type LocalizedText = Record<Lang, string>;

export interface ThemeDef {
  id: ThemeId;
  /** Emoji shown on the theme card. */
  emoji: string;
  name: LocalizedText;
  tagline: LocalizedText;
  /** CSS gradient painted behind the theme card and the round screen. */
  gradient: string;
  /** Solid accent used for the selected-card ring and progress bars. */
  accent: string;
}

/**
 * The word bank for one language. Each theme is a shuffled pool formed from
 * the shared `core` list plus the theme-specific list. Keeping a shared core
 * lets every theme exceed the 1000-word target without duplicating data.
 */
export interface WordBank {
  core: string[];
  themes: Record<ThemeId, string[]>;
}

export interface Team {
  id: string;
  name: string;
  /** Accent color for the team's badge and scoreboard row. */
  color: string;
  score: number;
}

/** One word shown during a round, tagged with how the team resolved it. */
export interface TurnWord {
  word: string;
  correct: boolean;
}

export interface TurnResult {
  teamId: string;
  words: TurnWord[];
  /** Points earned this turn after the skip penalty is applied. */
  points: number;
}

export interface AliasSettings {
  lang: Lang;
  themeId: ThemeId;
  /** Length of one team's turn, in seconds. */
  roundSeconds: number;
  /** Ends the game once a full round is played; the highest score at or above it wins. */
  targetScore: number;
  /** Points deducted for skipping; 0 disables the penalty. */
  skipPenalty: number;
  sound: boolean;
}

export type Phase = "setup" | "ready" | "playing" | "turnResults" | "gameOver";
