/**
 * A durable mirror of the lab keys, kept in IndexedDB.
 *
 * localStorage stays the hot path — every storage seam in lab is synchronous —
 * but it can be evicted under storage pressure while the origin's grant is
 * best-effort. Every write that goes through `mirroredStorage()` is therefore
 * also copied into one small IndexedDB store, which is protected by
 * `navigator.storage.persist()` and gets a quota far beyond localStorage's
 * 5 MB. Mirror writes are coalesced (one transaction per microtask,
 * last-write-wins) and resolve on transaction completion, not request
 * completion; they stay best-effort and never block or throw.
 *
 * The boot (`bootStorageMirror`) does three things:
 *  1. asks for a persistent storage grant;
 *  2. restores keys missing from localStorage (i.e. evicted) from the mirror;
 *  3. seeds the mirror from localStorage, so keys written before the mirror
 *     existed — and writes by seams that bypass it — are covered too.
 * Restores and boot-time writes race with app hydration: writes made while
 * the boot is in flight wait in the same queue, and if a restore actually
 * recovered keys, the page reloads once so apps re-read the restored state
 * instead of running on freshly written defaults.
 */

import { isLabKey, labKeys } from "./lab-keys";

export const MIRROR_DB = "lab-mirror";
export const MIRROR_STORE = "kv";
/** Reload guard, so a recovered eviction can never turn into a reload loop. */
const RELOAD_FLAG = "lab:mirror:reloaded";

export type MirrorPair = [key: string, value: string];
/** A queued mirror write: `value === null` deletes the key. */
export type MirrorWrite = [key: string, value: string | null];

let openPromise: Promise<IDBDatabase | null> | undefined;

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

/** Opens `lab-mirror`, memoized; `null` where IndexedDB is missing or broken. */
function openMirror(): Promise<IDBDatabase | null> {
  openPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(MIRROR_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MIRROR_STORE)) {
          request.result.createObjectStore(MIRROR_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return openPromise;
}

/** Asks for a persistent storage grant; best-effort, the answer is not enforced anywhere. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return typeof navigator === "undefined" ? false : await navigator.storage?.persist() === true;
  } catch {
    return false;
  }
}

// The write queue: coalesced, and held back until the boot has settled so a
// boot-time default write over an evicted key cannot clobber the mirror copy.
const pending = new Map<string, string | null>();
let flushScheduled = false;
let bootSettled = false;

/** Mirrors one write; a no-op for anything that is not a lab key. Never throws, never blocks. */
export function mirrorSet(key: string, value: string): void {
  if (!isLabKey(key)) return;
  pending.set(key, value);
  scheduleFlush();
}

/** Mirrors one removal. Never throws, never blocks. */
export function mirrorDelete(key: string): void {
  if (!isLabKey(key)) return;
  pending.set(key, null);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (bootSettled) void flushPending();
  });
}

async function flushPending(): Promise<void> {
  if (pending.size === 0) return;
  const writes: MirrorWrite[] = [...pending];
  pending.clear();
  const db = await openMirror();
  if (!db) return;
  try {
    const tx = db.transaction(MIRROR_STORE, "readwrite");
    const store = tx.objectStore(MIRROR_STORE);
    for (const [key, value] of writes) {
      if (value === null) store.delete(key);
      else store.put(value, key);
    }
    await txDone(tx);
  } catch {
    // A failed mirror write is fine: localStorage remains the source of truth,
    // and the next boot re-seeds the mirror from it.
  }
}

/** All mirrored pairs that parse as strings, in one transaction. */
export async function collectMirror(idb: IDBDatabase): Promise<MirrorPair[]> {
  const tx = idb.transaction(MIRROR_STORE, "readonly");
  const store = tx.objectStore(MIRROR_STORE);
  const keysRequest = store.getAllKeys() as IDBRequest<IDBValidKey[]>;
  const valuesRequest = store.getAll() as IDBRequest<unknown[]>;
  await txDone(tx);
  const pairs: MirrorPair[] = [];
  for (let i = 0; i < keysRequest.result.length; i += 1) {
    const key = keysRequest.result[i];
    const value = valuesRequest.result[i];
    if (typeof key === "string" && typeof value === "string" && isLabKey(key)) {
      pairs.push([key, value]);
    }
  }
  return pairs;
}

/** Pure core of the boot restore: copies pairs into keys storage is missing. */
export function restorePairs(pairs: MirrorPair[], storage: Pick<Storage, "getItem" | "setItem">): string[] {
  const restored: string[] = [];
  for (const [key, value] of pairs) {
    if (!isLabKey(key)) continue;
    try {
      if (storage.getItem(key) === null) {
        storage.setItem(key, value);
        restored.push(key);
      }
    } catch {
      // Unavailable storage: nothing to restore into.
    }
  }
  return restored;
}

/**
 * Pure planning core of the boot, so the race logic is testable without IDB:
 * which mirror keys to restore into localStorage, which localStorage values to
 * seed into the mirror (everything that differs — this covers pre-mirror data
 * and bypassing seams), and whether a recovered eviction warrants one reload.
 */
export function bootPlan(
  pairs: MirrorPair[],
  storage: Pick<Storage, "getItem" | "setItem" | "length" | "key">,
  reloadAllowed: boolean,
): { restore: MirrorPair[]; seed: MirrorPair[]; reload: boolean } {
  const mirrored = new Map(pairs);
  const restore: MirrorPair[] = [];
  for (const [key, value] of pairs) {
    try {
      if (storage.getItem(key) === null) {
        storage.setItem(key, value);
        restore.push([key, value]);
      }
    } catch {
      // Unavailable storage: nothing to restore into.
    }
  }
  const seed: MirrorPair[] = [];
  for (const key of labKeys(storage)) {
    const value = storage.getItem(key);
    if (value !== null && mirrored.get(key) !== value) seed.push([key, value]);
  }
  return { restore, seed, reload: restore.length > 0 && reloadAllowed };
}

let booted = false;

/** Once per page: persist grant, restore evicted keys, seed the mirror. Fire-and-forget. */
export function bootStorageMirror(): void {
  if (booted) return;
  booted = true;
  void runBoot();
}

async function runBoot(): Promise<void> {
  try {
    void requestPersistence();
    if (typeof localStorage === "undefined") return;
    let reloadAllowed = false;
    try {
      reloadAllowed = sessionStorage.getItem(RELOAD_FLAG) !== "1";
    } catch {
      reloadAllowed = false; // no sessionStorage: never reload, never loop
    }
    const db = await openMirror();
    const pairs = db ? await collectMirror(db) : [];
    const plan = bootPlan(pairs, localStorage, reloadAllowed);
    if (db) {
      // Restored keys must not be re-mirrored from boot-time default writes
      // queued by early-hydrating apps; seeding writes the storage truth.
      for (const [key] of plan.restore) pending.delete(key);
      for (const [key, value] of plan.seed) pending.set(key, value);
    }
    bootSettled = true;
    void flushPending();
    if (plan.reload) {
      try {
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // Without sessionStorage we do not reload at all (reloadAllowed is false).
      }
      if (reloadAllowed) window.location.reload();
      return;
    }
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // No sessionStorage: nothing to clear.
    }
  } catch {
    bootSettled = true;
    void flushPending();
  }
}
