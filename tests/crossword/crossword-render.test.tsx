// @vitest-environment jsdom
import { act } from "react";
import type { ReactElement } from "react";import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { Board } from "@/components/crossword/Board";
import { PuzzlePicker } from "@/components/crossword/PuzzlePicker";
import { buildPuzzle } from "@/lib/crossword/grid";
import { CROSSWORD_PUZZLES } from "@/lib/crossword/puzzles";
import { WALK_PUZZLE, WARMUP_PUZZLE } from "./fixture";
import type { CrosswordSoundEngine } from "@/lib/crossword/sound";

const warmup = buildPuzzle(WARMUP_PUZZLE);
const built = [...CROSSWORD_PUZZLES.en, ...CROSSWORD_PUZZLES.ru].map(buildPuzzle);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sound: CrosswordSoundEngine = {  play: () => undefined,
  setEnabled: () => undefined,
  resume: () => undefined,
  isEnabled: () => true,
};

function boardProps(overrides: Partial<Parameters<typeof Board>[0]> = {}): Parameters<typeof Board>[0] {
  return {
    built: warmup,
    lang: "ru",
    saved: undefined,
    hasNext: true,
    sound,
    soundOn: true,
    onToggleSound: () => undefined,
    onPersist: () => undefined,
    onBack: () => undefined,
    onNext: () => undefined,
    ...overrides,
  };
}

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function mount(node: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

describe("Board", () => {
  it("renders one button per white cell plus the sticky clue", () => {
    const markup = renderToStaticMarkup(<Board {...boardProps()} />);
    expect((markup.match(/data-cell=/g) ?? []).length).toBe(20);
    expect(markup).toContain("Здание, где дети учатся");
    expect(markup).toContain("Подсказка");
    expect(markup).toContain("Проверить");
  });

  it("reveals the active letter with the hint button", () => {
    const host = mount(<Board {...boardProps()} />);
    const hint = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Подсказка"),
    );
    act(() => hint?.click());
    expect(host.querySelector('[data-cell="0:0"]')?.textContent).toContain("Ш");
    expect(host.querySelector(".cw-toast")?.textContent).toContain("Буква подсказана");
  });

  it("accepts a word from the hidden input and celebrates it", () => {
    const host = mount(<Board {...boardProps()} />);
    const input = host.querySelector<HTMLInputElement>(".cw-input");
    expect(input).not.toBeNull();
    act(() => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Школа");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('[data-cell="0:0"]')?.textContent).toContain("Ш");
    expect(host.querySelector('[data-cell="0:4"]')?.textContent).toContain("А");
    expect(host.querySelector(".cw-toast")?.textContent).toContain("Слово отгадано");
  });

  it("shows the clue on top without naming a direction", () => {
    const host = mount(<Board {...boardProps()} />);
    const bar = host.querySelector(".cw-cluebar");
    expect(bar?.textContent).toContain("Здание, где дети учатся");
    expect(bar?.textContent).not.toMatch(/горизонтали|вертикали/i);
    const main = host.querySelector(".cw-main");
    expect(main?.firstElementChild).toBe(bar);
  });

  it("lists across and down clues", () => {
    const markup = renderToStaticMarkup(<Board {...boardProps()} />);
    expect(markup).toContain("По горизонтали");
    expect(markup).toContain("По вертикали");
    expect(markup).toContain("Байкал — самое глубокое в мире");
  });

  it("types the tapped word on its own axis", () => {
    const walk = buildPuzzle(WALK_PUZZLE);
    const host = mount(<Board {...boardProps({ built: walk })} />);
    act(() => host.querySelector<HTMLButtonElement>('[data-cell="3:0"]')?.click());
    const input = host.querySelector<HTMLInputElement>(".cw-input");
    for (const char of "ДОРОГА") {
      act(() => {
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, char);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(host.querySelector('[data-cell="3:0"]')?.textContent).toContain("Д");
    expect(host.querySelector('[data-cell="3:1"]')?.textContent).toContain("О");
    expect(host.querySelector('[data-cell="3:5"]')?.textContent).toContain("А");
    expect(host.querySelector('[data-cell="3:0"]')?.classList.contains("is-solved")).toBe(true);
  });
});

describe("PuzzlePicker", () => {
  it("renders a card per puzzle with progress", () => {
    const ru = built.filter((item) => item.puzzle.lang === "ru");
    const items = ru.map((item) => ({ puzzle: item.puzzle, built: item, progress: undefined }));
    const markup = renderToStaticMarkup(
      <PuzzlePicker items={items} lang="ru" onOpen={() => undefined} />,
    );
    expect((markup.match(/class="cw-card"/g) ?? []).length).toBe(CROSSWORD_PUZZLES.ru.length);
    expect(markup).toContain(CROSSWORD_PUZZLES.ru[0].title);
    expect(markup).toContain(CROSSWORD_PUZZLES.ru[CROSSWORD_PUZZLES.ru.length - 1].title);
  });

  it("renders English strings for English puzzles", () => {
    const en = built.filter((item) => item.puzzle.lang === "en");
    const items = en.map((item) => ({ puzzle: item.puzzle, built: item, progress: undefined }));
    const markup = renderToStaticMarkup(
      <PuzzlePicker items={items} lang="en" onOpen={() => undefined} />,
    );
    expect(markup).toContain("Pick a crossword");
    expect(markup).toContain(CROSSWORD_PUZZLES.en[0].title);
  });

  it("opens the selected puzzle", () => {
    const opened: string[] = [];
    const ru = built.filter((item) => item.puzzle.lang === "ru");
    const items = ru.map((item) => ({ puzzle: item.puzzle, built: item, progress: undefined }));
    const host = mount(
      <PuzzlePicker items={items} lang="ru" onOpen={(id) => opened.push(id)} />,
    );
    const first = host.querySelector<HTMLButtonElement>(".cw-card");
    act(() => first?.click());
    expect(opened).toEqual([CROSSWORD_PUZZLES.ru[0].id]);
  });
});