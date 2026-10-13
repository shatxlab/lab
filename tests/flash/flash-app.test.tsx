// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import FlashApp from "@/components/flash/FlashApp";
import { tf } from "@/lib/flash/i18n";
import { createCard, createDeck, emptyStore, localDay } from "@/lib/flash/model";
import { FLASH_STORAGE_KEY, readFlashStore, writeFlashStore } from "@/lib/flash/storage";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const text = () => document.body.textContent ?? "";
const buttonWithText = (label: string) =>
  [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === label) as HTMLButtonElement | undefined;
/** The deck row's open button also holds its counts, so match on its start. */
const deckButton = (name: string) =>
  [...document.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith(name) && button.className.includes("text-left")) as
    | HTMLButtonElement
    | undefined;
const field = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector("textarea, input") as
    | HTMLTextAreaElement
    | HTMLInputElement
    | null;

function seed(cards = [["sun", "солнце"], ["moon", "луна"]], newPerDay = 20) {
  const store = emptyStore();
  store.settings.newPerDay = newPerDay;
  store.decks = [createDeck("Words", cards.map(([front, back]) => createCard({ front: front!, back: back! })))];
  writeFlashStore(store);
  return store;
}

const saved = () => readFlashStore();

describe("FlashApp — decks", () => {
  it("starts empty and accessible", async () => {
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "noDecks")));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("creates a deck, adds a card and persists both under lab:flash:v1", async () => {
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(document.querySelector("#fc-new-name")).toBeTruthy());
    await type(document.querySelector<HTMLInputElement>("#fc-new-name"), "Spanish");
    await click(buttonWithText(tf("en", "create")));
    await waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("Spanish"));

    await type(field(tf("en", "front")) as HTMLTextAreaElement, "hola");
    await type(field(tf("en", "back")) as HTMLTextAreaElement, "hello");
    await click(buttonWithText(tf("en", "add")));
    await waitFor(() => expect(text()).toContain("hola"));

    const store = saved();
    expect(store.decks).toHaveLength(1);
    expect(store.decks[0]!.cards[0]).toMatchObject({ front: "hola", back: "hello", reps: 0 });
    expect(localStorage.getItem(FLASH_STORAGE_KEY)).toContain("Spanish");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("imports pasted lines after a preview", async () => {
    seed([]);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain("Words"));
    await click(deckButton("Words"));
    await waitFor(() => expect(field(tf("en", "importPaste"))).toBeTruthy());
    await type(field(tf("en", "importPaste")) as HTMLTextAreaElement, "cat — кошка\ndog - собака\nbroken line");
    await waitFor(() => expect(text()).toContain(tf("en", "importFound", { n: 2 })));
    expect(text()).toContain(tf("en", "importSkipped", { n: 1 }));
    await click(buttonWithText(tf("en", "importAdd", { n: 2 })));
    await waitFor(() => expect(saved().decks[0]!.cards.map((card) => card.front)).toEqual(["cat", "dog"]));
    view.unmount();
  });

  it("deletes a deck only after confirmation", async () => {
    seed();
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(deckButton("Words")).toBeTruthy());
    await click(deckButton("Words"));
    await click(buttonWithText(tf("en", "deleteDeck")));
    expect(text()).toContain(tf("en", "deleteAsk", { name: "Words", n: 2 }));
    await click(buttonWithText(tf("en", "keep")));
    expect(saved().decks).toHaveLength(1);
    await click(buttonWithText(tf("en", "deleteDeck")));
    await click(buttonWithText(tf("en", "deleteYes")));
    await waitFor(() => expect(saved().decks).toHaveLength(0));
    view.unmount();
  });

  it("renders Russian copy when the shared language is Russian", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("ru", "noDecks")));
    expect(text()).toContain("Карточки");
    view.unmount();
  });
});

describe("FlashApp — studying", () => {
  async function openStudy() {
    seed();
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(buttonWithText(tf("en", "study"))).toBeTruthy());
    await click(buttonWithText(tf("en", "study")));
    await waitFor(() => expect(text()).toContain(tf("en", "progress", { n: 1, total: 2 })));
    return view;
  }

  it("reveals the answer, shows the interval on each button and grades the card", async () => {
    const view = await openStudy();
    expect(text()).toContain("sun");
    expect(text()).not.toContain("солнце");
    await click(buttonWithText(tf("en", "showAnswer")));
    expect(text()).toContain("солнце");
    // Golden first-review intervals: 1, 1, 4 and 14 days.
    for (const [key, days] of [["again", 1], ["hard", 1], ["good", 4], ["easy", 14]] as const) {
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.startsWith(tf("en", key)));
      expect(button?.textContent).toContain(tf("en", "days", { n: days }));
    }
    expect(await axeViolations()).toEqual([]);

    await click(buttonWithText(`${tf("en", "good")}${tf("en", "days", { n: 4 })}`));
    const first = saved().decks[0]!.cards.find((card) => card.front === "sun")!;
    expect(first).toMatchObject({ reps: 1, due: localDay() + 4 });
    expect(saved().log[localDay()]).toBe(1);
    await waitFor(() => expect(text()).toContain(tf("en", "progress", { n: 2, total: 2 })));
    view.unmount();
  });

  it("accepts keyboard grades and finishes with a summary and a streak", async () => {
    const view = await openStudy();
    await click(buttonWithText(tf("en", "showAnswer")));
    await press(window, "3");
    await waitFor(() => expect(text()).toContain("moon"));
    await press(window, " ");
    await waitFor(() => expect(text()).toContain("луна"));
    await press(window, "4");
    await waitFor(() => expect(text()).toContain(tf("en", "doneTitle")));
    expect(text()).toContain(tf("en", "doneBody", { n: 2 }));
    expect(await axeViolations()).toEqual([]);

    await click(buttonWithText(tf("en", "done")));
    await click(buttonWithText(tf("en", "backToDecks").replace(/^/, "← ")));
    await waitFor(() => expect(text()).toContain(tf("en", "statStreak")));
    expect(document.querySelector("dl")?.textContent).toContain("1");
    view.unmount();
  });

  it("brings a failed card back a few cards later, scheduling it only once", async () => {
    const view = await openStudy();
    await click(buttonWithText(tf("en", "showAnswer")));
    await press(window, "1");
    await waitFor(() => expect(text()).toContain(tf("en", "progress", { n: 2, total: 3 })));
    const afterAgain = saved().decks[0]!.cards.find((card) => card.front === "sun")!;
    expect(afterAgain).toMatchObject({ reps: 1, due: localDay() + 1 });

    // moon: good, then sun returns with pass/fail buttons only.
    await click(buttonWithText(tf("en", "showAnswer")));
    await press(window, "3");
    await waitFor(() => expect(text()).toContain("sun"));
    await click(buttonWithText(tf("en", "showAnswer")));
    expect(buttonWithText(tf("en", "gotIt"))).toBeTruthy();
    await press(window, "2");
    await waitFor(() => expect(text()).toContain(tf("en", "doneTitle")));
    expect(saved().decks[0]!.cards.find((card) => card.front === "sun")).toMatchObject({ reps: 1 });
    expect(text()).toContain(tf("en", "doneBody", { n: 2 }));
    view.unmount();
  });

  it("crams without touching the schedule", async () => {
    seed();
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(deckButton("Words")).toBeTruthy());
    await click(deckButton("Words"));
    await click(buttonWithText(tf("en", "cram")));
    await waitFor(() => expect(text()).toContain(tf("en", "cramNote")));
    for (let i = 0; i < 2; i += 1) {
      await click(buttonWithText(tf("en", "showAnswer")));
      await click(buttonWithText(tf("en", "gotIt")));
    }
    await waitFor(() => expect(text()).toContain(tf("en", "doneTitle")));
    const store = saved();
    expect(store.decks[0]!.cards.every((card) => card.reps === 0)).toBe(true);
    expect(store.log).toEqual({});
    view.unmount();
  });

  it("limits a session to the daily new-card allowance", async () => {
    seed([["a", "1"], ["b", "2"], ["c", "3"]], 2);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(buttonWithText(tf("en", "study"))).toBeTruthy());
    await click(buttonWithText(tf("en", "study")));
    await waitFor(() => expect(text()).toContain(tf("en", "progress", { n: 1, total: 2 })));
    view.unmount();
  });
});
