import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { FastForward, Pause } from "lucide-react";

import type { FootballText } from "@/lib/football/i18n";
import { CELEBRATION, fitView, pickAt, Stage, type View } from "@/lib/football/render/draw";
import { KITS } from "@/lib/football/render/sprites";
import { MATCH_SECONDS } from "@/lib/football/sim/balance";
import { choose, step, STEP } from "@/lib/football/sim/match";
import type { Match, Moment } from "@/lib/football/sim/types";

/** How long the player has to call a moment before the lads decide for themselves. */
export const MOMENT_SECONDS = 7;

/** Longest frame gap the sim catches up on; after that it just runs slower instead of lurching. */
const MAX_CATCH_UP = 0.1;

interface Hud {
  minute: number;
  home: number;
  away: number;
  over: boolean;
  /** How many things have happened, so the feed redraws when one more does. */
  events: number;
  /** The goal being celebrated, if one is. */
  banner: string | null;
}

function snapshot(m: Match, banner: string | null): Hud {
  return { minute: Math.min(90, Math.floor((m.t / MATCH_SECONDS) * 90)), home: m.score[0], away: m.score[1], over: m.over, events: m.events.length, banner };
}

const sameHud = (a: Hud, b: Hud): boolean => (Object.keys(a) as (keyof Hud)[]).every((key) => a[key] === b[key]);

/** True while the screen is taller than it is wide. */
function usePortrait(): boolean {
  const query = "(orientation: portrait)";
  const [portrait, setPortrait] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setPortrait(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return portrait;
}

export function MatchView({
  match,
  text,
  onOver,
  onLeave,
  children,
}: {
  match: Match;
  text: FootballText;
  /** Called once, at the final whistle. */
  onOver: (match: Match) => void;
  onLeave: () => void;
  /** The full-time panel, shown over the pitch once it's over. */
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(fitView(1, 1));
  const stageRef = useRef(new Stage());
  const [hud, setHud] = useState<Hud>(() => snapshot(match, null));
  const [moment, setMoment] = useState<Moment | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const portrait = usePortrait();
  // The loop reads these every frame without re-subscribing.
  // The match is landscape only: turned upright, it holds still until it's turned back.
  const pausedRef = useRef(false);
  pausedRef.current = paused || portrait;
  const fastRef = useRef(false);
  fastRef.current = fast;
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hover;
  const momentRef = useRef<Moment | null>(null);
  momentRef.current = moment;
  const momentLeft = useRef(0);
  const overRef = useRef(false);
  const goalsSeen = useRef(0);

  const resolve = useCallback(
    (index: number | null) => {
      if (!match.moment) return;
      choose(match, index);
      setMoment(null);
      setHover(null);
    },
    [match],
  );

  // Keep the canvas backing store at device resolution and the pitch fitted to it.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      viewRef.current = fitView(width, height, ratio);
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, []);

  // One loop for the whole match: fixed-step sim, held still while a call is pending or a goal is being celebrated.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const stage = stageRef.current;
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_CATCH_UP, (now - last) / 1000);
      last = now;
      const clock = now / 1000;
      const celebrating = stage.celebrating(clock) !== null;
      if (match.moment) {
        if (momentRef.current !== match.moment) {
          momentLeft.current = MOMENT_SECONDS;
          setMoment(match.moment);
        }
        if (!pausedRef.current) {
          momentLeft.current -= elapsed;
          if (momentLeft.current <= 0) resolve(null);
        }
      } else if (!pausedRef.current && !celebrating && !match.over) {
        pending += elapsed * (fastRef.current ? 2 : 1);
        while (pending >= STEP) {
          step(match, STEP);
          pending -= STEP;
          if (match.moment || match.over) break;
        }
        if (match.moment) pending = 0;
      } else {
        pending = 0;
      }
      if (ctx && canvas) {
        const ratio = canvas.width / Math.max(1, viewRef.current.width);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        stage.draw(ctx, match, viewRef.current, match.moment, hoverRef.current, clock);
      }
      let banner: string | null = null;
      if (stage.celebrating(clock) !== null) {
        const goal = [...match.events].reverse().find((event) => event.kind === "goal");
        banner = text.goal(goal?.who !== undefined ? match.players[goal.who].name : "");
      }
      goalsSeen.current = match.score[0] + match.score[1];
      const next = snapshot(match, banner);
      setHud((current) => (sameHud(current, next) ? current : next));
      if (match.over && !overRef.current) {
        overRef.current = true;
        setMoment(null);
        onOver(match);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [match, onOver, resolve, text]);

  // Ask the browser to hold the screen sideways; it only agrees in an installed app or fullscreen, so the rotate screen backs it up.
  useEffect(() => {
    const orientation = typeof screen === "undefined" ? undefined : (screen.orientation as ScreenOrientation & { lock?: (to: string) => Promise<void> });
    orientation?.lock?.("landscape")?.catch(() => {});
    return () => orientation?.unlock?.();
  }, []);

  // Switching apps or tabs pauses the match rather than letting it play on unwatched.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Keyboard: 1 to 9 pick a choice, Space lets the lads decide, P or Escape pauses.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (overRef.current) return;
      const current = momentRef.current;
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        setPaused((value) => !value);
        return;
      }
      if (!current || pausedRef.current) return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= current.choices.length) {
        event.preventDefault();
        resolve(number - 1);
      } else if (event.key === " ") {
        event.preventDefault();
        resolve(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolve]);

  const pointerIndex = (event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>): number | null => {
    const current = momentRef.current;
    if (!current) return null;
    const box = event.currentTarget.getBoundingClientRect();
    return pickAt(viewRef.current, match, current, event.clientX - box.left, event.clientY - box.top);
  };

  const onFieldClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (paused || !momentRef.current) return;
    const index = pointerIndex(event);
    if (index !== null) resolve(index);
  };

  const names = (index: number): string => match.players[index]?.name ?? "";
  const feed = match.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind !== "half" && event.kind !== "full")
    .slice(-5)
    .reverse();
  const home = KITS[match.sides[0].kit % KITS.length];
  const away = KITS[match.sides[1].kit % KITS.length];

  return (
    <div className="tower-run fb-run">
      <div className="tower-hud fb-hud">
        <button type="button" className="tower-icon-button" onClick={() => setPaused(true)} disabled={hud.over} aria-label={text.pause}>
          <Pause size={18} aria-hidden="true" />
        </button>
        <div className="fb-score" role="status" aria-live="polite">
          <span className="fb-team">
            <i className="fb-dot" style={{ background: home.jersey }} aria-hidden="true" />
            <span className="fb-team-name">{match.sides[0].name}</span>
          </span>
          <span className="fb-middle">
            <span className="fb-goals">
              {hud.home} – {hud.away}
            </span>
            <span className="fb-minute">{text.minute(hud.minute)}</span>
          </span>
          <span className="fb-team fb-team-away">
            <span className="fb-team-name">{match.sides[1].name}</span>
            <i className="fb-dot" style={{ background: away.jersey }} aria-hidden="true" />
          </span>
        </div>
        <button
          type="button"
          className="tower-icon-button"
          aria-label={text.speed}
          aria-pressed={fast}
          data-active={fast}
          onClick={() => setFast((current) => !current)}
        >
          <FastForward size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="fb-main">
      <div className="tower-field fb-field" ref={hostRef}>
        <canvas
          ref={canvasRef}
          className="tower-canvas"
          aria-label={text.fieldLabel}
          onClick={onFieldClick}
          onPointerMove={(event) => setHover(pointerIndex(event))}
          onPointerLeave={() => setHover(null)}
        />
        {hud.banner && (
          <div className="fb-banner" aria-hidden="true" style={{ animationDuration: `${CELEBRATION}s` }}>
            {hud.banner}
          </div>
        )}

      </div>

      <div className="fb-panel" data-active={moment !== null}>
        {moment ? (
          <>
            <div className="fb-panel-head">
              <strong>{text.yourCall}</strong>
              <span>{text.letThemDecide}</span>
            </div>
            <div className="fb-timer" aria-hidden="true">
              <span
                key={moment.carrier + ":" + match.t}
                style={{ animationDuration: `${MOMENT_SECONDS}s`, animationPlayState: paused ? "paused" : "running" }}
              />
            </div>
            <div className="fb-choices" role="group" aria-label={text.momentLabel}>
              {moment.choices.map((choice, index) => (
                <button
                  key={`${choice.kind}${choice.to ?? ""}`}
                  type="button"
                  className="fb-choice"
                  data-kind={choice.kind}
                  data-odds={choice.chance >= 0.65 ? "high" : choice.chance >= 0.35 ? "mid" : "low"}
                  onClick={() => resolve(index)}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                >
                  <kbd aria-hidden="true">{index + 1}</kbd>
                  {text.choice(choice, choice.to === undefined ? "" : names(choice.to))}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="fb-watching">{text.watching}</p>
            <ul className="fb-feed" aria-label={text.feedLabel}>
              {feed.map(({ event, index }) => (
                <li key={index} data-kind={event.kind} style={{ boxShadow: `inset 3px 0 0 ${(event.team === 0 ? home : away).jersey}` }}>
                  <span className="fb-feed-minute">{text.minute(Math.max(1, Math.ceil((event.t / MATCH_SECONDS) * 90)))}</span>
                  {text.feed(event.kind, names(event.who ?? -1))}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      </div>
      {paused && !hud.over && (
        <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="fb-pause-title">
          <div className="tower-panel">
            <h2 id="fb-pause-title">{text.paused}</h2>
            <div className="tower-actions">
              <button type="button" className="tower-button" onClick={() => setPaused(false)} autoFocus>
                {text.resume}
              </button>
              <button type="button" className="tower-button tower-button-quiet" onClick={onLeave}>
                {text.leave}
              </button>
            </div>
          </div>
        </div>
      )}
      {children}
      {portrait && !hud.over && (
        <div className="fb-rotate" role="alert">
          <svg viewBox="0 0 48 48" aria-hidden="true" className="fb-rotate-icon">
            <rect x="14" y="4" width="20" height="40" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M40 18c3 3 3 9 0 12m0 0 3-4m-3 4-4-2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <strong>{text.rotateTitle}</strong>
          <span>{text.rotateBody}</span>
          <button type="button" className="tower-button tower-button-quiet" onClick={onLeave}>
            {text.leave}
          </button>
        </div>
      )}
    </div>
  );
}
