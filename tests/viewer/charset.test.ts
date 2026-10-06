// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { decodeMarkupBytes, decodeTextBytes } from "@/lib/viewer/charset";
import { windows1251Buffer } from "./fixtures/sheet";

describe("decodeTextBytes", () => {
  it("keeps UTF-8 including Cyrillic", () => {
    expect(decodeTextBytes(new TextEncoder().encode("Анна,Москва"))).toBe("Анна,Москва");
  });

  it("honours a UTF-8 BOM", () => {
    const body = new TextEncoder().encode("hello");
    const withBom = new Uint8Array(3 + body.length);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(body, 3);
    expect(decodeTextBytes(withBom)).toBe("hello");
  });

  it("decodes windows-1251 when the bytes are not valid UTF-8", () => {
    expect(decodeTextBytes(new Uint8Array(windows1251Buffer("Анна,Москва")))).toBe("Анна,Москва");
  });
});

describe("decodeMarkupBytes", () => {
  it("uses a declared windows-1251 charset", () => {
    const html = `<meta charset=windows-1251><table><tr><td>Анна</td></tr></table>`;
    expect(decodeMarkupBytes(new Uint8Array(windows1251Buffer(html)))).toContain("Анна");
  });
});
