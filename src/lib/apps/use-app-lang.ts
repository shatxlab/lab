import { useEffect, useState } from "react";

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
