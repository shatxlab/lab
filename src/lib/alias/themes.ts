import type { ThemeDef, ThemeId } from "./types";

/**
 * The ten playable themes. Each card carries its own gradient so the setup
 * grid and the round screen take on the chosen deck's look.
 */
export const THEMES: readonly ThemeDef[] = [
  {
    id: "everyday",
    emoji: "🌍",
    name: { en: "Everyday life", ru: "Повседневная жизнь" },
    tagline: { en: "Things you meet every day", ru: "То, что вокруг каждый день" },
    gradient: "linear-gradient(135deg, #2b5876 0%, #4e4376 100%)",
    accent: "#4e4376",
  },
  {
    id: "food",
    emoji: "🍕",
    name: { en: "Food & drinks", ru: "Еда и напитки" },
    tagline: { en: "Taste the vocabulary", ru: "Вкусный словарный запас" },
    gradient: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)",
    accent: "#e08a13",
  },
  {
    id: "animals",
    emoji: "🦊",
    name: { en: "Animals & nature", ru: "Животные и природа" },
    tagline: { en: "Wild, tame and green", ru: "Дикие, домашние и зелёные" },
    gradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    accent: "#11998e",
  },
  {
    id: "home",
    emoji: "🏠",
    name: { en: "Home & interior", ru: "Дом и интерьер" },
    tagline: { en: "Everything under the roof", ru: "Всё, что под крышей" },
    gradient: "linear-gradient(135deg, #c79081 0%, #dfa579 100%)",
    accent: "#b3745f",
  },
  {
    id: "people",
    emoji: "🧑‍🚀",
    name: { en: "People & professions", ru: "Люди и профессии" },
    tagline: { en: "Who everybody is", ru: "Кто есть кто" },
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    accent: "#5b53c4",
  },
  {
    id: "travel",
    emoji: "✈️",
    name: { en: "Travel & city", ru: "Путешествия и город" },
    tagline: { en: "Pack your bags", ru: "Пакуйте чемоданы" },
    gradient: "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)",
    accent: "#1b7f99",
  },
  {
    id: "sport",
    emoji: "⚽",
    name: { en: "Sports & games", ru: "Спорт и игры" },
    tagline: { en: "Faster, higher, stronger", ru: "Быстрее, выше, сильнее" },
    gradient: "linear-gradient(135deg, #f85032 0%, #e73827 100%)",
    accent: "#d93a2a",
  },
  {
    id: "art",
    emoji: "🎬",
    name: { en: "Art & entertainment", ru: "Искусство и развлечения" },
    tagline: { en: "Stage, screen and sound", ru: "Сцена, экран и звук" },
    gradient: "linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)",
    accent: "#7a1fd8",
  },
  {
    id: "tech",
    emoji: "🔬",
    name: { en: "Science & technology", ru: "Наука и техника" },
    tagline: { en: "From atoms to apps", ru: "От атомов до приложений" },
    gradient: "linear-gradient(135deg, #0f2027 0%, #2c5364 100%)",
    accent: "#2c5364",
  },
  {
    id: "abstract",
    emoji: "💭",
    name: { en: "Actions & feelings", ru: "Действия и чувства" },
    tagline: { en: "Verbs and emotions", ru: "Глаголы и эмоции" },
    gradient: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
    accent: "#ee0979",
  },
] as const;

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

const THEME_BY_ID = new Map<ThemeId, ThemeDef>(THEMES.map((theme) => [theme.id, theme]));

export function getTheme(id: ThemeId): ThemeDef {
  return THEME_BY_ID.get(id) ?? THEMES[0];
}
