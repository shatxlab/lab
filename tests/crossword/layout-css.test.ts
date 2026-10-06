import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles/crossword.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("crossword grid layout", () => {
  // jsdom has no layout engine, so guard the CSS invariant directly: the hidden
  // input is parked with `grid-area`, and if it stayed in flow every auto-placed
  // cell after the cursor would skip its slot and the whole board would shift.
  it("keeps the hidden input out of grid flow", () => {
    expect(rule(".cw-input")).toMatch(/position:\s*absolute/);
  });

  it("makes the grid the containing block for that input", () => {
    expect(rule(".cw-grid")).toMatch(/position:\s*relative/);
  });

  it("fits the viewport: fixed-height board and a grid sized from both axes", () => {
    expect(rule(".cw-board")).toMatch(/height:\s*calc\(100dvh/);
    expect(rule(".cw-board")).toMatch(/overflow:\s*hidden/);
    expect(rule(".cw-stage")).toMatch(/container-type:\s*size/);
    expect(rule(".cw-grid")).toMatch(/100cqh/);
  });

  it("keeps blocks visibly darker than playable squares in both themes", () => {
    const light = rule(".cw-shell");
    const dark = rule('[data-theme="dark"] .cw-shell');
    const lightness = (block: string, name: string) =>
      Number(new RegExp(`--${name}:\\s*oklch\\(([0-9.]+)`).exec(block)?.[1]);
    for (const theme of [light, dark]) {
      const gap = lightness(theme, "cw-cell") - lightness(theme, "cw-block");
      expect(gap).toBeGreaterThan(0.25);
    }
  });
});
