import type { GameDef, GameId, Lang, ThemeDef, ThemeId } from "./types";

/**
 * The three games. Each one is the same «answer, pass the phone, reveal»
 * loop; only the framing and the options change.
 */
export const GAMES: readonly GameDef[] = [
  {
    id: "norm",
    emoji: "🤔",
    name: { ru: "Норм или стрём", en: "Fine or Cringe" },
    tagline: { ru: "Оцениваем странности", en: "Rating each other's quirks" },
    description: {
      ru: "Ведущий зачитывает ситуацию, оба решают — это норм или уже стрём. Совпадёте или нет?",
      en: "One of you reads a situation out loud and both decide — fine or cringe. Will your verdicts match?",
    },
    gradient: "linear-gradient(135deg, #0f766e 0%, #22c55e 100%)",
    accent: "#0f766e",
  },
  {
    id: "either",
    emoji: "⚖️",
    name: { ru: "ИлиТо", en: "This or That" },
    tagline: { ru: "Выбираем из двух", en: "Choosing one of two" },
    description: {
      ru: "Два варианта — один выбор. Узнайте, совпадают ли ваши вкусы, когда вариантов всего два.",
      en: "Two options, one choice. Find out whether your tastes match when there is no middle ground.",
    },
    gradient: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
    accent: "#7c3aed",
  },
  {
    id: "who",
    emoji: "👉",
    name: { ru: "Кто из нас", en: "Who of Us" },
    tagline: { ru: "Показываем пальцем", en: "Pointing fingers" },
    description: {
      ru: "«Кто из нас скорее…» — оба тайно выбирают, к кому это подходит больше. Посмотрим, кого вы видите одинаково.",
      en: "“Which of us would rather…” — both secretly pick who it fits best. See whether you see each other the same way.",
    },
    gradient: "linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)",
    accent: "#ea580c",
  },
] as const;

const GAME_BY_ID = new Map<GameId, GameDef>(GAMES.map((game) => [game.id, game]));

export function getGame(id: GameId): GameDef {
  return GAME_BY_ID.get(id) ?? GAMES[0];
}

/**
 * Ten couples-flavoured themes. Every game seeds 300 prompts per theme, so the
 * picker and a mixed «все темы» deck both stay varied.
 */
export const THEMES: readonly ThemeDef[] = [
  {
    id: "home",
    emoji: "🏠",
    name: { ru: "Быт и уют", en: "Home & Cozy" },
    tagline: { ru: "Дом, привычки, порядок", en: "Home, habits, order" },
    gradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
    accent: "#0f766e",
  },
  {
    id: "romance",
    emoji: "💞",
    name: { ru: "Романтика", en: "Romance" },
    tagline: { ru: "Свидания и знаки внимания", en: "Dates and little gestures" },
    gradient: "linear-gradient(135deg, #be123c 0%, #fb7185 100%)",
    accent: "#be123c",
  },
  {
    id: "habits",
    emoji: "🌀",
    name: { ru: "Привычки", en: "Habits" },
    tagline: { ru: "Маленькие странности", en: "Little oddities" },
    gradient: "linear-gradient(135deg, #4338ca 0%, #818cf8 100%)",
    accent: "#4338ca",
  },
  {
    id: "food",
    emoji: "🍜",
    name: { ru: "Еда", en: "Food" },
    tagline: { ru: "Что и как вы едите", en: "What and how you eat" },
    gradient: "linear-gradient(135deg, #b45309 0%, #fbbf24 100%)",
    accent: "#b45309",
  },
  {
    id: "money",
    emoji: "💸",
    name: { ru: "Деньги", en: "Money" },
    tagline: { ru: "Траты и накопления", en: "Spending and saving" },
    gradient: "linear-gradient(135deg, #166534 0%, #4ade80 100%)",
    accent: "#166534",
  },
  {
    id: "travel",
    emoji: "✈️",
    name: { ru: "Путешествия", en: "Travel" },
    tagline: { ru: "Отпуск и дорога", en: "Vacations and the road" },
    gradient: "linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)",
    accent: "#0369a1",
  },
  {
    id: "friends",
    emoji: "🎉",
    name: { ru: "Друзья", en: "Friends" },
    tagline: { ru: "Гости и вечеринки", en: "Guests and parties" },
    gradient: "linear-gradient(135deg, #9d174d 0%, #f472b6 100%)",
    accent: "#9d174d",
  },
  {
    id: "tender",
    emoji: "💋",
    name: { ru: "Нежность", en: "Tenderness" },
    tagline: { ru: "Близость и забота", en: "Closeness and care" },
    gradient: "linear-gradient(135deg, #9f1239 0%, #fb7185 100%)",
    accent: "#9f1239",
  },
  {
    id: "future",
    emoji: "🔮",
    name: { ru: "Планы и мечты", en: "Plans & Dreams" },
    tagline: { ru: "Куда вы идёте вместе", en: "Where you are heading together" },
    gradient: "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
    accent: "#6d28d9",
  },
  {
    id: "conflict",
    emoji: "⚡",
    name: { ru: "Споры", en: "Arguments" },
    tagline: { ru: "Ссоры и примирения", en: "Quarrels and making up" },
    gradient: "linear-gradient(135deg, #b91c1c 0%, #f87171 100%)",
    accent: "#b91c1c",
  },
] as const;

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

const THEME_BY_ID = new Map<ThemeId, ThemeDef>(THEMES.map((theme) => [theme.id, theme]));

export function getTheme(id: ThemeId): ThemeDef {
  return THEME_BY_ID.get(id) ?? THEMES[0];
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ru";
}

export const CARD_COUNTS: readonly number[] = [10, 20, 30];
export const DEFAULT_CARD_COUNT = 20;
