import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  initTheme,
  persistTheme,
  type Theme,
} from "@/lib/apps/theme";

/**
 * Light/dark toggle island. Initializes from storage/system preference,
 * persists each toggle, and reflects the current mode on <html data-theme>.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-theme-mode={theme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-(--border) bg-(--surface) text-(--muted-fg) transition-colors hover:text-(--fg)"
    >
      {/*
        Both glyphs are always rendered and keyed off html[data-theme] in CSS
        (see apps.css), so the icon is correct before hydration — no SSR
        glyph flash. React state only updates the label/hover affordance.
      */}
      <svg
        aria-hidden="true"
        className="theme-glyph-sun h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg
        aria-hidden="true"
        className="theme-glyph-moon h-4 w-4"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1Z" />
      </svg>
    </button>
  );
}
