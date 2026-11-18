import { describe, expect, it } from "vitest";
import { gridMetrics, revealDelta, MIN_CELL, MAX_CELL, READABLE_CELL } from "@/lib/crossword/viewport";

describe("crossword viewport geometry", () => {
  it("uses readable 44px cells regardless of grid size or available space", () => {
    for (const rows of [10, 25, 40]) {
      const m = gridMetrics(rows, 30, 336, 120, READABLE_CELL);
      expect(m.cell).toBe(44);
      expect(m.width).toBe(30 * 44 + 29 * 2);
      expect(m.height).toBe(rows * 44 + (rows - 1) * 2);
    }
  });
  it("fits the entire board including gaps and padding to both available axes", () => {
    for (const [w, h] of [[336, 310], [300, 90], [600, 44], [1000, 700]]) {
      const m = gridMetrics(24, 30, w, h, "fit");
      expect(m.width + m.padding * 2).toBeLessThanOrEqual(w + .001);
      expect(m.height + m.padding * 2).toBeLessThanOrEqual(h + .001);
      expect(m.cell).toBeLessThanOrEqual(READABLE_CELL);
    }
  });
  it("clamps zoom sizes and remains finite before measuring", () => {
    expect(gridMetrics(20, 20, 0, 0, "fit").cell).toBe(1);
    expect(gridMetrics(20, 20, 0, 0, -100).cell).toBe(MIN_CELL);
    expect(gridMetrics(20, 20, 0, 0, 500).cell).toBe(MAX_CELL);
  });
  it("reveals a cell using nearest-edge scrolling, centers oversized cells, and doesn't move visible cells", () => {
    expect(revealDelta(30, 74, 0, 200)).toBe(0);
    expect(revealDelta(-10, 34, 0, 200)).toBe(-18);
    expect(revealDelta(180, 224, 0, 200)).toBe(32);
    expect(revealDelta(100, 168, 0, 50)).toBe(109);
  });
});
