// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import CrosswordGame from "@/components/crossword/CrosswordGame";
import { initialState } from "@/lib/crossword/game";
import { buildPuzzle } from "@/lib/crossword/grid";
import { LEGACY_CROSSWORD_PUZZLES } from "@/lib/crossword/legacy-puzzles";
import { CROSSWORD_PUZZLES } from "@/lib/crossword/puzzles";
import { stringsFor } from "@/lib/crossword/i18n";
import {
  applyStoredProgress, CROSSWORD_STORAGE_KEY, progressFor, readCrosswordState,
  writeCrosswordState, type StoredPuzzleProgress,
} from "@/lib/crossword/storage";
import type { Lang } from "@/lib/crossword/types";

const settings = vi.hoisted(() => ({ lang: "en" as "en" | "ru" }));
vi.mock("@/lib/apps/use-app-lang", () => ({
  useAppLang: () => settings.lang,
  useLangReady: () => ({ current: null }),
}));
vi.mock("@/lib/crossword/sound", () => ({
  createCrosswordSoundEngine: () => ({ resume() {}, setEnabled() {}, play() {}, isEnabled: () => false }),
}));
// Keep catalog/picker/storage real; isolate the board UI owned by the other agent.
vi.mock("@/components/crossword/Board", () => ({
  Board: (props: {
    built: ReturnType<typeof buildPuzzle>;
    saved?: StoredPuzzleProgress;
    onPersist(id: string, progress: StoredPuzzleProgress): void;
    onNext(): void;
    onBack(): void;
  }) => (
    <div data-board-id={props.built.puzzle.id}>
      <output>{JSON.stringify(props.saved ?? null)}</output>
      <button data-next onClick={props.onNext}>Next</button>
      <button data-back onClick={props.onBack}>Back</button>
      <button data-persist onClick={() => props.onPersist(props.built.puzzle.id, {
        values: {}, revealed: [], assistanceCount: 9, elapsed: 99, completed: false,
      })}>Save</button>
    </div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
});
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CrosswordGame />));
  return host;
}
function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  act(() => button!.click());
}
const empty: StoredPuzzleProgress = { values: {}, revealed: [], assistanceCount: 0, elapsed: 0, completed: false };

describe("previous-edition continuity", () => {
  it("keeps shipped IDs/layouts separate from every new catalog ID", () => {
    const legacyIds = new Set<string>();
    const newIds = new Set<string>();
    for (const lang of ["en", "ru"] as const) {
      expect(LEGACY_CROSSWORD_PUZZLES[lang]).toHaveLength(50);
      expect(CROSSWORD_PUZZLES[lang]).toHaveLength(50);
      LEGACY_CROSSWORD_PUZZLES[lang].forEach((puzzle, i) => {
        expect(puzzle.id).toBe(`${lang === "en" ? "en-" : ""}cw-${String(i + 1).padStart(2, "0")}`);
        legacyIds.add(puzzle.id);
        expect(() => buildPuzzle(puzzle)).not.toThrow();
      });
      for (const puzzle of CROSSWORD_PUZZLES[lang]) {
        expect(puzzle.id).toMatch(/cw-v\d+-\d+-[a-f0-9]+$/);
        expect(puzzle.entries.length).toBeGreaterThanOrEqual(10);
        expect(puzzle.entries.length).toBeLessThanOrEqual(50);
        expect(legacyIds.has(puzzle.id)).toBe(false);
        newIds.add(puzzle.id);
      }
    }
    expect(newIds.size).toBe(100);
    expect([...newIds].some((id) => legacyIds.has(id))).toBe(false);
    const first = LEGACY_CROSSWORD_PUZZLES.ru[0];
    expect([first.rows, first.cols]).toEqual([9, 8]);
    expect(first.entries[0]).toMatchObject({ answer: "ОРНАМЕНТ", row: 4, col: 0, dir: "across" });
  });

  it.each(["en", "ru"] as Lang[])("resumes old %s progress without transferring it to a new grid", (lang) => {
    const old = buildPuzzle(LEGACY_CROSSWORD_PUZZLES[lang][0]);
    const current = buildPuzzle(CROSSWORD_PUZZLES[lang][0]);
    const values = Object.fromEntries(old.cells.filter((cell) => !cell.isBlack)
      .map((cell) => [`${cell.row}:${cell.col}`, cell.solution]));
    const progress = { ...empty, values, revealed: [Object.keys(values)[0]], assistanceCount: 4, elapsed: 90, completed: true };
    writeCrosswordState({ [old.puzzle.id]: progress });
    const saved = readCrosswordState();
    expect(applyStoredProgress(initialState(old), progressFor(saved, old))).toMatchObject({
      values, revealed: progress.revealed, assistanceCount: 4, elapsed: 90,
    });
    expect(progressFor(saved, current)).toBeUndefined();
    expect(applyStoredProgress(initialState(current), progressFor(saved, current))).toMatchObject({
      values: {}, revealed: [], assistanceCount: 0, elapsed: 0,
    });
  });

  it.each(["en", "ru"] as Lang[])("shows only saved legacy %s puzzles, persists old IDs, and next stays in the new edition", (lang) => {
    settings.lang = lang;
    const old = LEGACY_CROSSWORD_PUZZLES[lang];
    const current = CROSSWORD_PUZZLES[lang];
    const variants = [
      { values: { "0:0": lang === "en" ? "A" : "А" } },
      { revealed: ["0:0"] }, { assistanceCount: 2 }, { elapsed: 3 }, { completed: true },
    ];
    const saved = Object.fromEntries(variants.map((variant, i) => [old[i].id, { ...empty, ...variant }]));
    saved[old[5].id] = empty;
    writeCrosswordState(saved);
    const host = mount();
    expect(host.querySelectorAll("[data-puzzle-id]")).toHaveLength(55);
    expect(host.querySelector(`[data-puzzle-id="${old[5].id}"]`)).toBeNull();
    expect(host.querySelector(`[data-puzzle-id="${old[6].id}"]`)).toBeNull();
    expect(host.textContent).toContain(stringsFor(lang).editionNotice);
    expect(host.querySelector(`[data-puzzle-id="${old[0].id}"]`)?.textContent).toContain(stringsFor(lang).legacyEdition);
    expect(host.querySelector(`[data-puzzle-id="${current[0].id}"]`)?.getAttribute("data-words"))
      .toBe(String(current[0].entries.length));
    expect(host.querySelector(`[data-puzzle-id="${current[0].id}"]`)?.getAttribute("data-completed")).toBe("false");

    click(host, `[data-puzzle-id="${old[0].id}"]`);
    expect(JSON.parse(host.querySelector("output")!.textContent!)).toEqual(saved[old[0].id]);
    click(host, "[data-persist]");
    const persisted = readCrosswordState();
    expect(persisted[old[0].id]).toEqual({ ...empty, assistanceCount: 9, elapsed: 99 });
    expect(persisted[old[4].id]).toEqual(saved[old[4].id]);
    expect(persisted[current[0].id]).toBeUndefined();
    expect(localStorage.getItem(CROSSWORD_STORAGE_KEY)).not.toBeNull();

    click(host, "[data-next]");
    expect(host.querySelector("[data-board-id]")?.getAttribute("data-board-id")).toBe(current[0].id);
    expect(host.querySelector("output")?.textContent).toBe("null");
    click(host, "[data-next]");
    expect(host.querySelector("[data-board-id]")?.getAttribute("data-board-id")).toBe(current[1].id);
    // Cycling the entire new catalog must never select any previous-edition board.
    for (let i = 1; i < current.length; i++) click(host, "[data-next]");
    expect(host.querySelector("[data-board-id]")?.getAttribute("data-board-id")).toBe(current[0].id);
    click(host, "[data-back]");
    expect(host.querySelectorAll("[data-puzzle-id]")).toHaveLength(55);
  });
});
