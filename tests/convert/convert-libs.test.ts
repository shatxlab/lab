import { describe, expect, it } from "vitest";

import { convertData, DataError, detectFormat, parseData, stringifyData } from "@/lib/convert/data";
import { base64ToBytes, bytesToBase64, decodeText, encodeText, hexToBytes, utf8 } from "@/lib/convert/encode";
import { digest, hashAll, hmac, md5 } from "@/lib/convert/hash";
import { bytesToHex } from "@/lib/convert/encode";
import { generateUuids, inspectUuid, uuidV4, uuidV7 } from "@/lib/convert/uuid";

const opts = { indent: 2 as const, sortKeys: false };

describe("data conversion", () => {
  it("converts JSON → YAML → TOML → JSON losslessly for plain data", () => {
    const json = '{"name":"lab","version":2,"tags":["a","b"],"nested":{"on":true,"ratio":0.5}}';
    const yaml = convertData("json", "yaml", json, opts);
    expect(yaml).toContain("name: lab");
    expect(yaml).toContain("- a");
    const toml = convertData("yaml", "toml", yaml, opts);
    expect(toml).toContain('name = "lab"');
    expect(toml).toContain("[nested]");
    const back = JSON.parse(convertData("toml", "json", toml, opts));
    expect(back).toEqual(JSON.parse(json));
  });

  it("supports indent, tabs, compact JSON and sorted keys", () => {
    const value = { b: 1, a: { d: 1, c: 2 } };
    expect(stringifyData("json", value, { indent: 0, sortKeys: true })).toBe('{"a":{"c":2,"d":1},"b":1}');
    expect(stringifyData("json", value, { indent: "tab", sortKeys: false })).toContain('\n\t"b": 1');
    expect(stringifyData("json", value, { indent: 4, sortKeys: false })).toContain('\n    "b": 1');
  });

  it("reports readable parse errors with their stage", () => {
    expect(() => parseData("json", "{bad")).toThrow(DataError);
    try {
      parseData("yaml", "a: [1, 2");
    } catch (error) {
      expect((error as DataError).stage).toBe("parse");
    }
    expect(() => parseData("toml", "a = ")).toThrow(DataError);
  });

  it("explains what TOML cannot hold", () => {
    expect(() => stringifyData("toml", [1, 2], opts)).toThrow(/top level/);
    expect(() => stringifyData("toml", { a: { b: null } }, opts)).toThrow(/a\.b/);
  });

  it("parses YAML features: multi-line strings, anchors, comments", () => {
    const value = parseData("yaml", "base: &b\n  x: 1\nuse:\n  <<: *b\n  y: 2 # note\ntext: |\n  line1\n  line2\n");
    expect(value).toEqual({ base: { x: 1 }, use: { x: 1, y: 2 }, text: "line1\nline2\n" });
  });

  it("stops YAML alias bombs", () => {
    const bomb = ["a: &a [x, x, x, x, x, x, x, x, x]", ...Array.from({ length: 12 }, (_, i) => `b${i}: &b${i} [${Array(9).fill(i === 0 ? "*a" : `*b${i - 1}`).join(", ")}]`)].join("\n");
    expect(() => parseData("yaml", bomb)).toThrow(DataError);
  });

  it("detects formats", () => {
    expect(detectFormat('{"a":1}')).toBe("json");
    expect(detectFormat("[1,2]")).toBe("json");
    expect(detectFormat('title = "x"\n[owner]\nname = "y"')).toBe("toml");
    expect(detectFormat("[section]\nkey = 1")).toBe("toml");
    expect(detectFormat("a: 1\nb:\n  - x")).toBe("yaml");
  });
});

describe("encoding", () => {
  it("encodes and decodes Base64 through UTF-8", () => {
    expect(encodeText("base64", "Привет, мир ✓")).toBe("0J/RgNC40LLQtdGCLCDQvNC40YAg4pyT");
    expect(decodeText("base64", "0J/RgNC40LLQtdGCLCDQvNC40YAg4pyT")).toEqual({ kind: "text", text: "Привет, мир ✓" });
  });

  it("handles URL-safe Base64, missing padding and whitespace", () => {
    const bytes = new Uint8Array([251, 255, 254, 1]);
    expect(bytesToBase64(bytes)).toBe("+//+AQ==");
    expect(bytesToBase64(bytes, true)).toBe("-__-AQ");
    expect(Array.from(base64ToBytes("-__-AQ"))).toEqual([251, 255, 254, 1]);
    expect(Array.from(base64ToBytes("-_ _-\nAQ=="))).toEqual([251, 255, 254, 1]);
    expect(() => base64ToBytes("not base64!")).toThrow();
    expect(() => base64ToBytes("A")).toThrow();
  });

  it("returns binary for non-text bytes", () => {
    const result = decodeText("base64", "/+8=");
    expect(result.kind).toBe("binary");
  });

  it("encodes URLs both ways", () => {
    expect(encodeText("urlComponent", "a b&c=д")).toBe("a%20b%26c%3D%D0%B4");
    expect(encodeText("url", "https://x.y/a b?q=д")).toBe("https://x.y/a%20b?q=%D0%B4");
    expect(decodeText("urlComponent", "a+b%20c")).toEqual({ kind: "text", text: "a b c" });
    expect(() => decodeText("url", "%E0%A4%A")).toThrow();
  });

  it("converts hex", () => {
    expect(encodeText("hex", "Hi!")).toBe("48 69 21");
    expect(decodeText("hex", "48 69 21")).toEqual({ kind: "text", text: "Hi!" });
    expect(Array.from(hexToBytes("0xDE:AD-be ef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(() => hexToBytes("abc")).toThrow();
  });
});

describe("hashing", () => {
  it("matches the MD5 test vectors", () => {
    expect(bytesToHex(md5(utf8("")))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(bytesToHex(md5(utf8("abc")))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(bytesToHex(md5(utf8("The quick brown fox jumps over the lazy dog")))).toBe("9e107d9d372bb6826bd81d3542a419d6");
    expect(bytesToHex(md5(utf8("a".repeat(1000))))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
  });

  it("matches SHA test vectors", async () => {
    expect(bytesToHex(await digest("SHA-1", utf8("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(bytesToHex(await digest("SHA-256", utf8("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const rows = await hashAll(utf8("abc"));
    expect(rows.map((row) => row.algorithm)).toEqual(["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"]);
    expect(rows[4]!.hex).toHaveLength(128);
  });

  it("computes HMAC-SHA256 (RFC 4231 case 2)", async () => {
    const mac = await hmac("SHA-256", utf8("Jefe"), utf8("what do ya want for nothing?"));
    expect(bytesToHex(mac)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    const rows = await hashAll(utf8("what do ya want for nothing?"), "Jefe");
    expect(rows.find((row) => row.algorithm === "SHA-256")!.hex).toBe(bytesToHex(mac));
    expect(rows.some((row) => row.algorithm === "MD5")).toBe(false);
  });
});

describe("uuid", () => {
  it("generates valid v4 and v7 UUIDs", () => {
    const v4 = uuidV4();
    expect(v4).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const v7 = uuidV7(1_700_000_000_000);
    expect(v7).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const info = inspectUuid(v7);
    expect(info).toMatchObject({ valid: true, version: 7, variant: "RFC 9562" });
    expect(info.valid && info.timestamp?.getTime()).toBe(1_700_000_000_000);
  });

  it("formats batches and keeps v7 ordered", () => {
    const list = generateUuids({ version: "v7", count: 5, uppercase: false, hyphens: true, braces: false });
    expect(new Set(list).size).toBe(5);
    expect([...list].sort()).toEqual(list);
    const styled = generateUuids({ version: "v4", count: 1, uppercase: true, hyphens: false, braces: true })[0]!;
    expect(styled).toMatch(/^\{[0-9A-F]{32}\}$/);
    expect(generateUuids({ version: "nil", count: 2, uppercase: false, hyphens: true, braces: false })).toEqual([
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(generateUuids({ version: "v4", count: 9999, uppercase: false, hyphens: true, braces: false })).toHaveLength(500);
  });

  it("inspects v1 timestamps and rejects junk", () => {
    const info = inspectUuid("c232ab00-9414-11ec-b3c8-9f6bdeced846");
    expect(info).toMatchObject({ valid: true, version: 1 });
    expect(info.valid && info.timestamp?.toISOString()).toBe("2022-02-22T19:22:22.000Z");
    expect(inspectUuid("not a uuid")).toEqual({ valid: false });
    expect(inspectUuid("00000000-0000-0000-0000-000000000000")).toMatchObject({ valid: true, variant: "nil" });
  });
});
