// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { highlightCodeBlocks } from "@/lib/viewer/highlight";

describe("highlightCodeBlocks", () => {
  it("colourises a fenced block whose language highlight.js knows", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<pre><code class="language-js">const value = 1;</code></pre>`;

    await highlightCodeBlocks(root);

    const code = root.querySelector("code");
    expect(code?.dataset.highlighted).toBe("yes");
    expect(code?.innerHTML).toContain("hljs-keyword");
    expect(code?.textContent).toBe("const value = 1;");
  });

  it("leaves unknown languages alone", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<pre><code class="language-madeup">zzz</code></pre>`;

    await highlightCodeBlocks(root);

    expect(root.querySelector("code")?.dataset.highlighted).toBeUndefined();
    expect(root.querySelector("code")?.textContent).toBe("zzz");
  });
});
