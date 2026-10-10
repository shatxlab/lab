import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Library,
  PanelLeft,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import {
  chapterPlural,
  dateLocale,
  epubT as t,
  resultPlural,
} from "@/lib/apps/epub-i18n";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import { parseEpubBytes, type EpubBook } from "@/lib/apps/epub-reader";
import {
  addBookmark,
  bookmarksForBook,
  clampReaderPrefs,
  defaultReaderPrefs,
  progressForBook,
  readReaderState,
  removeBookmark,
  searchChapters,
  upsertProgress,
  writeReaderState,
  type ReaderBookmark,
  type ReaderPrefs,
  type ReaderStoredState,
  type ReaderTheme,
} from "@/lib/apps/epub-reader-state";
import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";
import type { Asset } from "@/lib/workbench/asset";

type LoadedBook = EpubBook & {
  fileName: string;
  identity: string;
};

type ReaderPanel = "contents" | "search" | "prefs" | "bookmarks";

/** Keyed like the old standalone reader, so remembered progress still matches. */
function bookIdentity(asset: Asset): string {
  return `epub:${asset.name}:${asset.size}:${asset.source.lastModified ?? 0}`;
}

function displayTitle(lang: "en" | "ru", book: LoadedBook): string {
  const parsed = book.title.trim();
  if (parsed) return parsed;
  return book.fileName.replace(/\.epub$/i, "") || t(lang, "untitledEpub");
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function chapterProgress(article: HTMLElement | null): number {
  if (!article || typeof window === "undefined") return 0;
  const rect = article.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const viewport = window.innerHeight || document.documentElement.clientHeight || 1;
  const readable = Math.max(1, rect.height - viewport * 0.55);
  const passed = Math.max(0, -rect.top + viewport * 0.15);
  return Math.max(0, Math.min(1, passed / readable));
}

function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollToProgress(article: HTMLElement | null, progress: number): void {
  if (!article || typeof window === "undefined") return;
  const behavior = scrollBehavior();
  const rect = article.getBoundingClientRect();
  if (rect.height <= 0) {
    article.scrollIntoView?.({ block: "start", behavior });
    return;
  }
  try {
    const top = rect.top + window.scrollY;
    const target = top + Math.max(0, rect.height - window.innerHeight * 0.7) * Math.max(0, Math.min(1, progress));
    window.scrollTo({ top: target, behavior });
  } catch {
    article.scrollIntoView?.({ block: "start", behavior });
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function highlightSanitizedHtml(sanitizedHtml: string, query: string): string {
  const needle = query.trim();
  if (needle.length < 2 || typeof DOMParser === "undefined") return sanitizedHtml;
  const doc = new DOMParser().parseFromString(sanitizedHtml, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const lowerNeedle = needle.toLocaleLowerCase();
  for (const textNode of nodes) {
    const value = textNode.nodeValue ?? "";
    const lowerValue = value.toLocaleLowerCase();
    if (!lowerValue.includes(lowerNeedle)) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    while (cursor < value.length) {
      const index = lowerValue.indexOf(lowerNeedle, cursor);
      if (index < 0) {
        fragment.append(doc.createTextNode(value.slice(cursor)));
        break;
      }
      if (index > cursor) fragment.append(doc.createTextNode(value.slice(cursor, index)));
      const mark = doc.createElement("mark");
      mark.className = "epub-reader-search-hit";
      mark.textContent = value.slice(index, index + needle.length);
      fragment.append(mark);
      cursor = index + needle.length;
    }
    textNode.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}

function themeLabel(lang: "en" | "ru", theme: ReaderTheme): string {
  if (theme === "sepia") return t(lang, "themeSepia");
  if (theme === "night") return t(lang, "themeNight");
  return t(lang, "themePaper");
}

const FALLBACK_TITLE = "Untitled EPUB";

/**
 * The EPUB reader, mounted by the workbench's `book.read` operation for the
 * open `.epub` asset. Opening, replacing and closing the file belong to the
 * workbench; this component only reads.
 */
export default function EpubReader({ asset }: { asset: Asset }) {
  const lang = useAppLang();
  const readyRef = useLangReady<HTMLDivElement>();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [book, setBook] = useState<LoadedBook | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapterProgressValue, setChapterProgressValue] = useState(0);
  const [storedState, setStoredState] = useState<ReaderStoredState>(() => readReaderState());
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => defaultReaderPrefs());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ReaderPanel>("contents");
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia("(min-width: 900px)").matches,
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const state = readReaderState();
    setStoredState(state);
    setPrefs(state.prefs);
  }, []);

  const currentChapter = book?.chapters[currentChapterIndex] ?? null;
  const bookmarks = useMemo(
    () => (book ? bookmarksForBook(storedState, book.identity) : []),
    [book, storedState],
  );
  const searchResults = useMemo(
    () => (book ? searchChapters(book, searchQuery) : []),
    [book, searchQuery],
  );
  const sanitizedHtml = useMemo(() => {
    if (!currentChapter) return "";
    const safeHtml = sanitizeDocumentHtml(currentChapter.html);
    return highlightSanitizedHtml(safeHtml, searchQuery);
  }, [currentChapter, searchQuery]);

  const readerVars = useMemo(
    () =>
      ({
        "--epub-font-size": `${prefs.fontSize}px`,
        "--epub-line-height": String(prefs.lineHeight),
        "--epub-max-width": `${prefs.maxWidth}ch`,
      }) as CSSProperties,
    [prefs],
  );

  const persistState = useCallback((next: ReaderStoredState) => {
    setStoredState(next);
    setPrefs(next.prefs);
    writeReaderState(next);
  }, []);

  const persistProgress = useCallback(
    (chapterIndex: number, progress: number) => {
      if (!book) return;
      const chapter = book.chapters[chapterIndex];
      if (!chapter) return;
      const next = upsertProgress(storedState, book.identity, {
        chapterHref: chapter.href,
        chapterProgress: Math.max(0, Math.min(1, progress)),
        updatedAt: Date.now(),
      });
      persistState(next);
    },
    [book, persistState, storedState],
  );

  const focusReader = useCallback((progress = 0) => {
    const run = () => {
      articleRef.current?.focus?.({ preventScroll: true });
      scrollToProgress(articleRef.current, progress);
    };
    window.setTimeout(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    }, 0);
  }, []);

  const selectChapter = useCallback(
    (nextIndex: number, progress = 0) => {
      if (!book) return;
      const bounded = Math.max(0, Math.min(nextIndex, book.chapters.length - 1));
      setCurrentChapterIndex(bounded);
      setChapterProgressValue(progress);
      persistProgress(bounded, progress);
      focusReader(progress);
    },
    [book, focusReader, persistProgress],
  );

  const openAsset = useCallback(
    async (picked: Asset, isCancelled: () => boolean) => {
      // Size is checked before the whole file is read into memory.
      if (picked.size > MAX_FILE_BYTES) {
        setError(t(lang, "bookTooLarge", { limit: formatBytesLimit(MAX_FILE_BYTES) }));
        return;
      }
      setError(null);
      setBusy(t(lang, "readingEpub"));
      try {
        const bytes = await picked.bytes();
        if (isCancelled()) return;
        const parsed = parseEpubBytes(bytes);
        const identity = bookIdentity(picked);
        const loaded: LoadedBook = {
          ...parsed,
          fileName: picked.name,
          identity,
        };
        const state = readReaderState();
        writeReaderState(state);
        const remembered = progressForBook(state, identity);
        const rememberedIndex = remembered
          ? loaded.chapters.findIndex((chapter) => chapter.href === remembered.chapterHref)
          : -1;
        const nextIndex = rememberedIndex >= 0 ? rememberedIndex : 0;
        const nextProgress = rememberedIndex >= 0 ? (remembered?.chapterProgress ?? 0) : 0;
        setStoredState(state);
        setPrefs(state.prefs);
        setBook(loaded);
        setCurrentChapterIndex(nextIndex);
        setChapterProgressValue(nextProgress);
        setActivePanel("contents");
        setSidebarOpen(
          typeof window === "undefined" || typeof window.matchMedia !== "function"
            ? true
            : window.matchMedia("(min-width: 900px)").matches,
        );
        setSearchQuery("");
        window.setTimeout(() => {
          persistState(
            upsertProgress(state, identity, {
              chapterHref: loaded.chapters[nextIndex]?.href ?? loaded.chapters[0]!.href,
              chapterProgress: nextProgress,
              updatedAt: Date.now(),
            }),
          );
          focusReader(nextProgress);
        }, 0);
      } catch (err) {
        if (isCancelled()) return;
        setBook(null);
        setCurrentChapterIndex(0);
        setChapterProgressValue(0);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!isCancelled()) setBusy(null);
      }
    },
    [focusReader, persistState, lang],
  );

  // Open the asset on mount and whenever the workbench swaps it. Keyed on the
  // asset only (via a ref for the opener), so a language switch never reloads.
  const openAssetRef = useRef(openAsset);
  openAssetRef.current = openAsset;
  useEffect(() => {
    let cancelled = false;
    void openAssetRef.current(asset, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const updatePrefs = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const nextPrefs = clampReaderPrefs({ ...prefs, ...patch });
      persistState({ ...storedState, prefs: nextPrefs });
    },
    [persistState, prefs, storedState],
  );

  const addCurrentBookmark = useCallback(() => {
    if (!book || !currentChapter) return;
    const progress = chapterProgress(articleRef.current) || chapterProgressValue;
    const bookmark: ReaderBookmark = {
      id: `bookmark:${Date.now()}:${currentChapter.href}`,
      chapterHref: currentChapter.href,
      chapterTitle: currentChapter.title,
      progress,
      label: `${currentChapter.title} · ${formatPercent(progress)}`,
      createdAt: Date.now(),
    };
    persistState(addBookmark(storedState, book.identity, bookmark));
    setActivePanel("bookmarks");
  }, [book, chapterProgressValue, currentChapter, persistState, storedState]);

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      if (!book) return;
      persistState(removeBookmark(storedState, book.identity, bookmarkId));
    },
    [book, persistState, storedState],
  );

  const restoreBookmark = useCallback(
    (bookmark: ReaderBookmark) => {
      if (!book) return;
      const index = book.chapters.findIndex((chapter) => chapter.href === bookmark.chapterHref);
      if (index >= 0) selectChapter(index, bookmark.progress);
    },
    [book, selectChapter],
  );

  useEffect(() => {
    if (!book) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const progress = chapterProgress(articleRef.current);
        setChapterProgressValue(progress);
        persistProgress(currentChapterIndex, progress);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [book, currentChapterIndex, persistProgress]);

  useEffect(() => {
    if (!book) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        setActivePanel("search");
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        selectChapter(currentChapterIndex - 1, 0);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        selectChapter(currentChapterIndex + 1, 0);
        return;
      }
      const progress = chapterProgress(articleRef.current);
      if ((event.key === "ArrowLeft" || event.key === "PageUp") && progress <= 0.08) {
        event.preventDefault();
        selectChapter(currentChapterIndex - 1, 0);
      }
      if ((event.key === "ArrowRight" || event.key === "PageDown") && progress >= 0.92) {
        event.preventDefault();
        selectChapter(currentChapterIndex + 1, 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [book, currentChapterIndex, selectChapter]);

  const canGoPrevious = Boolean(book && currentChapterIndex > 0);
  const canGoNext = Boolean(book && currentChapterIndex < book.chapters.length - 1);

  const sidebar = book ? (
    <aside className="epub-reader-sidebar" aria-label={t(lang, "readerPanels")}>
      <div className="epub-reader-tabs" role="tablist" aria-label={t(lang, "readerTools")}>
        {([
          ["contents", Library, t(lang, "tabContents")],
          ["search", Search, t(lang, "tabSearch")],
          ["prefs", SlidersHorizontal, "Aa"],
          ["bookmarks", Bookmark, t(lang, "tabBookmarks")],
        ] as const).map(([panel, Icon, label]) => (
          <button
            key={panel}
            type="button"
            role="tab"
            id={`epub-reader-tab-${panel}`}
            aria-selected={activePanel === panel}
            aria-controls={`epub-reader-panel-${panel}`}
            className="epub-reader-tab"
            onClick={() => setActivePanel(panel)}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {activePanel === "contents" && (
        <nav
          role="tabpanel"
          id="epub-reader-panel-contents"
          aria-labelledby="epub-reader-tab-contents"
          tabIndex={0}
          className="epub-reader-panel"
        >
          <h2>{t(lang, "tabContents")}</h2>
          <ol className="epub-reader-toc">
            {book.chapters.map((chapter, index) => (
              <li key={chapter.href}>
                <button
                  type="button"
                  className="epub-reader-toc-button"
                  aria-current={index === currentChapterIndex ? "page" : undefined}
                  onClick={() => selectChapter(index, 0)}
                >
                  <span>{chapter.title}</span>
                  <small>{index + 1}</small>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {activePanel === "search" && (
        <section
          role="tabpanel"
          id="epub-reader-panel-search"
          aria-labelledby="epub-reader-tab-search"
          tabIndex={0}
          className="epub-reader-panel"
        >
          <h2>{t(lang, "tabSearch")}</h2>
          <label className="epub-reader-search-box">
            <span>{t(lang, "findInBook")}</span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t(lang, "searchChapters")}
            />
          </label>
          <p className="epub-reader-panel-note">
            {searchQuery.trim().length < 2
              ? t(lang, "typeTwoChars")
              : t(lang, "resultsCount", {
                  count: searchResults.length,
                  countPlural: resultPlural(lang, searchResults.length),
                })}
          </p>
          <ol className="epub-reader-results">
            {searchResults.map((result) => (
              <li key={`${result.chapterHref}:${result.matchIndex}`}>
                <button
                  type="button"
                  onClick={() => {
                    selectChapter(result.chapterIndex, 0);
                    focusReader(0);
                  }}
                >
                  <strong>{result.chapterTitle}</strong>
                  <span>{result.snippet}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {activePanel === "prefs" && (
        <section
          role="tabpanel"
          id="epub-reader-panel-prefs"
          aria-labelledby="epub-reader-tab-prefs"
          tabIndex={0}
          className="epub-reader-panel"
        >
          <h2>{t(lang, "readingSettings")}</h2>
          <div className="epub-reader-theme-options" role="group" aria-label={t(lang, "themeLabel")}>
            {(["paper", "sepia", "night"] as ReaderTheme[]).map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={prefs.theme === theme}
                onClick={() => updatePrefs({ theme })}
              >
                {themeLabel(lang, theme)}
              </button>
            ))}
          </div>
          <div className="epub-reader-stepper">
            <span>{t(lang, "fontSize")}</span>
            <button type="button" aria-label={t(lang, "decreaseFontSize")} onClick={() => updatePrefs({ fontSize: prefs.fontSize - 1 })}>−</button>
            <strong>{prefs.fontSize}px</strong>
            <button type="button" aria-label={t(lang, "increaseFontSize")} onClick={() => updatePrefs({ fontSize: prefs.fontSize + 1 })}>+</button>
          </div>
          <div className="epub-reader-stepper">
            <span>{t(lang, "lineHeight")}</span>
            <button type="button" aria-label={t(lang, "decreaseLineHeight")} onClick={() => updatePrefs({ lineHeight: prefs.lineHeight - 0.05 })}>−</button>
            <strong>{prefs.lineHeight.toFixed(2)}</strong>
            <button type="button" aria-label={t(lang, "increaseLineHeight")} onClick={() => updatePrefs({ lineHeight: prefs.lineHeight + 0.05 })}>+</button>
          </div>
          <div className="epub-reader-stepper">
            <span>{t(lang, "pageWidth")}</span>
            <button type="button" aria-label={t(lang, "narrowPage")} onClick={() => updatePrefs({ maxWidth: prefs.maxWidth - 4 })}>−</button>
            <strong>{prefs.maxWidth}ch</strong>
            <button type="button" aria-label={t(lang, "widenPage")} onClick={() => updatePrefs({ maxWidth: prefs.maxWidth + 4 })}>+</button>
          </div>
        </section>
      )}

      {activePanel === "bookmarks" && (
        <section
          role="tabpanel"
          id="epub-reader-panel-bookmarks"
          aria-labelledby="epub-reader-tab-bookmarks"
          tabIndex={0}
          className="epub-reader-panel"
        >
          <h2>{t(lang, "tabBookmarks")}</h2>
          {bookmarks.length === 0 ? (
            <p className="epub-reader-panel-note">{t(lang, "noBookmarks")}</p>
          ) : (
            <ol className="epub-reader-bookmarks">
              {bookmarks.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => restoreBookmark(item)}>
                    <strong>{item.label}</strong>
                    <span>{new Date(item.createdAt).toLocaleDateString(dateLocale(lang))}</span>
                  </button>
                  <button type="button" aria-label={t(lang, "deleteBookmark", { label: item.label })} onClick={() => deleteBookmark(item.id)}>
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </aside>
  ) : null;

  return (
    <div
      ref={(node) => {
        shellRef.current = node;
        readyRef(node);
      }}
      data-lang-sensitive=""
      className="epub-reader-shell"
      data-reader-theme={prefs.theme}
      style={readerVars}
    >
      {error && <p role="alert" className="epub-reader-alert">{error}</p>}

      {!book || !currentChapter ? (
        busy && (
          <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
            {busy}
          </p>
        )
      ) : (
        <div className="epub-reader-workspace">
          <header className="epub-reader-toolbar">
            <div>
              <p className="epub-reader-eyebrow">EPUB Reader</p>
              <h2>{displayTitle(lang, book)}</h2>
              <p>
                {book.author ? t(lang, "byAuthor", { author: book.author }) : ""}
                {t(lang, "chaptersCount", {
                  count: book.chapters.length,
                  countPlural: chapterPlural(lang, book.chapters.length),
                })}
              </p>
            </div>
            <div className="epub-reader-toolbar-actions">
              <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-pressed={sidebarOpen}>
                <PanelLeft aria-hidden="true" className="size-4" />
                {t(lang, "tabContents")}
              </button>
              <button type="button" onClick={() => { setActivePanel("search"); setSidebarOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}>
                <Search aria-hidden="true" className="size-4" />
                {t(lang, "tabSearch")}
              </button>
              <button type="button" onClick={() => { setActivePanel("prefs"); setSidebarOpen(true); }}>
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                Aa
              </button>
              <button type="button" onClick={addCurrentBookmark}>
                <Bookmark aria-hidden="true" className="size-4" />
                {t(lang, "bookmark")}
              </button>
            </div>
          </header>

          <div className={`epub-reader-layout${sidebarOpen ? "" : " is-sidebar-collapsed"}`}>
            {sidebar}
            <main className="epub-reader-main">
              <div className="epub-reader-chapter-card">
                <div className="epub-reader-chapter-head">
                  <button type="button" onClick={() => selectChapter(currentChapterIndex - 1, 0)} disabled={!canGoPrevious}>
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    {t(lang, "previous")}
                  </button>
                  <div>
                    <p>{t(lang, "chapterOf", { index: currentChapterIndex + 1, count: book.chapters.length })}</p>
                    <h2>{currentChapter.title}</h2>
                  </div>
                  <button type="button" onClick={() => selectChapter(currentChapterIndex + 1, 0)} disabled={!canGoNext}>
                    {t(lang, "next")}
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </button>
                </div>
                <article
                  ref={articleRef}
                  tabIndex={-1}
                  className="epub-reader-prose"
                  aria-label={currentChapter.title}
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              </div>
            </main>
          </div>

          <nav className="epub-reader-progress-nav" aria-label={t(lang, "readingProgress")}>
            <button type="button" onClick={() => selectChapter(currentChapterIndex - 1, 0)} disabled={!canGoPrevious}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              {t(lang, "previous")}
            </button>
            <div>
              <span>{formatPercent(chapterProgressValue)}</span>
              <div className="epub-reader-progress-track" aria-hidden="true">
                <span style={{ width: formatPercent(chapterProgressValue) }} />
              </div>
            </div>
            <button type="button" onClick={() => selectChapter(currentChapterIndex + 1, 0)} disabled={!canGoNext}>
              {t(lang, "next")}
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
