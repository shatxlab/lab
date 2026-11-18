import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BRAND, pageTitle } from "@/lib/brand";
import { TOOLS } from "@/lib/apps/tools";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("brand", () => {
  it("has a name, a tagline and a pitch in both languages", () => {
    expect(BRAND.name).toBe("Local Lab");
    for (const lang of ["en", "ru"] as const) {
      expect(BRAND.tagline[lang].length).toBeGreaterThan(10);
      expect(BRAND.pitch[lang].length).toBeGreaterThan(40);
      expect(BRAND.promises[lang]).toHaveLength(BRAND.promises.en.length);
    }
  });

  it("keeps the search snippet within what search engines show", () => {
    expect(BRAND.homeTitle.length).toBeLessThanOrEqual(65);
    expect(BRAND.description.length).toBeLessThanOrEqual(220);
    expect(pageTitle("PDF tools")).toBe("PDF tools | Local Lab");
  });

  it("gives every tool a unique, snippet-sized title and description", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const tool of TOOLS) {
      const title = pageTitle(tool.seo.title);
      expect(title.length, tool.id).toBeLessThanOrEqual(65);
      expect(tool.seo.description.length, tool.id).toBeGreaterThanOrEqual(80);
      expect(tool.seo.description.length, tool.id).toBeLessThanOrEqual(175);
      titles.add(title);
      descriptions.add(tool.seo.description);
    }
    expect(titles.size).toBe(TOOLS.length);
    expect(descriptions.size).toBe(TOOLS.length);
  });

  it("no longer uses the old lightning-bolt mark or bare 'lab' name", () => {
    const favicon = read("assets/favicon.svg");
    expect(favicon).not.toContain("shatxlab-bolt");
    expect(favicon).toContain("clipPath"); // the flask
    expect(favicon).not.toContain("Gradient"); // flat, minimal
    const layout = read("src/layouts/ToolsLayout.astro");
    expect(layout).not.toContain("— lab");
    expect(layout).not.toContain('content="lab"');
  });

  it("ships the generated brand images the metadata points to", () => {
    for (const file of ["assets/og-image.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png", "assets/icons/apple-touch-icon.png"]) {
      expect(existsSync(new URL(`../${file}`, import.meta.url)), file).toBe(true);
    }
    // PNG signature + IHDR dimensions of the social card: 1200×630.
    const png = readFileSync(new URL("../assets/og-image.png", import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("emits a sitemap with every page", async () => {
    const { GET } = await import("../src/pages/sitemap.xml");
    const xml = await (await GET({ site: new URL("https://example.test") } as never)).text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://example.test/</loc>");
    expect((xml.match(/<loc>/g) ?? []).length).toBe(TOOLS.length + 1);
    for (const tool of TOOLS) expect(xml).toContain(`${tool.path}/</loc>`);
  });
});
