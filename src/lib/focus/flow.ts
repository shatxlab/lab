/**
 * The Pomodoro flow as a pure state machine. Every function takes `now` (epoch
 * ms) and returns a new state, so the clock is injectable: time is measured
 * against `endsAt`, never counted in ticks, so a throttled background tab only
 * delays the display.
 *
 * Start begins a focus. A finished focus is followed by a break (every fourth is
 * the long one); a finished break is followed by the next focus, by itself.
 * Giving a Pomodoro up costs one person their job and leaves the flow waiting for
 * Start; when the whole team has gone the office is empty until a new one is hired.
 */

export const FLOW = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 } as const;
/** The team at the start. One person leaves for every Pomodoro given up. */
export const HEADCOUNT = 6;

export type Phase = "ready" | "focus" | "break" | "empty";

export interface FlowState {
  phase: Phase;
  paused: boolean;
  /** When the running segment ends (null unless it is running). */
  endsAt: number | null;
  /** Time left while paused. */
  leftMs: number | null;
  /** Pomodoros finished. */
  done: number;
  /** Pomodoros given up, which is how many people have left. */
  missed: number;
  focusedMs: number;
  /** One entry per resolved Pomodoro, in order. */
  results: ("done" | "missed")[];
  /** Whether the current break is the long one. */
  long: boolean;
}

const MINUTE = 60_000;

export const createFlow = (): FlowState => ({
  phase: "ready",
  paused: false,
  endsAt: null,
  leftMs: null,
  done: 0,
  missed: 0,
  focusedMs: 0,
  results: [],
  long: false,
});

export const isRunning = (state: FlowState): boolean => (state.phase === "focus" || state.phase === "break") && !state.paused;

/** How long the segment now in play (or next up) lasts. */
export function segmentMinutes(state: FlowState): number {
  if (state.phase === "break") return state.long ? FLOW.longMin : FLOW.shortMin;
  return FLOW.focusMin;
}

/** Milliseconds left in the running segment (0 when nothing is running). */
export function remainingMs(state: FlowState, now: number): number {
  if (state.phase !== "focus" && state.phase !== "break") return 0;
  if (state.paused) return state.leftMs ?? 0;
  return Math.max(0, (state.endsAt ?? now) - now);
}

const beginFocus = (state: FlowState, now: number): FlowState => ({
  ...state,
  phase: "focus",
  paused: false,
  endsAt: now + FLOW.focusMin * MINUTE,
  leftMs: null,
  long: false,
});

const beginBreak = (state: FlowState, now: number, long: boolean): FlowState => ({
  ...state,
  phase: "break",
  paused: false,
  long,
  endsAt: now + (long ? FLOW.longMin : FLOW.shortMin) * MINUTE,
  leftMs: null,
});

export function start(state: FlowState, now: number): FlowState {
  return state.phase === "ready" ? beginFocus(state, now) : state;
}

export function pause(state: FlowState, now: number): FlowState {
  if (!isRunning(state)) return state;
  return { ...state, paused: true, leftMs: remainingMs(state, now), endsAt: null };
}

export function resume(state: FlowState, now: number): FlowState {
  if (!state.paused || (state.phase !== "focus" && state.phase !== "break")) return state;
  return { ...state, paused: false, endsAt: now + (state.leftMs ?? 0), leftMs: null };
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

/** Give up the Pomodoro in progress: someone leaves, and the flow waits for Start (or ends if nobody is left). */
export function abandon(state: FlowState): FlowState {
  if (state.phase !== "focus") return state;
  const missed = state.missed + 1;
  return {
    ...state,
    missed,
    results: [...state.results, "missed"],
    phase: missed >= HEADCOUNT ? "empty" : "ready",
    paused: false,
    endsAt: null,
    leftMs: null,
  };
}

/** Where the next person to leave stands in the team (how many have gone). */
export const peopleLeft = (state: FlowState): number => state.missed;

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
