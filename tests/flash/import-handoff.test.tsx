// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import FlashApp from "@/components/flash/FlashApp";
import { writeHandoff } from "@/lib/flash/handoff";
import { tf } from "@/lib/flash/i18n";
import { createCard, createDeck, emptyStore } from "@/lib/flash/model";
import { readFlashStore, writeFlashStore } from "@/lib/flash/storage";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const pasteBox = () => document.querySelector<HTMLTextAreaElement>("details textarea")!;
const open = () => {
  const details = [...document.querySelectorAll("details")].find((node) => node.textContent?.includes(tf("en", "importDeckTitle")))!;
  details.open = true;
};
const dialog = () => document.querySelector('[role="dialog"]');

describe("Import a deck on the Flashcards page", () => {
  it("turns pasted JSON into a new deck and opens it", async () => {
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "importDeckTitle")));
    open();
    await type(pasteBox(), JSON.stringify([{ front: "sun", back: "солнце", tags: ["nature"] }, { front: "moon", back: "луна" }]));
    await waitFor(() => expect(text()).toContain(tf("en", "importFound", { n: 2 })));
    const name = [...document.querySelectorAll("details label")].find((l) => l.textContent?.startsWith(tf("en", "importDeckName")))!.querySelector("input")!;
    await type(name, "Space");
    await click(button(tf("en", "importCreate", { n: 2 })));
    await waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("Space"));
    const deck = readFlashStore().decks[0]!;
    expect(deck.name).toBe("Space");
    expect(deck.cards.map((c) => [c.front, c.back, c.tags])).toEqual([["sun", "солнце", ["nature"]], ["moon", "луна", []]]);
    view.unmount();
  });

  it("takes a CSV file and names the deck after it", async () => {
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "importDeckTitle")));
    open();
    const input = document.querySelector<HTMLInputElement>('details input[type="file"]')!;
    expect(input.accept).toContain(".json");
    const file = new File(["front,back\nhola,hello\nadios,bye\n"], "spanish_basics.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(text()).toContain(tf("en", "importFound", { n: 2 })));
    const name = [...document.querySelectorAll("details label")].find((l) => l.textContent?.startsWith(tf("en", "importDeckName")))!.querySelector("input")!;
    expect(name.value).toBe("spanish basics");
    view.unmount();
  });

  it("offers nothing to create when the text holds no cards", async () => {
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "importDeckTitle")));
    open();
    await type(pasteBox(), "just one line with no separator");
    await waitFor(() => expect(text()).toContain(tf("en", "importFound", { n: 0 })));
    expect(button(tf("en", "importCreate", { n: 0 }))!.disabled).toBe(true);
    view.unmount();
  });
});

describe("Send to Flashcards arriving from the workbench", () => {
  it("asks where the cards should go, then creates a deck named after the file", async () => {
    writeHandoff({ name: "capitals.csv", text: "front,back\nParis,France\nRome,Italy\n" });
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog()!.textContent).toContain(tf("en", "importFound", { n: 2 }));
    expect(dialog()!.textContent).toContain("Paris");
    expect(await axeViolations()).toEqual([]);
    await click(button(tf("en", "handoffAdd", { n: 2 })));
    await waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("capitals"));
    expect(readFlashStore().decks[0]!.cards).toHaveLength(2);
    // It was offered once only.
    expect(localStorage.getItem("lab-handoff:flash")).toBeNull();
    view.unmount();
  });

  it("can add the cards to a deck that already exists", async () => {
    const store = emptyStore();
    store.decks = [createDeck("Geography", [createCard({ front: "Oslo", back: "Norway" })])];
    writeFlashStore(store);
    writeHandoff({ name: "more.txt", text: "Paris — France\nRome — Italy" });
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(dialog()).toBeTruthy());
    const select = dialog()!.querySelector("select")!;
    select.value = readFlashStore().decks[0]!.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await click(button(tf("en", "handoffAdd", { n: 2 })));
    await waitFor(() => expect(readFlashStore().decks[0]!.cards).toHaveLength(3));
    expect(readFlashStore().decks).toHaveLength(1);
    view.unmount();
  });

  it("says so when the text holds no cards, and imports nothing", async () => {
    writeHandoff({ name: "essay.txt", text: "A paragraph of prose without any separators at all." });
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(dialog()?.textContent).toContain(tf("en", "handoffNothing")));
    expect(button(tf("en", "handoffAdd", { n: 0 }))).toBeUndefined();
    await click(button("Dismiss") ?? [...document.querySelectorAll("button")].at(-1));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(readFlashStore().decks).toHaveLength(0);
    view.unmount();
  });

  it("ignores a handoff that nobody collected in time", async () => {
    writeHandoff({ name: "old.txt", text: "a — b" }, Date.now() - 11 * 60 * 1000);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "noDecks")));
    expect(dialog()).toBeNull();
    view.unmount();
  });
});
