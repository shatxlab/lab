import { describe, expect, it } from "vitest";
import { deflateSync, strToU8 } from "fflate";

import { MAX_DECODED_BYTES, MAX_FRAGMENT_CHARS, decodeSend, encodeSend, sendLink } from "@/lib/send/codec";

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("send codec", () => {
  it("round-trips JSON, including non-ASCII text", () => {
    const data = { n: "Испанский", c: [["hola", "привет — hello"], ["a\nb", "c\"d", "tag1 tag2"]] };
    const encoded = encodeSend("flashdeck", data);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(decodeSend(encoded.fragment)).toEqual({ kind: "flashdeck", data });
    // The browser hands the fragment over with its leading '#'.
    expect(decodeSend(`#${encoded.fragment}`)?.kind).toBe("flashdeck");
  });

  it("produces a url-safe fragment", () => {
    const encoded = encodeSend("text", "?&=/+ ünïcode ".repeat(20));
    expect(encoded.ok && /^send=1\.text\.[A-Za-z0-9_-]+$/.test(encoded.fragment)).toBe(true);
  });

  it("builds a link on the tool's own page", () => {
    expect(sendLink("https://x.test", "/lab/flash", "send=1.a.b")).toBe("https://x.test/lab/flash/#send=1.a.b");
    expect(sendLink("https://x.test", "/lab/flash/", "send=1.a.b")).toBe("https://x.test/lab/flash/#send=1.a.b");
  });

  it("refuses what would not fit a QR code, and reports the size", () => {
    // Incompressible-ish data so deflate cannot shrink it below the cap.
    let seed = 7;
    const noise = Array.from({ length: 4000 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8).toString(36)).join("");
    const result = encodeSend("text", noise);
    expect(result.ok).toBe(false);
    expect(result.size).toBeGreaterThan(MAX_FRAGMENT_CHARS);
  });

  it("fits a realistic deck of ~80 short cards", () => {
    const cards = Array.from({ length: 80 }, (_, i) => [`word${i} meaning of it`, `the translation number ${i}`]);
    const result = encodeSend("flashdeck", { n: "Vocabulary", c: cards });
    expect(result.ok).toBe(true);
  });

  it("rejects a bad kind when encoding", () => {
    expect(encodeSend("Bad Kind", {}).ok).toBe(false);
    expect(encodeSend("", {}).ok).toBe(false);
  });
});

describe("decodeSend is defensive", () => {
  const valid = (() => {
    const result = encodeSend("text", "hello");
    if (!result.ok) throw new Error("setup");
    return result.fragment;
  })();

  it.each([
    ["empty", ""],
    ["unrelated fragment", "#section-2"],
    ["wrong prefix", "other=1.text.abc"],
    ["wrong version", valid.replace("send=1.", "send=2.")],
    ["missing parts", "send=1.text"],
    ["extra parts", `${valid}.x`],
    ["bad kind", valid.replace(".text.", ".TEXT.")],
    ["not base64url", "send=1.text.@@@@"],
    ["not deflate", `send=1.text.${base64url(strToU8("plain text, not deflated"))}`],
    ["not json", `send=1.text.${base64url(deflateSync(strToU8("{nope")))}`],
  ])("returns null for %s", (_name, fragment) => {
    expect(decodeSend(fragment)).toBeNull();
  });

  it("returns null for an over-long fragment", () => {
    expect(decodeSend(`send=1.text.${"A".repeat(MAX_FRAGMENT_CHARS)}`)).toBeNull();
  });

  it("does not inflate a small payload into a huge one", () => {
    const bomb = deflateSync(strToU8(JSON.stringify("a".repeat(MAX_DECODED_BYTES + 10))), { level: 9 });
    const fragment = `send=1.text.${base64url(bomb)}`;
    expect(fragment.length).toBeLessThan(MAX_FRAGMENT_CHARS);
    expect(decodeSend(fragment)).toBeNull();
  });

  it("does not turn a prototype-polluting payload into anything special", () => {
    const fragment = `send=1.text.${base64url(deflateSync(strToU8('{"__proto__":{"polluted":true}}')))}`;
    const decoded = decodeSend(fragment);
    expect(decoded?.kind).toBe("text");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
