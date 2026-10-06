import type { ThemeId } from "../types";

export type { ThemeId };

/** A sentence pattern plus the objects it crosses. */
export interface ScenarioFrame {
  /** Infinitive pattern for «Норм или стрём» / "Fine or Cringe". */
  norm: string;
  /**
   * Pattern completing "Кто из нас скорее …?" (ru) or "Which of us would …?"
   * (en).
   */
  who: string;
  /** First slot, substituted for `{a}`. */
  a: readonly string[];
  /** Optional second slot, substituted for `{b}`. */
  b?: readonly string[];
}

/** One dilemma axis: a shared label plus mutually exclusive options. */
export interface EitherAxis {
  label: string;
  options: readonly string[];
}

export type FramesByTheme = Record<ThemeId, readonly ScenarioFrame[]>;
export type AxesByTheme = Record<ThemeId, readonly EitherAxis[]>;
