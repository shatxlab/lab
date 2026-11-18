// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { buildDocx } from "./fixtures/docx";
import { textBuffer } from "./fixtures/sheet";
import { renderDocx } from "@/lib/viewer/docx";

describe("renderDocx", () => {
  it("maps Word structure onto HTML the prose styles can target", async () => {
    const { html } = await renderDocx(await buildDocx());

    expect(html).toContain("<h1>Quarterly Report</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td><p>Defects</p></td>");
  });

  it("maps Word's Title style even when the name is localised", async () => {
    const { html, warnings } = await renderDocx(await buildDocx());

    expect(html).toContain("<h1 class=\"doc-title\">Document Title</h1>");
    expect(warnings.join("\n")).not.toMatch(/Title/);
  });

  it("keeps the embedded image as an inline data URI", async () => {
    const { html } = await renderDocx(await buildDocx());

    // Sanitizing must not strip this: `data:` stays allowed for images only,
    // which is the sole way an embedded Word picture can render.
    expect(html).toMatch(/<img[^>]+src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  });

  it("rewrites document hyperlinks to open in a new tab", async () => {
    const { html } = await renderDocx(await buildDocx());

    expect(html).toContain('href="https://example.com/report"');
    expect(html).toContain('target="_blank"');
  });

  it("does not let markup written inside the document become live HTML", async () => {
    const { html } = await renderDocx(await buildDocx());

    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects a file that is not a real .docx", async () => {
    await expect(renderDocx(textBuffer("this is not a zip archive"))).rejects.toThrow();
  });
});
