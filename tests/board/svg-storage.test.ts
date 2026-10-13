// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { BoardElement } from "@/lib/board/model";
import { createBoard } from "@/lib/board/model";
import {
  BOARD_FILE_FORMAT,
  BOARD_STORAGE_KEY,
  cleanElements,
  emptyStore,
  parseBoardFile,
  readBoardStore,
  serializeBoard,
  writeBoardStore,
  type BoardStorage,
} from "@/lib/board/storage";
import { boardSvg, colorOf, describeElement, penPath, serializeNode } from "@/lib/board/svg";
import { DARK, LIGHT } from "@/lib/charts/palette";

const base = { color: "blue" as const, fill: false, width: 4 };
const sample: BoardElement[] = [
  { id: "1", type: "rect", x: 10, y: 20, w: 100, h: 60, ...base, fill: true },
  { id: "2", type: "ellipse", x: 150, y: 20, w: 80, h: 60, ...base, color: "orange" },
  { id: "3", type: "arrow", x1: 0, y1: 120, x2: 100, y2: 140, ...base, color: "green" },
  { id: "4", type: "pen", points: [0, 200, 20, 210, 40, 200, 60, 215], ...base, color: "violet" },
  { id: "5", type: "text", x: 10, y: 250, text: "Hello\nworld & <you>", size: 24, ...base, color: "ink" },
];

const parse = (svg: string) => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
};

describe("describeElement", () => {
  it("draws each kind in its colour and width, with a wash only when filled", () => {
    const [rect, ellipse, arrow, pen, text] = sample.map((el) => describeElement(el, LIGHT));
    expect(rect).toMatchObject({ tag: "rect", attrs: { x: 10, y: 20, width: 100, height: 60, stroke: LIGHT.series[0], "stroke-width": 4, fill: LIGHT.series[0], "fill-opacity": 0.14 } });
    expect(ellipse).toMatchObject({ tag: "ellipse", attrs: { cx: 190, cy: 50, rx: 40, ry: 30, stroke: LIGHT.series[1], fill: "none" } });
    expect(ellipse!.attrs["fill-opacity"]).toBeUndefined();
    expect(arrow!.tag).toBe("g");
    expect(arrow!.children).toHaveLength(2);
    expect(arrow!.attrs.stroke).toBe(LIGHT.series[2]);
    expect(pen).toMatchObject({ tag: "path", attrs: { fill: "none", stroke: LIGHT.series[6], "stroke-linecap": "round" } });
    expect(text!.tag).toBe("text");
    expect(text!.children!.map((c) => c.text)).toEqual(["Hello", "world & <you>"]);
    expect(text!.attrs.fill).toBe(LIGHT.ink);
  });

  it("resolves colours per theme", () => {
    expect(colorOf(LIGHT, "ink")).toBe(LIGHT.ink);
    expect(colorOf(DARK, "ink")).toBe(DARK.ink);
    expect(colorOf(DARK, "blue")).toBe(DARK.series[0]);
    expect(colorOf(DARK, "red")).toBe(DARK.series[7]);
    expect(colorOf(LIGHT, "violet")).not.toBe(colorOf(DARK, "violet"));
  });

  it("normalises a rectangle drawn backwards", () => {
    const node = describeElement({ id: "x", type: "rect", x: 50, y: 50, w: -20, h: -10, ...base }, LIGHT);
    expect(node.attrs).toMatchObject({ x: 30, y: 40, width: 20, height: 10 });
  });
});

describe("penPath", () => {
  it("makes a dot, a line or a smooth curve", () => {
    expect(penPath([])).toBe("");
    expect(penPath([5, 5])).toContain("M5 5");
    expect(penPath([0, 0, 10, 10])).toBe("M0 0L10 10");
    const curve = penPath([0, 0, 10, 10, 20, 0, 30, 10]);
    expect(curve.startsWith("M0 0")).toBe(true);
    expect(curve).toContain("Q");
    expect(curve.endsWith("L30 10")).toBe(true);
  });
});

describe("boardSvg", () => {
  it("is a well-formed standalone SVG cropped to the content with padding", () => {
    const { svg, width, height } = boardSvg(sample, { palette: LIGHT });
    const doc = parse(svg);
    const root = doc.documentElement;
    expect(root.getAttribute("width")).toBe(String(width));
    expect(root.getAttribute("height")).toBe(String(height));
    expect(doc.querySelectorAll("rect").length).toBe(2); // the background and the rectangle
    expect(doc.querySelector("rect")!.getAttribute("fill")).toBe(LIGHT.surface);
    expect(doc.querySelectorAll("ellipse")).toHaveLength(1);
    expect(doc.querySelectorAll("tspan")).toHaveLength(2);
    // The content is 10..230 wide: the canvas is a little bigger than that, not the whole plane.
    expect(width).toBeGreaterThan(220);
    expect(width).toBeLessThan(330);
    expect(svg).not.toContain("var(--");
  });

  it("escapes text and keeps it out of the markup", () => {
    const { svg } = boardSvg(sample, { palette: LIGHT });
    expect(svg).toContain("world &amp; &lt;you&gt;");
    expect(svg).not.toContain("<you>");
  });

  it("can be transparent, dark, or empty", () => {
    expect(parse(boardSvg(sample, { palette: LIGHT, background: false }).svg).querySelectorAll("rect")).toHaveLength(1);
    expect(boardSvg(sample, { palette: DARK }).svg).toContain(DARK.surface);
    const empty = boardSvg([], { palette: LIGHT });
    expect(parse(empty.svg).documentElement.getAttribute("viewBox")).toBeTruthy();
    expect(empty.width).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(boardSvg(sample, { palette: LIGHT }).svg).toBe(boardSvg(sample, { palette: LIGHT }).svg);
  });

  it("serialises an empty element as self-closing", () => {
    expect(serializeNode({ tag: "line", attrs: { x1: 1 } })).toBe('<line x1="1"/>');
  });
});

describe("cleanElements", () => {
  it("keeps good elements and drops malformed ones", () => {
    const cleaned = cleanElements([
      ...sample,
      null,
      "x",
      { type: "rect", x: "a" },
      { type: "mystery", x: 1 },
      { type: "text", x: 1, y: 1, text: "" },
      { type: "pen", points: [1] },
      { type: "pen", points: [1, "z"] },
    ]);
    expect(cleaned.map((e) => e.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("repairs styles, ids, sizes and extreme numbers", () => {
    const [a, b, c] = cleanElements([
      { id: "same", type: "rect", x: 1e12, y: -1e12, w: -30, h: 20, color: "chartreuse", width: 9999, fill: "yes" },
      { id: "same", type: "ellipse", x: 0, y: 0, w: 5, h: 5 },
      { type: "text", x: 0, y: 0, text: "x".repeat(5000), size: 1 },
    ]);
    expect(a).toMatchObject({ x: 1_000_000, y: -1_000_000, w: 30, h: 20, color: "ink", width: 20, fill: false });
    expect(new Set([a!.id, b!.id]).size).toBe(2);
    expect(c).toMatchObject({ size: 8 });
    expect((c as Extract<BoardElement, { type: "text" }>).text).toHaveLength(2000);
  });

  it("limits the element and stroke point counts, and keeps pen points paired", () => {
    expect(cleanElements(Array.from({ length: 4000 }, (_, i) => ({ id: String(i), type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1 })))).toHaveLength(3000);
    const [p] = cleanElements([{ type: "pen", points: Array.from({ length: 9001 }, (_, i) => i) }]) as Extract<BoardElement, { type: "pen" }>[];
    expect(p!.points.length).toBe(4000);
    const [odd] = cleanElements([{ type: "pen", points: [1, 2, 3] }]) as Extract<BoardElement, { type: "pen" }>[];
    expect(odd!.points).toEqual([1, 2]);
  });

  it("does not trust prototype pollution payloads", () => {
    cleanElements(JSON.parse('[{"__proto__":{"polluted":true},"type":"rect","x":1,"y":1,"w":1,"h":1}]'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("board store", () => {
  const memory = (initial?: unknown): BoardStorage & { value: string | null } => ({
    value: initial === undefined ? null : typeof initial === "string" ? initial : JSON.stringify(initial),
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  });

  it("uses a lab: key so the settings backup covers it", () => {
    expect(BOARD_STORAGE_KEY).toBe("lab:board:v1");
  });

  it("round-trips boards, the current one and the grid setting", () => {
    const board = { ...createBoard("Plan"), elements: sample, updated: 123 };
    const second = createBoard("Ideas");
    const storage = memory();
    writeBoardStore({ boards: [board, second], current: second.id, grid: false }, storage);
    const back = readBoardStore(storage);
    expect(back.boards.map((b) => b.name)).toEqual(["Plan", "Ideas"]);
    expect(back.boards[0]!.elements).toEqual(sample);
    expect(back.current).toBe(second.id);
    expect(back.grid).toBe(false);
  });

  it("starts empty on corrupt data and falls back to the first board when the current one is gone", () => {
    for (const bad of [undefined, "{no", "[1]", "null", 3]) expect(readBoardStore(memory(bad))).toEqual(emptyStore());
    const store = readBoardStore(memory({ boards: [{ id: "a", name: "A", elements: [] }, { id: "b", name: "  ", elements: "no" }], current: "zzz" }));
    expect(store.current).toBe("a");
    expect(store.boards[1]!.name).toBe("Board");
    expect(store.boards[1]!.elements).toEqual([]);
  });

  it("limits the number of boards and repairs a bad view", () => {
    const store = readBoardStore(memory({ boards: Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, elements: [], view: { x: "a", y: 0, zoom: 99 } })) }));
    expect(store.boards).toHaveLength(30);
    expect(store.boards[0]!.view.zoom).toBe(1);
  });

  it("never throws when storage refuses writes", () => {
    expect(() =>
      writeBoardStore(emptyStore(), {
        getItem: () => null,
        setItem() {
          throw new Error("quota");
        },
      }),
    ).not.toThrow();
  });
});

describe("board files", () => {
  it("round-trips through JSON, as plain readable text", () => {
    const board = { ...createBoard("My plan"), elements: sample };
    const text = serializeBoard(board);
    expect(JSON.parse(text)).toMatchObject({ format: BOARD_FILE_FORMAT, version: 1, name: "My plan" });
    const back = parseBoardFile(text)!;
    expect(back.name).toBe("My plan");
    expect(back.elements).toEqual(sample);
    // A new board, not the old one's id.
    expect(back.id).not.toBe(board.id);
  });

  it.each([
    ["not json", "{nope"],
    ["wrong format", JSON.stringify({ format: "other", elements: [] })],
    ["no elements", JSON.stringify({ format: BOARD_FILE_FORMAT })],
    ["an array", "[]"],
    ["a string", '"hello"'],
  ])("rejects %s", (_name, text) => {
    expect(parseBoardFile(text)).toBeNull();
  });

  it("cleans what it reads, and names a nameless board", () => {
    const board = parseBoardFile(JSON.stringify({ format: BOARD_FILE_FORMAT, elements: [{ type: "rect", x: 1, y: 1, w: 5, h: 5 }, { type: "bogus" }] }))!;
    expect(board.name).toBe("Imported board");
    expect(board.elements).toHaveLength(1);
  });

  it("refuses a huge file", () => {
    expect(parseBoardFile(" ".repeat(9 * 1024 * 1024))).toBeNull();
  });
});
