/*
 * Matching and ranking for the command palette. Pure functions so the ranking
 * can be tested without a DOM.
 */

export interface PaletteItem {
  id: string;
  group: "tools" | "actions";
  title: string;
  /** Secondary line (category, shortcut, ...). */
  hint?: string;
  /** Extra searchable words, not shown. */
  keywords?: string;
  href?: string;
  run?: () => void;
}

/** Lowercase, fold ё→е and strip diacritics so "cafe" finds "café". */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0;
  for (const char of haystack) {
    if (char === needle[at]) at += 1;
    if (at === needle.length) return true;
  }
  return needle.length === 0;
}

function scoreToken(token: string, title: string, keywords: string): number {
  if (title.startsWith(token)) return 100;
  if (title.split(/[\s\-·/]+/).some((word) => word.startsWith(token))) return 80;
  if (title.includes(token)) return 60;
  if (keywords.split(/\s+/).some((word) => word.startsWith(token))) return 40;
  if (keywords.includes(token)) return 25;
  if (token.length >= 3 && isSubsequence(token, title)) return 10;
  return -1;
}

/** Score one item for a query; -1 means "does not match". Every token must match. */
export function scoreItem(item: PaletteItem, query: string): number {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const title = normalize(item.title);
  const keywords = normalize(`${item.keywords ?? ""} ${item.hint ?? ""}`);
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token, title, keywords);
    if (score < 0) return -1;
    total += score;
  }
  return total;
}

/** Filter and rank. An empty query keeps the original order. */
export function filterItems(items: readonly PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return [...items];
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
