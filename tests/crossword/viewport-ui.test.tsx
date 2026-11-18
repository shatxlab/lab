// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/crossword/Board";
import { buildPuzzle } from "@/lib/crossword/grid";
import { WARMUP_PUZZLE } from "./fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let resize: (() => void) | undefined;
let width = 336, height = 200;
beforeEach(() => {
  width = 336; height = 200;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("cw-grid-viewport") ? width : 0; });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("cw-grid-viewport") ? height : 0; });
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root?.render(<Board built={buildPuzzle(WARMUP_PUZZLE)} lang="ru" saved={undefined} hasNext={true}
    sound={{play() {}, resume() {}, setEnabled() {}, isEnabled: () => false}} soundOn={false}
    onToggleSound={() => {}} onPersist={() => {}} onBack={() => {}} onNext={() => {}} />));
  return host;
}
function click(host: HTMLElement, selector: string) {
  const el = host.querySelector<HTMLButtonElement>(selector)!; expect(el).not.toBeNull();
  act(() => { el.dispatchEvent(new Event("pointerdown", {bubbles:true})); el.click(); });
}
function type(input: HTMLInputElement, text: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", {bubbles:true})); });
}
describe("readable crossword viewport", () => {
  it("keeps one native input node and keyboard focus through zoom, overview, selection and resize", () => {
    const host = mount(); const input = host.querySelector<HTMLInputElement>(".cw-input")!;
    click(host, '[data-cell="0:0"]'); expect(document.activeElement).toBe(input);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    act(() => host.querySelector(".cw-grid-viewport")!.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    for (const selector of ['[data-zoom="in"]','[data-zoom="out"]','[data-zoom="fit"]']) {
      click(host, selector); expect(document.activeElement).toBe(input); expect(host.querySelector(".cw-input")).toBe(input);
    }
    expect(host.querySelector(".cw-grid-viewport")?.getAttribute("data-view")).toBe("fit");
    click(host, '[data-cell="0:2"]');
    expect(host.querySelector(".cw-grid-viewport")?.getAttribute("data-view")).toBe("readable");
    act(() => { height = 90; width = 300; resize?.(); });
    expect(host.querySelector(".cw-input")).toBe(input); expect(document.activeElement).toBe(input);
    expect(host.querySelector(".cw-grid")?.getAttribute("style")).toContain("--cw-cell-px: 44px");
    type(input, "Ш"); expect(host.querySelectorAll(".cw-input")).toHaveLength(1);
  });
  it("exits overview on typing and clue navigation, but not on viewport resize alone", () => {
    const host = mount(); const input = host.querySelector<HTMLInputElement>(".cw-input")!;
    click(host, '[data-cell="0:0"]'); click(host, '[data-zoom="fit"]');
    act(() => { height = 100; resize?.(); });
    expect(host.querySelector(".cw-grid-viewport")?.getAttribute("data-view")).toBe("fit");
    type(input, "Ш"); expect(host.querySelector(".cw-grid-viewport")?.getAttribute("data-view")).toBe("readable");
    click(host, '[data-zoom="fit"]');
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab",bubbles:true})));
    expect(host.querySelector(".cw-grid-viewport")?.getAttribute("data-view")).toBe("readable");
    expect(host.querySelector(".cw-input")).toBe(input);
  });
  it("does not summon a dismissed native keyboard when adjusting zoom by pointer or keyboard", () => {
    const host = mount(); const input = host.querySelector<HTMLInputElement>(".cw-input")!;
    click(host, '[data-cell="0:0"]'); click(host, '[data-zoom="in"]');
    act(() => input.blur()); click(host, '[data-zoom="out"]');
    expect(document.activeElement).not.toBe(input);
    // A stale pointer-preserve flag must not steal focus from keyboard toolbar users.
    click(host, '[data-cell="0:0"]'); click(host, '[data-zoom="in"]');
    const button = host.querySelector<HTMLButtonElement>('[data-zoom="out"]')!;
    act(() => { input.blur(); button.focus(); button.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter",bubbles:true})); button.click(); });
    expect(document.activeElement).toBe(button);
  });
});
