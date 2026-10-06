/** Text statistics for the word-count tool. All counts are Unicode-aware. */

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  bytes: number;
  /** Minutes to read silently (≈ 200 wpm) and to say aloud (≈ 130 wpm). */
  readingMinutes: number;
  speakingMinutes: number;
}

export interface WordFrequency {
  word: string;
  count: number;
}

type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: "grapheme" | "word" | "sentence" },
) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function segmenter(): SegmenterCtor | undefined {
  return (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
}

/** Visible characters, counting an emoji or a letter+accent as one. */
export function countGraphemes(text: string): number {
  const Segmenter = segmenter();
  if (!Segmenter) return Array.from(text).length;
  let count = 0;
  for (const _ of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) count += 1;
  return count;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function extractWords(text: string): string[] {
  const Segmenter = segmenter();
  if (Segmenter) {
    const words: string[] = [];
    for (const part of new Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (part.isWordLike) words.push(part.segment);
    }
    return words;
  }
  return text.match(WORD_PATTERN) ?? [];
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  // A sentence ends at . ! ? … (runs of them count once) or at the end of the text.
  const matches = trimmed.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [];
  return matches.filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

export function analyzeText(text: string): TextStats {
  const words = extractWords(text).length;
  const nonEmptyLines = text === "" ? 0 : text.split(/\r\n|\r|\n/).length;
  return {
    characters: countGraphemes(text),
    charactersNoSpaces: countGraphemes(text.replace(/\s/gu, "")),
    words,
    sentences: countSentences(text),
    paragraphs: text.split(/(?:\r?\n){2,}/).filter((block) => block.trim() !== "").length,
    lines: nonEmptyLines,
    bytes: new TextEncoder().encode(text).length,
    readingMinutes: words / 200,
    speakingMinutes: words / 130,
  };
}

/** Most used words (lower-cased), skipping very short ones. */
export function topWords(text: string, limit = 10, minLength = 3): WordFrequency[] {
  const counts = new Map<string, number>();
  for (const word of extractWords(text)) {
    const key = word.toLowerCase();
    if (Array.from(key).length < minLength) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** "3 min", "45 sec", "< 1 sec" style duration from minutes, localised by the caller's labels. */
export function splitDuration(minutes: number): { minutes: number; seconds: number } {
  const total = Math.round(minutes * 60);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
