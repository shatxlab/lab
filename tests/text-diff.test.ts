import { describe, expect, it } from "vitest";

import { collapseRows, computeDiff, splitLines, unifiedPatch } from "@/lib/text/diff";

describe("computeDiff", () => {
  it("reports identical texts, even with different line endings", () => {
    const result = computeDiff("a\r\nb\r\n", "a\nb");
    expect(result.identical).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.blocks).toEqual([]);
  });

  it("pairs modified lines and highlights changed words", () => {
    const result = computeDiff("one\nthe quick brown fox\nthree\n", "one\nthe quick red fox\nthree\n");
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    const change = result.rows.find((row) => row.kind === "change")!;
    expect(change.left?.no).toBe(2);
    expect(change.right?.no).toBe(2);
    expect(change.left!.segments.filter((s) => s.changed).map((s) => s.text)).toEqual(["brown"]);
    expect(change.right!.segments.filter((s) => s.changed).map((s) => s.text)).toEqual(["red"]);
  });

  it("handles pure additions and removals with correct line numbers", () => {
    const result = computeDiff("a\nb\nc\n", "a\nc\nd\ne\n");
    const kinds = result.rows.map((row) => row.kind);
    expect(kinds).toContain("remove");
    expect(kinds).toContain("add");
    const removedRow = result.rows.find((row) => row.kind === "remove")!;
    expect(removedRow.left?.segments[0]?.text).toBe("b");
    expect(removedRow.left?.no).toBe(2);
    const lastAdd = result.rows.filter((row) => row.kind === "add").pop()!;
    expect(lastAdd.right?.no).toBe(4);
  });

  it("can ignore whitespace and case", () => {
    expect(computeDiff("Hello   world\n", "hello world\n").identical).toBe(false);
    expect(computeDiff("Hello   world\n", "hello world\n", { ignoreWhitespace: true, ignoreCase: true }).identical).toBe(true);
  });

  it("keeps each side's own wording when ignoring case", () => {
    const result = computeDiff("Hello\nX\n", "HELLO\nY\n", { ignoreCase: true });
    const equal = result.rows.find((row) => row.kind === "equal")!;
    expect(equal.left?.segments[0]?.text).toBe("Hello");
    expect(equal.right?.segments[0]?.text).toBe("HELLO");
  });

  it("marks wholly different lines as fully changed", () => {
    const result = computeDiff("abcdefghij\n", "klmnopqrst\n");
    const change = result.rows[0]!;
    expect(change.left!.segments).toEqual([{ text: "abcdefghij", changed: true }]);
  });

  it("handles empty sides", () => {
    expect(computeDiff("", "a\nb\n").added).toBe(2);
    expect(computeDiff("a\nb\n", "").removed).toBe(2);
    expect(computeDiff("", "").identical).toBe(true);
  });

  it("rejects absurdly large input", () => {
    expect(() => computeDiff("x".repeat(2_000_001), "")).toThrow(/too large/);
  });

  it("records the start of each change block", () => {
    const result = computeDiff("a\nb\nc\nd\ne\n", "a\nB\nc\nd\nE\n");
    expect(result.blocks).toEqual([1, 4]);
  });
});

describe("helpers", () => {
  it("splits lines without a phantom trailing line", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines("\n")).toEqual([""]);
  });

  it("collapses long equal runs but keeps context", () => {
    const base = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const changed = [...base];
    changed[15] = "CHANGED";
    const { rows } = computeDiff(base.join("\n"), changed.join("\n"));
    const chunks = collapseRows(rows, 3);
    const gaps = chunks.filter((c) => c.type === "gap");
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ length: 12 - 0 });
    const opened = collapseRows(rows, 3, new Set([gaps[0]!.start]));
    expect(opened.filter((c) => c.type === "gap")).toHaveLength(1);
  });

  it("produces a unified patch", () => {
    const patch = unifiedPatch("a\nb\n", "a\nc\n", "old.txt", "new.txt");
    expect(patch).toContain("--- old.txt");
    expect(patch).toContain("-b");
    expect(patch).toContain("+c");
  });
});
