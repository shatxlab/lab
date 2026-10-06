import { EITHER_AXES, FRAMES } from "./vocab";
import { THEME_IDS } from "./themes";
import type { CouplesQuestion, GameId, Lang, ThemeId } from "./types";

/**
 * Deterministic prompt builder.
 *
 * The seed vocabulary in `vocab/` is expanded here into 3 000 prompts per game
 * per language (300 per theme). Everything is driven by a seeded PRNG, so the
 * exact same deck is produced on every build, in the browser and in tests — no
 * network, no randomness at runtime.
 */

/** Options shown for «Норм или стрём» / "Fine or Cringe", per language. */
export const NORM_OPTIONS: Record<Lang, readonly [string, string]> = {
  en: ["Fine", "Cringe"],
  ru: ["Норм", "Стрём"],
};

/** Placeholders for «Кто из нас»; resolved to the partners' names in the UI. */
export const WHO_OPTIONS: readonly [string, string] = ["{a}", "{b}"];

/** Wraps a `who` pattern into a full prompt, per language. */
const WHO_WRAP: Record<Lang, (pattern: string) => string> = {
  en: (pattern) => `Which of us would ${pattern}?`,
  ru: (pattern) => `Кто из нас скорее ${pattern}?`,
};

/** Prompts generated per theme, per game, per language. */
export const PER_THEME = 300;

export const QUESTIONS_PER_GAME = PER_THEME * THEME_IDS.length;

/* ------------------------------------------------------------- deterministic rng */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(key: string): () => number {
  return mulberry32(xmur3(key)());
}

/** Fisher–Yates with an injectable rng. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/* --------------------------------------------------------------- candidates */

/** A raw prompt plus the two buttons it should render. */
interface Candidate {
  prompt: string;
  options: [string, string];
  group: string;
}

function fill(pattern: string, a: string, b?: string): string {
  const filled = pattern.replace("{a}", a);
  return b === undefined ? filled : filled.replace("{b}", b);
}

/**
 * Expand a theme's coherent scenario frames. Both games share the frames'
 * object lists, so `norm` reads «Есть пиццу с ананасами» and `who` reads
 * «Кто из нас скорее съест пиццу с ананасами?» from the same seed.
 */
function frameCandidates(theme: ThemeId, game: "norm" | "who", lang: Lang): Candidate[] {
  const out: Candidate[] = [];
  const wrap = WHO_WRAP[lang];
  FRAMES[lang][theme].forEach((frame, frameIndex) => {
    const pattern = game === "norm" ? frame.norm : frame.who;
    const options = game === "norm" ? NORM_OPTIONS[lang] : WHO_OPTIONS;
    for (const a of frame.a) {
      const group = `${frameIndex}:${a}`;
      if (frame.b) {
        for (const b of frame.b) {
          const prompt = fill(pattern, a, b);
          out.push({
            prompt: game === "norm" ? prompt : wrap(prompt),
            options: [...options],
            group,
          });
        }
      } else {
        const prompt = fill(pattern, a);
        out.push({
          prompt: game === "norm" ? prompt : wrap(prompt),
          options: [...options],
          group,
        });
      }
    }
  });
  return out;
}

/** Every pair of options within every axis: `Label: a или b?`. */
function eitherCandidates(theme: ThemeId, lang: Lang): Candidate[] {
  const out: Candidate[] = [];
  for (const axis of EITHER_AXES[lang][theme]) {
    const { label, options } = axis;
    for (let i = 0; i < options.length; i += 1) {
      for (let j = i + 1; j < options.length; j += 1) {
        const prompt = lang === "en" ? `${label} ${options[i]} or ${options[j]}?` : `${label} ${options[i]} или ${options[j]}?`;
        // Each pair is its own dilemma, so it never needs de-duplicating.
        out.push({ prompt, options: [options[i], options[j]], group: prompt });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------- builder */

function candidatesFor(game: GameId, theme: ThemeId, lang: Lang): Candidate[] {
  if (game === "norm") return frameCandidates(theme, "norm", lang);
  if (game === "who") return frameCandidates(theme, "who", lang);
  return eitherCandidates(theme, lang);
}

function buildGame(game: GameId, lang: Lang): CouplesQuestion[] {
  const used = new Set<string>();
  const out: CouplesQuestion[] = [];

  for (const theme of THEME_IDS) {
    const rng = rngFor(`couples:${game}:${theme}`);
    const candidates = shuffle(candidatesFor(game, theme, lang), rng);

    let added = 0;
    for (const candidate of candidates) {
      if (added >= PER_THEME) break;
      if (used.has(candidate.prompt)) continue;
      used.add(candidate.prompt);
      out.push({
        id: `${lang}:${game}:${theme}:${added}`,
        game,
        theme,
        prompt: candidate.prompt,
        options: [...candidate.options],
        group: candidate.group,
      });
      added += 1;
    }
  }

  return out;
}

const CACHE = new Map<string, CouplesQuestion[]>();

/** All prompts for one game and language, grouped by theme and capped at 300 per theme. */
export function buildGameQuestions(game: GameId, lang: Lang = "ru"): CouplesQuestion[] {
  const key = `${lang}:${game}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const built = buildGame(game, lang);
  CACHE.set(key, built);
  return built;
}

/** Every prompt for every game in one language (9 000 in total). */
export function buildAllQuestions(lang: Lang = "ru"): CouplesQuestion[] {
  return (["norm", "either", "who"] as const).flatMap((game) => buildGameQuestions(game, lang));
}

/** Prompts for one game, optionally filtered to a single theme. */
export function questionsFor(game: GameId, theme: ThemeId | "all", lang: Lang = "ru"): CouplesQuestion[] {
  const all = buildGameQuestions(game, lang);
  return theme === "all" ? all : all.filter((question) => question.theme === theme);
}

/** Resolve the two buttons for a card, substituting the partners' names for «who». */
export function resolveOptions(
  question: CouplesQuestion,
  names: readonly [string, string],
): [string, string] {
  if (question.game === "who") return [names[0], names[1]];
  return [question.options[0], question.options[1]];
}

/** Number of prompts available for a game/theme, for the setup screen. */
export function questionCount(game: GameId, theme: ThemeId | "all", lang: Lang = "ru"): number {
  return questionsFor(game, theme, lang).length;
}
