/**
 * Turn pasted or uploaded text into cards. Three shapes are understood:
 * tab-separated rows, comma/semicolon CSV (with an optional header), and plain
 * lines of "term — definition". The shape is detected, not chosen.
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

/** Detect the shape of `text` and parse it. */
export function parseImport(input: string): ParseResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { cards: [], skipped: 0 };

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
