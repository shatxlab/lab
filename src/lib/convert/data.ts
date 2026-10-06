import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import YAML from "yaml";

export type DataFormat = "json" | "yaml" | "toml";

export const DATA_FORMATS: readonly DataFormat[] = ["json", "yaml", "toml"];

export interface StringifyOptions {
  /** Spaces per level; 0 = compact (JSON only). */
  indent: 0 | 2 | 4 | "tab";
  sortKeys: boolean;
}

export class DataError extends Error {
  /** Where the problem was found: while reading or while writing. */
  readonly stage: "parse" | "stringify";
  constructor(stage: "parse" | "stringify", message: string) {
    super(message);
    this.name = "DataError";
    this.stage = stage;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse text in the given format into a plain JavaScript value. */
export function parseData(format: DataFormat, text: string): unknown {
  try {
    switch (format) {
      case "json":
        return JSON.parse(text);
      case "yaml":
        // YAML 1.2 core schema; the library caps alias expansion (billion-laughs guard).
        return YAML.parse(text, { maxAliasCount: 100, merge: true });
      case "toml":
        return parseToml(text);
    }
  } catch (error) {
    throw new DataError("parse", message(error));
  }
}

/**
 * Guess the format of pasted text. JSON when it opens with `{`/`[` and
 * parses; TOML when it parses as TOML and looks like it (has `key =` lines or
 * `[table]` headers); YAML otherwise.
 */
export function detectFormat(text: string): DataFormat {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // `[table]` headers also start with `[`; fall through to TOML/YAML.
    }
  }
  if (/^\s*(?:\[[^\]\n]+\]|[\w."'-]+\s*=)/m.test(trimmed)) {
    try {
      parseToml(trimmed);
      return "toml";
    } catch {
      // Not TOML after all.
    }
  }
  return "yaml";
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sortDeep(child)]),
    );
  }
  return value;
}

/** TOML cannot hold null/undefined; find the first path that does. */
function findNull(value: unknown, path = ""): string | null {
  if (value === null || value === undefined) return path || "(root)";
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findNull(value[index], `${path}[${index}]`);
      if (found) return found;
    }
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value)) {
      const found = findNull(child, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

export function stringifyData(format: DataFormat, value: unknown, options: StringifyOptions): string {
  const data = options.sortKeys ? sortDeep(value) : value;
  try {
    switch (format) {
      case "json": {
        const space = options.indent === "tab" ? "\t" : options.indent;
        const text = JSON.stringify(data, null, space === 0 ? undefined : space);
        if (text === undefined) throw new Error("This value cannot be written as JSON.");
        return text;
      }
      case "yaml": {
        const indent = options.indent === "tab" || options.indent === 0 ? 2 : options.indent;
        return YAML.stringify(data, { indent, lineWidth: 0 });
      }
      case "toml": {
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("TOML needs an object (key/value pairs) at the top level.");
        }
        const hole = findNull(data);
        if (hole) throw new Error(`TOML has no null value (found at ${hole}).`);
        return `${stringifyToml(data as Record<string, unknown>)}\n`;
      }
    }
  } catch (error) {
    throw new DataError("stringify", message(error));
  }
}

export function convertData(from: DataFormat, to: DataFormat, text: string, options: StringifyOptions): string {
  return stringifyData(to, parseData(from, text), options);
}
