import { useCallback, useEffect, useState } from "react";

import {
  applyAppLang,
  readAppLang,
  subscribeToAppLang,
  type AppLang,
} from "@/lib/apps/lang";

/**
 * Subscribe an island to the global UI language.
 *
 * The hook reads the persisted choice on mount, keeps <html lang> in sync and
 * re-renders whenever any island (typically the header toggle) changes it.
 */
export function useAppLang(): AppLang {
  const [lang, setLang] = useState<AppLang>(() => readAppLang());

  useEffect(() => subscribeToAppLang(setLang), []);

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
