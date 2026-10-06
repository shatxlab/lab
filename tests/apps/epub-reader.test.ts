// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { parseEpubBytes } from "@/lib/apps/epub-reader";

const tinyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0xab, 0x8e, 0x36, 0x89, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function epub(entries: Record<string, string | Uint8Array>): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    zipEntries[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(zipEntries, { level: 0 });
}

const container = (opfPath = "OPS/package.opf") => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

describe("parseEpubBytes", () => {
  it("reads EPUB 3 nav labels in spine order", () => {
    const bytes = epub({
      mimetype: "application/epub+zip",
      "META-INF/container.xml": container(),
      "OPS/package.opf": `<?xml version="1.0"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Nav Book</dc:title>
            <dc:creator>Pat Author</dc:creator>
          </metadata>
          <manifest>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
            <item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/>
            <item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
        </package>`,
      "OPS/nav.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body>
        <nav epub:type="toc"><ol>
          <li><a href="text/two.xhtml">Second label</a></li>
          <li><a href="text/one.xhtml">First label</a></li>
        </ol></nav>
      </body></html>`,
      "OPS/text/one.xhtml": `<html><body><h1>One</h1><p>First chapter text</p></body></html>`,
      "OPS/text/two.xhtml": `<html><body><h1>Two</h1><p>Second chapter text</p></body></html>`,
    });

    const book = parseEpubBytes(bytes);

    expect(book.title).toBe("Nav Book");
    expect(book.author).toBe("Pat Author");
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(["First label", "Second label"]);
    expect(book.chapters.map((chapter) => chapter.href)).toEqual([
      "OPS/text/one.xhtml",
      "OPS/text/two.xhtml",
    ]);
    expect(book.chapters[0]?.html).toContain("First chapter text");
  });

  it("uses EPUB 2 NCX labels when no nav item exists", () => {
    const bytes = epub({
      "META-INF/container.xml": container("OEBPS/content.opf"),
      "OEBPS/content.opf": `<?xml version="1.0"?>
        <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>NCX Book</dc:title></metadata>
          <manifest>
            <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
            <item id="a" href="chapters/a.html" media-type="application/xhtml+xml"/>
            <item id="b" href="chapters/b.html" media-type="text/html"/>
          </manifest>
          <spine toc="toc"><itemref idref="a"/><itemref idref="b"/></spine>
        </package>`,
      "OEBPS/toc.ncx": `<?xml version="1.0"?>
        <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
          <navPoint id="a"><navLabel><text>NCX One</text></navLabel><content src="chapters/a.html#frag"/></navPoint>
          <navPoint id="b"><navLabel><text>NCX Two</text></navLabel><content src="chapters/b.html"/></navPoint>
        </navMap></ncx>`,
      "OEBPS/chapters/a.html": `<html><body><p>Alpha</p></body></html>`,
      "OEBPS/chapters/b.html": `<html><body><p>Beta</p></body></html>`,
    });

    expect(parseEpubBytes(bytes).chapters.map((chapter) => chapter.title)).toEqual([
      "NCX One",
      "NCX Two",
    ]);
  });

  it("rewrites package-relative local raster images to data URLs", () => {
    const bytes = epub({
      "META-INF/container.xml": container(),
      "OPS/package.opf": `<?xml version="1.0"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Image Book</dc:title></metadata>
          <manifest>
            <item id="c1" href="text/chapter.xhtml" media-type="application/xhtml+xml"/>
            <item id="img" href="images/pixel.png" media-type="image/png"/>
          </manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`,
      "OPS/text/chapter.xhtml": `<html><body><p>Image below</p><img alt="pixel" src="../images/pixel.png"/></body></html>`,
      "OPS/images/pixel.png": tinyPng,
    });

    const html = parseEpubBytes(bytes).chapters[0]?.html ?? "";

    expect(html).toContain("src=\"data:image/png;base64,");
    expect(html).not.toContain("../images/pixel.png");
  });

  it("leaves external image URLs non-data so sanitization can remove them", () => {
    const bytes = epub({
      "META-INF/container.xml": container(),
      "OPS/package.opf": `<?xml version="1.0"?>
        <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>External Image Book</dc:title></metadata>
          <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`,
      "OPS/chapter.xhtml": `<html><body><img alt="tracker" src="https://tracker.invalid/pixel.png"/></body></html>`,
    });

    const html = parseEpubBytes(bytes).chapters[0]?.html ?? "";

    expect(html).toContain("https://tracker.invalid/pixel.png");
    expect(html).not.toContain("data:image");
  });

  it("throws a useful error when container.xml is missing", () => {
    expect(() => parseEpubBytes(epub({ mimetype: "application/epub+zip" }))).toThrow(
      /missing META-INF\/container\.xml/i,
    );
  });
});
