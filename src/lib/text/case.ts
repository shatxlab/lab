/** Case conversions for the text tools. Unicode-aware (Cyrillic works as well as Latin). */

export type CaseMode =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "invert"
  | "camel"
  | "pascal"
  | "snake"
  | "constant"
  | "kebab"
  | "dot";

export const CASE_MODES: readonly CaseMode[] = [
  "upper",
  "lower",
  "title",
  "sentence",
  "invert",
  "camel",
  "pascal",
  "snake",
  "constant",
  "kebab",
  "dot",
];

const capitalize = (word: string): string => {
  const [first = "", ...rest] = Array.from(word);
  return first.toUpperCase() + rest.join("").toLowerCase();
};

/**
 * Split identifiers and phrases into words: on anything that is not a letter
 * or digit and on camelCase / digit boundaries ("parseHTTPResponse2" →
 * parse, HTTP, Response, 2).
 */
export function splitWords(text: string): string[] {
  return text
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function toTitle(text: string): string {
  // Keep the original spacing and punctuation; only change word starts.
  return text.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

function toSentence(text: string): string {
  const lower = text.toLowerCase();
  return lower.replace(/(^\s*|[.!?…]\s+|\n\s*)(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

function toInverted(text: string): string {
  return Array.from(text)
    .map((char) => {
      const upper = char.toUpperCase();
      return char === upper ? char.toLowerCase() : upper;
    })
    .join("");
}

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitle(text);
    case "sentence":
      return toSentence(text);
    case "invert":
      return toInverted(text);
    case "camel": {
      const words = splitWords(text).map((word) => word.toLowerCase());
      return words.map((word, index) => (index === 0 ? word : capitalize(word))).join("");
    }
    case "pascal":
      return splitWords(text).map(capitalize).join("");
    case "snake":
      return splitWords(text).map((word) => word.toLowerCase()).join("_");
    case "constant":
      return splitWords(text).map((word) => word.toUpperCase()).join("_");
    case "kebab":
      return splitWords(text).map((word) => word.toLowerCase()).join("-");
    case "dot":
      return splitWords(text).map((word) => word.toLowerCase()).join(".");
  }
}
