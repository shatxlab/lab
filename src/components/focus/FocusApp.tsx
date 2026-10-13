import * as React from "react";

import { DayPanel } from "@/components/focus/DayPanel";
import { DaySetup } from "@/components/focus/DaySetup";
import { FocusScene } from "@/components/focus/FocusScene";
import { HistoryPanel } from "@/components/focus/HistoryPanel";
import { ToolPage } from "@/components/tools/ui";
import { localDay } from "@/lib/apps/local-day";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { cueFor } from "@/lib/focus/cues";
import { applyTimer, dismissDay, rollover, startDay } from "@/lib/focus/day";
import { formatClock, tz } from "@/lib/focus/i18n";
import { buildOffice } from "@/lib/focus/office";
import { quotaOf, type Plan } from "@/lib/focus/pomodoro";
import { createFocusSoundEngine, type FocusSoundEngine } from "@/lib/focus/sound";
import { emptyStore, readFocusStore, writeFocusStore, type FocusStore } from "@/lib/focus/storage";
import { abandon, endDay, isRunning, pause, remainingMs, resume, skipBreak, start, tick, type TimerState } from "@/lib/focus/timer";
import type { Employee } from "@/lib/tycoon/sim/types";
import { cn } from "@/lib/viewer/utils";

const TICK_MS = 250;

export default function FocusApp() {
  const lang = useAppLang();
  const [store, setStore] = React.useState<FocusStore>(() => emptyStore(0));
  const storeRef = React.useRef(store);
  const [hydrated, setHydrated] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const [focusMode, setFocusMode] = React.useState(false);
  const [tapped, setTapped] = React.useState<Employee | null>(null);

  const soundRef = React.useRef<FocusSoundEngine | null>(null);
  soundRef.current ??= createFocusSoundEngine(true);
  const sound = soundRef.current;

  const commit = React.useCallback((update: (current: FocusStore) => FocusStore) => {
    const next = update(storeRef.current);
    if (next === storeRef.current) return;
    storeRef.current = next;
    setStore(next);
    writeFocusStore(next);
  }, []);

  React.useEffect(() => {
    // A day left open past midnight is closed (and recorded) before anything shows.
    const stored = readFocusStore();
    const loaded = rollover(stored, localDay());
    // Persist what the rollover did right away, so the closed day is not lost if the tab goes next.
    if (loaded !== stored) writeFocusStore(loaded);
    storeRef.current = loaded;
    setStore(loaded);
    setNow(Date.now());
    setHydrated(true);
  }, []);

  React.useEffect(() => sound.setEnabled(store.sound), [sound, store.sound]);

  const today = store.today;
  const timer = today?.timer ?? null;
  const quota = timer ? quotaOf(timer.segments) : 0;
  const office = React.useMemo(() => (today ? buildOffice(today.key, quota) : null), [today?.key, quota]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Apply a timer transition, with the sound it deserves. */
  const run = React.useCallback(
    (change: (state: TimerState, at: number) => TimerState) => {
      const current = storeRef.current.today;
      if (!current) return;
      const at = Date.now();
      const next = change(current.timer, at);
      setNow(at);
      if (next === current.timer) return;
      const cue = cueFor(current.timer, next);
      if (cue) soundRef.current?.play(cue);
      commit((s) => applyTimer(s, next));
    },
    [commit],
  );

  // The clock: timestamps decide, so a throttled background tab only delays the display.
  const running = timer ? isRunning(timer) : false;
  React.useEffect(() => {
    if (!running) return;
    const beat = () => run(tick);
    const id = window.setInterval(beat, TICK_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [running, run]);

  // Closing or reloading mid-Pomodoro asks first; if the page really goes, the Pomodoro is given up.
  const focusing = timer?.phase === "focus";
  React.useEffect(() => {
    if (!focusing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leave = (event: PageTransitionEvent) => {
      if (!event.persisted) run(abandon);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", leave);
    };
  }, [focusing, run]);

  // The tab title carries the countdown, so it is visible from other tabs.
  const baseTitle = React.useRef("");
  React.useEffect(() => {
    baseTitle.current = document.title;
    return () => {
      document.title = baseTitle.current;
    };
  }, []);
  React.useEffect(() => {
    if (timer && running) document.title = `${formatClock(remainingMs(timer, now))} · ${tz(lang, "title")}`;
    else if (baseTitle.current) document.title = baseTitle.current;
  }, [timer, running, now, lang]);

  // Focus mode: the day fills the screen (and the browser's full screen when allowed).
  const toggleFocusMode = React.useCallback(() => {
    setFocusMode((on) => {
      const next = !on;
      try {
        if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch {
        // Full screen is a nicety; the overlay works without it.
      }
      return next;
    });
  }, []);
  React.useEffect(() => {
    if (!focusMode) return;
    const onChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [focusMode]);

  // A person you tap says hello for a few seconds.
  React.useEffect(() => {
    if (!tapped) return;
    const id = window.setTimeout(() => setTapped(null), 3500);
    return () => window.clearTimeout(id);
  }, [tapped]);

  const openDay = (plan: Plan) => {
    commit((s) => startDay(s, plan, localDay()));
    setFocusMode(false);
  };

  // The plate over the office doors: time left (frozen while paused), or the next segment's length.
  const active = timer?.phase === "focus" || timer?.phase === "break";
  const chipMs = !timer ? 0 : active ? remainingMs(timer, now) : timer.phase === "ready" ? (timer.segments[timer.index]?.minutes ?? 0) * 60_000 : 0;
  const chipLabel = timer?.phase === "complete" ? "—" : formatClock(chipMs);

  const role = (person: Employee) =>
    tz(lang, person.role === "designer" ? "roleDesigner" : person.role === "tester" ? "roleTester" : "roleDeveloper");

  let body: React.ReactNode = null;
  if (hydrated) {
    if (!today || !timer || !office) {
      body = (
        <>
          <DaySetup
            lang={lang}
            plan={store.plan}
            sound={store.sound}
            onOpen={openDay}
            onSound={(on) => commit((s) => ({ ...s, sound: on }))}
          />
          <HistoryPanel lang={lang} history={store.history} today={localDay()} />
        </>
      );
    } else {
      body = (
        <>
          <div className={cn(focusMode ? "fixed inset-0 z-60 flex flex-col gap-3 overflow-auto bg-(--bg) p-4" : "flex flex-col gap-4")}>
            <FocusScene
              lang={lang}
              office={office}
              fired={timer.missed}
              working={timer.phase === "focus" && !timer.paused}
              label={chipLabel}
              onSelect={setTapped}
              className={focusMode ? "min-h-48 flex-1" : "h-[46dvh] max-h-[32rem] min-h-64"}
            />
            <p className="min-h-5 text-center text-sm text-(--muted-fg)" role="status">
              {tapped ? tz(lang, "tapped", { name: tapped.name, role: role(tapped) }) : ""}
            </p>
            <DayPanel
              lang={lang}
              timer={timer}
              office={office}
              now={now}
              focusMode={focusMode}
              onStart={() => run(start)}
              onPause={() => run(pause)}
              onResume={() => run(resume)}
              onSkipBreak={() => run(skipBreak)}
              onGiveUp={() => run(abandon)}
              onEndDay={() => run((state) => endDay(state))}
              onNewDay={() => {
                setFocusMode(false);
                commit(dismissDay);
              }}
              onToggleFocusMode={toggleFocusMode}
            />
          </div>
          {!focusMode && <HistoryPanel lang={lang} history={store.history} today={localDay()} />}
        </>
      );
    }
  }

  return (
    <ToolPage title={tz(lang, "title")} tagline={tz(lang, "tagline")}>
      {body}
    </ToolPage>
  );
}
