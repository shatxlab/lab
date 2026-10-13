import { describe, expect, it } from "vitest";

import { HISTORY_LIMIT, canRedo, canUndo, commit, createHistory, redo, undo } from "@/lib/board/history";
import { clampZoom, fitView, panBy, toScreen, toWorld, zoomAt } from "@/lib/board/viewport";

describe("history", () => {
  it("undoes and redoes snapshots in order", () => {
    let h = createHistory<string[]>([]);
    h = commit(h, ["a"]);
    h = commit(h, ["a", "b"]);
    expect(h.present).toEqual(["a", "b"]);
    h = undo(h);
    expect(h.present).toEqual(["a"]);
    h = undo(h);
    expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect(h.present).toEqual(["a", "b"]);
    expect(canRedo(h)).toBe(false);
  });

  it("drops the redo branch when something new is done, and ignores a no-op", () => {
    let h = createHistory(0);
    h = commit(commit(h, 1), 2);
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = commit(h, 9);
    expect(canRedo(h)).toBe(false);
    expect(commit(h, 9)).toBe(h);
  });

  it("does nothing at the ends", () => {
    const h = createHistory("x");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("keeps only the most recent snapshots", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
    expect(h.present).toBe(HISTORY_LIMIT + 20);
  });
});

describe("viewport", () => {
  const view = { x: 100, y: 50, zoom: 2 };

  it("converts between world and screen and back", () => {
    expect(toScreen(view, { x: 110, y: 60 })).toEqual({ x: 20, y: 20 });
    expect(toWorld(view, 20, 20)).toEqual({ x: 110, y: 60 });
    const there = toScreen(view, { x: -7.5, y: 33.3 });
    const back = toWorld(view, there.x, there.y);
    expect(back.x).toBeCloseTo(-7.5, 9);
    expect(back.y).toBeCloseTo(33.3, 9);
  });

  it("zooms about a point, keeping that world point under it", () => {
    const before = toWorld(view, 300, 200);
    const zoomed = zoomAt(view, 300, 200, 1.5);
    expect(zoomed.zoom).toBe(3);
    const after = toWorld(zoomed, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("clamps the zoom", () => {
    expect(clampZoom(0.001)).toBe(0.1);
    expect(clampZoom(100)).toBe(8);
    expect(zoomAt({ x: 0, y: 0, zoom: 7 }, 0, 0, 10).zoom).toBe(8);
  });

  it("pans by screen pixels, whatever the zoom", () => {
    expect(panBy(view, 20, -10)).toEqual({ x: 90, y: 55, zoom: 2 });
  });

  it("fits a box into the screen, never past 1:1, and centres it", () => {
    const fit = fitView({ x: 0, y: 0, w: 1000, h: 500 }, 500, 400, 50);
    expect(fit.zoom).toBeCloseTo(0.4, 9);
    // The centre of the box is the centre of the screen.
    const centre = toScreen(fit, { x: 500, y: 250 });
    expect(centre.x).toBeCloseTo(250, 9);
    expect(centre.y).toBeCloseTo(200, 9);
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, 500, 400).zoom).toBe(1);
    expect(fitView(null, 500, 400)).toEqual({ x: -40, y: -40, zoom: 1 });
    expect(fitView({ x: 0, y: 0, w: 10, h: 10 }, 0, 0)).toEqual({ x: -40, y: -40, zoom: 1 });
  });
});
