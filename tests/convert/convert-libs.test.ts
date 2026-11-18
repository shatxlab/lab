import { describe, expect, it } from "vitest";

import { convertData, DataError, detectFormat, parseData, stringifyData } from "@/lib/convert/data";

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
