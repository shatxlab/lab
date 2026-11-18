// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { markdownToHtml, renderMarkdown } from "@/lib/viewer/markdown";

describe("markdownToHtml", () => {
  it("renders a GFM table rather than leaving the pipes as text", () => {
    const html = markdownToHtml(["| Case | Result |", "| --- | --- |", "| Login | Pass |"].join("\n"));

    expect(html).toContain("<table>");
    expect(html).toContain("<th>Case</th>");
    expect(html).toContain("<td>Pass</td>");
  });

  it("renders fenced code blocks with their language class", () => {
    const html = markdownToHtml("```sql\nselect 1;\n```");

    expect(html).toContain('class="language-sql"');
    expect(html).toContain("select 1;");
  });

  it("keeps single newlines as soft wraps so wrapped paragraphs stay paragraphs", () => {
    const html = markdownToHtml("first line\nsecond line");

    expect(html).not.toContain("<br>");
  });
});

describe("renderMarkdown", () => {
  it("strips an inline script", () => {
    const html = renderMarkdown("Before\n\n<script>window.stolen = 1</script>\n\nAfter");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.stolen");
    expect(html).toContain("After");
  });

  it("strips event handler attributes", () => {
    const html = renderMarkdown('<img src="x" onerror="window.stolen = 1">');

    expect(html).not.toContain("onerror");
  });

  it("drops javascript: links but keeps the text", () => {
    const html = renderMarkdown("[click me](javascript:window.stolen=1)");

    expect(html).not.toContain("javascript:");
    expect(html).toContain("click me");
  });

  it("sends external links to a new tab so the open file is not discarded", () => {
    const html = renderMarkdown("[docs](https://example.com/docs)");

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps the formatting that survives sanitizing", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** and `code`.\n\n- one\n- two");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<li>one</li>");
  });
});
