import { describe, expect, it } from "vitest";

import { jsonLines, parseJson, prettifyJson, tokenizePrettyLine } from "@/lib/viewer/json";

describe("parseJson", () => {
  it("parses pretty, minified and nested documents", () => {
    expect(parseJson('{ "a": 1 }')).toEqual({ value: { a: 1 }, warnings: [] });
    expect(parseJson('{"a":[1,2],"b":{"c":null}}')).toEqual({
      value: { a: [1, 2], b: { c: null } },
      warnings: [],
    });
    expect(parseJson("[true, false, null]")).toEqual({ value: [true, false, null], warnings: [] });
  });

  it("reports the failing line and column", () => {
    // The engine points at the offset just after the missing comma on line 3.
    let message = "";
    try {
      parseJson('{\n  "a": 1\n  "b": 2\n}');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("line 3");
    expect(message).toContain("column 3");
  });

  it("throws a plain Error when the engine gives no position at all", () => {
    expect(() => parseJson("[1, 2,")).toThrow(/Invalid JSON/);
  });

  it("warns once per number whose round-trip loses precision", () => {
    const { value, warnings } = parseJson('{"big": 12345678901234567890, "tiny": 42}');
    // Literal is built via Number() so tsc doesn't flag a >2^53 numeric literal; the
    // value is exactly what JSON.parse produces for the same digits.
    expect(value).toEqual({ big: Number("12345678901234567890"), tiny: 42 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("rounded");
    expect(warnings[0]).toContain("12345678901234567890");
  });

  it("flags exponent literals that parse to Infinity", () => {
    const { warnings } = parseJson('{"flood": 1e999}');
    expect(warnings.length).toBe(1);
  });

  it("ignores numbers inside string values and normal numbers", () => {
    const { warnings } = parseJson('{"id": "12345678901234567890", "count": 42, "pi": 3.14}');
    expect(warnings).toEqual([]);
  });

  it("caps the warnings at 5", () => {
    const big = Array.from({ length: 8 }, (_, index) => `1${index}234567890123456789`);
    const { warnings } = parseJson(`[${big.join(",")}]`);
    expect(warnings).toHaveLength(5);
  });
});

describe("prettifyJson", () => {
  it("pretty-prints with two-space indentation and no trailing newline", () => {
    expect(prettifyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("tokenizePrettyLine", () => {
  it("splits a member line into indent, key, value and trailing comma", () => {
    const tokens = tokenizePrettyLine('  "count": 10,');
    expect(tokens).toEqual([
      { type: "indent", text: "  " },
      { type: "key", text: '"count"', name: "count" },
      { type: "punct", text: ":" },
      { type: "punct", text: " " },
      { type: "value", text: "10", kind: "number" },
      { type: "punct", text: "," },
    ]);
  });

  it("round-trips every line exactly, escapes and all", () => {
    const lines = prettifyJson({
      'say "hi"': "back\\slash and\ttab",
      n: 1.5,
      flag: true,
      nothing: null,
      list: [{}, []],
      empty: "",
    }).split("\n");

    for (const line of lines) {
      const tokens = tokenizePrettyLine(line);
      expect(tokens.map((token) => token.text).join("")).toBe(line);
    }
  });

  it("unescapes the key name and keeps the raw literal as its text", () => {
    const tokens = tokenizePrettyLine('  "say \\"hi\\"": "back\\\\slash",');
    const key = tokens.find((token) => token.type === "key")!;
    expect(key.text).toBe('"say \\"hi\\""');
    expect((key as { name: string }).name).toBe('say "hi"');
    const value = tokens.find((token) => token.type === "value")!;
    expect((value as { kind: string }).kind).toBe("string");
  });

  it("classifies literal values and structural lines", () => {
    const kinds = tokenizePrettyLine("    true,").filter((token) => token.type === "value");
    expect(kinds).toEqual([{ type: "value", text: "true", kind: "literal" }]);

    const structural = tokenizePrettyLine("  },");
    expect(structural.map((token) => token.text).join("")).toBe("  },");
  });
});

describe("jsonLines", () => {
  it("renders a minified tree as pretty tokenized lines", () => {
    const { value } = parseJson('{"name":"Ada","tags":["x"],"meta":{}}');
    const lines = jsonLines(value);

    const texts = lines.map((line) => line.tokens.map((token) => token.text).join(""));
    expect(texts).toEqual([
      "{",
      '  "name": "Ada",',
      '  "tags": [',
      '    "x"',
      "  ],",
      '  "meta": {}',
      "}",
    ]);
  });

  it("renders a root scalar document as one tokenized value line", () => {
    expect(jsonLines(42)).toEqual([
      { tokens: [{ type: "value", text: "42", kind: "number" }] },
    ]);
    expect(jsonLines("hi")[0]!.tokens[0]!.type).toBe("value");
  });

  it("pretty-prints nested containers member by member", () => {
    const lines = jsonLines({ users: [{ name: "Ada" }] });
    const texts = lines.map((line) => line.tokens.map((token) => token.text).join(""));
    expect(texts).toEqual([
      "{",
      '  "users": [',
      "    {",
      '      "name": "Ada"',
      "    }",
      "  ]",
      "}",
    ]);
  });
});