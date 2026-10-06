import { EN_WORDS } from "./en";
import { RU_WORDS } from "./ru";

import type { AppLang } from "@/lib/apps/lang";

const split = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Answer pools. Guesses are NOT restricted to these — any five letters are accepted. */
export const WORDS: Record<AppLang, readonly string[]> = {
  en: split(EN_WORDS),
  ru: split(RU_WORDS),
};
