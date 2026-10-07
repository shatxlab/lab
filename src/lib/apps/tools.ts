import type { AppLang } from "@/lib/apps/lang";
import { withBase } from "@/lib/apps/paths";

/**
 * The single source of truth for every tool on the site.
 *
 * The landing grid, the command palette and (later) the PWA manifest
 * shortcuts all read this list, so adding a tool means adding one entry here.
 */
export type ToolCategory = "read" | "utilities" | "games";

export type Localized = Record<AppLang, string>;

export interface ToolEntry {
  id: string;
  /** Path relative to the site base, e.g. "/reader". */
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

export const CATEGORY_ORDER: readonly ToolCategory[] = ["read", "utilities", "games"];

export const CATEGORY_TITLES: Record<ToolCategory, Localized> = {
  read: { en: "Read & view", ru: "Чтение и просмотр" },
  utilities: { en: "Utilities", ru: "Утилиты" },
  games: { en: "Games", ru: "Игры" },
};

export const TOOLS: readonly ToolEntry[] = [
  {
    id: "reader",
    path: "/reader",
    category: "read",
    files: { en: ".epub", ru: ".epub" },
    title: { en: "EPUB reader", ru: "EPUB-читалка" },
    description: {
      en: "Open an EPUB and read it right in your browser — chapter navigation, themeable UI, reading position persisted locally.",
      ru: "Открывайте EPUB и читайте прямо в браузере — навигация по главам, темы оформления, позиция чтения сохраняется локально.",
    },
    keywords: "book ebook epub read книга читалка чтение",
    seo: {
      title: "Free EPUB reader online — private",
      description:
        "Read EPUB books in your browser with search, bookmarks and reading themes. The book stays on your device.",
    },
  },
  {
    id: "viewer",
    path: "/viewer",
    category: "read",
    files: {
      en: ".pdf · .docx · .xlsx · .csv · .json · .md · .html · images",
      ru: ".pdf · .docx · .xlsx · .csv · .json · .md · .html · картинки",
    },
    title: { en: "Document viewer", ru: "Просмотр документов" },
    description: {
      en: "PDF, Word, spreadsheets, JSON, Markdown, HTML, images and text, rendered locally. Edit and export sheets, compare two files, print to PDF.",
      ru: "PDF, Word, таблицы, JSON, Markdown, HTML, картинки и текст — локально. Правка и экспорт таблиц, сравнение двух файлов, печать в PDF.",
    },
    keywords: "document viewer pdf word docx excel xlsx csv json markdown html image diff compare документ просмотр таблица",
    seo: {
      title: "PDF, Word, Excel & Markdown viewer",
      description:
        "Open, convert and compare PDF, DOCX, XLSX, CSV, JSON, Markdown, HTML and images right in your browser. Export and print to PDF, all on your device.",
    },
  },
  {
    id: "pdf",
    path: "/pdf",
    category: "utilities",
    files: { en: ".pdf", ru: ".pdf" },
    title: { en: "PDF tools", ru: "Инструменты PDF" },
    description: {
      en: "Merge several PDFs, split one into parts, reorder, rotate or delete pages — all on your device.",
      ru: "Склейка PDF, разделение на части, перестановка, поворот и удаление страниц — всё на вашем устройстве.",
    },
    keywords: "pdf merge split reorder rotate pages join склеить разделить страницы",
    seo: {
      title: "Merge, split & reorder PDF files",
      description:
        "Combine PDFs, split them into parts, and reorder, rotate or delete pages — free, in your browser, with no sign-up.",
    },
  },
  {
    id: "image",
    path: "/image",
    category: "utilities",
    files: { en: "png · jpg · webp", ru: "png · jpg · webp" },
    title: { en: "Image tools", ru: "Инструменты для картинок" },
    description: {
      en: "Convert, resize and compress images, and strip EXIF metadata such as GPS location.",
      ru: "Конвертация, изменение размера и сжатие картинок, удаление EXIF-метаданных, например GPS.",
    },
    keywords: "image photo convert resize compress exif jpeg png webp картинка фото сжать размер",
    seo: {
      title: "Compress, resize & convert images",
      description:
        "Convert, resize and compress images in your browser, and strip EXIF and GPS metadata before you share. Your photos stay on your device.",
    },
  },
  {
    id: "qr",
    path: "/qr",
    category: "utilities",
    files: { en: "QR · camera · image", ru: "QR · камера · картинка" },
    title: { en: "QR code", ru: "QR-код" },
    description: {
      en: "Generate QR codes for text, links and Wi-Fi, and scan them with the camera or from an image.",
      ru: "Создавайте QR-коды для текста, ссылок и Wi-Fi и сканируйте их камерой или с картинки.",
    },
    keywords: "qr code scanner generator barcode wifi камера сканер код",
    seo: {
      title: "QR code generator & scanner",
      description:
        "Create QR codes for links, Wi-Fi, contacts and more, and scan them with your camera or from an image. Free, private, works offline.",
    },
  },
  {
    id: "text",
    path: "/text",
    category: "utilities",
    files: { en: "diff · count · case · regex", ru: "diff · счётчик · регистр · regex" },
    title: { en: "Text tools", ru: "Текстовые инструменты" },
    description: {
      en: "Compare two texts, count words and characters, change letter case and test regular expressions.",
      ru: "Сравнение двух текстов, подсчёт слов и символов, смена регистра и проверка регулярных выражений.",
    },
    keywords: "text diff compare word count characters case upper lower regex regexp текст сравнить подсчёт регистр",
    seo: {
      title: "Text diff, word counter & regex tester",
      description:
        "Compare two texts, count words and characters, change letter case and test regular expressions — instantly, in your browser.",
    },
  },
  {
    id: "convert",
    path: "/convert",
    category: "utilities",
    files: { en: "JSON · YAML · TOML · Base64 · hash · UUID", ru: "JSON · YAML · TOML · Base64 · хеш · UUID" },
    title: { en: "Data converter", ru: "Конвертер данных" },
    description: {
      en: "Convert between JSON, YAML and TOML; encode Base64 and URLs; compute SHA hashes; generate UUIDs.",
      ru: "Конвертация JSON, YAML и TOML; кодирование Base64 и URL; хеши SHA; генерация UUID.",
    },
    keywords: "json yaml toml base64 url encode decode hash sha md5 uuid guid convert кодировать хеш конвертер",
    seo: {
      title: "JSON, YAML, TOML, Base64 & hash tools",
      description:
        "Convert JSON, YAML and TOML, encode Base64 and URLs, compute SHA and MD5 hashes and generate UUIDs. Runs locally; your data stays with you.",
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
