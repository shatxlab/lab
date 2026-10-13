/**
 * Turn pasted or uploaded text into cards. These shapes are understood:
 * tab-separated rows, comma/semicolon CSV (with an optional header), plain
 * lines of "term — definition", and JSON (an array of `{ front, back, tags }`
 * objects or `[front, back]` pairs, a `{ cards: [...] }` wrapper, or a plain
 * `{ "term": "definition" }` map). The shape is detected, not chosen.
 */

import { MAX_CARDS_PER_DECK, MAX_FIELD_LENGTH, MAX_TAGS } from "@/lib/flash/model";

export interface ParsedCard {
  front: string;
  back: string;
  tags: string[];
}

export interface ParseResult {
  cards: ParsedCard[];
  /** Rows that had no usable front and back, plus cards past the deck limit. */
  skipped: number;
}

const FRONT_NAMES = new Set(["front", "question", "term", "word", "вопрос", "термин", "слово"]);
const BACK_NAMES = new Set(["back", "answer", "definition", "meaning", "ответ", "определение", "значение"]);
const TAG_NAMES = new Set(["tags", "tag", "теги", "тег"]);

/** A dash needs spaces around it so "well-known" or "10-20" never splits. */
const DASH = /\s[—–-]\s|\t/;
const COLON = /:\s/;

/** Split delimited text into rows, honouring quoted fields (which may hold delimiters and newlines). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    cell = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (char === delimiter) endCell();
    else if (char === "\n") endRow();
    else cell += char;
  }
  endRow();
  return rows;
}

function splitTags(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

function finish(entries: ParsedCard[], skipped: number): ParseResult {
  const cards = entries.slice(0, MAX_CARDS_PER_DECK);
  return { cards, skipped: skipped + (entries.length - cards.length) };
}

function fromRows(rows: string[][]): ParseResult {
  let frontAt = 0;
  let backAt = 1;
  let tagsAt = 2;
  let body = rows;
  const header = rows[0]?.map((value) => value.toLowerCase());
  if (header && FRONT_NAMES.has(header[0] ?? "") && BACK_NAMES.has(header[1] ?? "")) {
    body = rows.slice(1);
    const found = header.findIndex((name) => TAG_NAMES.has(name));
    tagsAt = found >= 0 ? found : -1;
  }
  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const row of body) {
    const front = (row[frontAt] ?? "").slice(0, MAX_FIELD_LENGTH);
    const back = (row[backAt] ?? "").slice(0, MAX_FIELD_LENGTH);
    if (!front || !back) skipped += 1;
    else cards.push({ front, back, tags: tagsAt >= 0 ? splitTags(row[tagsAt] ?? "") : [] });
  }
  return finish(cards, skipped);
}

/** One "term — definition" per line; the first separator wins. */
export function parseLines(text: string): ParseResult {
  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = DASH.exec(trimmed) ?? COLON.exec(trimmed);
    const front = match ? trimmed.slice(0, match.index).trim() : "";
    const back = match ? trimmed.slice(match.index + match[0].length).trim() : "";
    if (!front || !back) skipped += 1;
    else cards.push({ front: front.slice(0, MAX_FIELD_LENGTH), back: back.slice(0, MAX_FIELD_LENGTH), tags: [] });
  }
  return finish(cards, skipped);
}

const isText = (value: unknown): value is string => typeof value === "string" || typeof value === "number";
const asText = (value: unknown): string => (isText(value) ? String(value).trim() : "");
const FRONT_KEYS = ["front", "question", "term", "word", "q", "вопрос", "термин", "слово"];
const BACK_KEYS = ["back", "answer", "definition", "meaning", "a", "ответ", "определение", "значение"];

function pick(item: Record<string, unknown>, keys: readonly string[]): unknown {
  const lower = new Map(Object.entries(item).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) if (lower.has(key)) return lower.get(key);
  return undefined;
}

function tagsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).slice(0, MAX_TAGS);
  return typeof value === "string" ? splitTags(value) : [];
}

/** JSON in one of the supported shapes, or null when the text is not JSON or not cards. */
export function parseJsonCards(text: string): ParseResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }

  let items: unknown[] | null = null;
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    const wrapped = object.cards ?? object.c;
    if (Array.isArray(wrapped)) items = wrapped;
    else if (Object.keys(object).length > 0 && Object.values(object).every((value) => typeof value === "string")) {
      items = Object.entries(object).map(([front, back]) => [front, back]);
    }
  }
  if (!items) return null;

  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const item of items) {
    let front = "";
    let back = "";
    let tags: string[] = [];
    if (Array.isArray(item)) {
      front = asText(item[0]);
      back = asText(item[1]);
      tags = tagsOf(item[2]);
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      front = asText(pick(record, FRONT_KEYS));
      back = asText(pick(record, BACK_KEYS));
      tags = tagsOf(pick(record, [...TAG_NAMES]));
    }
    if (!front || !back) skipped += 1;
    else cards.push({ front: front.slice(0, MAX_FIELD_LENGTH), back: back.slice(0, MAX_FIELD_LENGTH), tags });
  }
  // An object that held nothing card-like is probably not a deck.
  if (cards.length === 0 && !Array.isArray(data)) return null;
  return finish(cards, skipped);
}

/** Detect the shape of `text` and parse it. */
export function parseImport(input: string): ParseResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { cards: [], skipped: 0 };

  const json = parseJsonCards(text);
  if (json) return json;

  const first = lines[0]!;
  if (first.includes("\t") && !first.includes(" — ")) return fromRows(parseDelimited(text, "\t"));

  const headerComma = /^\s*"?([^",;]+?)"?\s*([,;])\s*"?([^",;]+?)"?\s*(?:[,;]|$)/.exec(first);
  if (headerComma && FRONT_NAMES.has(headerComma[1]!.toLowerCase()) && BACK_NAMES.has(headerComma[3]!.toLowerCase())) {
    return fromRows(parseDelimited(text, headerComma[2]!));
  }

  const share = (test: (line: string) => boolean) => lines.filter(test).length / lines.length;
  if (share((line) => DASH.test(line) || COLON.test(line)) >= 0.5) return parseLines(text);

  const commas = (first.match(/,/g) ?? []).length;
  const semicolons = (first.match(/;/g) ?? []).length;
  if (commas + semicolons > 0 && share((line) => /[,;]/.test(line)) >= 0.5) {
    return fromRows(parseDelimited(text, semicolons > commas ? ";" : ","));
  }
  return parseLines(text);
}

/** A deck as tab-separated text (front, back, tags) that `parseImport` reads back. */
export function toTsv(cards: readonly { front: string; back: string; tags: readonly string[] }[]): string {
  const cell = (value: string) => (/[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return ["front\tback\ttags", ...cards.map((card) => [card.front, card.back, card.tags.join(" ")].map(cell).join("\t"))].join("\n") + "\n";
}

/** A deck as JSON (`[{ "front", "back", "tags" }]`) that `parseImport` reads back. */
export function toJson(cards: readonly { front: string; back: string; tags: readonly string[] }[]): string {
  return `${JSON.stringify(
    cards.map((card) => (card.tags.length > 0 ? { front: card.front, back: card.back, tags: [...card.tags] } : { front: card.front, back: card.back })),
    null,
    2,
  )}\n`;
}
