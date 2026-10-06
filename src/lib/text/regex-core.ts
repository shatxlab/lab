/*
 * Regular-expression testing, kept free of DOM and worker APIs so the worker,
 * the main-thread fallback and the tests all share one implementation.
 */

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

export interface RegexRequest {
  pattern: string;
  flags: string;
  text: string;
  /** Replacement string (supports $1, $<name>, $&). `undefined` skips replacing. */
  replacement?: string;
}

export type RegexResponse =
  | { ok: true; matches: RegexMatch[]; truncated: boolean; replaced?: string }
  | { ok: false; error: string };

export const MAX_MATCHES = 1000;
export const MAX_TEXT_CHARS = 1_000_000;
export const VALID_FLAGS = ["g", "i", "m", "s", "u"] as const;

export function runRegex(request: RegexRequest): RegexResponse {
  const { pattern, text, replacement } = request;
  if (text.length > MAX_TEXT_CHARS) return { ok: false, error: "text-too-large" };
  // Keep only supported flags, each once; matching is always global for listing.
  const flags = [...new Set(request.flags.split(""))].filter((flag) => (VALID_FLAGS as readonly string[]).includes(flag));
  const listing = flags.includes("g") ? flags : [...flags, "g"];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, listing.join(""));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;
  for (const match of text.matchAll(regex)) {
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    const full = match[0] ?? "";
    const index = match.index ?? 0;
    matches.push({
      index,
      end: index + full.length,
      text: full,
      groups: match.slice(1),
      named: { ...(match.groups ?? {}) },
    });
  }

  let replaced: string | undefined;
  if (replacement !== undefined) {
    const original = flags.includes("g") ? regex : new RegExp(pattern, flags.join(""));
    replaced = text.replace(original, replacement);
  }
  return { ok: true, matches, truncated, replaced };
}
