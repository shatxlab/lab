import type { AppLang } from "@/lib/apps/lang";

/**
 * Tiny typed translator shared by the newer tools.
 *
 * `strings` holds a full table per language; `{name}` placeholders are filled
 * from `params`. A missing Russian key falls back to English so a half-done
 * translation never renders `undefined`.
 */
export type Strings<K extends string> = Record<AppLang, Record<K, string>>;

export type Translate<K extends string> = (
  lang: AppLang,
  key: K,
  params?: Record<string, string | number>,
) => string;

export function createTranslator<K extends string>(strings: Strings<K>): Translate<K> {
  return (lang, key, params) => {
    const template = strings[lang]?.[key] ?? strings.en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

/** Pick the right Russian plural form (1 файл, 2 файла, 5 файлов). */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
