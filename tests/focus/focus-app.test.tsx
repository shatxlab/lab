// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTimer, startDay } from "@/lib/focus/day";
import { tz } from "@/lib/focus/i18n";
import { DEFAULT_PLAN } from "@/lib/focus/pomodoro";
import { FOCUS_STORAGE_KEY, emptyStore, readFocusStore, writeFocusStore, type FocusStore } from "@/lib/focus/storage";
import { localDay } from "@/lib/apps/local-day";
import { tick as tickTimer } from "@/lib/focus/timer";
import { axeViolations as axeRun, click, mount, press, type } from "../helpers/dom";

// jsdom has no WebGL: the scene is replaced by a stand-in that records what it was told.
const sceneProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@/components/focus/FocusScene", () => ({
  FocusScene: (props: Record<string, unknown> & { office: { roster: { id: number; name: string }[] }; fired: number; label: string; onSelect: (p: unknown) => void }) => {
    sceneProps.current = props;
    return (
      <div role="img" aria-label="office" data-testid="scene" data-fired={props.fired} data-label={props.label} data-working={String(props.working)}>
        {props.office.roster.map((person) => (
          <button key={person.id} type="button" data-person={person.name} onClick={() => props.onSelect(person)}>
            {person.name}
          </button>
        ))}
      </div>
    );
  },
}));

import FocusApp from "@/components/focus/FocusApp";

const MIN = 60_000;

/** The shared helper polls with real timers; under fake ones, step the fake clock a little instead. */
async function waitFor(assert: () => void, attempts = 100) {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      assert();
      return;
    } catch (error) {
      last = error;
      await act(async () => {
        vi.advanceTimersByTime(5);
        await Promise.resolve();
      });
    }
  }
  throw last;
}

/** axe schedules with real timers, so it runs outside the fake clock. */
async function axeViolations(element?: Element): Promise<string[]> {
  const at = Date.now();
  vi.useRealTimers();
  try {
    return await axeRun(element);
  } finally {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(at);
  }
}

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const scene = () => document.querySelector<HTMLElement>('[data-testid="scene"]');
const timerText = () => document.querySelector('[role="timer"]')?.textContent;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date(2026, 9, 13, 10, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  sceneProps.current = null;
});

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

async function openDay() {
  const view = await mount(<FocusApp />);
  await waitFor(() => expect(button(tz("en", "open"))).toBeTruthy());
  await click(button(tz("en", "open")));
  await waitFor(() => expect(scene()).toBeTruthy());
  return view;
}

const saved = () => readFocusStore();

describe("FocusApp — setup", () => {
  it("shows the plan, a live Pomodoro count and an empty history, accessibly", async () => {
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(text()).toContain(tz("en", "planTitle")));
    expect(text()).toContain(tz("en", "planSummary", { n: 7, time: "3 h 35 min" }));
    expect(text()).toContain(tz("en", "historyEmpty"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("recalculates the quota when the hours change and refuses a day with no Pomodoro", async () => {
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(text()).toContain(tz("en", "planTitle")));
    const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    await type(slider, "1");
    expect(text()).toContain(tz("en", "planSummary", { n: 2, time: "55 min" }));
    // Custom lengths too big for the hour leave no room for a single Pomodoro.
    await type(document.querySelector<HTMLInputElement>('input[min="10"][max="90"]'), "90");
    expect(text()).toContain(tz("en", "planNone"));
    expect(button(tz("en", "open"))?.disabled).toBe(true);
    view.unmount();
  });

  it("opens the office with the chosen plan and remembers it", async () => {
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(button(tz("en", "open"))).toBeTruthy());
    await type(document.querySelector<HTMLInputElement>('input[type="range"]'), "2");
    await click(button(tz("en", "open")));
    await waitFor(() => expect(scene()).toBeTruthy());
    expect(saved().plan.hours).toBe(2);
    expect(saved().today!.timer.segments.filter((s) => s.kind === "focus")).toHaveLength(4);
    expect(document.querySelectorAll("[data-person]")).toHaveLength(4);
    view.unmount();
  });
});

describe("FocusApp — a day", () => {
  it("runs a Pomodoro by the clock, then a break that starts by itself", async () => {
    const view = await openDay();
    expect(timerText()).toBe("25:00");
    expect(scene()!.dataset.working).toBe("false");
    await click(button(tz("en", "start")));
    expect(scene()!.dataset.working).toBe("true");
    expect(scene()!.dataset.label).toBe("25:00");

    await advance(10 * MIN);
    expect(timerText()).toBe("15:00");
    expect(document.title).toContain("15:00");

    await advance(15 * MIN + 500);
    await waitFor(() => expect(text()).toContain(tz("en", "phaseBreak")));
    expect(saved().today!.timer).toMatchObject({ done: 1, phase: "break" });
    expect(timerText()).toBe("5:00");
    expect(scene()!.dataset.working).toBe("false");

    await advance(5 * MIN + 500);
    await waitFor(() => expect(text()).toContain(tz("en", "phaseReady")));
    // The next Pomodoro waits for the user.
    expect(saved().today!.timer.phase).toBe("ready");
    expect(button(tz("en", "start"))).toBeTruthy();
    view.unmount();
  });

  it("pauses and resumes without losing time", async () => {
    const view = await openDay();
    await click(button(tz("en", "start")));
    await advance(5 * MIN);
    await click(button(tz("en", "pause")));
    expect(timerText()).toBe("20:00");
    await advance(60 * MIN);
    expect(timerText()).toBe("20:00");
    expect(scene()!.dataset.working).toBe("false");
    await click(button(tz("en", "resume")));
    await advance(MIN);
    expect(timerText()).toBe("19:00");
    view.unmount();
  });

  it("shows the paused time on the doors' plate, not 0:00", async () => {
    const view = await openDay();
    await click(button(tz("en", "start")));
    await advance(5 * MIN);
    await click(button(tz("en", "pause")));
    expect(scene()!.dataset.label).toBe("20:00");
    view.unmount();
  });

  it("asks before giving up, naming who would leave, and keeps going on cancel", async () => {
    const view = await openDay();
    await click(button(tz("en", "start")));
    await click(button(tz("en", "giveUp")));
    const dialog = document.querySelector('[role="dialog"]')!;
    const next = saved().today!;
    expect(dialog.textContent).toContain(tz("en", "giveUpTitle"));
    expect(dialog.textContent).toMatch(/will pack a box and leave/);
    expect(await axeViolations(dialog)).toEqual([]);

    await click(button(tz("en", "keepFocusing")));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(saved().today!.timer.missed).toBe(0);
    expect(next.timer.phase).toBe("focus");
    view.unmount();
  });

  it("gives up: someone leaves, the Pomodoro is missed and the break is skipped", async () => {
    const view = await openDay();
    await click(button(tz("en", "start")));
    await click(button(tz("en", "giveUp")));
    await click(button(tz("en", "giveUpYes")));
    await waitFor(() => expect(scene()!.dataset.fired).toBe("1"));
    expect(saved().today!.timer).toMatchObject({ missed: 1, done: 0, phase: "ready", index: 2 });
    expect(document.querySelector('[role="img"][aria-label^="Pomodoros"]')?.getAttribute("aria-label")).toBe(
      tz("en", "dots", { done: 0, missed: 1, left: 6 }),
    );
    view.unmount();
  });

  it("ends the day on request: every unplayed Pomodoro costs a job, and the day is recorded", async () => {
    const view = await openDay();
    await click(button(tz("en", "endDay")));
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(tz("en", "endBody", { n: 7 }));
    await click(button(tz("en", "endYes")));
    await waitFor(() => expect(text()).toContain(tz("en", "loseTitle")));
    expect(scene()!.dataset.fired).toBe("7");
    const record = saved().history[0]!;
    expect(record).toMatchObject({ quota: 7, done: 0, missed: 7, day: localDay() });
    expect(record.left).toHaveLength(7);
    expect(text()).toContain(tz("en", "loseBody", { done: 0, total: 7, names: record.left.join(", ") }));
    view.unmount();
  });

  it("completes a clean day: everyone stays, the day is recorded once and a streak starts", async () => {
    // A one-Pomodoro day keeps the walk-through short.
    const store = startDay(emptyStore(5), { ...DEFAULT_PLAN, hours: 1, focusMin: 60 }, localDay());
    writeFocusStore(store);
    expect(store.today!.timer.segments).toHaveLength(1);
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(button(tz("en", "start"))).toBeTruthy());
    await click(button(tz("en", "start")));
    await advance(60 * MIN + 500);
    await waitFor(() => expect(text()).toContain(tz("en", "winTitle")));
    expect(saved().history).toHaveLength(1);
    expect(saved().history[0]).toMatchObject({ quota: 1, done: 1, missed: 0, focusedMin: 60, left: [] });
    expect(scene()!.dataset.fired).toBe("0");

    await click(button(tz("en", "newDay")));
    await waitFor(() => expect(text()).toContain(tz("en", "planTitle")));
    expect(saved().today).toBeNull();
    expect(text()).toContain(tz("en", "stayed"));
    view.unmount();
  });
});

describe("FocusApp — leaving and returning", () => {
  it("warns the browser before unload during a Pomodoro, but not otherwise", async () => {
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const view = await openDay();
    expect(unload()).toBe(false);
    await click(button(tz("en", "start")));
    expect(unload()).toBe(true);
    await advance(25 * MIN + 500); // now in the break
    await waitFor(() => expect(text()).toContain(tz("en", "phaseBreak")));
    expect(unload()).toBe(false);
    view.unmount();
  });

  it("gives up the Pomodoro when the page really goes away, but not when it is only cached", async () => {
    const view = await openDay();
    await click(button(tz("en", "start")));
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    });
    expect(saved().today!.timer.missed).toBe(0);
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    });
    expect(saved().today!.timer).toMatchObject({ missed: 1, phase: "ready" });
    view.unmount();
  });

  it("resumes a running Pomodoro after a reload from the saved end time", async () => {
    let store: FocusStore = startDay(emptyStore(5), DEFAULT_PLAN, localDay());
    const started = store.today!.timer;
    store = applyTimer(store, { ...started, phase: "focus", endsAt: Date.now() + 12 * MIN });
    writeFocusStore(store);
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(timerText()).toBe("12:00"));
    await advance(2 * MIN);
    expect(timerText()).toBe("10:00");
    view.unmount();
  });

  it("completes a Pomodoro whose time ran out while the page was closed", async () => {
    let store: FocusStore = startDay(emptyStore(5), DEFAULT_PLAN, localDay());
    store = applyTimer(store, { ...store.today!.timer, phase: "focus", endsAt: Date.now() - 1000 });
    writeFocusStore(store);
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(saved().today!.timer.done).toBe(1));
    expect(saved().today!.timer.phase).toBe("break");
    view.unmount();
  });

  it("closes a day left open past midnight and shows the setup with it in the history", async () => {
    let store = startDay(emptyStore(5), DEFAULT_PLAN, localDay() - 1);
    store = applyTimer(store, tickTimer({ ...store.today!.timer, phase: "focus", endsAt: Date.now() - MIN }, Date.now()));
    writeFocusStore(store);
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(text()).toContain(tz("en", "planTitle")));
    const after = saved();
    expect(after.today).toBeNull();
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ day: localDay() - 1, done: 1, missed: 6 });
    view.unmount();
  });
});

describe("FocusApp — extras", () => {
  it("greets a person you tap", async () => {
    const view = await openDay();
    const first = document.querySelector<HTMLButtonElement>("[data-person]")!;
    await click(first);
    expect(text()).toMatch(new RegExp(`${first.dataset.person}, (Designer|Developer|Tester)`));
    await advance(4000);
    expect(text()).not.toMatch(/, (Designer|Developer|Tester)/);
    view.unmount();
  });

  it("enters and leaves focus mode with the button and Escape", async () => {
    const view = await openDay();
    await click(button(tz("en", "focusMode")));
    expect(document.querySelector(".fixed.inset-0.z-60")).toBeTruthy();
    expect(button(tz("en", "exitFocusMode"))).toBeTruthy();
    await press(window, "Escape");
    expect(document.querySelector(".fixed.inset-0.z-60")).toBeNull();
    view.unmount();
  });

  it("restores the tab title when the timer stops", async () => {
    document.title = "Focus office — Local Lab";
    const view = await openDay();
    await click(button(tz("en", "start")));
    expect(document.title).not.toBe("Focus office — Local Lab");
    await click(button(tz("en", "pause")));
    expect(document.title).toBe("Focus office — Local Lab");
    view.unmount();
  });

  it("renders Russian copy", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<FocusApp />);
    await waitFor(() => expect(text()).toContain(tz("ru", "planTitle")));
    expect(text()).toContain("Офис фокуса");
    await click(button(tz("ru", "open")));
    await waitFor(() => expect(button(tz("ru", "start"))).toBeTruthy());
    view.unmount();
  });

  it("uses the lab: key so the settings backup covers it", async () => {
    const view = await openDay();
    expect(localStorage.getItem(FOCUS_STORAGE_KEY)).toContain('"today"');
    view.unmount();
  });
});
