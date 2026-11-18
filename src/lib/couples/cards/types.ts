import type { GameId, ThemeId } from "../types";

/**
 * A hand-written card. Unlike the generated seed vocabulary, every card is a
 * whole sentence someone chose on purpose, written natively for its language
 * (never translated from the other one).
 *
 * What makes a card worth keeping:
 * - a real split: couples would honestly answer differently;
 * - a concrete scene, not a category ("finishes your fries" beats "eating");
 * - it reveals something about the two of them;
 * - one idea, in its own sentence shape.
 */
export interface CuratedCard {
  /** The full text shown on the card. */
  prompt: string;
  /**
   * A line for «Вместе» / "Together" mode that turns the tap into a
   * conversation. Phrased as a question or an invitation, never a quiz.
   */
  followUp: string;
  /** The two buttons. Required for `either`; the other games have fixed ones. */
  options?: readonly [string, string];
}

export type CuratedGames = Record<GameId, readonly CuratedCard[]>;

/**
 * Themes migrated to hand-written cards. A theme missing here still uses the
 * generated vocabulary, so themes can be moved over one at a time.
 */
export type CuratedDeck = Partial<Record<ThemeId, CuratedGames>>;
