// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import LangToggle from "@/components/apps/LangToggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-lang");
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-lang");
});

describe("LangToggle", () => {
  it("gives every option the class the stylesheet targets", () => {
    // Regression: the buttons used to lack `lang-toggle-option`, so the
    // active-state rules in apps.css never matched and the toggle looked
    // unstyled.
    const html = renderToStaticMarkup(<LangToggle />);
    expect((html.match(/class="lang-toggle-option"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-lang-option="en"');
    expect(html).toContain('data-lang-option="ru"');
    // The server default marks English active.
    expect(html).toMatch(/class="lang-toggle-option"[^>]*data-lang-option="en"[^>]*data-active="true"/);
  });

  it("reflects the stored language and updates the document on click", () => {
    localStorage.setItem("lab:lang", "ru");
    document.documentElement.dataset.lang = "ru";

    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(<LangToggle />);
    });

    const ru = host.querySelector<HTMLButtonElement>('[data-lang-option="ru"]');
    const en = host.querySelector<HTMLButtonElement>('[data-lang-option="en"]');
    expect(ru?.getAttribute("aria-pressed")).toBe("true");
    expect(ru?.getAttribute("data-active")).toBe("true");
    expect(en?.getAttribute("data-active")).toBe("false");

    act(() => en?.click());

    expect(host.querySelector('[data-lang-option="en"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-lang-option="ru"]')?.getAttribute("data-active")).toBe("false");
    expect(localStorage.getItem("lab:lang")).toBe("en");
    // The attribute the CSS-driven active state keys off must follow too.
    expect(document.documentElement.dataset.lang).toBe("en");
  });
});
