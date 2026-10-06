/**
 * Pure JSON model for the viewer: parsing with helpful errors and the
 * line/token plan used by JsonView.
 */

/**
 * Parses `text`, throwing an Error whose message names the line and column of
 * the failure when the engine reports a position. Warnings (capped at 5) flag
 * number literals whose round-trip through JSON.parse/JSON.stringify loses
 * precision, e.g. `12345678901234567890` or `1e999`.
 *
 * Duplicate object keys are not detected: JSON.parse keeps the last one, and
 * the viewer shows exactly what the parse produced.
 */
export function parseJson(text: string): { value: unknown; warnings: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${describeParseFailure(text, error)}`);
  }
  return { value, warnings: precisionWarnings(text) };
}

function describeParseFailure(text: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Newer engines spell the location out; older ones only give a byte position.
  const withLineCol = /\(line (\d+) column (\d+)\)/.exec(message);
  if (withLineCol) return `${message} — line ${withLineCol[1]}, column ${withLineCol[2]}`;

  const atPosition = /position (\d+)/.exec(message);
  if (atPosition) {
    const offset = Math.min(Number(atPosition[1]), text.length);
    const before = text.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - (before.lastIndexOf("\n") + 1) + 1;
    return `${message} — line ${line}, column ${column}`;
  }

  return message;
}

const MAX_WARNINGS = 5;
const NUMBER_LITERAL = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function precisionWarnings(text: string): string[] {
  let scrubbed: string;
  try {
    // Number literals inside strings are data, not numbers — hide the strings.
    scrubbed = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  } catch {
    scrubbed = text;
  }

  const warnings: string[] = [];
  for (const match of scrubbed.matchAll(NUMBER_LITERAL)) {
    const literal = match[0];
    let parsed: unknown;
    try {
      parsed = JSON.parse(literal);
    } catch {
      continue;
    }
    if (JSON.stringify(parsed) !== literal) {
      warnings.push(`Number ${literal} is very large or very precise and may be rounded`);
      if (warnings.length >= MAX_WARNINGS) break;
    }
  }
  return warnings;
}

/** Serializes the (edited) tree the way downloads and the view need it. */
export function prettifyJson(value: unknown): string {
  // Download output gets its trailing newline added by the caller.
  return JSON.stringify(value, null, 2);
}

/* One tokenized entry per line of JSON.stringify(value, null, 2) output. */
export type JsonToken =
  | { type: "indent"; text: string }
  | { type: "key"; text: string; name: string }
  | { type: "value"; text: string; kind: "string" | "number" | "literal" }
  | { type: "punct"; text: string };

export type JsonLine = {
  tokens: JsonToken[];
};

/**
 * Splits one line of pretty-printed JSON into colored segments. Pure, and
 * round-trip safe: concatenating every token's text rebuilds the line exactly,
 * escapes and all.
 */
export function tokenizePrettyLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];

  const indent = /^\s*/.exec(line)![0];
  if (indent) tokens.push({ type: "indent", text: indent });
  let rest = line.slice(indent.length);

  while (rest !== "") {
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      tokens.push({ type: "punct", text: whitespace[0] });
      rest = rest.slice(whitespace[0].length);
      continue;
    }

    // Bare structural line: `{`, `}`, `[`, `],`, `},` …
    if (/^[{}\[\]]+(,)?$/.test(rest)) {
      tokens.push({ type: "punct", text: rest });
      break;
    }

    if (rest.startsWith('"')) {
      const literal = consumeStringLiteral(rest);
      if (!literal) break; // Unbalanced quote; show the rest as plain text.
      const after = rest.slice(literal.length);
      if (/^:\s/.test(after) || after === ":") {
        tokens.push({ type: "key", text: literal, name: unescapeStringLiteral(literal) });
      } else {
        tokens.push({ type: "value", text: literal, kind: "string" });
      }
      rest = after;
      continue;
    }

    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: "value", text: number[0], kind: "number" });
      rest = rest.slice(number[0].length);
      continue;
    }

    const word = /^(true|false|null)/.exec(rest);
    if (word) {
      tokens.push({ type: "value", text: word[0], kind: "literal" });
      rest = rest.slice(word[0].length);
      continue;
    }

    const punct = /^[^\s]+/.exec(rest)!;
    tokens.push({ type: "punct", text: punct[0] });
    rest = rest.slice(punct[0].length);
  }

  return tokens;
}

/** Length of the `"…"` literal at the start of `text`, honoring \\ escapes. */
function consumeStringLiteral(text: string): string | null {
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return text.slice(0, index + 1);
  }
  return null;
}

function unescapeStringLiteral(literal: string): string {
  try {
    return JSON.parse(literal) as string;
  } catch {
    return literal.slice(1, -1);
  }
}

function scalarTokenText(value: string | number | boolean | null): string {
  return prettifyJson(value);
}

/** The tokenized pretty-printed lines JsonView renders. */
export function jsonLines(value: unknown): JsonLine[] {
  return buildLines(value, "", false);
}

function buildLines(value: unknown, indent: string, comma: boolean): JsonLine[] {
  const trailing = comma ? "," : "";

  if (value === null || typeof value !== "object") {
    return [
      {
        tokens: tokenizePrettyLine(`${indent}${scalarTokenText(value as string | number | boolean | null)}${trailing}`),
      },
    ];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ tokens: tokenizePrettyLine(`${indent}[]${trailing}`) }];
    }
    const lines: JsonLine[] = [{ tokens: tokenizePrettyLine(`${indent}[`) }];
    value.forEach((child, index) => {
      lines.push(...buildLines(child, `${indent}  `, index < value.length - 1));
    });
    lines.push({ tokens: tokenizePrettyLine(`${indent}]${trailing}`) });
    return lines;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return [{ tokens: tokenizePrettyLine(`${indent}{}${trailing}`) }];
  }
  const lines: JsonLine[] = [{ tokens: tokenizePrettyLine(`${indent}{`) }];
  entries.forEach(([key, child], index) => {
    const keyLiteral = scalarTokenText(key);
    const childIndent = `${indent}  `;
    const isScalar = child === null || typeof child === "string" || typeof child === "number" || typeof child === "boolean";

    if (isScalar) {
      const memberTrailing = index < entries.length - 1 ? "," : "";
      lines.push({
        tokens: tokenizePrettyLine(`${childIndent}${keyLiteral}: ${scalarTokenText(child as string | number | boolean | null)}${memberTrailing}`),
      });
      return;
    }

    const body = buildLines(child, childIndent, index < entries.length - 1);
    // The container's own header `{`/`[` becomes `  "key": {`/`  "key": [`.
    lines.push({ tokens: mergeKeyIntoHeader(childIndent, keyLiteral, body[0]!.tokens) });
    lines.push(...body.slice(1));
  });
  lines.push({ tokens: tokenizePrettyLine(`${indent}}${trailing}`) });
  return lines;
}

/** `  "users": [` — the container header line with the member key merged in. */
function mergeKeyIntoHeader(indent: string, keyLiteral: string, headerTokens: JsonToken[]): JsonToken[] {
  // headerTokens starts with the container's indent + `{`/`[`.
  const brace = headerTokens.find((token) => token.text.startsWith("{") || token.text.startsWith("["))!;
  return [
    { type: "indent", text: indent },
    { type: "key", text: keyLiteral, name: unescapeStringLiteral(keyLiteral) },
    { type: "punct", text: ": " },
    { type: "punct", text: brace.text },
  ];
}
