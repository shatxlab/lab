import type { FocusSound } from "@/lib/focus/sound";
import type { TimerState } from "@/lib/focus/timer";

/** Which sound, if any, a change of timer state deserves. */
export function cueFor(prev: TimerState, next: TimerState): FocusSound | null {
  if (prev === next) return null;
  if (prev.phase !== "complete" && next.phase === "complete") return next.missed === 0 ? "dayWin" : "dayLose";
  if (next.missed > prev.missed) return "walkout";
  if (next.done > prev.done) return "chime";
  if (prev.phase === "break" && next.phase === "ready") return "breakEnd";
  if (prev.phase === "ready" && next.phase === "focus") return "start";
  return null;
}
