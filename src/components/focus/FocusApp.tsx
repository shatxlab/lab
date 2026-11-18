import * as React from "react";
import { Maximize, Minimize, Volume2, VolumeX } from "lucide-react";

import { FlowPanel } from "@/components/focus/FlowPanel";
import { FocusScene } from "@/components/focus/FocusScene";
import { ToolPage } from "@/components/tools/ui";
import { withBase } from "@/lib/apps/paths";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { cueFor } from "@/lib/focus/cues";
import { abandon, createFlow, FLOW, HEADCOUNT, isRunning, remainingMs, segmentMinutes, skipBreak, start, tick, type FlowState } from "@/lib/focus/flow";
import { formatClock, tz } from "@/lib/focus/i18n";
import { createLofi, type Lofi, type LofiState } from "@/lib/focus/lofi-audio";
import { buildOffice } from "@/lib/focus/office";
import { createFocusSoundEngine, type FocusSoundEngine } from "@/lib/focus/sound";
import type { Employee } from "@/lib/tycoon/sim/types";

const TICK_MS = 250;
/** Earlier versions saved days and history here; there is nothing to save any more. */
const OLD_KEY = "lab:focus:v1";

const newKey = () => (Math.random() * 0x100000000) >>> 0;

const ICON_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-(--border) bg-(--bg) px-3 text-sm font-medium text-(--fg) transition-colors hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

export default function FocusApp() {
  const lang = useAppLang();
  const [flow, setFlow] = React.useState<FlowState>(createFlow);
  const flowRef = React.useRef(flow);
  /** The office is chosen on the client, so the server and the first paint agree. */
  const [key, setKey] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [tapped, setTapped] = React.useState<Employee | null>(null);
  const [fullScreen, setFullScreen] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(0.6);
  const [music, setMusic] = React.useState<LofiState>("idle");

  const lofiRef = React.useRef<Lofi | null>(null);
  const soundRef = React.useRef<FocusSoundEngine | null>(null);
  soundRef.current ??= createFocusSoundEngine(true);

  React.useEffect(() => {
    setKey(newKey());
    setNow(Date.now());
    try {
      localStorage.removeItem(OLD_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    const lofi = createLofi();
    lofiRef.current = lofi;
    const unsubscribe = lofi.subscribe(setMusic);
    // Plays at once where the browser allows it; otherwise the first tap starts it.
    void lofi.start();
    return () => {
      unsubscribe();
      lofi.stop();
      lofiRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    lofiRef.current?.setMuted(muted);
    soundRef.current?.setEnabled(!muted);
  }, [muted]);
  React.useEffect(() => lofiRef.current?.setVolume(volume), [volume]);
  // Breaks are quiet: the music fades out when one starts and comes back with the next Pomodoro.
  const onBreak = flow.phase === "break";
  React.useEffect(() => lofiRef.current?.setPaused(onBreak), [onBreak]);

  const office = React.useMemo(() => (key === null ? null : buildOffice(key, HEADCOUNT)), [key]);

  /** Apply a transition, with the sound it deserves. */
  const run = React.useCallback((change: (state: FlowState, at: number) => FlowState) => {
    const current = flowRef.current;
    const at = Date.now();
    const next = change(current, at);
    setNow(at);
    if (next === current) return;
    const cue = cueFor(current, next);
    if (cue) soundRef.current?.play(cue);
    flowRef.current = next;
    setFlow(next);
  }, []);

  // The clock: timestamps decide, so a throttled background tab only delays the display.
  const running = isRunning(flow);
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
  const focusing = flow.phase === "focus";
  React.useEffect(() => {
    if (!focusing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leave = (event: PageTransitionEvent) => {
      if (!event.persisted) run((state) => abandon(state));
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
    if (running) document.title = `${formatClock(remainingMs(flow, now))} · ${tz(lang, "title")}`;
    else if (baseTitle.current) document.title = baseTitle.current;
  }, [flow, running, now, lang]);

  // The office always fills the page; the browser's full screen is an extra.
  React.useEffect(() => {
    const onChange = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullScreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      // Full screen is a nicety.
    }
  };

  // A person you tap says hello for a few seconds.
  React.useEffect(() => {
    if (!tapped) return;
    const id = window.setTimeout(() => setTapped(null), 3500);
    return () => window.clearTimeout(id);
  }, [tapped]);

  // Someone was just fired: say so across the top, and name who is next.
  const [firedAlert, setFiredAlert] = React.useState<string | null>(null);
  const firedBefore = React.useRef(0);
  React.useEffect(() => {
    const fired = flow.fired;
    if (fired <= firedBefore.current) {
      firedBefore.current = fired;
      return;
    }
    const from = firedBefore.current;
    firedBefore.current = fired;
    const name = (id: number | undefined) => office?.roster.find((person) => person.id === id)?.name ?? "";
    const gone = office?.fireOrder.slice(from, fired).map(name).join(", ") ?? "";
    const next = fired < HEADCOUNT ? name(office?.fireOrder[fired]) : "";
    setFiredAlert(next ? tz(lang, "firedAlert", { name: gone, next }) : tz(lang, "firedAlertLast", { name: gone }));
  }, [flow.fired, office, lang]);
  React.useEffect(() => {
    if (!firedAlert) return;
    const id = window.setTimeout(() => setFiredAlert(null), 5000);
    return () => window.clearTimeout(id);
  }, [firedAlert]);

  // A Pomodoro finished or a break ended: say so across the top, as well as the bell.
  const [phaseAlert, setPhaseAlert] = React.useState<string | null>(null);
  const phaseBefore = React.useRef(flow.phase);
  React.useEffect(() => {
    const before = phaseBefore.current;
    phaseBefore.current = flow.phase;
    if (flow.phase === "break" && before === "focus") {
      setPhaseAlert(tz(lang, "breakAlert", { n: flow.long ? FLOW.longMin : FLOW.shortMin }));
    } else if (flow.phase === "focus" && before === "break") {
      setPhaseAlert(tz(lang, "breakOverAlert"));
    }
  }, [flow.phase, flow.long, lang]);
  React.useEffect(() => {
    if (!phaseAlert) return;
    const id = window.setTimeout(() => setPhaseAlert(null), 8000);
    return () => window.clearTimeout(id);
  }, [phaseAlert]);

  const hire = () => {
    flowRef.current = createFlow();
    setFlow(flowRef.current);
    setKey(newKey());
  };

  // The plate over the office doors: time left or the length of what is next.
  const active = flow.phase === "focus" || flow.phase === "break";
  const chipMs = active ? remainingMs(flow, now) : flow.phase === "ready" ? segmentMinutes(flow) * 60_000 : 0;
  const chipLabel = flow.phase === "empty" ? "—" : formatClock(chipMs);

  const role = (person: Employee) => tz(lang, person.role === "designer" ? "roleDesigner" : person.role === "tester" ? "roleTester" : "roleDeveloper");

  if (!office) {
    return (
      <ToolPage title={tz(lang, "title")} tagline={tz(lang, "tagline")}>
        <p className="text-sm text-(--muted-fg)">{tz(lang, "loading")}</p>
      </ToolPage>
    );
  }

  return (
    <div className="fixed inset-0 z-60 flex flex-col gap-3 overflow-auto bg-(--bg) p-4" data-testid="focus-room">
      {firedAlert && (
        <div role="alert" className="pointer-events-none fixed inset-x-0 top-4 z-70 flex justify-center px-4">
          <p className="rounded-md border border-(--warning) bg-(--surface) px-4 py-2 text-center text-sm font-semibold text-(--warning) shadow-lg">{firedAlert}</p>
        </div>
      )}
      {phaseAlert && !firedAlert && (
        <div role="alert" className="pointer-events-none fixed inset-x-0 top-4 z-70 flex justify-center px-4">
          <p className="rounded-md border border-(--accent) bg-(--surface) px-4 py-2 text-center text-sm font-semibold text-(--accent) shadow-lg">{phaseAlert}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold">{tz(lang, "title")}</h1>
        <div className="flex items-center gap-2">
          <button type="button" className={ICON_BUTTON} aria-label={tz(lang, muted ? "unmute" : "mute")} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX aria-hidden="true" className="size-4" /> : <Volume2 aria-hidden="true" className="size-4" />}
          </button>
          <label className="flex items-center gap-2 text-xs text-(--muted-fg)">
            <span className="sr-only sm:not-sr-only">{tz(lang, "music")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label={tz(lang, "volume")}
              className="w-24 accent-(--accent)"
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
        </div>
        <button type="button" className={ICON_BUTTON} onClick={toggleFullScreen}>
          {fullScreen ? <Minimize aria-hidden="true" className="size-4" /> : <Maximize aria-hidden="true" className="size-4" />}
          <span className="hidden sm:inline">{tz(lang, fullScreen ? "exitFullScreen" : "fullScreen")}</span>
        </button>
        <a href={withBase("/")} className={ICON_BUTTON}>
          {tz(lang, "leave")}
        </a>
      </div>

      {music === "blocked" && (
        <p className="text-center text-xs text-(--muted-fg)" role="status">
          {tz(lang, "musicBlocked")}
        </p>
      )}

      <FocusScene
        lang={lang}
        office={office}
        fired={flow.fired}
        working={flow.phase === "focus"}
        onBreak={onBreak}
        label={chipLabel}
        onSelect={setTapped}
        className="min-h-48 flex-1"
      />
      <p className="min-h-5 text-center text-sm text-(--muted-fg)" role="status">
        {tapped ? tz(lang, "tapped", { name: tapped.name, role: role(tapped) }) : ""}
      </p>
      <FlowPanel
        lang={lang}
        flow={flow}
        office={office}
        now={now}
        onStart={() => {
          // A click is the gesture the browser wants before it lets music play.
          void lofiRef.current?.start();
          run(start);
        }}
        onSkipBreak={() => run(skipBreak)}
        onGiveUp={() => run((state) => abandon(state))}
        onHire={hire}
      />
      {/* Debugging only: `import.meta.env.DEV` is false in a build, so this never ships. Ends the Pomodoro now, as if its time were up. Fixed in the corner so it takes no room from the scene. */}
      {import.meta.env.DEV && flow.phase === "focus" && (
        <button
          type="button"
          className="fixed bottom-2 left-2 z-50 rounded-md border border-dashed border-(--border) bg-(--surface) px-3 py-1 text-xs text-(--muted-fg) hover:text-(--fg)"
          onClick={() => run((state, at) => tick({ ...state, endsAt: at }, at))}
        >
          Dev: finish Pomodoro
        </button>
      )}
    </div>
  );
}
