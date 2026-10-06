import type { GameDef, GameId, ThemeDef, ThemeId } from "./types";

/**
 * The three games. Each one is the same «answer, pass the phone, reveal»
 * loop; only the framing and the options change.
 */
export const GAMES: readonly GameDef[] = [
  {
    id: "norm",
    emoji: "🤔",
    name: "Норм или стрём",
    tagline: "Оцениваем странности",
    description:
      "Ведущий зачитывает ситуацию, оба решают — это норм или уже стрём. Совпадёте или нет?",
    gradient: "linear-gradient(135deg, #0f766e 0%, #22c55e 100%)",
    accent: "#0f766e",
  },
  {
    id: "either",
    emoji: "⚖️",
    name: "ИлиТо",
    tagline: "Выбираем из двух",
    description:
      "Два варианта — один выбор. Узнайте, совпадают ли ваши вкусы, когда вариантов всего два.",
    gradient: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
    accent: "#7c3aed",
  },
  {
    id: "who",
    emoji: "👉",
    name: "Кто из нас",
    tagline: "Показываем пальцем",
    description:
      "«Кто из нас скорее…» — оба тайно выбирают, к кому это подходит больше. Посмотрим, кого вы видите одинаково.",
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
    name: "Быт и уют",
    tagline: "Дом, привычки, порядок",
    gradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
    accent: "#0f766e",
  },
  {
    id: "romance",
    emoji: "💞",
    name: "Романтика",
    tagline: "Свидания и знаки внимания",
    gradient: "linear-gradient(135deg, #be123c 0%, #fb7185 100%)",
    accent: "#be123c",
  },
  {
    id: "habits",
    emoji: "🌀",
    name: "Привычки",
    tagline: "Маленькие странности",
    gradient: "linear-gradient(135deg, #4338ca 0%, #818cf8 100%)",
    accent: "#4338ca",
  },
  {
    id: "food",
    emoji: "🍜",
    name: "Еда",
    tagline: "Что и как вы едите",
    gradient: "linear-gradient(135deg, #b45309 0%, #fbbf24 100%)",
    accent: "#b45309",
  },
  {
    id: "money",
    emoji: "💸",
    name: "Деньги",
    tagline: "Траты и накопления",
    gradient: "linear-gradient(135deg, #166534 0%, #4ade80 100%)",
    accent: "#166534",
  },
  {
    id: "travel",
    emoji: "✈️",
    name: "Путешествия",
    tagline: "Отпуск и дорога",
    gradient: "linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)",
    accent: "#0369a1",
  },
  {
    id: "friends",
    emoji: "🎉",
    name: "Друзья",
    tagline: "Гости и вечеринки",
    gradient: "linear-gradient(135deg, #9d174d 0%, #f472b6 100%)",
    accent: "#9d174d",
  },
  {
    id: "tender",
    emoji: "💋",
    name: "Нежность",
    tagline: "Близость и забота",
    gradient: "linear-gradient(135deg, #9f1239 0%, #fb7185 100%)",
    accent: "#9f1239",
  },
  {
    id: "future",
    emoji: "🔮",
    name: "Планы и мечты",
    tagline: "Куда вы идёте вместе",
    gradient: "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
    accent: "#6d28d9",
  },
  {
    id: "conflict",
    emoji: "⚡",
    name: "Споры",
    tagline: "Ссоры и примирения",
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

export const CARD_COUNTS: readonly number[] = [10, 20, 30];
export const DEFAULT_CARD_COUNT = 20;
