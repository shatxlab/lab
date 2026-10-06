import { useCallback, useEffect, useState } from "react";

import { changeAppLang, readAppLang, type AppLang } from "@/lib/apps/lang";

const LANG_OPTIONS: readonly { code: AppLang; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "ru", label: "RU", full: "Русский" },
];

/**
 * Header language toggle. One shared setting ("lab:lang") drives every app
 * island, the tools index and the <html lang> attribute.
 *
 * The visual active state is CSS-driven off <html data-lang> (see apps.css)
 * so the toggle is correct before hydration; React only manages aria-pressed.
 */
export default function LangToggle() {
  const [lang, setLang] = useState<AppLang>(() => readAppLang());

  useEffect(() => {
    setLang(readAppLang());
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
      {LANG_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          data-lang-option={option.code}
          aria-pressed={option.code === lang}
          title={option.full}
          onClick={() => pick(option.code)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
