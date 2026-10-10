import { describe, expect, it, vi } from "vitest";

import { createEditSession, EditSession, type EditFormat } from "@/lib/workbench/editor";

const FORMATS: readonly EditFormat[] = [
  { id: "txt", extension: "txt", mime: "text/plain" },
  { id: "md", extension: "md", mime: "text/markdown" },
];

function textSession(initial = "", historyLimit?: number) {
  return createEditSession<string>({
    initial,
    formats: FORMATS,
    serialize: (value) => value,
    ...(historyLimit !== undefined ? { historyLimit } : {}),
  });
}

describe("EditSession", () => {
  it("is constructed through createEditSession", () => {
    const session = textSession("hello");
    expect(session).toBeInstanceOf(EditSession);
    expect(session.value).toBe("hello");
    expect(session.formats).toBe(FORMATS);
  });

  it("starts clean with no undo or redo", () => {
    const session = textSession("hello");
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
  });

  it("tracks dirty against the initial value", () => {
    const session = textSession("hello");
    session.set("hello world");
    expect(session.dirty).toBe(true);
    session.undo();
    expect(session.dirty).toBe(false);
  });

  it("compares objects with the default deep equality", () => {
    const session = createEditSession<{ a: number; b: number[] }>({
      initial: { a: 1, b: [1, 2] },
      formats: FORMATS,
      serialize: (value) => JSON.stringify(value),
    });
    session.set({ a: 1, b: [1, 2] });
    expect(session.dirty).toBe(false);
    session.set({ a: 1, b: [1, 3] });
    expect(session.dirty).toBe(true);
  });

  it("supports a custom equals function", () => {
    const session = createEditSession<string>({
      initial: "a",
      formats: FORMATS,
      serialize: (value) => value,
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    });
    session.set("A");
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
  });

  it("pushes a new snapshot on set", () => {
    const session = textSession("a");
    session.set("b");
    expect(session.value).toBe("b");
    expect(session.canUndo).toBe(true);
    expect(session.canRedo).toBe(false);
  });

  it("collapses two coalesced sets into one undo step", () => {
    const session = textSession("");
    session.set("a", { coalesce: true });
    session.set("ab", { coalesce: true });
    expect(session.canUndo).toBe(true);
    session.undo();
    expect(session.value).toBe("");
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(true);
  });

  it("keeps a non-coalesced set as a separate undo step", () => {
    const session = textSession("");
    session.set("a");
    session.set("ab", { coalesce: true });
    session.set("abc");
    expect(session.value).toBe("abc");
    session.undo();
    expect(session.value).toBe("ab");
    session.undo();
    expect(session.value).toBe("");
  });

  it("moves a cursor with undo and redo", () => {
    const session = textSession("a");
    session.set("b");
    session.set("c");
    session.undo();
    expect(session.value).toBe("b");
    expect(session.canRedo).toBe(true);
    session.redo();
    expect(session.value).toBe("c");
    session.undo();
    session.undo();
    expect(session.value).toBe("a");
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(true);
  });

  it("drops the redo branch when a new set happens after undo", () => {
    const session = textSession("a");
    session.set("b");
    session.set("c");
    session.undo();
    session.set("d");
    expect(session.value).toBe("d");
    expect(session.canRedo).toBe(false);
    session.undo();
    expect(session.value).toBe("b");
  });

  it("reverts to the initial value and clears history", () => {
    const session = textSession("start");
    session.set("middle");
    session.set("end");
    session.revert();
    expect(session.value).toBe("start");
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
  });

  it("reset makes the next value the new initial and clears history", () => {
    const session = textSession("start");
    session.set("middle");
    session.reset("fresh");
    expect(session.value).toBe("fresh");
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    session.set("fresh!");
    session.undo();
    expect(session.value).toBe("fresh");
    expect(session.dirty).toBe(false);
  });

  it("serializes through the provided callback", () => {
    const serialize = vi.fn((value: string) => `>${value}<`);
    const session = createEditSession<string>({ initial: "draft", formats: FORMATS, serialize });
    expect(session.serialize("txt")).toBe(">draft<");
    expect(serialize).toHaveBeenCalledWith("draft", "txt");
  });

  it("normalizes string output to UTF-8 bytes and names the file", () => {
    const session = textSession("héllo");
    const output = session.output("txt");
    expect(output.bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(output.bytes)).toBe("héllo");
    expect(output.name("report")).toBe("report.txt");
    expect(output.mime).toBe("text/plain");
  });

  it("passes through Uint8Array output unchanged", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const session = createEditSession<number>({
      initial: 0,
      formats: FORMATS,
      serialize: () => bytes,
    });
    const output = session.output("md");
    expect(output.bytes).toBe(bytes);
    expect(output.name("notes")).toBe("notes.md");
    expect(output.mime).toBe("text/markdown");
  });

  it("throws for an unknown format", () => {
    const session = textSession("x");
    expect(() => session.output("nope")).toThrow(/unknown format/);
  });

  it("caps history at historyLimit", () => {
    const session = textSession("0", 3);
    session.set("1");
    session.set("2");
    session.set("3");
    session.set("4");

    session.undo();
    expect(session.value).toBe("3");
    session.undo();
    expect(session.value).toBe("2");
    expect(session.canUndo).toBe(false);
  });
});
