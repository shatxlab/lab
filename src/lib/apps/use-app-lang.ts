import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  APP_LANG_STORAGE_KEY,
  applyAppLang,
  readAppLang,
  subscribeToAppLang,
  type AppLang,
} from "@/lib/apps/lang";

function subscribe(onChange: () => void): () => void {
  const unsubscribe = subscribeToAppLang(onChange);
  // Another tab changed the language.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === APP_LANG_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = (): AppLang => "en";

/**
 * Subscribe an island to the global UI language.
 *
 * Built on useSyncExternalStore so hydration is mismatch-free: the prerendered
 * HTML is English, React hydrates with that server snapshot, then immediately
 * (before paint) re-renders with the stored language. A plain
 * `useState(() => readAppLang())` would instead hydrate with the client value
 * and trip React's "text content does not match" error for every visitor who
 * has chosen another language.
 */
export function useAppLang(): AppLang {
  const lang = useSyncExternalStore(subscribe, readAppLang, serverSnapshot);

  useEffect(() => {
    applyAppLang(lang);
  }, [lang]);

  return lang;
}

/**
 * Ref callback for an island's root element.
 *
 * Prerendered islands are English; while a non-default language is stored the
 * pre-paint script marks <html data-lang-wait> and the CSS keeps every
 * `[data-lang-sensitive]` root invisible until it hydrates and stamps itself
 * with `[data-lang-ready]`. The layout effect runs before the hydrated frame
 * paints, so the visitor never sees the English prerender flash.
 */
export function useLangReady<T extends HTMLElement>() {
  return useCallback((node: T | null) => {
    node?.setAttribute("data-lang-ready", "");
  }, []);
}
