import { useCallback, useEffect, useState } from "react";

import {
  changeAppLang,
  readAppLang,
  subscribeToAppLang,
  type AppLang,
} from "@/lib/apps/lang";

const LANG_OPTIONS: readonly { code: AppLang; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "ru", label: "RU", full: "Русский" },
];

/**
 * Header language toggle — a compact EN/RU segmented control.
 *
 * One shared setting ("lab:lang") drives every app island, the tools index and
 * the <html lang> attribute. The visual active state is CSS-driven so it is
 * already correct in the prerendered HTML (`<html data-lang>` is set by the
 * pre-paint script); React keeps `aria-pressed`/`data-active` in sync after
 * hydration. Both hooks are provided so the control renders correctly even if
 * that script never runs.
 */
export default function LangToggle() {
  // Start from the server default to keep hydration quiet; the pre-paint script
  // and the CSS already show the right option before this effect runs.
  const [lang, setLang] = useState<AppLang>("en");

  useEffect(() => {
    setLang(readAppLang());
    return subscribeToAppLang(setLang);
  }, []);

  const pick = useCallback((next: AppLang) => {
    changeAppLang(next);
    setLang(next);
  }, []);

  return (
    <div
      role="group"
      aria-label="Language · Язык"
      className="lang-toggle"
    >
      {LANG_OPTIONS.map((option) => {
        const active = option.code === lang;
        return (
          <button
            key={option.code}
            type="button"
            className="lang-toggle-option"
            data-lang-option={option.code}
            data-active={active ? "true" : "false"}
            aria-pressed={active}
            title={option.full}
            onClick={() => pick(option.code)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
