import type { EpubBook } from "@/lib/apps/epub-reader";

export type ReaderTheme = "paper" | "sepia" | "night";

export interface ReaderPrefs {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
}

export interface ReaderBookmark {
  id: string;
  chapterHref: string;
  chapterTitle: string;
  progress: number;
  label: string;
  createdAt: number;
}

export interface ReaderProgress {
  chapterHref: string;
  chapterProgress: number;
  updatedAt: number;
}

export interface ReaderBookState {
  progress?: ReaderProgress;
  bookmarks: ReaderBookmark[];
}

export interface ReaderStoredState {
  prefs: ReaderPrefs;
  books: Record<string, ReaderBookState>;
}

export interface ChapterSearchResult {
  chapterIndex: number;
  chapterHref: string;
  chapterTitle: string;
  snippet: string;
  matchIndex: number;
}

export const EPUB_READER_STORAGE_KEY = "epub-reader:state:v1";
const SEARCH_RESULT_LIMIT = 50;
const SNIPPET_RADIUS = 54;

const THEMES = new Set<ReaderTheme>(["paper", "sepia", "night"]);

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storageOrUndefined(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function defaultReaderPrefs(): ReaderPrefs {
  return {
    theme: "paper",
    fontSize: 18,
    lineHeight: 1.65,
    maxWidth: 74,
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampReaderPrefs(prefs: Partial<ReaderPrefs> | null | undefined): ReaderPrefs {
  const defaults = defaultReaderPrefs();
  const theme = prefs?.theme && THEMES.has(prefs.theme) ? prefs.theme : defaults.theme;
  return {
    theme,
    fontSize: Math.round(clamp(finiteNumber(prefs?.fontSize, defaults.fontSize), 16, 24)),
    lineHeight: Math.round(clamp(finiteNumber(prefs?.lineHeight, defaults.lineHeight), 1.35, 2) * 100) / 100,
    maxWidth: Math.round(clamp(finiteNumber(prefs?.maxWidth, defaults.maxWidth), 58, 92)),
  };
}

function safeProgress(value: unknown): ReaderProgress | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as { chapterHref?: unknown; chapterProgress?: unknown; updatedAt?: unknown };
  if (typeof raw.chapterHref !== "string" || !raw.chapterHref) return undefined;
  return {
    chapterHref: raw.chapterHref,
    chapterProgress: clamp(finiteNumber(raw.chapterProgress, 0), 0, 1),
    updatedAt: finiteNumber(raw.updatedAt, Date.now()),
  };
}

function safeBookmark(value: unknown): ReaderBookmark | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as {
    id?: unknown;
    chapterHref?: unknown;
    chapterTitle?: unknown;
    progress?: unknown;
    label?: unknown;
    createdAt?: unknown;
  };
  if (
    typeof raw.id !== "string" ||
    typeof raw.chapterHref !== "string" ||
    typeof raw.chapterTitle !== "string" ||
    typeof raw.label !== "string"
  ) {
    return undefined;
  }
  return {
    id: raw.id,
    chapterHref: raw.chapterHref,
    chapterTitle: raw.chapterTitle,
    progress: clamp(finiteNumber(raw.progress, 0), 0, 1),
    label: raw.label.slice(0, 120),
    createdAt: finiteNumber(raw.createdAt, Date.now()),
  };
}

function safeBookState(value: unknown): ReaderBookState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { bookmarks: [] };
  const raw = value as { progress?: unknown; bookmarks?: unknown };
  return {
    ...(safeProgress(raw.progress) ? { progress: safeProgress(raw.progress) } : {}),
    bookmarks: Array.isArray(raw.bookmarks)
      ? raw.bookmarks.map(safeBookmark).filter((item): item is ReaderBookmark => Boolean(item)).slice(0, 100)
      : [],
  };
}

function parseNewShape(parsed: Record<string, unknown>): ReaderStoredState | null {
  if (!("prefs" in parsed) && !("books" in parsed)) return null;
  const books: ReaderStoredState["books"] = {};
  const rawBooks = parsed.books;
  if (rawBooks && typeof rawBooks === "object" && !Array.isArray(rawBooks)) {
    for (const [identity, value] of Object.entries(rawBooks)) {
      books[identity] = safeBookState(value);
    }
  }
  return {
    prefs: clampReaderPrefs(parsed.prefs as Partial<ReaderPrefs> | undefined),
    books,
  };
}

function parseLegacyShape(parsed: Record<string, unknown>): ReaderStoredState {
  const books: ReaderStoredState["books"] = {};
  for (const [identity, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const chapterHref = (value as { chapterHref?: unknown }).chapterHref;
    if (typeof chapterHref !== "string" || !chapterHref) continue;
    books[identity] = {
      progress: { chapterHref, chapterProgress: 0, updatedAt: 0 },
      bookmarks: [],
    };
  }
  return { prefs: defaultReaderPrefs(), books };
}

export function readReaderState(storage = storageOrUndefined()): ReaderStoredState {
  if (!storage) return { prefs: defaultReaderPrefs(), books: {} };
  try {
    const raw = storage.getItem(EPUB_READER_STORAGE_KEY);
    if (!raw) return { prefs: defaultReaderPrefs(), books: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { prefs: defaultReaderPrefs(), books: {} };
    }
    return parseNewShape(parsed as Record<string, unknown>) ?? parseLegacyShape(parsed as Record<string, unknown>);
  } catch {
    return { prefs: defaultReaderPrefs(), books: {} };
  }
}

export function writeReaderState(state: ReaderStoredState, storage = storageOrUndefined()): void {
  if (!storage) return;
  const normalized: ReaderStoredState = {
    prefs: clampReaderPrefs(state.prefs),
    books: {},
  };
  for (const [identity, book] of Object.entries(state.books)) {
    normalized.books[identity] = safeBookState(book);
  }
  storage.setItem(EPUB_READER_STORAGE_KEY, JSON.stringify(normalized));
}

export function progressForBook(state: ReaderStoredState, identity: string): ReaderProgress | undefined {
  return state.books[identity]?.progress;
}

export function bookmarksForBook(state: ReaderStoredState, identity: string): ReaderBookmark[] {
  return state.books[identity]?.bookmarks ?? [];
}

export function upsertProgress(
  state: ReaderStoredState,
  identity: string,
  progress: ReaderProgress,
): ReaderStoredState {
  return {
    prefs: clampReaderPrefs(state.prefs),
    books: {
      ...state.books,
      [identity]: {
        bookmarks: state.books[identity]?.bookmarks ?? [],
        progress: safeProgress(progress) ?? progress,
      },
    },
  };
}

export function addBookmark(
  state: ReaderStoredState,
  identity: string,
  bookmark: ReaderBookmark,
): ReaderStoredState {
  const current = state.books[identity] ?? { bookmarks: [] };
  const safe = safeBookmark(bookmark);
  if (!safe) return state;
  return {
    prefs: clampReaderPrefs(state.prefs),
    books: {
      ...state.books,
      [identity]: {
        ...current,
        bookmarks: [safe, ...current.bookmarks.filter((item) => item.id !== safe.id)].slice(0, 100),
      },
    },
  };
}

export function removeBookmark(
  state: ReaderStoredState,
  identity: string,
  bookmarkId: string,
): ReaderStoredState {
  const current = state.books[identity] ?? { bookmarks: [] };
  return {
    prefs: clampReaderPrefs(state.prefs),
    books: {
      ...state.books,
      [identity]: {
        ...current,
        bookmarks: current.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
      },
    },
  };
}

export function chapterPlainText(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function snippetFor(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function searchChapters(book: EpubBook, query: string): ChapterSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  const results: ChapterSearchResult[] = [];
  for (const [chapterIndex, chapter] of book.chapters.entries()) {
    const text = chapterPlainText(chapter.html);
    const haystack = text.toLocaleLowerCase();
    let from = 0;
    while (results.length < SEARCH_RESULT_LIMIT) {
      const matchIndex = haystack.indexOf(needle, from);
      if (matchIndex < 0) break;
      results.push({
        chapterIndex,
        chapterHref: chapter.href,
        chapterTitle: chapter.title,
        matchIndex,
        snippet: snippetFor(text, matchIndex, needle.length),
      });
      from = matchIndex + Math.max(needle.length, 1);
    }
    if (results.length >= SEARCH_RESULT_LIMIT) break;
  }
  return results;
}
