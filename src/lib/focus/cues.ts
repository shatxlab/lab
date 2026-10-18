import type { FlowState } from "@/lib/focus/flow";
import type { FocusSound } from "@/lib/focus/sound";

/** Which sound, if any, a change of the flow's state deserves. */
export function cueFor(prev: FlowState, next: FlowState): FocusSound | null {
  if (prev === next) return null;
  if (next.fired > prev.fired) return next.phase === "empty" ? "emptyOffice" : "walkout";
  if (next.done > prev.done) return "chime";
  if (prev.phase === "break" && next.phase === "focus") return "breakEnd";
  if (prev.phase === "ready" && next.phase === "focus") return "start";
  return null;
}
