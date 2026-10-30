import { RUN_VERSION } from "./sim/run";
import type { Run } from "./sim/types";

/**
 * The run in progress, saved as it goes (the page writes it when hidden or closed and at every level-up) and picked
 * up again on load. Reopening the page resumes the same moment, so closing the tab just before falling doesn't dodge
 * the fall.
 */
export const RUN_STORAGE_KEY = "lab:hr:run:v1";

export interface RunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOrUndefined(): RunStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A stored run if it is one this version of the sim can carry on, else null. It is checked only as deep as a broken
 * save would show: a run the sim wrote itself is trusted below that.
 */
export function normalizeRun(raw: unknown): Run | null {
  if (!raw || typeof raw !== "object") return null;
  const run = raw as Partial<Run>;
  if (run.version !== RUN_VERSION || run.status !== "playing") return null;
  if (![run.seed, run.rng, run.coworkerId, run.difficulty, run.time, run.level, run.xp, run.nextId].every(isNumber)) return null;
  if (!run.hero || ![run.hero.x, run.hero.y, run.hero.hp].every(isNumber)) return null;
  if (!run.base || !run.numbers) return null;
  const lists = [run.weapons, run.foes, run.shots, run.drops, run.foeShots, run.gems, run.effects];
  if (!lists.every(Array.isArray)) return null;
  if (run.picks !== null && !Array.isArray(run.picks)) return null;
  return run as Run;
}

export function readRun(storage: RunStorage | undefined = storageOrUndefined()): Run | null {
  try {
    const raw = storage?.getItem(RUN_STORAGE_KEY);
    return raw ? normalizeRun(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeRun(run: Run, storage: RunStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Private mode or a full quota: the run just can't be resumed.
  }
}

/** Forget the run once it is over. */
export function clearRun(storage: RunStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.removeItem(RUN_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
