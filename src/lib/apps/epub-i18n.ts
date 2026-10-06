import type { AppLang } from "./lang";

/**
 * UI copy for the EPUB reader. English is the fallback for every key. Parser
 * error messages (thrown by the epub library) stay in English on purpose:
 * they describe file defects, not interface chrome.
 */

type StringKey =
  | "readerPanels"
  | "readerTools"
  | "tabContents"
  | "tabSearch"
  | "tabBookmarks"
  | "findInBook"
  | "searchChapters"
  | "typeTwoChars"
  | "resultsCount"
  | "readingSettings"
  | "themeLabel"
  | "themePaper"
  | "themeSepia"
  | "themeNight"
  | "fontSize"
  | "decreaseFontSize"
  | "increaseFontSize"
  | "lineHeight"
  | "decreaseLineHeight"
  | "increaseLineHeight"
  | "pageWidth"
  | "narrowPage"
  | "widenPage"
  | "noBookmarks"
  | "deleteBookmark"
  | "landingEyebrow"
  | "landingTitle"
  | "landingDescription"
  | "openEpub"
  | "dropNote"
  | "byAuthor"
  | "chaptersCount"
  | "bookmark"
  | "closeBook"
  | "previous"
  | "next"
  | "chapterOf"
  | "readingProgress"
  | "readingEpub"
  | "bookTooLarge"
  | "untitledEpub";

const STRINGS: Record<AppLang, Record<StringKey, string>> = {
  en: {
    readerPanels: "Reader panels",
    readerTools: "Reader tools",
    tabContents: "Contents",
    tabSearch: "Search",
    tabBookmarks: "Bookmarks",
    findInBook: "Find in book",
    searchChapters: "Search chapters",
    typeTwoChars: "Type at least two characters.",
    resultsCount: "{count} {countPlural}",
    readingSettings: "Reading settings",
    themeLabel: "Theme",
    themePaper: "Paper",
    themeSepia: "Sepia",
    themeNight: "Night",
    fontSize: "Font size",
    decreaseFontSize: "Decrease font size",
    increaseFontSize: "Increase font size",
    lineHeight: "Line height",
    decreaseLineHeight: "Decrease line height",
    increaseLineHeight: "Increase line height",
    pageWidth: "Page width",
    narrowPage: "Narrow page",
    widenPage: "Widen page",
    noBookmarks: "No bookmarks yet.",
    deleteBookmark: "Delete bookmark {label}",
    landingEyebrow: "Local EPUB reader",
    landingTitle: "Open a book and start reading immediately.",
    landingDescription:
      "Files stay in this browser session. After choosing the same book again, this reader restores your chapter, progress, bookmarks, and reading settings.",
    openEpub: "Open EPUB",
    dropNote: "Drop a .epub file here, or use the button.",
    byAuthor: "by {author} · ",
    chaptersCount: "{count} {countPlural}",
    bookmark: "Bookmark",
    closeBook: "Close book",
    previous: "Previous",
    next: "Next",
    chapterOf: "{index} of {count}",
    readingProgress: "Reading progress",
    readingEpub: "Reading EPUB…",
    bookTooLarge: "This book is larger than {limit} and cannot be opened safely",
    untitledEpub: "Untitled EPUB",
  },
  ru: {
    readerPanels: "Панели читалки",
    readerTools: "Инструменты читалки",
    tabContents: "Содержание",
    tabSearch: "Поиск",
    tabBookmarks: "Закладки",
    findInBook: "Найти в книге",
    searchChapters: "Поиск по главам",
    typeTwoChars: "Введите хотя бы два символа.",
    resultsCount: "{count} {countPlural}",
    readingSettings: "Настройки чтения",
    themeLabel: "Тема",
    themePaper: "Бумага",
    themeSepia: "Сепия",
    themeNight: "Ночь",
    fontSize: "Размер шрифта",
    decreaseFontSize: "Уменьшить шрифт",
    increaseFontSize: "Увеличить шрифт",
    lineHeight: "Межстрочный интервал",
    decreaseLineHeight: "Уменьшить интервал",
    increaseLineHeight: "Увеличить интервал",
    pageWidth: "Ширина страницы",
    narrowPage: "Уже страница",
    widenPage: "Шире страница",
    noBookmarks: "Закладок пока нет.",
    deleteBookmark: "Удалить закладку {label}",
    landingEyebrow: "Локальная EPUB-читалка",
    landingTitle: "Откройте книгу и читайте сразу.",
    landingDescription:
      "Файлы остаются в этой сессии браузера. Когда вы снова откроете ту же книгу, читалка восстановит главу, прогресс, закладки и настройки чтения.",
    openEpub: "Открыть EPUB",
    dropNote: "Перетащите файл .epub сюда или нажмите кнопку.",
    byAuthor: "автор: {author} · ",
    chaptersCount: "{count} {countPlural}",
    bookmark: "Закладка",
    closeBook: "Закрыть книгу",
    previous: "Назад",
    next: "Далее",
    chapterOf: "{index} из {count}",
    readingProgress: "Прогресс чтения",
    readingEpub: "Читаем EPUB…",
    bookTooLarge: "Книга больше {limit} — её нельзя безопасно открыть",
    untitledEpub: "EPUB без названия",
  },
};

export type EpubTranslationKey = StringKey;

/** Translate a key, interpolating `{placeholders}` from `vars`. */
export function epubT(lang: AppLang, key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Plural for search results. */
export function resultPlural(lang: AppLang, count: number): string {
  if (lang === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "совпадение";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "совпадения";
    return "совпадений";
  }
  return count === 1 ? "result" : "results";
}

/** Chapter plural shares Russian forms with "совпадение"; English is simpler. */
export function chapterPlural(lang: AppLang, count: number): string {
  if (lang === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "глава";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "главы";
    return "глав";
  }
  return count === 1 ? "chapter" : "chapters";
}

/** Locale-aware date formatting for bookmark timestamps. */
export function dateLocale(lang: AppLang): string {
  return lang === "ru" ? "ru-RU" : "en-US";
}
