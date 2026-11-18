export type Theme = "light" | "dark";

/** Persisted theme value shape: "light" | "dark". */
export const THEME_STORAGE_KEY = "lab:theme:v1";

/** Minimal storage contract so callers can inject any Storage (node, jsdom, tests). */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const THEMES: readonly Theme[] = ["light", "dark"];

/**
 * Stored choice wins; otherwise honor the system preference.
 */
export function resolveTheme(stored: Theme | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

type OptionalThemeStorage = ThemeStorage | undefined;

function themeStorageOrUndefined(): OptionalThemeStorage {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Read and validate the persisted theme. Corrupt values are treated as unset.
 */
export function readStoredTheme(storage: OptionalThemeStorage = themeStorageOrUndefined()): Theme | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : null;
  } catch {
    return null;
  }
}

/**
 * Persist the theme. Fails soft: when storage is unavailable (private mode,
 * permissions, quota) the theme still applies for the session.
 */
export function persistTheme(theme: Theme, storage: OptionalThemeStorage = themeStorageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore — a theme is a preference, never worth breaking a page over.
  }
}

/**
 * Reflect the theme on <html data-theme="..."> for the CSS tokens to key off.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Resolve the effective theme (stored choice, else system preference),
 * apply it, and return it so callers can render matching UI.
 */
export function initTheme(storage: OptionalThemeStorage = themeStorageOrUndefined()): Theme {
  const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = resolveTheme(readStoredTheme(storage), Boolean(prefersDark));
  applyTheme(theme);
  return theme;
}
