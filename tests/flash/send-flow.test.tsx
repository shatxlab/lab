// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FlashApp from "@/components/flash/FlashApp";
import { tf } from "@/lib/flash/i18n";
import { createCard, createDeck, emptyStore } from "@/lib/flash/model";
import { FLASH_SEND_KIND, parseDeckSend } from "@/lib/flash/send";
import { readFlashStore, writeFlashStore } from "@/lib/flash/storage";
import { decodeSend, encodeSend } from "@/lib/send/codec";
import { ts } from "@/lib/send/i18n";
import { axeViolations, click, mount, waitFor } from "../helpers/dom";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const deckButton = (name: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim().startsWith(name) && node.className.includes("text-left"));

function seed(cards: [string, string][]) {
  const store = emptyStore();
  store.decks = [createDeck("Words", cards.map(([front, back]) => createCard({ front, back })))];
  writeFlashStore(store);
}

function arrive(fragment: string) {
  window.history.replaceState(null, "", `/lab/flash/#${fragment}`);
}

function fragmentFor(name: string, cards: string[][]): string {
  const result = encodeSend(FLASH_SEND_KIND, { n: name, c: cards });
  if (!result.ok) throw new Error("fixture too large");
  return result.fragment;
}

describe("Send to phone — sending a deck", () => {
  it("shows a QR code whose link carries the deck, and reports the size", async () => {
    seed([["hola", "hello"], ["adiós", "bye"]]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const view = await mount(<FlashApp />);
    await waitFor(() => expect(deckButton("Words")).toBeTruthy());
    await click(deckButton("Words"));
    await click(button(ts("en", "button")));

    await waitFor(() => expect(document.querySelector('[role="img"] svg')).toBeTruthy());
    expect(text()).toContain(ts("en", "scanHint"));
    expect(text()).toMatch(/\d+ of 2200 characters/);
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    await click(button(ts("en", "copyLink")));
    const link = new URL(writeText.mock.calls[0]![0] as string);
    expect(link.pathname.endsWith("/flash/")).toBe(true);
    const sent = decodeSend(link.hash);
    expect(sent?.kind).toBe(FLASH_SEND_KIND);
    expect(parseDeckSend(sent!.data)?.cards.map((card) => card.front)).toEqual(["hola", "adiós"]);
    view.unmount();
  });

  it("says so when the deck is too big for a code, instead of drawing one", async () => {
    let seedValue = 11;
    const cards = Array.from({ length: 400 }, (): [string, string] => [
      ((seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff) >> 4).toString(36).repeat(3),
      ((seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff) >> 4).toString(36).repeat(3),
    ]);
    seed(cards);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(deckButton("Words")).toBeTruthy());
    await click(deckButton("Words"));
    await click(button(ts("en", "button")));
    await waitFor(() => expect(text()).toContain(ts("en", "tooLargeTitle")));
    expect(document.querySelector('[role="img"] svg')).toBeNull();
    view.unmount();
  });

  it("offers nothing to send from an empty deck", async () => {
    seed([]);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(deckButton("Words")).toBeTruthy());
    await click(deckButton("Words"));
    expect(button(ts("en", "button"))?.disabled).toBe(true);
    view.unmount();
  });
});

describe("Send to phone — receiving a deck", () => {
  it("previews first, imports on confirmation, opens the deck and clears the link", async () => {
    arrive(fragmentFor("Capitals", [["France", "Paris"], ["Spain", "Madrid", "europe"]]));
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "receiveSummary", { name: "Capitals", n: 2 })));
    // Nothing is added until the user says so.
    expect(readFlashStore().decks).toEqual([]);
    expect(await axeViolations(document.querySelector('[role="dialog"]')!)).toEqual([]);

    await click(button(ts("en", "import")));
    await waitFor(() => expect(readFlashStore().decks).toHaveLength(1));
    const deck = readFlashStore().decks[0]!;
    expect(deck.name).toBe("Capitals");
    expect(deck.cards.map((card) => [card.front, card.back, card.reps])).toEqual([["France", "Paris", 0], ["Spain", "Madrid", 0]]);
    expect(deck.cards[1]!.tags).toEqual(["europe"]);
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("Capitals"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  it("adds nothing and clears the link on dismiss", async () => {
    arrive(fragmentFor("Capitals", [["France", "Paris"]]));
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(button(ts("en", "dismiss"))).toBeTruthy());
    await click(button(ts("en", "dismiss")));
    expect(readFlashStore().decks).toEqual([]);
    expect(window.location.hash).toBe("");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  it("keeps the existing decks when a new one arrives", async () => {
    seed([["a", "b"]]);
    arrive(fragmentFor("Extra", [["x", "y"]]));
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(button(ts("en", "import"))).toBeTruthy());
    await click(button(ts("en", "import")));
    await waitFor(() => expect(readFlashStore().decks.map((deck) => deck.name)).toEqual(["Words", "Extra"]));
    view.unmount();
  });

  it("silently drops a fragment it cannot read", async () => {
    arrive("send=1.flashdeck.@@@not-valid");
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  it("drops a readable fragment with no usable cards", async () => {
    arrive(fragmentFor("Empty", [["only front"]]));
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(readFlashStore().decks).toEqual([]);
    view.unmount();
  });

  it("leaves a fragment meant for another tool alone", async () => {
    const other = encodeSend("text", "hello");
    if (!other.ok) throw new Error("fixture");
    arrive(other.fragment);
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("en", "noDecks")));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.hash).toBe(`#${other.fragment}`);
    view.unmount();
  });

  it("shows the preview in Russian", async () => {
    localStorage.setItem("lab:lang", "ru");
    arrive(fragmentFor("Столицы", [["Франция", "Париж"]]));
    const view = await mount(<FlashApp />);
    await waitFor(() => expect(text()).toContain(tf("ru", "receiveSummary", { name: "Столицы", n: 1 })));
    expect(text()).toContain(ts("ru", "receiveNote"));
    view.unmount();
  });
});
