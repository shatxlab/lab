// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useLangReady } from "@/lib/apps/use-app-lang";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const readyRef = useLangReady<HTMLDivElement>();
  return <div ref={readyRef} data-lang-sensitive="" id="probe" />;
}

describe("language paint guard", () => {
  it("marks the island root as ready only after hydration, not in prerender", () => {
    // Prerender (build-time markup): the ready stamp must be absent so the
    // guard CSS can keep the English prerender invisible.
    const prerendered = renderToStaticMarkup(<Probe />);
    expect(prerendered).toContain('data-lang-sensitive=""');
    expect(prerendered).not.toContain("data-lang-ready");

    // Hydration: the callback ref stamps the root before it paints.
    let root: Root | null = null;
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(<Probe />);
    });
    expect(host.querySelector("#probe")?.hasAttribute("data-lang-ready")).toBe(true);
    act(() => root?.unmount());
    host.remove();
  });
});
