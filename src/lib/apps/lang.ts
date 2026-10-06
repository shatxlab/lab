/*
 * Global UI language for the whole lab tool stack.
 *
 * One setting drives every app (alias, crossword, couples, viewer, reader) and
 * the tools index. Because Astro ships each island as its own bundle, module
 * state is NOT shared between islands — so the store keeps the value in
 * localStorage and spreads changes with a window CustomEvent that any island
 * can subscribe to.
 */

export type AppLang = "en" | "ru";

export const APP_LANG_STORAGE_KEY = "lab:lang";

/** Legacy per-app language keys, honoured once when nothing newer is stored. */
const LEGACY_LANG_KEYS = ["lab:crossword:lang"] as const;

const LANGS: readonly AppLang[] = ["en", "ru"];

/** Storage contract so callers can inject any Storage (node, jsdom, tests). */
export interface LangStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type OptionalStorage = LangStorage | undefined;

function storageOrUndefined(): OptionalStorage {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isLang(value: unknown): value is AppLang {
  return value === "en" || value === "ru";
}

function legacyLang(storage: OptionalStorage): AppLang | null {
  if (!storage) return null;
  try {
    for (const key of LEGACY_LANG_KEYS) {
      const value = storage.getItem(key);
      if (isLang(value)) return value;
    }
    // Alias and couples persisted their own settings JSON with a lang field.
    for (const key of ["lab:alias:v1", "lab:couples:v1"]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const lang = (parsed as { settings?: { lang?: unknown } } | null)?.settings?.lang;
      if (isLang(lang)) return lang;
    }
  } catch {
    // Malformed JSON is treated as unset.
  }
  return null;
}

/**
 * Read the persisted language: the global key wins, then the legacy per-app
 * choices (so a Russian crossword player keeps Russian), then English — the
 * site's default language.
 */
export function readAppLang(storage: OptionalStorage = storageOrUndefined()): AppLang {
  if (!storage) return "en";
  try {
    const stored = storage.getItem(APP_LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
    return legacyLang(storage) ?? "en";
  } catch {
    return "en";
  }
}

export function persistAppLang(lang: AppLang, storage: OptionalStorage = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(APP_LANG_STORAGE_KEY, lang);
  } catch {
    // A preference is never worth breaking a page over.
  }
}

/** Reflect the language on <html lang> and <html data-lang> for the CSS tokens to key off. */
export function applyAppLang(lang: AppLang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  // The header toggle's active state is CSS-driven off data-lang (apps.css),
  // so this must follow every change, not just the pre-paint snapshot.
  document.documentElement.dataset.lang = lang;
}

/** DOM event used to fan a language change out to every island on the page. */
export const APP_LANG_EVENT = "lab:lang-change";

type LangListener = (lang: AppLang) => void;

/**
 * Subscribe to language changes across all islands. The fan-out is a DOM
 * event (dispatchEvent is synchronous), so every island on the page — and the
 * one that changed the setting — is notified exactly once.
 */
export function subscribeToAppLang(listener: LangListener): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<AppLang>).detail;
    if (isLang(detail)) listener(detail);
  };
  window.addEventListener(APP_LANG_EVENT, onEvent);
  return () => window.removeEventListener(APP_LANG_EVENT, onEvent);
}

/**
 * Change the global language: persist, reflect on <html lang> and notify
 * every island via the DOM event.
 */
export function changeAppLang(lang: AppLang, storage: OptionalStorage = storageOrUndefined()): void {
  persistAppLang(lang, storage);
  applyAppLang(lang);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppLang>(APP_LANG_EVENT, { detail: lang }));
  }
}
