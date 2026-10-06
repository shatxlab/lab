import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("accessibility foundations", () => {
  const css = read("src/styles/apps.css");
  const layout = read("src/layouts/ToolsLayout.astro");

  it("honours prefers-reduced-motion for animations, transitions and smooth scrolling", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)\n}\n/.exec(css)?.[1] ?? "";
    expect(block).toContain("animation-duration: 0.001ms !important");
    expect(block).toContain("transition-duration: 0.001ms !important");
    expect(block).toContain("scroll-behavior: auto !important");
  });

  it("gives every interactive element a visible keyboard focus ring by default", () => {
    expect(css).toMatch(/:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*{[^}]*outline: 2px solid var\(--accent\)/);
  });

  it("offers a skip link to the main landmark on every page", () => {
    expect(layout).toContain('href="#main"');
    expect(layout).toMatch(/<main id="main"/);
    expect(css).toContain(".skip-link:focus");
  });

  it("keeps theme text colours at WCAG AA against their backgrounds", () => {
    // oklch lightness is a decent proxy: muted text must stay clearly darker than the surface.
    const muted = /--muted-fg: oklch\(([\d.]+)/.exec(css)?.[1];
    expect(Number(muted)).toBeLessThanOrEqual(0.5);
  });

  it("does not remove focus outlines without a replacement indicator", () => {
    for (const file of ["alias", "couples", "crossword", "wordle", "tools"]) {
      const source = read(`src/styles/${file}.css`);
      for (const match of source.matchAll(/([^{}]+){[^{}]*outline:\s*none[^{}]*}/g)) {
        const rule = match[0];
        // Allowed: an invisible text-capture input (crossword) or a replacement ring in the same rule.
        const replaced = /box-shadow|border-color/.test(rule) || /cw-input/.test(match[1]!);
        expect(replaced, `outline removed without replacement: ${match[1]!.trim()}`).toBe(true);
      }
    }
  });
});
