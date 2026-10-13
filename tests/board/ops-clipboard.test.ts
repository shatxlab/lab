// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { BOARD_CLIP_KEY, PASTE_STEP, markPasted, place, readClip, writeClip } from "@/lib/board/clipboard";
import { isLabKey } from "@/lib/apps/backup";
import { BOARD_HANDOFF_KEY, MAX_BOARD_HANDOFF_CHARS, takeBoardHandoff, writeBoardHandoff } from "@/lib/board/handoff";
import { reorder, snapTo } from "@/lib/board/ops";
import type { BoardElement } from "@/lib/board/model";
import { cleanElements, emptyStore, readBoardStore, serializeBoard, parseBoardFile, writeBoardStore } from "@/lib/board/storage";
import { createBoard } from "@/lib/board/model";

afterEach(() => localStorage.clear());

const style = { color: "ink" as const, fill: false, width: 4 };
const rect = (id: string, x = 0, y = 0): BoardElement => ({ id, type: "rect", x, y, w: 100, h: 60, ...style });
const arrow = (id: string, from?: string, to?: string): BoardElement => ({ id, type: "arrow", x1: 0, y1: 0, x2: 50, y2: 50, ...(from ? { from } : {}), ...(to ? { to } : {}), ...style });
const ids = (list: BoardElement[]) => list.map((el) => el.id);
const base = ["a", "b", "c", "d", "e"].map((id) => rect(id));

describe("reorder", () => {
  it("brings to the front and sends to the back, keeping the chosen order among themselves", () => {
    expect(ids(reorder(base, ["b", "d"], "front"))).toEqual(["a", "c", "e", "b", "d"]);
    expect(ids(reorder(base, ["d", "b"], "back"))).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("steps forward and backward past one neighbour that is not chosen", () => {
    expect(ids(reorder(base, ["b"], "forward"))).toEqual(["a", "c", "b", "d", "e"]);
    expect(ids(reorder(base, ["b"], "backward"))).toEqual(["b", "a", "c", "d", "e"]);
    expect(ids(reorder(base, ["b", "c"], "forward"))).toEqual(["a", "d", "b", "c", "e"]);
    expect(ids(reorder(base, ["c", "d"], "backward"))).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("changes nothing when it cannot: already at the end, nothing chosen, unknown ids", () => {
    expect(reorder(base, ["e"], "front")).toBe(base);
    expect(reorder(base, ["e"], "forward")).toBe(base);
    expect(reorder(base, ["a"], "back")).toBe(base);
    expect(reorder(base, ["a"], "backward")).toBe(base);
    expect(reorder(base, [], "front")).toBe(base);
    expect(reorder(base, ["zzz"], "front")).toBe(base);
    expect(reorder(base, ["d", "e"], "front")).toBe(base);
  });

  it("never loses or duplicates an element, and does not touch the input", () => {
    const before = [...base];
    for (const mode of ["front", "back", "forward", "backward"] as const) {
      const out = reorder(base, ["b", "d"], mode);
      expect([...ids(out)].sort()).toEqual(["a", "b", "c", "d", "e"]);
    }
    expect(base).toEqual(before);
  });
});

describe("snapTo", () => {
  it("rounds to the nearest step, and does nothing for no step", () => {
    expect(snapTo(30, 24)).toBe(24);
    expect(snapTo(37, 24)).toBe(48);
    expect(snapTo(-13, 24)).toBe(-24);
    expect(snapTo(0, 24)).toBe(0);
    expect(snapTo(13.7, 0)).toBe(13.7);
  });
});

describe("the whiteboard clipboard", () => {
  const visible = { x: 0, y: 0, w: 800, h: 600 };

  it("holds copied elements, and is not part of the settings backup", () => {
    expect(isLabKey(BOARD_CLIP_KEY)).toBe(false);
    expect(readClip()).toBeNull();
    expect(writeClip([rect("a")], "board-1")).toBe(true);
    const clip = readClip()!;
    expect(ids(clip.elements)).toEqual(["a"]);
    expect(clip).toMatchObject({ source: "board-1", pastes: 0 });
    expect(writeClip([], "board-1")).toBe(false);
  });

  it("survives damaged data", () => {
    localStorage.setItem(BOARD_CLIP_KEY, "{nope");
    expect(readClip()).toBeNull();
    localStorage.setItem(BOARD_CLIP_KEY, JSON.stringify({ elements: [{ type: "bogus" }], source: 1, pastes: -4 }));
    expect(readClip()).toBeNull();
    localStorage.setItem(BOARD_CLIP_KEY, JSON.stringify({ elements: [rect("a")], source: 7, pastes: -4 }));
    expect(readClip()).toMatchObject({ source: "", pastes: 0 });
  });

  it("pastes new elements: fresh ids, same place on another board, a step aside on the same one", () => {
    writeClip([rect("a", 100, 100)], "one");
    const clip = readClip()!;
    const elsewhere = place(clip, "two", visible);
    expect(elsewhere.elements[0]).toMatchObject({ type: "rect", x: 100, y: 100 });
    expect(elsewhere.ids[0]).not.toBe("a");
    const same = place(clip, "one", visible);
    expect(same.elements[0]).toMatchObject({ x: 100 + PASTE_STEP, y: 100 + PASTE_STEP });
  });

  it("steps further with every paste", () => {
    writeClip([rect("a", 10, 10)], "one");
    markPasted(readClip()!);
    markPasted(readClip()!);
    const third = place(readClip()!, "one", visible);
    expect(third.elements[0]).toMatchObject({ x: 10 + 3 * PASTE_STEP });
  });

  it("centres in the view when the copied elements are somewhere else", () => {
    writeClip([rect("a", 5000, 5000)], "one");
    const placed = place(readClip()!, "two", visible).elements[0] as unknown as { x: number; y: number; w: number; h: number };
    expect(placed.x + placed.w / 2).toBeCloseTo(400, 6);
    expect(placed.y + placed.h / 2).toBeCloseTo(300, 6);
  });

  it("keeps arrows attached to their copied shapes, and lets go of shapes that were not copied", () => {
    writeClip([rect("a", 0, 0), rect("b", 300, 0), arrow("x", "a", "b"), arrow("y", "a", "outside")], "one");
    const placed = place(readClip()!, "two", visible);
    const [a, b, x, y] = placed.elements as [BoardElement, BoardElement, Extract<BoardElement, { type: "arrow" }>, Extract<BoardElement, { type: "arrow" }>];
    expect(x).toMatchObject({ from: a.id, to: b.id });
    expect(y.from).toBe(a.id);
    expect(y.to).toBeUndefined();
    expect(new Set([a.id, b.id, x.id, y.id]).size).toBe(4);
  });

  it("keeps the place for Duplicate even when the original is off screen", () => {
    writeClip([rect("a", 5000, 5000)], "one");
    const placed = place(readClip()!, "one", visible, true).elements[0];
    expect(placed).toMatchObject({ x: 5000 + PASTE_STEP });
  });
});

describe("stored arrows", () => {
  it("keeps attachments to shapes that exist, and drops the rest", () => {
    const cleaned = cleanElements([rect("a", 0, 0), rect("b", 300, 0), { ...arrow("x", "a", "b") }, { ...arrow("y", "a", "ghost") }]);
    expect(cleaned[2]).toMatchObject({ from: "a", to: "b", x1: 100, x2: 300 });
    expect((cleaned[3] as Extract<BoardElement, { type: "arrow" }>).to).toBeUndefined();
    expect((cleaned[3] as Extract<BoardElement, { type: "arrow" }>).from).toBe("a");
  });

  it("round-trips through a board file", () => {
    const board = { ...createBoard("Flow"), elements: cleanElements([rect("a", 0, 0), rect("b", 300, 0), arrow("x", "a", "b")]) };
    const parsed = parseBoardFile(serializeBoard(board))!;
    expect(parsed.elements[2]).toMatchObject({ from: "a", to: "b" });
  });

  it("remembers the snap setting", () => {
    expect(emptyStore().snap).toBe(false);
    const board = createBoard("B");
    writeBoardStore({ boards: [board], current: board.id, grid: true, snap: true });
    expect(readBoardStore().snap).toBe(true);
    localStorage.setItem("lab:board:v1", JSON.stringify({ boards: [], snap: "yes" }));
    expect(readBoardStore().snap).toBe(false);
  });
});

describe("board handoff", () => {
  it("is collected once and stays out of the backup", () => {
    expect(isLabKey(BOARD_HANDOFF_KEY)).toBe(false);
    expect(writeBoardHandoff({ name: "plan.json", text: "{}" })).toBe(true);
    expect(takeBoardHandoff()).toEqual({ name: "plan.json", text: "{}" });
    expect(takeBoardHandoff()).toBeNull();
  });

  it("refuses what is too big for browser storage", () => {
    expect(writeBoardHandoff({ name: "x", text: "a".repeat(MAX_BOARD_HANDOFF_CHARS + 1) })).toBe(false);
  });
});
