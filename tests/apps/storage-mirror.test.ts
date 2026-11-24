// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootPlan, bootStorageMirror, collectMirror, mirrorDelete, mirrorSet, restorePairs } from "@/lib/apps/storage-mirror";

/**
 * A minimal in-memory IDB stand, transaction-level completion like the real
 * thing. One instance serves the whole file: `openMirror` memoizes its
 * connection, the store is cleared between tests.
 */
function createFakeDb() {
  const store = new Map<string, string>();
  return {
    store,
    transaction() {
      const tx = {
        objectStore: () => ({
          put: (value: string, key: string) => {
            store.set(key, value);
          },
          delete: (key: string) => {
            store.delete(key);
          },
          getAllKeys: () => ({ result: [...store.keys()] }),
          getAll: () => ({ result: [...store.values()] }),
        }),
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
}

type FakeDb = ReturnType<typeof createFakeDb>;
const db: FakeDb = createFakeDb();

let indexedDbTarget: Record<string, unknown>;
beforeEach(() => {
  db.store.clear();
  indexedDbTarget = {
    open: () => {
      // The request lifecycle openMirror expects: upgrade, then success.
      const request: Record<string, unknown> = {
        result: {
          ...db,
          objectStoreNames: { contains: () => false },
          createObjectStore: () => undefined,
        },
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        (request.onupgradeneeded as () => void)?.call(request);
        (request.onsuccess as () => void)?.call(request);
      });
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDbTarget, configurable: true, writable: true });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

/** Let microtasks (coalescing, transactions) settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mirror queue", () => {
  it("boots, seeds, and then coalesces writes into one last-write-wins transaction", async () => {
    localStorage.setItem("lab:pre", "before the mirror existed");
    bootStorageMirror(); // seeds lab:pre into the mirror
    await settle();
    expect(db.store.get("lab:pre")).toBe("before the mirror existed");

    mirrorSet("lab:a", "1");
    mirrorSet("lab:a", "2"); // coalesces: only the last value goes out
    mirrorSet("other:key", "3"); // never queued
    mirrorDelete("lab:b");
    mirrorSet("lab:b", "4"); // delete then write: one put remains
    await settle();

    expect([...db.store.entries()].sort()).toEqual([
      ["lab:a", "2"],
      ["lab:b", "4"],
      ["lab:pre", "before the mirror existed"],
    ]);
  });
});

describe("restorePairs", () => {
  const pairs: [string, string][] = [
    ["lab:missing", "restored"],
    ["lab:present", "not overwriting"],
    ["other-project:key", "never"],
  ];

  it("fills only the gaps, only with lab keys", () => {
    localStorage.setItem("lab:present", "live");
    const restored = restorePairs(pairs, localStorage);
    expect(restored).toEqual(["lab:missing"]);
    expect(localStorage.getItem("lab:missing")).toBe("restored");
    expect(localStorage.getItem("lab:present")).toBe("live");
    expect(localStorage.getItem("other-project:key")).toBeNull();
  });

  it("swallows a storage that refuses writes", () => {
    const refusing: Pick<Storage, "getItem" | "setItem"> = { getItem: () => null, setItem: () => { throw new Error("full"); } };
    expect(restorePairs(pairs, refusing)).toEqual([]);
  });
});

describe("bootPlan", () => {
  it("plans a restore for evicted keys, one reload, and seeds only genuine diffs", () => {
    localStorage.setItem("lab:live", "here");
    const plan = bootPlan([["lab:evicted", "saved"], ["lab:live", "stale mirror"]], localStorage, true);
    expect(plan.restore).toEqual([["lab:evicted", "saved"]]);
    expect(localStorage.getItem("lab:evicted")).toBe("saved");
    // The live key's mirror copy is stale: seeding repairs it from storage.
    expect(plan.seed).toEqual([["lab:live", "here"]]);
    expect(plan.reload).toBe(true);
  });

  it("no reload when the guard is set or nothing was evicted", () => {
    localStorage.setItem("lab:live", "here");
    expect(bootPlan([["lab:live", "here"]], localStorage, true).reload).toBe(false);
    expect(bootPlan([["lab:gone", "x"]], localStorage, false).reload).toBe(false);
  });

  it("seeds keys the mirror never saw, and skips non-lab keys", () => {
    localStorage.setItem("lab:new", "fresh");
    localStorage.setItem("other:thing", "ignored");
    const plan = bootPlan([], localStorage, false);
    expect(plan.seed).toEqual([["lab:new", "fresh"]]);
  });
});

describe("collectMirror", () => {
  it("keeps only string keys and values that are lab keys", async () => {
    db.store.set("lab:a", "1");
    db.store.set("nope", "2");
    db.store.set("lab:bad", 42 as unknown as string);
    const pairs = await collectMirror(db as unknown as IDBDatabase);
    expect(pairs).toEqual([["lab:a", "1"]]);
  });
});
