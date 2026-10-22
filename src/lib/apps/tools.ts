import type { AppLang } from "@/lib/apps/lang";
import { withBase } from "@/lib/apps/paths";

/**
 * The single source of truth for every tool on the site.
 *
 * The landing grid, the command palette and (later) the PWA manifest
 * shortcuts all read this list, so adding a tool means adding one entry here.
 */
export type ToolCategory = "files" | "productivity" | "games";

export type Localized = Record<AppLang, string>;

export interface ToolEntry {
  id: string;
  /** Path relative to the site base, e.g. "/tools". */
  path: string;
  category: ToolCategory;
  title: Localized;
  /** Short line shown under the title on the landing grid. */
  description: Localized;
  /** What it opens / which languages — the small caption on the card. */
  files: Localized;
  /** Extra words the command palette matches on (both languages). */
  keywords: string;
  /** What search results and link previews show (English; the brand is appended to the title). */
  seo: { title: string; description: string };
}

export const CATEGORY_ORDER: readonly ToolCategory[] = ["files", "productivity", "games"];

export const CATEGORY_TITLES: Record<ToolCategory, Localized> = {
  files: { en: "Files", ru: "Файлы" },
  productivity: { en: "Study & focus", ru: "Учёба и фокус" },
  games: { en: "Games", ru: "Игры" },
};

export const TOOLS: readonly ToolEntry[] = [
  {
    id: "tools",
    path: "/tools",
    category: "files",
    files: {
      en: ".pdf · .docx · .xlsx · .epub · .json · .md · images · QR",
      ru: ".pdf · .docx · .xlsx · .epub · .json · .md · картинки · QR",
    },
    title: { en: "Workbench", ru: "Рабочая область" },
    description: {
      en: "One page for every file: open and edit documents, read EPUBs, merge, split and sign PDFs, convert images, compare files and make QR codes.",
      ru: "Одна страница для любых файлов: просмотр и правка документов, чтение EPUB, склейка, разделение и подпись PDF, конвертация картинок, сравнение файлов и QR-коды.",
    },
    keywords:
      "workbench tools file document viewer editor pdf merge split sign word docx excel xlsx csv json yaml toml markdown html epub ebook book reader image photo convert resize compress exif qr code generator text diff compare инструменты файл документ просмотр правка склеить разделить подписать книга читалка картинка сжать конвертировать сравнить",
    seo: {
      title: "PDF, Word, Excel, EPUB & image tools",
      description:
        "View PDF, Word, Excel and images, read EPUBs, merge, split and sign PDFs, convert data and make QR codes — free, private, in your browser.",
    },
  },
  {
    id: "focus",
    path: "/focus",
    category: "productivity",
    files: { en: "Pomodoro timer · a tiny office · lo-fi music · works offline", ru: "Таймер Помодоро · маленький офис · лоуфай · работает офлайн" },
    title: { en: "Focus office", ru: "Офис фокуса" },
    description: {
      en: "A Pomodoro timer with stakes and lo-fi to work to: open a small pixel office, press Start and follow the 25/5/15 flow; give a Pomodoro up and someone packs their box.",
      ru: "Таймер Помодоро со ставкой и лоуфай для работы: откройте маленький пиксельный офис, нажмите «Старт» и держите поток 25/5/15; бросите помодоро — кто-то соберёт коробку.",
    },
    keywords: "focus pomodoro timer office productivity work deep work study pixel помодоро таймер фокус офис продуктивность работа учёба",
    seo: {
      title: "Pomodoro timer with a tiny office",
      description:
        "A Pomodoro focus timer with lo-fi music where every Pomodoro you give up costs a pixel office worker their job. Opens ready to go — free, private and offline.",
    },
  },
  {
    id: "board",
    path: "/board",
    category: "productivity",
    files: { en: "Rectangles · arrows · text · PNG export", ru: "Прямоугольники · стрелки · текст · экспорт PNG" },
    title: { en: "Whiteboard", ru: "Доска" },
    description: {
      en: "A small whiteboard for quick sketches: rectangles, arrows and text, with undo and a PNG download.",
      ru: "Небольшая доска для быстрых набросков: прямоугольники, стрелки и текст, отмена и скачивание PNG.",
    },
    keywords: "whiteboard draw sketch diagram boxes arrows notes доска рисовать набросок схема стрелки заметки",
    seo: {
      title: "Online whiteboard and sketchpad",
      description: "A free, private whiteboard in your browser: draw rectangles, arrows and text, and download a PNG. Works offline.",
    },
  },
  {
    id: "alias",
    path: "/alias",
    category: "games",
    files: { en: "English · Русский · 10 themes", ru: "English · Русский · 10 тем" },
    title: { en: "Alias word game", ru: "Алиас" },
    description: {
      en: "The party word-guessing game: one player explains, the team guesses. Ten themed decks with 1000+ words each and sound feedback.",
      ru: "Компания угадывает слова: один объясняет, команда угадывает. Десять тематических колод по 1000+ слов со звуковыми подсказками.",
    },
    keywords: "alias party word game team guess алиас игра слова компания",
    seo: {
      title: "Alias — the party word-guessing game",
      description:
        "Play Alias with friends: explain words, the team guesses. Ten themed decks with over 1000 words each, in English and Russian. Free and offline.",
    },
  },
  {
    id: "crossword",
    path: "/crossword",
    category: "games",
    files: { en: "English · Русский · 100 crosswords", ru: "Русский · English · 100 кроссвордов" },
    title: { en: "Crossword", ru: "Кроссворд" },
    description: {
      en: "Bilingual crosswords with a phone-friendly grid, hints, mistake checking and saved progress.",
      ru: "Кроссворды на русском и английском: крупная сетка, подсказки, проверка ошибок и сохранение прогресса.",
    },
    keywords: "crossword puzzle clues кроссворд головоломка",
    seo: {
      title: "Free crosswords in English & Russian",
      description:
        "Solve 100 crosswords with a phone-friendly grid, hints, mistake checking and saved progress. English and Russian, free and offline.",
    },
  },
  {
    id: "couples",
    path: "/couples",
    category: "games",
    files: {
      en: "English · Русский · 3 games · thousands of questions",
      ru: "Русский · English · 3 игры · тысячи вопросов",
    },
    title: { en: "Games for couples", ru: "Игры для пар" },
    description: {
      en: "Normal or Nah, This or That and Who of Us for two: answer in turns and see how much you match.",
      ru: "Норм или стрём, ИлиТо и Кто из нас для двоих: отвечайте по очереди и смотрите, насколько вы совпадаете.",
    },
    keywords: "couples pairs two players this or that normal or nah who of us пары двоих илито норм стрём",
    seo: {
      title: "Games for couples: This or That & more",
      description:
        "Normal or Nah, This or That and Who of Us for two: thousands of questions, secret voting and an agreement score. In English and Russian.",
    },
  },
  {
    id: "tycoon",
    path: "/tycoon",
    category: "games",
    files: {
      en: "single-player · autosaves locally",
      ru: "одиночная · автосохранение локально",
    },
    title: { en: "Software Tycoon", ru: "Империя софта" },
    description: {
      en: "Run a small software studio: hire a team, pick a product and its features, ship it, and grow from a garage to a company.",
      ru: "Управляйте небольшой студией: нанимайте команду, выбирайте продукт и его возможности, выпускайте и растите от гаража до компании.",
    },
    keywords:
      "tycoon management sim game software studio developer gamedev hire team ship products offices rivals career игра симулятор студия разработка менеджмент тайкун",
    seo: {
      title: "Software Tycoon — run a software studio",
      description:
        "Hire a team, build products, ship, and grow a studio — a free management sim that runs and saves entirely in your browser.",
    },
  },
  {
    id: "tower",
    path: "/tower",
    category: "games",
    files: {
      en: "single-player · made for phones · saves locally",
      ru: "одиночная · для телефона · сохраняется локально",
    },
    title: { en: "Lone Tower", ru: "Одинокая башня" },
    description: {
      en: "Hold a lone archer tower against waves from every side: tap to rain volleys, pick an upgrade after each wave, and buy perks with the gold.",
      ru: "Удержите одинокую башню лучника от волн врагов со всех сторон: обрушивайте залпы касанием, выбирайте улучшение после каждой волны и покупайте бонусы за золото.",
    },
    keywords:
      "tower defense archer arrows waves roguelike upgrades casual arcade башня лучник стрелы волны защита улучшения аркада",
    seo: {
      title: "Lone Tower — a casual archer tower defense",
      description:
        "Defend a lone archer tower against endless waves: rain volleys of arrows, pick upgrades, beat your best wave. Free, offline, made for phones.",
    },
  },
];

export function toolHref(tool: ToolEntry): string {
  return withBase(tool.path);
}

export function toolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOLS.filter((tool) => tool.category === category);
}
