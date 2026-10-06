import type { AppLang } from "@/lib/apps/lang";

/** On-screen keyboard rows per language. Russian omits ё (it is typed as е). */
export const KEYBOARD_ROWS: Record<AppLang, readonly (readonly string[])[]> = {
  en: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ],
  ru: [
    ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
    ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
    ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю"],
  ],
};

/**
 * Physical key (KeyboardEvent.code) → letter, for the Russian ЙЦУКЕН layout.
 * Lets someone with an English keyboard layout active still type Russian
 * answers by position.
 */
export const RU_BY_CODE: Record<string, string> = {
  KeyQ: "й", KeyW: "ц", KeyE: "у", KeyR: "к", KeyT: "е", KeyY: "н", KeyU: "г", KeyI: "ш", KeyO: "щ", KeyP: "з",
  BracketLeft: "х", BracketRight: "ъ",
  KeyA: "ф", KeyS: "ы", KeyD: "в", KeyF: "а", KeyG: "п", KeyH: "р", KeyJ: "о", KeyK: "л", KeyL: "д",
  Semicolon: "ж", Quote: "э",
  KeyZ: "я", KeyX: "ч", KeyC: "с", KeyV: "м", KeyB: "и", KeyN: "т", KeyM: "ь", Comma: "б", Period: "ю",
};

const EN_BY_CODE: Record<string, string> = Object.fromEntries(
  "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => [`Key${letter.toUpperCase()}`, letter]),
);

const ALPHABET: Record<AppLang, RegExp> = {
  en: /^[a-z]$/,
  ru: /^[а-я]$/,
};

/** Fold a typed character into the game alphabet, or null when it does not belong. */
export function normalizeLetter(lang: AppLang, input: string): string | null {
  const letter = input.toLowerCase().replace("ё", "е");
  return ALPHABET[lang].test(letter) ? letter : null;
}

/** Letter for a key press: the typed character when it fits, else the physical key's position. */
export function letterFromKeyEvent(lang: AppLang, event: { key: string; code: string }): string | null {
  if (event.key.length === 1) {
    const typed = normalizeLetter(lang, event.key);
    if (typed) return typed;
  }
  const byCode = (lang === "ru" ? RU_BY_CODE : EN_BY_CODE)[event.code];
  return byCode ?? null;
}
