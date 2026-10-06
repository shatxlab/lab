import { describe, expect, it } from "vitest";

import { checkHardMode, evaluateGuess, keyStates, newGame, pickAnswer, shareText, submitGuess, type GameState } from "@/lib/wordle/game";
import { KEYBOARD_ROWS, letterFromKeyEvent, normalizeLetter } from "@/lib/wordle/layout";
import { defaultStore, readWordleStore, recordResult, WORDLE_STORAGE_KEY, writeWordleStore, type WordleStorage } from "@/lib/wordle/storage";
import { loadValidWords, WORDS } from "@/lib/wordle/words";

const memory = (): WordleStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

describe("guess dictionaries", () => {
  it.each([
    ["en", /^[a-z]{5}$/, 10000],
    ["ru", /^[а-я]{5}$/, 4000],
  ] as const)("%s: a large, well-formed word list that contains every answer", async (lang, shape, minimum) => {
    const valid = await loadValidWords(lang);
    expect(valid.size).toBeGreaterThanOrEqual(minimum);
    expect([...valid].filter((word) => !shape.test(word))).toEqual([]);
    expect(WORDS[lang].filter((word) => !valid.has(word))).toEqual([]);
  });

  it("accepts real words and rejects gibberish", async () => {
    const en = await loadValidWords("en");
    for (const word of ["crane", "slate", "zebra", "queue"]) expect(en.has(word), word).toBe(true);
    for (const word of ["asdfg", "zzzzz", "qwert", "xxxxx"]) expect(en.has(word), word).toBe(false);
    const ru = await loadValidWords("ru");
    for (const word of ["книга", "кошка", "стена", "белый"]) expect(ru.has(word), word).toBe(true);
    for (const word of ["ыыыыы", "йцуке", "ъъъъъ"]) expect(ru.has(word), word).toBe(false);
  });

  it("loads each dictionary once", async () => {
    expect(loadValidWords("en")).toBe(loadValidWords("en"));
  });
});

describe("word lists", () => {
  it.each([
    ["en", /^[a-z]{5}$/],
    ["ru", /^[а-я]{5}$/],
  ] as const)("%s: around a thousand unique five-letter words in the right alphabet", (lang, shape) => {
    const words = WORDS[lang];
    expect(words.length).toBeGreaterThanOrEqual(950);
    expect(words.length).toBeLessThanOrEqual(1200);
    expect(new Set(words).size).toBe(words.length);
    expect(words.filter((word) => !shape.test(word))).toEqual([]);
  });

  it("never uses ё in Russian answers", () => {
    expect(WORDS.ru.some((word) => word.includes("ё"))).toBe(false);
  });
});

describe("evaluateGuess", () => {
  const e = (guess: string, answer: string) => evaluateGuess(guess, answer).map((state) => state[0]).join("");

  it("scores exact, misplaced and missing letters", () => {
    expect(e("crane", "crane")).toBe("ccccc");
    expect(e("slate", "crane")).toBe("aacac");
    expect(e("nacre", "crane")).toBe("ppppc");
  });

  it("uses each answer letter only once for repeated letters", () => {
    // The answer has two L's and one A: the second A in the guess gets nothing.
    expect(evaluateGuess("allay", "label")).toEqual(["present", "present", "present", "absent", "absent"]);
    // One E in the answer, three in the guess, the last one in the right place.
    expect(e("geese", "crane")).toBe("aaaac");
    expect(evaluateGuess("eerie", "creep")).toEqual(["present", "present", "present", "absent", "absent"]);
    expect(evaluateGuess("mamma", "alarm")).toEqual(["present", "present", "absent", "absent", "present"]);
    expect(e("speed", "abide")).toBe("aapap");
    expect(evaluateGuess("llama", "hello")).toEqual(["present", "present", "absent", "absent", "absent"]);
  });

  it("gives green priority over yellow", () => {
    // Answer "creep": the E at position 3 is exact, so the E at position 2 may
    // only claim the other E.
    expect(e("geese", "creep")).toBe("apcaa");
  });

  it("works for Cyrillic", () => {
    expect(evaluateGuess("книга", "кошка")).toEqual(["correct", "absent", "absent", "absent", "correct"]);
  });
});

describe("keyStates", () => {
  it("keeps the best state per letter", () => {
    const states = keyStates(["slate", "crane"], "crane");
    expect(states.c).toBe("correct");
    expect(states.a).toBe("correct");
    expect(states.s).toBe("absent");
    expect(states.e).toBe("correct");
  });
});

describe("hard mode", () => {
  it("requires greens in place and yellows somewhere", () => {
    expect(checkHardMode("crane", [], "crane")).toBeNull();
    // After "crate" vs "crane": c r a are green.
    expect(checkHardMode("clank", ["crate"], "crane")).toEqual({ kind: "position", letter: "r", index: 1 });
    // After "nacre": n a c r e are all yellow/present... must reuse them.
    expect(checkHardMode("steel", ["nacre"], "crane")).toMatchObject({ kind: "position", letter: "e", index: 4 });
    expect(checkHardMode("slate", ["nacre"], "crane")).toMatchObject({ kind: "include", letter: "n" });
    expect(checkHardMode("crane", ["nacre"], "crane")).toBeNull();
  });

  it("counts repeated yellows", () => {
    // "geese" vs "creep": e at index 1 is yellow? e e both present/correct, require two e's.
    const answer = "creep";
    expect(checkHardMode("trend", ["geese"], answer)).toMatchObject({ kind: "include", letter: "e" });
  });
});

describe("submitGuess", () => {
  const start = (answer: string): GameState => ({ answer, guesses: [], status: "playing" });

  it("rejects short guesses and leaves the state alone", () => {
    const state = start("crane");
    expect(submitGuess(state, "cra", { hardMode: false })).toEqual({ state, error: { kind: "short" } });
  });

  it("wins and loses", () => {
    expect(submitGuess(start("crane"), "crane", { hardMode: false }).state.status).toBe("won");
    let state = start("crane");
    for (const guess of ["slate", "pound", "light", "fuzzy", "march", "jumpy"]) state = submitGuess(state, guess, { hardMode: false }).state;
    expect(state.status).toBe("lost");
    expect(submitGuess(state, "crane", { hardMode: false }).state).toBe(state);
  });

  it("enforces hard mode only when enabled", () => {
    const state = submitGuess(start("crane"), "crate", { hardMode: false }).state;
    expect(submitGuess(state, "clank", { hardMode: false }).error).toBeUndefined();
    expect(submitGuess(state, "clank", { hardMode: true }).error).toMatchObject({ kind: "hard-position", letter: "r" });
  });

  it("refuses non-words without using a guess or revealing anything", () => {
    const state = start("crane");
    const outcome = submitGuess(state, "asdfg", { hardMode: false, isWord: (guess) => guess !== "asdfg" });
    expect(outcome).toEqual({ state, error: { kind: "unknown" } });
    expect(outcome.evaluation).toBeUndefined();
    expect(submitGuess(state, "slate", { hardMode: false, isWord: () => true }).state.guesses).toEqual(["slate"]);
  });

  it("checks the dictionary before hard-mode rules, as the original does", () => {
    const after = submitGuess(start("crane"), "crate", { hardMode: false }).state;
    const outcome = submitGuess(after, "zzzzz", { hardMode: true, isWord: () => false });
    expect(outcome.error?.kind).toBe("unknown");
  });
});

describe("answers", () => {
  it("avoids recent words and uses the injected random source", () => {
    const pool = WORDS.en;
    expect(pickAnswer("en", [], () => 0)).toBe(pool[0]);
    expect(pickAnswer("en", [pool[0]!], () => 0)).toBe(pool[1]);
    expect(pickAnswer("en", [...pool], () => 0.999)).toBeTruthy();
    expect(WORDS.ru).toContain(newGame("ru").answer);
  });

  it("builds a spoiler-free share grid", () => {
    const state: GameState = { answer: "crane", guesses: ["slate", "crane"], status: "won" };
    expect(shareText("en", state, { hardMode: true, highContrast: false })).toBe("Wordle EN 2/6*\n\n⬛⬛🟩⬛🟩\n🟩🟩🟩🟩🟩");
    const lost: GameState = { answer: "кошка", guesses: ["книга"], status: "lost" };
    expect(shareText("ru", lost, { hardMode: false, highContrast: true })).toBe("Вордли RU X/6\n\n🟧⬛⬛⬛🟧");
    expect(shareText("en", state, { hardMode: false, highContrast: false })).not.toContain("crane");
  });
});

describe("input handling", () => {
  it("normalises letters, folding ё", () => {
    expect(normalizeLetter("ru", "Ё")).toBe("е");
    expect(normalizeLetter("ru", "a")).toBeNull();
    expect(normalizeLetter("en", "Q")).toBe("q");
    expect(normalizeLetter("en", "ж")).toBeNull();
  });

  it("types Russian by key position when an English layout is active", () => {
    expect(letterFromKeyEvent("ru", { key: "й", code: "KeyQ" })).toBe("й");
    expect(letterFromKeyEvent("ru", { key: "q", code: "KeyQ" })).toBe("й");
    expect(letterFromKeyEvent("ru", { key: "[", code: "BracketLeft" })).toBe("х");
    expect(letterFromKeyEvent("en", { key: "q", code: "KeyQ" })).toBe("q");
    expect(letterFromKeyEvent("en", { key: "й", code: "KeyQ" })).toBe("q");
    expect(letterFromKeyEvent("en", { key: "Enter", code: "Enter" })).toBeNull();
  });

  it("covers every letter of both alphabets on the on-screen keyboard", () => {
    const en = KEYBOARD_ROWS.en.flat().sort().join("");
    expect(en).toBe("abcdefghijklmnopqrstuvwxyz");
    const ru = KEYBOARD_ROWS.ru.flat().sort().join("");
    expect(ru).toBe("абвгдежзийклмнопрстуфхцчшщъыьэюя");
  });
});

describe("storage and stats", () => {
  it("round-trips and sanitises persisted data", () => {
    const storage = memory();
    const store = defaultStore();
    store.games.en = { answer: WORDS.en[3]!, guesses: ["crane"], status: "playing" };
    store.settings.hardMode = true;
    writeWordleStore(store, storage);
    const back = readWordleStore(storage);
    expect(back.games.en?.answer).toBe(WORDS.en[3]);
    expect(back.settings.hardMode).toBe(true);

    storage.data.set(WORDLE_STORAGE_KEY, JSON.stringify({ games: { en: { answer: "zzzzz", guesses: [], status: "won" }, ru: { answer: WORDS.ru[0], guesses: ["abcde"], status: "playing" } }, stats: { en: { played: -5, won: 99, streak: "x" } } }));
    const dirty = readWordleStore(storage);
    expect(dirty.games.en).toBeUndefined();
    expect(dirty.games.ru).toBeUndefined();
    expect(dirty.stats.en).toMatchObject({ played: 0, won: 0, streak: 0 });
    storage.data.set(WORDLE_STORAGE_KEY, "not json");
    expect(readWordleStore(storage)).toEqual(defaultStore());
  });

  it("recomputes status instead of trusting stored values", () => {
    const storage = memory();
    const answer = WORDS.en[10]!;
    storage.data.set(WORDLE_STORAGE_KEY, JSON.stringify({ games: { en: { answer, guesses: ["crane", answer, "slate"], status: "playing" } } }));
    const game = readWordleStore(storage).games.en!;
    expect(game.status).toBe("won");
    expect(game.guesses).toEqual(["crane", answer]);
  });

  it("tracks streaks and the guess distribution", () => {
    let stats = defaultStore().stats.en;
    const won = (n: number): GameState => ({ answer: "crane", guesses: [...Array(n - 1).fill("slate"), "crane"], status: "won" });
    stats = recordResult(stats, won(3));
    stats = recordResult(stats, won(3));
    stats = recordResult(stats, won(6));
    expect(stats).toMatchObject({ played: 3, won: 3, streak: 3, maxStreak: 3 });
    expect(stats.distribution).toEqual([0, 0, 2, 0, 0, 1]);
    stats = recordResult(stats, { answer: "crane", guesses: Array(6).fill("slate"), status: "lost" });
    expect(stats).toMatchObject({ played: 4, won: 3, streak: 0, maxStreak: 3 });
    expect(recordResult(stats, { answer: "crane", guesses: [], status: "playing" })).toBe(stats);
  });
});
