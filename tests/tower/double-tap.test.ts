import { describe, expect, it } from "vitest";

import { createTapTracker, DOUBLE_TAP, pressEnd, pressStart } from "@/lib/tower/double-tap";

/** A quick tap by one finger: down at `time`, up 80 ms later. */
function tap(tracker: ReturnType<typeof createTapTracker>, time: number, x = 100, y = 100, id = 1): boolean {
  const doubled = pressStart(tracker, id, time, x, y);
  pressEnd(tracker, id, time + 80, x, y);
  return doubled;
}

describe("double tap", () => {
  it("fires on a second quick press near the first", () => {
    const tracker = createTapTracker();
    expect(tap(tracker, 0)).toBe(false);
    expect(pressStart(tracker, 1, 200, 110, 95)).toBe(true);
  });

  it("needs the second press soon and close", () => {
    const late = createTapTracker();
    tap(late, 0);
    expect(pressStart(late, 1, 80 + DOUBLE_TAP.gapMs + 1, 100, 100)).toBe(false);
    const far = createTapTracker();
    tap(far, 0);
    expect(pressStart(far, 1, 200, 100 + DOUBLE_TAP.reach + 5, 100)).toBe(false);
  });

  it("doesn't count a hold or a drag as the first tap", () => {
    const held = createTapTracker();
    pressStart(held, 1, 0, 100, 100);
    pressEnd(held, 1, DOUBLE_TAP.tapMs + 50, 100, 100);
    expect(pressStart(held, 1, DOUBLE_TAP.tapMs + 100, 100, 100)).toBe(false);
    const dragged = createTapTracker();
    pressStart(dragged, 1, 0, 100, 100);
    pressEnd(dragged, 1, 80, 200, 100);
    expect(pressStart(dragged, 1, 150, 200, 100)).toBe(false);
  });

  it("lets a second finger double-tap while the first one holds", () => {
    const tracker = createTapTracker();
    pressStart(tracker, 1, 0, 50, 300);
    expect(tap(tracker, 100, 200, 100, 2)).toBe(false);
    expect(pressStart(tracker, 3, 250, 200, 100)).toBe(true);
  });

  it("treats a triple tap as one double, not two", () => {
    const tracker = createTapTracker();
    tap(tracker, 0);
    expect(tap(tracker, 150)).toBe(true);
    expect(tap(tracker, 300)).toBe(false);
  });
});
