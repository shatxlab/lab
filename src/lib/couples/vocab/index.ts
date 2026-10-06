/**
 * Seed vocabulary for the couples games, per language.
 *
 * Each locale provides the same structure: scenario frames per theme (feeding
 * «Норм или стрём» and «Кто из нас» / "Fine or Cringe" and "Who of Us") and
 * either-dilemma axes per theme (feeding «ИлиТо» / "This or That").
 */

import type { Lang } from "../types";
import { EITHER_AXES as EITHER_AXES_EN, FRAMES as FRAMES_EN } from "./en";
import { EITHER_AXES as EITHER_AXES_RU, FRAMES as FRAMES_RU } from "./ru";
import type { AxesByTheme, FramesByTheme } from "./types";

export type { EitherAxis, ScenarioFrame } from "./types";

export const FRAMES: Record<Lang, FramesByTheme> = {
  en: FRAMES_EN,
  ru: FRAMES_RU,
};

export const EITHER_AXES: Record<Lang, AxesByTheme> = {
  en: EITHER_AXES_EN,
  ru: EITHER_AXES_RU,
};
