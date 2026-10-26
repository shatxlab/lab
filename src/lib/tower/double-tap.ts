/**
 * Spotting a double tap on the field among the presses that steer the archer.
 *
 * A tap is a press let go quickly without wandering; a double tap is a second
 * press that comes down soon after a tap, close to where it was. Times are in
 * milliseconds and positions in CSS pixels, so "close" is a finger's width on
 * any screen.
 */
export const DOUBLE_TAP = {
  /** The longest press that still counts as a tap rather than a hold. */
  tapMs: 250,
  /** The longest wait between letting go of the tap and pressing again. */
  gapMs: 300,
  /** How far apart the two presses may be. */
  reach: 40,
} as const;

interface Press {
  time: number;
  x: number;
  y: number;
  /** This press finished a double tap, so letting go of it starts nothing new. */
  doubled?: boolean;
}

export interface TapTracker {
  /** Presses still down, by pointer. */
  down: Map<number, Press>;
  /** Where and when the last tap was let go, while a second press could still make it a double. */
  lastTap: Press | null;
}

export function createTapTracker(): TapTracker {
  return { down: new Map(), lastTap: null };
}

/** A finger comes down. True when it is the second half of a double tap. */
export function pressStart(tracker: TapTracker, pointerId: number, time: number, x: number, y: number): boolean {
  const last = tracker.lastTap;
  const doubled = !!last && time - last.time <= DOUBLE_TAP.gapMs && Math.hypot(x - last.x, y - last.y) <= DOUBLE_TAP.reach;
  tracker.down.set(pointerId, { time, x, y, doubled });
  // Used up either way: a third tap starts a new pair rather than doubling again.
  tracker.lastTap = null;
  return doubled;
}

/** A finger lifts (or is cancelled). A quick press that stayed put becomes the tap a double tap waits for. */
export function pressEnd(tracker: TapTracker, pointerId: number, time: number, x: number, y: number): void {
  const press = tracker.down.get(pointerId);
  tracker.down.delete(pointerId);
  if (!press) return;
  const quick = time - press.time <= DOUBLE_TAP.tapMs;
  const still = Math.hypot(x - press.x, y - press.y) <= DOUBLE_TAP.reach;
  tracker.lastTap = quick && still && !press.doubled ? { time, x, y } : null;
}
