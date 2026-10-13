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
describe("hyperlinks", () => {
  const files = (html: string) => unzipSync(htmlToDocx(html, { title: "T" }));
  const doc = (html: string) => strFromU8(files(html)["word/document.xml"]!);

  it("turns a web link into a Word hyperlink with an external relationship", () => {
    const html = '<p>See <a href="https://example.com/a?x=1&amp;y=2">my site</a> now</p>';
    const out = files(html);
    const xml = strFromU8(out["word/document.xml"]!);
    expect(xml).toContain('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
    expect(xml).toMatch(/<w:hyperlink r:id="rId1"><w:r><w:rPr><w:color w:val="0563C1"\/><w:u w:val="single"\/><\/w:rPr><w:t xml:space="preserve">my site<\/w:t><\/w:r><\/w:hyperlink>/);
    const rels = strFromU8(out["word/_rels/document.xml.rels"]!);
    expect(rels).toContain('Target="https://example.com/a?x=1&amp;y=2"');
    expect(rels).toContain('TargetMode="External"');
    expect(rels).toContain("relationships/hyperlink");
    // The words around it stay ordinary text.
    expect(xml).toContain("See ");
    expect(xml).toContain(" now");
  });

  it("gives each distinct address one relationship, however often it is used", () => {
    const xml = doc('<p><a href="https://a.test/">one</a> <a href="https://b.test/">two</a> <a href="https://a.test/">three</a></p>');
    expect(xml.match(/r:id="rId1"/g)).toHaveLength(2);
    expect(xml.match(/r:id="rId2"/g)).toHaveLength(1);
    const rels = strFromU8(files('<p><a href="https://a.test/">x</a><a href="https://b.test/">y</a></p>')["word/_rels/document.xml.rels"]!);
    expect(rels.match(/<Relationship /g)).toHaveLength(2);
  });

  it("keeps bold inside a link, and merges nothing across different links", () => {
    const xml = doc('<p><a href="https://a.test/"><strong>bold</strong> plain</a><a href="https://b.test/">next</a></p>');
    expect(xml.match(/<w:hyperlink /g)).toHaveLength(2);
    expect(xml).toContain("<w:b/>");
  });

  it("leaves unsafe or relative addresses as plain text", () => {
    for (const href of ["javascript:alert(1)", "mailto:a@b.test", "/relative", "ftp://x.test/", ""]) {
      const out = files(`<p><a href="${href}">label</a></p>`);
      expect(strFromU8(out["word/document.xml"]!)).not.toContain("<w:hyperlink");
      expect(out["word/_rels/document.xml.rels"]).toBeUndefined();
      expect(strFromU8(out["word/document.xml"]!)).toContain(">label<");
    }
  });

  it("writes no relationships file when there are no links, and does not leak links between documents", () => {
    expect(files("<p>plain</p>")["word/_rels/document.xml.rels"]).toBeUndefined();
    files('<p><a href="https://leak.test/">x</a></p>');
    expect(files("<p>plain</p>")["word/_rels/document.xml.rels"]).toBeUndefined();
    const second = strFromU8(files('<p><a href="https://other.test/">x</a></p>')["word/_rels/document.xml.rels"]!);
    expect(second).not.toContain("leak.test");
    expect(second).toContain('Id="rId1"');
  });

  it("stays valid XML", () => {
    const xml = doc('<h1>Name</h1><ul><li><a href="https://a.test/?q=1&amp;r=2">x &amp; y</a></li></ul>');
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
  });
});
