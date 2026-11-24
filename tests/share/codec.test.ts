import { describe, expect, it } from "vitest";

import { decodeShare, encodeFileShare, encodeShare, fileBytesFromShare, generatePassphrase, MAX_SHARE_FRAGMENT_CHARS, shareLink } from "@/lib/share/codec";
import { PASSPHRASE_WORDS, SHARE_WORDS } from "@/lib/share/words";

const pass = "ember-cairn-fjord-glow-quill-moss";

describe("share codec", () => {
  it("round-trips JSON, including non-ASCII text", async () => {
    const data = { n: "Отчёт", rows: [["hola", "привет — hello"], ["a\nb", "c\"d", "tag1 tag2"]] };
    const encoded = await encodeShare("sheet", data, pass);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    await expect(decodeShare(encoded.fragment, pass)).resolves.toEqual({ kind: "sheet", data });
    // The browser hands the fragment over with its leading '#'.
    await expect(decodeShare(`#${encoded.fragment}`, pass)).resolves.toEqual({ kind: "sheet", data });
  });

  it("hides the kind inside the encrypted payload, not the fragment", async () => {
    const encoded = await encodeShare("docx", { x: 1 }, pass);
    expect(encoded.ok && !encoded.fragment.includes("docx")).toBe(true);
  });

  it("produces a url-safe fragment with the KDF parameters in the open", async () => {
    const encoded = await encodeShare("text", "ünïcode & spaces ", pass);
    expect(
      encoded.ok && /^share=1\.pbkdf2-600000\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(encoded.fragment),
    ).toBe(true);
  });

  it("decrypts on another device: same passphrase, different trim", async () => {
    const encoded = await encodeShare("text", "hello", ` ${pass} `);
    expect(encoded.ok).toBe(true);
    await expect(decodeShare(encoded.ok ? encoded.fragment : "", pass)).resolves.toEqual({ kind: "text", data: "hello" });
  });

  it("builds a link on the tool's own page", () => {
    expect(shareLink("https://x.test", "/lab/viewer", "share=1.a.b.c.d")).toBe("https://x.test/lab/viewer/#share=1.a.b.c.d");
    expect(shareLink("https://x.test", "/lab/viewer/", "share=1.a.b.c.d")).toBe("https://x.test/lab/viewer/#share=1.a.b.c.d");
  });

  it("refuses what would not fit a link, and reports the size", async () => {
    // Cryptographically random base64 characters so deflate cannot find patterns.
    let noise = "";
    while (noise.length < 1_200_000) {
      const bytes = crypto.getRandomValues(new Uint8Array(65_536));
      noise += String.fromCharCode(...bytes).replace(/[^A-Za-z0-9]/g, "");
    }
    const text = noise.slice(0, 1_200_000);
    const result = await encodeShare("text", text, pass);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("tooLarge");
    expect(result.size).toBeGreaterThan(MAX_SHARE_FRAGMENT_CHARS);
  });

  it("rejects a bad kind and a bad passphrase before any crypto", async () => {
    expect((await encodeShare("Bad Kind", {}, pass)).ok).toBe(false);
    expect((await encodeShare("", {}, pass)).ok).toBe(false);
    expect((await encodeShare("text", "hello", "")).ok).toBe(false);
    expect((await encodeShare("text", "hello", "   ")).ok).toBe(false);
  });
});

describe("a wrong passphrase is indistinguishable from damage", () => {
  const valid = (async () => {
    const result = await encodeShare("text", "hello", pass);
    if (!result.ok) throw new Error("setup");
    return result.fragment;
  })();

  it("returns null for a wrong passphrase", async () => {
    await expect(decodeShare(await valid, "ember-cairn-fjord-glow-quill-wrong")).resolves.toBeNull();
  });

  it("returns null for a tampered ciphertext (the tag check fails)", async () => {
    // Corrupt the middle of the ciphertext: the last character may hold only
    // unused base64 bits, which would leave the bytes unchanged.
    const tampered = (await valid).replace(/[A-Za-z0-9_-]+$/, (ct) => {
      const at = Math.floor(ct.length / 2);
      return ct.slice(0, at) + (ct[at] === "A" ? "B" : "A") + ct.slice(at + 1);
    });
    await expect(decodeShare(tampered, pass)).resolves.toBeNull();
  });

  it.each([
    ["empty", ""],
    ["unrelated fragment", "#section-2"],
    ["wrong prefix", "other=1.pbkdf2-600000.a.b.c"],
    ["wrong version", "share=9.pbkdf2-600000.a.b.c"],
    ["wrong kdf", "share=1.pbkdf2-1.a.b.c"],
    ["missing parts", "share=1.pbkdf2-600000.a.b"],
    ["extra parts", "share=1.pbkdf2-600000.a.b.c.d"],
    ["not base64url", "share=1.pbkdf2-600000.@@@@.b.c"],
    ["salt of the wrong length", "share=1.pbkdf2-600000.aaaa.b.c"],
  ])("returns null for %s", async (_name, fragment) => {
    await expect(decodeShare(fragment, pass)).resolves.toBeNull();
  });
});

describe("SHARE_WORDS", () => {
  it("is exactly 256 unique words, so one random byte picks without bias", () => {
    expect(SHARE_WORDS).toHaveLength(256);
    expect(new Set(SHARE_WORDS).size).toBe(256);
  });
});

describe("file shares", () => {
  it("round-trips bytes, even non-UTF-8 ones, under the encrypted payload", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(50_000));
    const encoded = await encodeFileShare("Отчёт.docx", bytes, pass);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeShare(encoded.fragment, pass);
    expect(decoded?.kind).toBe("file");
    const back = fileBytesFromShare((decoded!.data as { b: string }).b);
    expect(back).toEqual(bytes);
  });

  it("returns null from a broken or wrong-kind payload", async () => {
    expect(fileBytesFromShare("@@@@")).toBeNull();
    expect(fileBytesFromShare("AAAA")).toBeNull();
  });

  it("refuses a payload that would inflate past the cap", async () => {
    // 5 MiB of zeros deflate to almost nothing.
    const encoded = await encodeFileShare("bomb.bin", new Uint8Array(5 * 1024 * 1024), pass);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeShare(encoded.fragment, pass);
    expect(decoded?.kind).toBe("file");
    expect(fileBytesFromShare((decoded!.data as { b: string }).b)).toBeNull();
  });
});

describe("generatePassphrase", () => {
  it("picks words from the list, joined by dashes", () => {
    const phrase = generatePassphrase();
    const words = phrase.split("-");
    expect(words).toHaveLength(PASSPHRASE_WORDS);
    for (const word of words) expect(SHARE_WORDS).toContain(word);
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i += 1) seen.add(generatePassphrase());
    expect(seen.size).toBe(5);
  });
});
