// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";

function fragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

describe("sanitizeDocumentHtml", () => {
  it.each([
    '<img srcset="https://tracker.example/a 1x, /b 2x">',
    '<picture><source srcset="//tracker.example/a"><img src="/b"></picture>',
    '<svg><image href="https://tracker.example/a" /></svg>',
    '<svg><image xlink:href="//tracker.example/a" /></svg>',
    '<video src="/movie" poster="https://tracker.example/poster"><source src="/source"><track src="/track"></video>',
    '<audio autoplay src="https://tracker.example/audio"><source src="/source"></audio>',
    '<link rel="stylesheet" href="https://tracker.example/style">',
    '<link rel="preload" as="image" href="https://tracker.example/preload">',
    '<table background="https://tracker.example/a"><tr><td background="/b">Cell</td></tr></table>',
    '<a href="https://example.com" ping="https://tracker.example/ping" attributionsrc="/attribution">Link</a>',
    '<div style="background-image:url(https://tracker.example/a)">Text</div><style>@import "/style";</style>',
    '<iframe src="/frame"></iframe><object data="/object"></object><embed src="/embed">',
    '<meta http-equiv="refresh" content="0;url=https://tracker.example"><base href="https://tracker.example">',
    '<form action="/submit"><input type="image" src="/image"><button formaction="/submit">Send</button></form>',
  ])("removes automatic resource surfaces: %s", (html) => {
    const result = fragment(sanitizeDocumentHtml(html));
    expect(result.querySelector("svg, math, picture, source, video, audio, track, link, style, iframe, object, embed, meta, base, form, input, button")).toBeNull();
    expect(result.querySelector("[src], [srcset], [poster], [background], [ping], [attributionsrc], [style], [action], [formaction], [data]")).toBeNull();
  });

  it("preserves document formatting, links and table semantics", () => {
    const result = fragment(sanitizeDocumentHtml(`
      <h2 id="section">Heading</h2><p><strong>Bold</strong> <em>Italic</em> <s>Deleted</s><br><sup>2</sup></p>
      <ol start="3"><li>Item</li></ol><blockquote>Quote</blockquote><pre><code class="language-js">let x;</code></pre>
      <a href="https://example.com/report" target="_self" rel="opener">Report</a><a href="#section">Section</a>
      <table><caption>Results</caption><colgroup><col span="2"></colgroup><thead><tr><th scope="col" colspan="2">Header</th></tr></thead>
      <tbody><tr><td rowspan="2">Merged</td><td>One</td></tr><tr><td>Two</td></tr></tbody><tfoot><tr><td colspan="2">Total</td></tr></tfoot></table>
    `));
    expect(result.querySelector("h2")?.id).toBe("section");
    for (const tag of ["strong", "em", "s", "br", "sup", "li", "blockquote", "pre", "colgroup", "thead", "tbody", "tfoot"]) {
      expect(result.querySelector(tag)).not.toBeNull();
    }
    expect(result.querySelector("ol")?.start).toBe(3);
    expect(result.querySelector("code")?.className).toBe("language-js");
    expect(result.querySelector("caption")?.textContent).toBe("Results");
    expect(result.querySelector("th")?.colSpan).toBe(2);
    expect(result.querySelector("th")?.scope).toBe("col");
    expect(result.querySelector("td")?.rowSpan).toBe(2);
    expect([...result.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(["https://example.com/report", "#section"]);
    for (const link of result.querySelectorAll("a")) {
      expect(link.target).toBe("_blank");
      expect(link.relList.contains("noopener")).toBe(true);
      expect(link.relList.contains("noreferrer")).toBe(true);
    }
  });

  it("strips executable markup and non-policy attributes", () => {
    const result = fragment(sanitizeDocumentHtml('<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">Link</a><img src="data:image/png;base64,AAAA" onerror="alert(1)" data-fetch="/tracker"><div is="fetch-widget">Text</div>'));
    expect(result.querySelector("script, [onclick], [onerror], [data-fetch], a[href]")).toBeNull();
    // DOMPurify may retain an empty `is` to prevent custom-element upgrades.
    expect(result.querySelector("div")?.getAttribute("is") || "").toBe("");
  });

  it.each([
    "https://tracker.example/pixel.png",
    "http://tracker.example/pixel.png",
    "//tracker.example/pixel.png",
    "/pixel.png",
    "pixel.png",
    "../pixel.png",
    "",
    "blob:https://viewer.example/id",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    "data:text/html;base64,PGltZz4=",
    "data:image/png;unexpected=value;base64,AAAA",
  ])("removes image sources outside the embedded raster subset: %s", (src) => {
    const result = fragment(sanitizeDocumentHtml(`<img src="${src}" alt="Picture">`));
    expect(result.querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(result.querySelector("img")?.getAttribute("alt")).toBe("Picture");
  });

  it.each(["png", "jpeg", "gif", "webp", "avif", "bmp", "x-icon"])(
    "keeps embedded %s raster image data",
    (mime) => {
      const src = `data:image/${mime};base64,AAAA`;
      const result = fragment(sanitizeDocumentHtml(`<img src="${src}" alt="Embedded">`));
      expect(result.querySelector("img")?.getAttribute("src")).toBe(src);
    },
  );
});
