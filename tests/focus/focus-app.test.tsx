// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tz } from "@/lib/focus/i18n";
import { HEADCOUNT } from "@/lib/focus/flow";
import { axeViolations as axeRun, click, mount } from "../helpers/dom";

// jsdom has no WebGL: the scene is replaced by a stand-in that records what it was told.
vi.mock("@/components/focus/FocusScene", () => ({
  FocusScene: (props: { office: { roster: { id: number; name: string }[] }; fired: number; label: string; working: boolean; onSelect: (p: unknown) => void }) => (
    <div role="group" aria-label="office" data-testid="scene" data-fired={props.fired} data-label={props.label} data-working={String(props.working)}>
      {props.office.roster.map((person) => (
        <button key={person.id} type="button" data-person={person.name} onClick={() => props.onSelect(person)}>
          {person.name}
        </button>
      ))}
    </div>
  ),
}));

// Music is a fake with a visible state, so the tests can play the browser's autoplay rules.
const lofi = vi.hoisted(() => ({
  state: "idle" as string,
  listeners: new Set<(s: string) => void>(),
  start: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  blockOnStart: false,
}));
vi.mock("@/lib/focus/lofi-audio", () => ({
  createLofi: () => ({
    get state() {
      return lofi.state;
    },
    start: async () => {
      lofi.start();
      lofi.state = lofi.blockOnStart ? "blocked" : "playing";
      lofi.listeners.forEach((l) => l(lofi.state));
      return lofi.state;
    },
    stop: lofi.stop,
    setVolume: lofi.setVolume,
    setMuted: lofi.setMuted,
    subscribe: (l: (s: string) => void) => {
      lofi.listeners.add(l);
      return () => lofi.listeners.delete(l);
    },
  }),
}));

import FocusApp from "@/components/focus/FocusApp";

const MIN = 60_000;
const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;
const labelled = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const scene = () => document.querySelector<HTMLElement>('[data-testid="scene"]');
const timerText = () => document.querySelector('[role="timer"]')?.textContent;
const fired = () => Number(scene()?.dataset.fired);
const team = () => [...document.querySelectorAll("[data-person]")].length;

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

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date(2026, 9, 13, 10, 0, 0));
  Object.assign(lofi, { state: "idle", blockOnStart: false });
  lofi.listeners.clear();
  lofi.start.mockClear();
  lofi.stop.mockClear();
  lofi.setMuted.mockClear();
  lofi.setVolume.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

async function open() {
  const view = await mount(<FocusApp />);
  await waitFor(() => expect(scene()).toBeTruthy());
  return view;
}

describe("FocusApp — opening", () => {
  it("is the office straight away: the scene, 25:00, a Start button and the whole team, accessibly", async () => {
    const view = await open();
    expect(document.querySelector("h1")?.textContent).toBe(tz("en", "title"));
    expect(timerText()).toBe("25:00");
    expect(button(tz("en", "start"))).toBeTruthy();
    expect(team()).toBe(HEADCOUNT);
    expect(scene()!.dataset.label).toBe("25:00");
    expect(document.querySelector('[data-testid="focus-room"]')!.className).toContain("fixed");
    // There is nothing to set up and nothing to save.
    expect(document.querySelector("input[type=number]")).toBeNull();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("starts the music on its own, and stops it when the page is left", async () => {
    const view = await open();
    expect(lofi.start).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="status"]')?.textContent).not.toContain(tz("en", "musicBlocked"));
    view.unmount();
    expect(lofi.stop).toHaveBeenCalled();
  });

  it("asks for a tap when the browser keeps the music back, and a click on Start lets it through", async () => {
    lofi.blockOnStart = true;
    const view = await open();
    await waitFor(() => expect(text()).toContain(tz("en", "musicBlocked")));
    lofi.blockOnStart = false;
    await click(button(tz("en", "start")));
    expect(lofi.start).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(text()).not.toContain(tz("en", "musicBlocked")));
    view.unmount();
  });

  it("clears the days saved by the old version, and saves nothing itself", async () => {
    localStorage.setItem("lab:focus:v1", '{"version":1}');
    localStorage.setItem("lab:other:v1", "keep");
    const view = await open();
    await click(button(tz("en", "start")));
    await advance(30 * MIN);
    expect(localStorage.getItem("lab:focus:v1")).toBeNull();
    expect(localStorage.getItem("lab:other:v1")).toBe("keep");
    expect(localStorage.length).toBe(1);
    view.unmount();
  });

  it("can be left, and has full screen", async () => {
    const view = await open();
    const leave = [...document.querySelectorAll("a")].find((a) => a.textContent === tz("en", "leave"));
    expect(leave?.getAttribute("href")).toMatch(/\/$/);
    expect(button(tz("en", "fullScreen"))).toBeTruthy();
    view.unmount();
  });
});

describe("FocusApp — the flow", () => {
  it("runs 25 minutes, rests 5, and starts the next Pomodoro by itself", async () => {
    const view = await open();
    await click(button(tz("en", "start")));
    expect(scene()!.dataset.working).toBe("true");
    expect(timerText()).toBe("25:00");
    await advance(10 * MIN);
    expect(timerText()).toBe("15:00");
    expect(document.title).toContain("15:00");
    await advance(15 * MIN);
    // The break.
    expect(text()).toContain(tz("en", "phaseBreak"));
    expect(timerText()).toBe("5:00");
    expect(scene()!.dataset.working).toBe("false");
    expect(text()).toContain(tz("en", "doneCount", { n: 1 }));
    expect(button(tz("en", "skipBreak"))).toBeTruthy();
    await advance(5 * MIN);
    // Back to work without a click.
    expect(text()).toContain(tz("en", "phaseFocus"));
    expect(timerText()).toBe("25:00");
    expect(fired()).toBe(0);
    view.unmount();
  });

  it("makes the fourth break a long one", async () => {
    const view = await open();
    await click(button(tz("en", "start")));
    for (let i = 0; i < 3; i += 1) await advance(30 * MIN);
    await advance(25 * MIN);
    expect(text()).toContain(tz("en", "phaseLong"));
    expect(timerText()).toBe("15:00");
    expect(text()).toContain(tz("en", "doneCount", { n: 4 }));
    view.unmount();
  });

  it("pauses and resumes, and skips a break", async () => {
    const view = await open();
    await click(button(tz("en", "start")));
    await advance(5 * MIN);
    await click(button(tz("en", "pause")));
    await advance(60 * MIN);
    expect(timerText()).toBe("20:00");
    expect(scene()!.dataset.working).toBe("false");
    await click(button(tz("en", "resume")));
    await advance(20 * MIN);
    expect(text()).toContain(tz("en", "phaseBreak"));
    await click(button(tz("en", "skipBreak")));
    expect(text()).toContain(tz("en", "phaseFocus"));
    expect(timerText()).toBe("25:00");
    view.unmount();
  });

  it("puts the countdown in the tab title while it runs", async () => {
    document.title = "Focus";
    const view = await open();
    await click(button(tz("en", "start")));
    await advance(1000);
    expect(document.title).toMatch(/^24:\d\d · /);
    view.unmount();
    expect(document.title).toBe("Focus");
  });
});

describe("FocusApp — failing the flow", () => {
  async function giveUp() {
    await click(button(tz("en", "start")));
    await click(button(tz("en", "giveUp")));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    return dialog!;
  }

  it("names who would leave, and keeps everyone if the user keeps focusing", async () => {
    const view = await open();
    const dialog = await giveUp();
    expect(dialog.textContent).toMatch(/will be fired!/);
    const names = [...document.querySelectorAll("[data-person]")].map((n) => (n as HTMLElement).dataset.person!);
    expect(names.some((name) => dialog.textContent!.includes(name))).toBe(true);
    await click(button(tz("en", "keepFocusing")));
    expect(fired()).toBe(0);
    expect(text()).toContain(tz("en", "phaseFocus"));
    view.unmount();
  });

  it("sends one person out per Pomodoro given up, and waits for Start", async () => {
    const view = await open();
    await giveUp();
    await click(button(tz("en", "giveUpYes")));
    expect(fired()).toBe(1);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/just got fired! Keep up the work or .+ is gonna be next!/);
    expect(text()).toContain(tz("en", "phaseReady"));
    expect(timerText()).toBe("25:00");
    expect(button(tz("en", "start"))).toBeTruthy();
    expect(text()).not.toContain(tz("en", "doneCount", { n: 1 }));
    view.unmount();
  });

  it("empties the office after six, and a new team can be hired", async () => {
    const view = await open();
    for (let i = 0; i < HEADCOUNT; i += 1) {
      await click(button(tz("en", "start")));
      await click(button(tz("en", "giveUp")));
      await click(button(tz("en", "giveUpYes")));
    }
    expect(fired()).toBe(HEADCOUNT);
    expect(text()).toContain(tz("en", "emptyTitle"));
    expect(button(tz("en", "start"))).toBeUndefined();
    const before = [...document.querySelectorAll("[data-person]")].map((n) => (n as HTMLElement).dataset.person);
    await click(button(tz("en", "hire")));
    expect(fired()).toBe(0);
    expect(timerText()).toBe("25:00");
    const after = [...document.querySelectorAll("[data-person]")].map((n) => (n as HTMLElement).dataset.person);
    expect(after).toHaveLength(HEADCOUNT);
    expect(after).not.toEqual(before);
    view.unmount();
  });

  it("asks before the page closes mid-Pomodoro, and gives the Pomodoro up if the page really goes", async () => {
    const view = await open();
    const idle = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    await click(button(tz("en", "start")));
    const warning = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(warning);
    expect(warning.defaultPrevented).toBe(true);
    // A page kept in the back/forward cache is not given up...
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    });
    expect(fired()).toBe(0);
    // ...one that is really gone is.
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    });
    expect(fired()).toBe(1);
    view.unmount();
  });

  it("does not warn during a break", async () => {
    const view = await open();
    await click(button(tz("en", "start")));
    await advance(25 * MIN);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    view.unmount();
  });
});

describe("FocusApp — music controls", () => {
  it("mutes and unmutes music and sounds together, and sets the volume", async () => {
    const view = await open();
    await click(labelled(tz("en", "mute")));
    expect(lofi.setMuted).toHaveBeenLastCalledWith(true);
    expect(labelled(tz("en", "unmute"))).toBeTruthy();
    await click(labelled(tz("en", "unmute")));
    expect(lofi.setMuted).toHaveBeenLastCalledWith(false);
    const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.getAttribute("aria-label")).toBe(tz("en", "volume"));
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(slider, "0.25");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(lofi.setVolume).toHaveBeenLastCalledWith(0.25);
    view.unmount();
  });

  it("is in Russian too", async () => {
    document.documentElement.lang = "ru";
    localStorage.setItem("lab:lang", "ru");
    const view = await open();
    expect(timerText()).toBe("25:00");
    view.unmount();
  });
});
