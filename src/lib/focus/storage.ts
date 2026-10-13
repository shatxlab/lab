import { DEFAULT_PLAN, normalizePlan, type Plan, type Segment, type SegmentKind } from "@/lib/focus/pomodoro";
import { MAX_HISTORY, type DayRecord } from "@/lib/focus/history";
import type { Phase, TimerState } from "@/lib/focus/timer";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const FOCUS_STORAGE_KEY = "lab:focus:v1";

export interface ActiveDay {
  /** Local calendar day the day was opened on. */
  day: number;
  /** Seeds the office: who works there, how they look, who leaves first. */
  key: number;
  timer: TimerState;
  /** The finished day is already in the history. */
  recorded: boolean;
}

export interface FocusStore {
  /** The user's own seed; with the day it makes every office different but repeatable. */
  seed: number;
  plan: Plan;
  sound: boolean;
  today: ActiveDay | null;
  history: DayRecord[];
}

export interface FocusStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyStore(seed: number = Math.floor(Math.random() * 2 ** 32)): FocusStore {
  return { seed: seed >>> 0, plan: { ...DEFAULT_PLAN }, sound: true, today: null, history: [] };
}

function storageOrUndefined(): FocusStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const SEGMENT_KINDS: readonly SegmentKind[] = ["focus", "short", "long"];
const PHASES: readonly Phase[] = ["ready", "focus", "break", "complete"];
const MAX_SEGMENTS = 30;

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function cleanSegments(raw: unknown): Segment[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SEGMENTS) return null;
  const out: Segment[] = [];
  for (const item of raw) {
    const segment = item as Partial<Segment> | null;
    if (!segment || !SEGMENT_KINDS.includes(segment.kind as SegmentKind)) return null;
    const minutes = finite(segment.minutes);
    if (minutes === null || minutes < 1 || minutes > 90) return null;
    out.push({ kind: segment.kind as SegmentKind, minutes: Math.round(minutes) });
  }
  return out;
}

/** A timer that does not hold together is dropped rather than repaired: today simply starts over. */
function cleanTimer(raw: unknown): TimerState | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<Record<keyof TimerState, unknown>>;
  const segments = cleanSegments(input.segments);
  if (!segments) return null;
  const index = count(input.index);
  const phase = input.phase as Phase;
  if (!PHASES.includes(phase) || index > segments.length) return null;
  if ((phase === "focus" || phase === "break") && !segments[index]) return null;
  const paused = input.paused === true;
  const endsAt = finite(input.endsAt);
  const leftMs = finite(input.leftMs);
  const running = phase === "focus" || phase === "break";
  if (running && !paused && endsAt === null) return null;
  if (running && paused && leftMs === null) return null;
  const results = Array.isArray(input.results) ? input.results.filter((r): r is "done" | "missed" => r === "done" || r === "missed") : [];
  return {
    segments,
    index,
    phase,
    paused: running && paused,
    endsAt: running && !paused ? endsAt : null,
    leftMs: running && paused ? Math.max(0, leftMs!) : null,
    done: count(input.done),
    missed: count(input.missed),
    focusedMs: count(input.focusedMs),
    results,
  };
}

function cleanRecord(raw: unknown): DayRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<Record<keyof DayRecord, unknown>>;
  const day = finite(input.day);
  if (day === null || !Number.isInteger(day)) return null;
  return { day, quota: count(input.quota), done: count(input.done), missed: count(input.missed), focusedMin: count(input.focusedMin) };
}

export function readFocusStore(storage: FocusStorage | undefined = storageOrUndefined()): FocusStore {
  const store = emptyStore();
  if (!storage) return store;
  try {
    const raw = JSON.parse(storage.getItem(FOCUS_STORAGE_KEY) ?? "null") as Partial<Record<keyof FocusStore, unknown>> | null;
    if (!raw || typeof raw !== "object") return store;
    const seed = finite(raw.seed);
    if (seed !== null) store.seed = Math.floor(seed) >>> 0;
    if (raw.plan && typeof raw.plan === "object") store.plan = normalizePlan(raw.plan as Partial<Plan>);
    store.sound = raw.sound !== false;
    if (Array.isArray(raw.history)) {
      store.history = raw.history.flatMap((item) => cleanRecord(item) ?? []).slice(-MAX_HISTORY);
    }
    const today = raw.today as Partial<Record<keyof ActiveDay, unknown>> | null | undefined;
    if (today && typeof today === "object") {
      const timer = cleanTimer(today.timer);
      const day = finite(today.day);
      const key = finite(today.key);
      if (timer && day !== null && Number.isInteger(day) && key !== null) {
        store.today = { day, key: Math.floor(key) >>> 0, timer, recorded: today.recorded === true };
      }
    }
  } catch {
    // Corrupt data: start fresh.
  }
  return store;
}

export function writeFocusStore(store: FocusStore, storage: FocusStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // The day is a convenience; never break the timer over storage.
  }
}
