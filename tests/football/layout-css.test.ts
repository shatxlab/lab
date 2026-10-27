import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../../src/styles/${file}`, import.meta.url), "utf8");
const tower = read("tower.css");

function rule(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

/*
 * A scrolling flex box that centres its child with align-items or justify-content cuts a tall child off at the
 * top, where scrolling can't reach (a menu taller than a phone's screen lost its title and its first buttons).
 * The screens and overlays centre their panel with auto margins instead.
 */
describe("tall panels on the game screens", () => {
  it("scroll without centring through the flex container", () => {
    for (const selector of [".tower-screen", ".tower-overlay"]) {
      const body = rule(tower, selector);
      expect(body, selector).toMatch(/overflow-y:\s*auto/);
      expect(body, `${selector} must not centre with flex`).not.toMatch(/align-items:\s*center/);
      expect(body, `${selector} must not centre with flex`).not.toMatch(/justify-content:\s*center/);
    }
  });

  it("centre the panel with auto margins, so it falls back to the top when it's too tall", () => {
    expect(rule(tower, ".tower-screen > .tower-panel,\n.tower-overlay > .tower-panel")).toMatch(/margin:\s*auto/);
  });

  it("keep the kick-off button in reach on a long menu", () => {
    expect(rule(read("football.css"), ".fb-kickoff")).toMatch(/position:\s*sticky/);
  });
});
