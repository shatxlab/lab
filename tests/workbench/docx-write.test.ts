// @vitest-environment jsdom
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { htmlToDocx } from "@/lib/docx/write";

const decoder = new TextDecoder();

function documentXml(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = files["word/document.xml"];
  if (!entry) throw new Error("word/document.xml missing");
  return decoder.decode(entry);
}

const SAMPLE_HTML = [
  "<h1>Report &amp; notes</h1>",
  "<p>Hello <strong>bold</strong> and <em>italic</em> text.</p>",
  "<ul><li>First item</li><li>Second &lt;item&gt;</li></ul>",
  '<p>See <a href="https://example.com">the link</a>.</p>',
].join("");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("htmlToDocx", () => {
  it("produces the minimal OOXML package", () => {
    const files = unzipSync(htmlToDocx(SAMPLE_HTML, { title: "Report" }));

    expect(files["[Content_Types].xml"]).toBeTruthy();
    expect(files["_rels/.rels"]).toBeTruthy();
    expect(files["word/document.xml"]).toBeTruthy();

    expect(strFromU8(files["[Content_Types].xml"]!)).toContain(
      "wordprocessingml.document.main+xml",
    );
    expect(strFromU8(files["_rels/.rels"]!)).toContain("word/document.xml");
  });

  it("maps blocks and inline formatting into WordprocessingML", () => {
    const xml = documentXml(htmlToDocx(SAMPLE_HTML));

    expect(xml).toContain("<w:body>");
    expect(xml).toContain("<w:p>");
    expect(xml).toContain("<w:t");
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    // Lists keep their text with a literal bullet prefix.
    expect(xml).toContain("\u2022 First item");
    // Links keep only their accessible text.
    expect(xml).toContain("the link");
    expect(xml).not.toContain("example.com");
  });

  it("XML-escapes text", () => {
    const xml = documentXml(htmlToDocx("<p>2 &lt; 3 &amp; 4 &gt; 1</p>"));
    expect(xml).toContain("2 &lt; 3 &amp; 4 &gt; 1");
  });

  it("strips XML-illegal control characters from runs and the title", () => {
    const bytes = htmlToDocx(`<p>a\u0001b\u001Fc</p>`, { title: "t\u0000itle" });
    const files = unzipSync(bytes);
    const document = decoder.decode(files["word/document.xml"]!);
    const core = decoder.decode(files["docProps/core.xml"]!);

    expect(document).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    expect(core).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    expect(document).toContain("abc");
  });

  it("round-trips through mammoth, proving the package is a real .docx", async () => {
    const { convertToHtml } = await import("mammoth/mammoth.browser.min.js");
    const bytes = htmlToDocx("<h1>Round trip</h1><p>Hello mammoth</p>");
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const { value } = await convertToHtml({ arrayBuffer });

    expect(value).toContain("Round trip");
    expect(value).toContain("Hello mammoth");
  });

  it("falls back to tag stripping when DOMParser is unavailable", () => {
    vi.stubGlobal("DOMParser", undefined);

    const bytes = htmlToDocx("<h1>Fallback</h1><p>Still &amp; works</p>");
    expect(bytes.length).toBeGreaterThan(0);

    const xml = documentXml(bytes);
    expect(xml).toContain("<w:body>");
    expect(xml).toContain("Fallback");
    expect(xml).toContain("Still &amp; works");
  });
});