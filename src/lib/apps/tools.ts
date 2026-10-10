import type { AppLang } from "@/lib/apps/lang";
import { withBase } from "@/lib/apps/paths";

/**
 * The single source of truth for every tool on the site.
 *
 * The landing grid, the command palette and (later) the PWA manifest
 * shortcuts all read this list, so adding a tool means adding one entry here.
 */
export type ToolCategory = "files" | "games";

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

export const CATEGORY_ORDER: readonly ToolCategory[] = ["files", "games"];

export const CATEGORY_TITLES: Record<ToolCategory, Localized> = {
  files: { en: "Files", ru: "Файлы" },
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
    id: "wordle",
    path: "/wordle",
    category: "games",
    files: { en: "English · Русский · ~1000 words each", ru: "English · Русский · около 1000 слов" },
    title: { en: "Wordle", ru: "Вордли" },
    description: {
      en: "Guess the hidden five-letter word in six tries, in English or Russian. Hard mode, high-contrast colours and saved statistics.",
      ru: "Угадайте слово из пяти букв за шесть попыток — на русском или английском. Сложный режим, контрастные цвета и сохранённая статистика.",
    },
    keywords: "wordle word guess puzzle five letter вордли слова угадай слово головоломка",
    seo: {
      title: "Wordle in English & Russian",
      description:
        "Guess the hidden five-letter word in six tries — in English or Russian, with hard mode, colour-blind colours and statistics. Free and offline.",
    },
  },
  {
    id: "couples",
    path: "/couples",
    category: "games",
    files: {
      en: "English · Русский · 3 games · 18 000 questions",
      ru: "Русский · English · 3 игры · 18 000 вопросов",
    },
    title: { en: "Games for couples", ru: "Игры для пар" },
    description: {
      en: "Fine or Cringe, This or That and Who of Us for two: answer in turns and see how much you match.",
      ru: "Норм или стрём, ИлиТо и Кто из нас для двоих: отвечайте по очереди и смотрите, насколько вы совпадаете.",
    },
    keywords: "couples pairs two players this or that fine or cringe who of us пары двоих илито норм стрём",
    seo: {
      title: "Games for couples: This or That & more",
      description:
        "Fine or Cringe, This or That and Who of Us for two: 18,000 questions, secret voting and an agreement score. In English and Russian.",
    },
  },
];

export function toolHref(tool: ToolEntry): string {
  return withBase(tool.path);
}

export function toolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOLS.filter((tool) => tool.category === category);
}
