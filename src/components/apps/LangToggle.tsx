import { useCallback, useEffect, useState } from "react";

import { changeAppLang, readAppLang, type AppLang } from "@/lib/apps/lang";

const LANG_OPTIONS: readonly { code: AppLang; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "ru", label: "RU", full: "Русский" },
];

/**
 * Header language toggle. One shared setting ("lab:lang") drives every app
 * island, the tools index and the <html lang> attribute.
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
      className="flex shrink-0 items-center rounded-full border border-(--border) bg-(--surface) p-0.5"
    >
      {LANG_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          aria-pressed={option.code === lang}
          title={option.full}
          onClick={() => pick(option.code)}
          className={`rounded-full px-2 py-1 text-[0.7rem] font-bold tracking-wide transition-colors ${
            option.code === lang
              ? "bg-(--accent) text-(--accent-fg)"
              : "text-(--muted-fg) hover:text-(--fg)"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
