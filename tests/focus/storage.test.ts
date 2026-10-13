import { describe, expect, it } from "vitest";

import { startDay } from "@/lib/focus/day";
import { DEFAULT_PLAN } from "@/lib/focus/pomodoro";
import { FOCUS_STORAGE_KEY, emptyStore, readFocusStore, writeFocusStore, type FocusStorage } from "@/lib/focus/storage";
import { pause, start } from "@/lib/focus/timer";

function memory(initial?: unknown): FocusStorage & { value: string | null } {
  return {
    value: initial === undefined ? null : typeof initial === "string" ? initial : JSON.stringify(initial),
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe("focus storage", () => {
  it("uses a lab: key so the settings backup covers it", () => {
    expect(FOCUS_STORAGE_KEY).toBe("lab:focus:v1");
  });

  it("round-trips a store with a running day and history", () => {
    let store = startDay(emptyStore(7), { ...DEFAULT_PLAN, hours: 3 }, 20_000);
    store = { ...store, sound: false, history: [{ day: 19_999, quota: 7, done: 7, missed: 0, focusedMin: 175 }] };
    store = { ...store, today: { ...store.today!, timer: start(store.today!.timer, 1_000_000) } };
    const storage = memory();
    writeFocusStore(store, storage);
    expect(readFocusStore(storage)).toEqual(store);
  });

  it("round-trips a paused timer", () => {
    let store = startDay(emptyStore(7), DEFAULT_PLAN, 20_000);
    store = { ...store, today: { ...store.today!, timer: pause(start(store.today!.timer, 0), 60_000) } };
    const storage = memory();
    writeFocusStore(store, storage);
    const back = readFocusStore(storage);
    expect(back.today!.timer).toMatchObject({ paused: true, leftMs: 24 * 60_000, endsAt: null });
  });

  it("starts empty on missing, corrupt or wrong-shaped data", () => {
    for (const input of [undefined, "{nope", "[1,2]", "null", 5]) {
      const store = readFocusStore(memory(input));
      expect(store.today).toBeNull();
      expect(store.history).toEqual([]);
      expect(store.plan).toEqual(DEFAULT_PLAN);
    }
    expect(readFocusStore(undefined).today).toBeNull();
  });

  it("clamps a tampered plan, drops junk history and keeps the seed", () => {
    const store = readFocusStore(
      memory({
        seed: 123.9,
        plan: { hours: 500, focusMin: -3 },
        sound: false,
        history: [{ day: 1, quota: 7, done: 7, missed: 0, focusedMin: 175 }, { day: "x" }, null, { day: 2.5 }, { day: 3, done: -4, missed: "a" }],
      }),
    );
    expect(store.seed).toBe(123);
    expect(store.plan).toMatchObject({ hours: 10, focusMin: 10 });
    expect(store.sound).toBe(false);
    expect(store.history).toEqual([
      { day: 1, quota: 7, done: 7, missed: 0, focusedMin: 175 },
      { day: 3, quota: 0, done: 0, missed: 0, focusedMin: 0 },
    ]);
  });

  it.each([
    ["no segments", { segments: [], index: 0, phase: "ready" }],
    ["bad segment kind", { segments: [{ kind: "nap", minutes: 25 }], index: 0, phase: "ready" }],
    ["absurd minutes", { segments: [{ kind: "focus", minutes: 5000 }], index: 0, phase: "ready" }],
    ["unknown phase", { segments: [{ kind: "focus", minutes: 25 }], index: 0, phase: "sleeping" }],
    ["index past the end", { segments: [{ kind: "focus", minutes: 25 }], index: 5, phase: "ready" }],
    ["running with no end time", { segments: [{ kind: "focus", minutes: 25 }], index: 0, phase: "focus", paused: false }],
    ["running on a missing segment", { segments: [{ kind: "focus", minutes: 25 }], index: 1, phase: "break", paused: false, endsAt: 5 }],
    ["paused with no time left", { segments: [{ kind: "focus", minutes: 25 }], index: 0, phase: "focus", paused: true }],
  ])("drops a timer that does not hold together: %s", (_name, timer) => {
    const store = readFocusStore(memory({ today: { day: 1, key: 2, timer, recorded: false } }));
    expect(store.today).toBeNull();
  });

  it("sanitises counters and results of a valid timer", () => {
    const store = readFocusStore(
      memory({
        today: {
          day: 5,
          key: 4294967299,
          recorded: true,
          timer: {
            segments: [{ kind: "focus", minutes: 25.4 }],
            index: 0,
            phase: "ready",
            done: -1,
            missed: 2.7,
            focusedMs: "x",
            results: ["done", "bogus", "missed", 5],
          },
        },
      }),
    );
    expect(store.today).toMatchObject({ day: 5, key: 3, recorded: true });
    expect(store.today!.timer).toMatchObject({ done: 0, missed: 2, focusedMs: 0, results: ["done", "missed"] });
    expect(store.today!.timer.segments).toEqual([{ kind: "focus", minutes: 25 }]);
  });

  it("never throws when storage refuses writes", () => {
    const storage: FocusStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota");
      },
    };
    expect(() => writeFocusStore(emptyStore(1), storage)).not.toThrow();
  });
});
