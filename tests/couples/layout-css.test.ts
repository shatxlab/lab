import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles/couples.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("couples layout", () => {
  it("stacks screens in a full-height, non-scrolling shell", () => {
    expect(rule(".cp-shell")).toMatch(/flex:\s*1 1 0/);
    expect(rule(".cp-shell")).toMatch(/min-height:\s*0/);
  });

  it("gives the play screen its own viewport without page scroll", () => {
    const play = rule(".cp-play");
    expect(play).toMatch(/flex:\s*1 1 0/);
    expect(play).toMatch(/min-height:\s*0/);
  });

  it("scrolls the menu, summary and setup fields", () => {
    expect(rule(".cp-menu,\n.cp-summary,\n.cp-setup-scroll")).toMatch(/overflow-y:\s*auto/);
  });

  // The shell is pinned to the dynamic viewport so a bottom browser bar cannot
  // cover the setup footer, and the footer is an in-flow flex child (not a
  // viewport-fixed bar) with a safe-area pad.
  it("keeps the start bar above the browser bar", () => {
    expect(rule("html:has(.cp-shell),\nbody:has(.cp-shell)")).toMatch(/height:\s*100dvh/);
    const footer = rule(".cp-setup-footer");
    expect(footer).toMatch(/flex:\s*0 0 auto/);
    expect(footer).not.toMatch(/position:\s*fixed/);
    expect(footer).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("lays the two answers out as a grid", () => {
    expect(rule(".cp-options")).toMatch(/grid-template-columns/);
  });

  it("keeps the handoff card centred and scrollable on small phones", () => {
    const card = rule(".cp-card,\n.cp-pass");
    expect(card).toMatch(/justify-content:\s*center/);
    expect(card).toMatch(/overflow-y:\s*auto/);
  });

  // On touch screens a bare :hover sticks after a tap, leaving a permanent
  // border on the answer. Every hover effect must therefore be gated behind
  // an actual hover-capable pointer.
  it("gates hover effects behind @media (hover: hover)", () => {
    for (const selector of [".cp-primary:hover", ".cp-secondary:hover", ".cp-theme:hover", ".cp-icon:hover", ".cp-option:hover"]) {
      expect(css).toContain(`@media (hover: hover) {\n  ${selector} {`);
    }
  });
});