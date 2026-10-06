// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WordleGame from "@/components/wordle/WordleGame";
import { defaultStore, readWordleStore, WORDLE_STORAGE_KEY } from "@/lib/wordle/storage";
import { WORDS } from "@/lib/wordle/words";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

const EN_ANSWER = WORDS.en[0]!;
const RU_ANSWER = WORDS.ru[0]!;

function seed(partial: Partial<ReturnType<typeof defaultStore>> = {}) {
  const store = defaultStore();
  store.games.en = { answer: EN_ANSWER, guesses: [], status: "playing" };
  store.games.ru = { answer: RU_ANSWER, guesses: [], status: "playing" };
  localStorage.setItem(WORDLE_STORAGE_KEY, JSON.stringify({ ...store, ...partial }));
}

async function key(key: string, code = `Key${key.toUpperCase()}`) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
  });
}

async function typeWord(word: string) {
  for (const letter of word) await key(letter);
}

const row = (index: number) => document.querySelectorAll('[role="row"]')[index]!;
const rowText = (index: number) => [...row(index).querySelectorAll('[role="gridcell"]')].map((cell) => cell.textContent?.replace(/[✓•]/g, "").trim()).join("");
const toast = () => document.querySelector(".wd-toast")?.textContent;
const button = (label: string) => document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;

beforeEach(() => {
  // Reduced motion makes the reveal instant, which keeps the tests fast.
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("WordleGame", () => {
  it("starts a game, accepts typing, deleting and rejects short guesses", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));

    await typeWord("abc");
    expect(rowText(0)).toBe("ABC");
    await key("Backspace", "Backspace");
    expect(rowText(0)).toBe("AB");
    await key("Enter", "Enter");
    expect(toast()).toBe("Not enough letters");
    await typeWord("cdefg");
    expect(rowText(0)).toBe("ABCDE");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("scores a real word and updates the keyboard", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await typeWord("crane");
    await key("Enter", "Enter");
    await waitFor(() => expect(readWordleStore().games.en?.guesses).toEqual(["crane"]));
    await waitFor(() => expect(button("C, not in the word")).toBeTruthy());
    expect(row(0).querySelectorAll('[data-state="absent"]').length).toBe(4);
    expect(row(0).querySelectorAll('[data-state="present"]').length).toBe(1);
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Guess 1 of 6");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("wins, records statistics and offers sharing", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await typeWord(EN_ANSWER);
    await key("Enter", "Enter");
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("You got it!"), 4000);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Solved in 1 of 6");
    const stats = readWordleStore().stats.en;
    expect(stats).toMatchObject({ played: 1, won: 1, streak: 1 });
    expect(stats.distribution[0]).toBe(1);
    expect(await axeViolations()).toEqual([]);

    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Share result"));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Result copied"));

    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Play again"));
    const game = readWordleStore().games.en!;
    expect(game.guesses).toEqual([]);
    expect(game.status).toBe("playing");
    expect(readWordleStore().recent.en).toContain(EN_ANSWER);
    view.unmount();
  });

  it("shows the answer after six misses", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    for (let i = 0; i < 6; i += 1) {
      await typeWord("crane");
      await key("Enter", "Enter");
      await waitFor(() => expect(readWordleStore().games.en?.guesses.length).toBe(i + 1));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain(`The word was ${EN_ANSWER.toUpperCase()}`), 4000);
    expect(readWordleStore().stats.en).toMatchObject({ played: 1, won: 0, streak: 0 });
    view.unmount();
  });

  it("works with the on-screen keyboard", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    for (const letter of "hello") await click(button(`${letter.toUpperCase()}, unused`));
    expect(rowText(0)).toBe("HELLO");
    await click(button("Delete last letter"));
    expect(rowText(0)).toBe("HELL");
    view.unmount();
  });

  it("plays Russian: Cyrillic keys, and Latin keys by position", async () => {
    localStorage.setItem("lab:lang", "ru");
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Вордли"));
    await key("й", "KeyQ");
    await key("q", "KeyQ"); // English layout active: still the й key
    await key("ё", "Backquote"); // folded to е
    expect(rowText(0)).toBe("ЙЙЕ");
    expect(button("Й, не использована")).toBeTruthy();
    expect(await axeViolations()).toEqual([]);

    // The English game is untouched and independent.
    expect(readWordleStore().games.en?.answer).toBe(EN_ANSWER);
    view.unmount();
  });

  it("enforces hard mode only after it is switched on", async () => {
    // Answer is WORDS.en[0]; guess a word sharing its first letter to get a green.
    seed();
    const answer = EN_ANSWER;
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));

    await click(button("Settings"));
    const hard = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent?.includes("Hard mode"))!;
    await click(hard);
    expect(readWordleStore().settings.hardMode).toBe(true);
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Close"));

    // 
    const first = "adult"; // shares the answer's first letter and last letter, so both turn green
    await typeWord(first);
    await key("Enter", "Enter");
    await waitFor(() => expect(readWordleStore().games.en?.guesses.length).toBe(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await typeWord("crane");
    await key("Enter", "Enter");
    expect(toast()).toContain(`Hard mode: letter 1 must be ${answer[0]!.toUpperCase()}`);
    expect(readWordleStore().games.en?.guesses.length).toBe(1);
    view.unmount();
  });

  it("asks before abandoning a game in progress and counts it as a loss", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await typeWord("crane");
    await key("Enter", "Enter");
    await waitFor(() => expect(readWordleStore().games.en?.guesses.length).toBe(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await click(button("New game"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Start a new game?");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Abandon and start new"));
    expect(readWordleStore().games.en?.guesses).toEqual([]);
    expect(readWordleStore().stats.en).toMatchObject({ played: 1, won: 0 });
    view.unmount();
  });

  it("opens help and statistics dialogs that pass accessibility checks", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await click(button("How to play"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("must be a real word");
    expect(await axeViolations()).toEqual([]);
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Close"));
    await click(button("Statistics"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("No finished games yet");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("WordleGame — word list", () => {
  it("rejects a made-up word without using a guess or giving feedback", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await typeWord("asdfg");
    await key("Enter", "Enter");
    await waitFor(() => expect(toast()).toBe("Not in word list"));
    expect(readWordleStore().games.en?.guesses).toEqual([]);
    expect(row(0).querySelectorAll('[data-state="absent"], [data-state="present"], [data-state="correct"]').length).toBe(0);
    expect(rowText(0)).toBe("ASDFG");
    expect(document.querySelector('button[aria-label^="A, "]')?.getAttribute("data-state")).toBe("unused");

    // The row stays editable: fix it into a real word and it is accepted.
    for (let i = 0; i < 5; i += 1) await key("Backspace", "Backspace");
    await typeWord("crane");
    await key("Enter", "Enter");
    await waitFor(() => expect(readWordleStore().games.en?.guesses).toEqual(["crane"]));
    view.unmount();
  });

  it("applies to Russian too", async () => {
    localStorage.setItem("lab:lang", "ru");
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Вордли"));
    for (const letter of "ыыыыы") await key(letter, "KeyS");
    await key("Enter", "Enter");
    await waitFor(() => expect(toast()).toBe("Нет такого слова"));
    expect(readWordleStore().games.ru?.guesses).toEqual([]);
    view.unmount();
  });
});

describe("WordleGame — Enter key", () => {
  it("submits even when focus sits on a letter key after using the on-screen keyboard", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    for (const letter of "hello") await click(button(`${letter.toUpperCase()}, unused`));
    const focused = button("O, unused");
    focused.focus();
    await act(async () => {
      focused.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    });
    await waitFor(() => expect(readWordleStore().games.en?.guesses).toEqual(["hello"]));
    view.unmount();
  });

  it("leaves Enter alone on the settings controls", async () => {
    seed();
    const view = await mount(<WordleGame />);
    await waitFor(() => expect(document.querySelectorAll('[role="row"]').length).toBe(6));
    await typeWord("crane");
    await click(button("Settings"));
    const close = [...document.querySelectorAll("button")].find((b) => b.textContent === "Close")!;
    close.focus();
    await act(async () => {
      close.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    });
    expect(readWordleStore().games.en?.guesses).toEqual([]);
    view.unmount();
  });
});
