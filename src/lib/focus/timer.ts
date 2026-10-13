/**
 * The day's timer as a pure state machine. Every function takes `now` (epoch
 * ms) and returns a new state, so the clock is injectable and the state can be
 * saved and resumed: time is measured against `endsAt`, never counted in ticks.
 *
 * Flow: the day starts "ready"; Start begins the first focus segment. Breaks
 * start by themselves when a focus ends; after a break the next focus waits
 * for the user ("ready"), so being away never counts as focused time.
 */

import { quotaOf, type Segment } from "@/lib/focus/pomodoro";

export type Phase = "ready" | "focus" | "break" | "complete";

export interface TimerState {
  segments: Segment[];
  /** The current segment. */
  index: number;
  phase: Phase;
  paused: boolean;
  /** When the running segment ends (null unless it is running). */
  endsAt: number | null;
  /** Time left while paused. */
  leftMs: number | null;
  /** Focus segments completed. */
  done: number;
  /** Focus segments abandoned, or never played when the day ended. */
  missed: number;
  focusedMs: number;
  /** One entry per resolved focus segment, in order — what the row of dots shows. */
  results: ("done" | "missed")[];
}

const MINUTE = 60_000;

export function createTimer(segments: Segment[]): TimerState {
  return {
    segments,
    index: 0,
    phase: segments.length === 0 ? "complete" : "ready",
    paused: false,
    endsAt: null,
    leftMs: null,
    done: 0,
    missed: 0,
    focusedMs: 0,
    results: [],
  };
}

export const isRunning = (state: TimerState): boolean => (state.phase === "focus" || state.phase === "break") && !state.paused;

export const quota = (state: TimerState): number => quotaOf(state.segments);

/** Milliseconds left in the current segment (0 when nothing is running). */
export function remainingMs(state: TimerState, now: number): number {
  if (state.phase !== "focus" && state.phase !== "break") return 0;
  if (state.paused) return state.leftMs ?? 0;
  return Math.max(0, (state.endsAt ?? now) - now);
}

function begin(state: TimerState, now: number): TimerState {
  const segment = state.segments[state.index];
  if (!segment) return { ...state, phase: "complete", endsAt: null, leftMs: null, paused: false };
  return {
    ...state,
    phase: segment.kind === "focus" ? "focus" : "break",
    paused: false,
    endsAt: now + segment.minutes * MINUTE,
    leftMs: null,
  };
}

/** Move to `index`: the day is over past the end, a break starts at once, a focus waits for the user. */
function goTo(state: TimerState, index: number, now: number): TimerState {
  const idle = { ...state, index, paused: false, endsAt: null, leftMs: null };
  const next = state.segments[index];
  if (!next) return { ...idle, phase: "complete" };
  if (next.kind !== "focus") return begin(idle, now);
  return { ...idle, phase: "ready" };
}

export function start(state: TimerState, now: number): TimerState {
  return state.phase === "ready" ? begin(state, now) : state;
}

export function pause(state: TimerState, now: number): TimerState {
  if (!isRunning(state)) return state;
  return { ...state, paused: true, leftMs: remainingMs(state, now), endsAt: null };
}

export function resume(state: TimerState, now: number): TimerState {
  if (!state.paused || (state.phase !== "focus" && state.phase !== "break")) return state;
  return { ...state, paused: false, endsAt: now + (state.leftMs ?? 0), leftMs: null };
}

/** Finish the running segment if its time is up. Call it often; it is cheap and idempotent. */
export function tick(state: TimerState, now: number): TimerState {
  if (!isRunning(state) || state.endsAt === null || now < state.endsAt) return state;
  const segment = state.segments[state.index]!;
  const credited =
    state.phase === "focus"
      ? { ...state, done: state.done + 1, focusedMs: state.focusedMs + segment.minutes * MINUTE, results: [...state.results, "done" as const] }
      : state;
  return goTo(credited, state.index + 1, now);
}

/** End a break early. */
export function skipBreak(state: TimerState, now: number): TimerState {
  return state.phase === "break" ? goTo(state, state.index + 1, now) : state;
}

/** Give up the focus segment in progress: it counts as missed, and the break after it is skipped. */
export function abandon(state: TimerState, now: number): TimerState {
  if (state.phase !== "focus") return state;
  const after = state.segments[state.index + 1];
  const skip = after && after.kind !== "focus" ? 2 : 1;
  return goTo({ ...state, missed: state.missed + 1, results: [...state.results, "missed"] }, state.index + skip, now);
}

/** Close the day now: every focus segment not yet played counts as missed. */
export function endDay(state: TimerState): TimerState {
  if (state.phase === "complete") return state;
  // A focus in progress or waiting is the current segment; after a break only later ones remain.
  const from = state.phase === "break" ? state.index + 1 : state.index;
  const unplayed = quotaOf(state.segments.slice(from));
  const results = [...state.results, ...Array.from({ length: unplayed }, () => "missed" as const)];
  return { ...state, missed: state.missed + unplayed, results, phase: "complete", paused: false, endsAt: null, leftMs: null };
}

/** The row of dots: each Pomodoro is done, missed, the one in play, or still to come. */
export function pomodoroStatuses(state: TimerState): ("done" | "missed" | "current" | "pending")[] {
  return Array.from({ length: quota(state) }, (_, i) => {
    const result = state.results[i];
    if (result) return result;
    return i === state.results.length && state.phase !== "complete" ? ("current" as const) : ("pending" as const);
  });
}
