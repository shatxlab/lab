/**
 * The Pomodoro flow as a pure state machine. Every function takes `now` (epoch
 * ms) and returns a new state, so the clock is injectable: time is measured
 * against `endsAt`, never counted in ticks, so a throttled background tab only
 * delays the display.
 *
 * Start begins a focus. A finished focus is followed by a break (every fourth is
 * the long one); a finished break is followed by the next focus, by itself.
 * Giving a Pomodoro up costs people their jobs and leaves the flow waiting for
 * Start: one for the first miss, then one more each time in a row (1, 2, 3, ...),
 * until a finished Pomodoro resets the streak. When the whole team has gone the
 * office is empty until a new one is hired.
 */

export const FLOW = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 } as const;
/** The team at the start. */
export const HEADCOUNT = 12;

export type Phase = "ready" | "focus" | "break" | "empty";

export interface FlowState {
  phase: Phase;
  /** When the running segment ends (null unless it is running). */
  endsAt: number | null;
  /** Pomodoros finished. */
  done: number;
  /** Pomodoros given up. */
  missed: number;
  /** Pomodoros given up in a row; a finished one resets it. */
  streak: number;
  /** People who have left, which is how far down the office's fire order we are. */
  fired: number;
  focusedMs: number;
  /** One entry per resolved Pomodoro, in order. */
  results: ("done" | "missed")[];
  /** Whether the current break is the long one. */
  long: boolean;
}

const MINUTE = 60_000;

export const createFlow = (): FlowState => ({
  phase: "ready",
  endsAt: null,
  done: 0,
  missed: 0,
  streak: 0,
  fired: 0,
  focusedMs: 0,
  results: [],
  long: false,
});

export const isRunning = (state: FlowState): boolean => state.phase === "focus" || state.phase === "break";

/** How long the segment now in play (or next up) lasts. */
export function segmentMinutes(state: FlowState): number {
  if (state.phase === "break") return state.long ? FLOW.longMin : FLOW.shortMin;
  return FLOW.focusMin;
}

/** Milliseconds left in the running segment (0 when nothing is running). */
export function remainingMs(state: FlowState, now: number): number {
  if (state.phase !== "focus" && state.phase !== "break") return 0;
  return Math.max(0, (state.endsAt ?? now) - now);
}

const beginFocus = (state: FlowState, now: number): FlowState => ({
  ...state,
  phase: "focus",
  endsAt: now + FLOW.focusMin * MINUTE,
  long: false,
});

const beginBreak = (state: FlowState, now: number, long: boolean): FlowState => ({
  ...state,
  phase: "break",
  long,
  endsAt: now + (long ? FLOW.longMin : FLOW.shortMin) * MINUTE,
});

export function start(state: FlowState, now: number): FlowState {
  return state.phase === "ready" ? beginFocus(state, now) : state;
}

/**
 * Finish the running segment if its time is up. Call it often; it is cheap and
 * idempotent. If the page was away for longer than a whole segment, the flow
 * moves on one segment at a time from when each should have ended.
 */
export function tick(state: FlowState, now: number): FlowState {
  let current = state;
  // Bounded: a long absence can cross several segments, but never an unbounded number.
  for (let guard = 0; guard < 200; guard += 1) {
    if (!isRunning(current) || current.endsAt === null || now < current.endsAt) return current;
    const endedAt = current.endsAt;
    if (current.phase === "focus") {
      const done = current.done + 1;
      current = {
        ...current,
        done,
        streak: 0,
        focusedMs: current.focusedMs + FLOW.focusMin * MINUTE,
        results: [...current.results, "done"],
      };
      current = beginBreak(current, endedAt, done % FLOW.longEvery === 0);
    } else {
      current = beginFocus(current, endedAt);
    }
  }
  return current;
}

/** End a break early; the next Pomodoro starts at once. */
export function skipBreak(state: FlowState, now: number): FlowState {
  return state.phase === "break" ? beginFocus(state, now) : state;
}

/** How many people the next given-up Pomodoro costs: one more than the streak so far, never more than are left. */
export const firingsNext = (state: FlowState): number => Math.min(state.streak + 1, HEADCOUNT - state.fired);

/** Give up the Pomodoro in progress: people leave, and the flow waits for Start (or ends if nobody is left). */
export function abandon(state: FlowState): FlowState {
  if (state.phase !== "focus") return state;
  const fired = state.fired + firingsNext(state);
  return {
    ...state,
    missed: state.missed + 1,
    streak: state.streak + 1,
    fired,
    results: [...state.results, "missed"],
    phase: fired >= HEADCOUNT ? "empty" : "ready",
    endsAt: null,
  };
}

export type Dot = "done" | "missed" | "current" | "pending";

/** Index of the first Pomodoro of the cycle in play. During a break, the cycle that just finished is still the one shown. */
function cycleStart(state: FlowState): number {
  const anchor = state.phase === "break" ? state.results.length - 1 : state.results.length;
  return Math.max(0, Math.floor(anchor / FLOW.longEvery)) * FLOW.longEvery;
}

/** The outcomes of the cycle in play so far. */
export const cycleResults = (state: FlowState): ("done" | "missed")[] => state.results.slice(cycleStart(state), cycleStart(state) + FLOW.longEvery);

/** The row of dots for the cycle in play: one per Pomodoro before the long break. */
export function cycleDots(state: FlowState): Dot[] {
  const first = cycleStart(state);
  return Array.from({ length: FLOW.longEvery }, (_, i): Dot => {
    const result = state.results[first + i];
    if (result) return result;
    return first + i === state.results.length && state.phase === "focus" ? "current" : "pending";
  });
}
