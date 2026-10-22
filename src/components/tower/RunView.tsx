import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pause } from "lucide-react";

import type { TowerText } from "@/lib/tower/i18n";
import { drawRun, fitView, toWorld, type View } from "@/lib/tower/render/draw";
import { castVolley, chooseUpgrade, giveUp, nearestEnemy, stats, step, STEP } from "@/lib/tower/sim/run";
import { isBossWave } from "@/lib/tower/sim/waves";
import type { Run, UpgradeId } from "@/lib/tower/sim/types";

interface Hud {
  phase: Run["phase"];
  wave: number;
  hp: number;
  maxHp: number;
  gold: number;
  volleyReady: boolean;
  choices: string;
}

function snapshot(run: Run): Hud {
  return {
    phase: run.phase,
    wave: run.wave,
    hp: Math.ceil(run.hp),
    maxHp: stats(run).maxHp,
    gold: run.gold,
    volleyReady: run.volleyLeft <= 0,
    choices: run.choices.join(","),
  };
}

function sameHud(a: Hud, b: Hud): boolean {
  return (Object.keys(a) as (keyof Hud)[]).every((key) => a[key] === b[key]);
}

/** Longest frame gap the sim catches up on; after that it just runs slower instead of lurching. */
const MAX_CATCH_UP = 0.1;

export function RunView({
  run,
  text,
  onOver,
  children,
}: {
  run: Run;
  text: TowerText;
  /** Called once, the moment the tower falls or the player gives up. */
  onOver: (run: Run) => void;
  /** The game-over panel, shown over the field once the run is over. */
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(fitView(1, 1));
  const [hud, setHud] = useState<Hud>(() => snapshot(run));
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const overRef = useRef(false);

  const refresh = useCallback(() => {
    const next = snapshot(run);
    setHud((current) => (sameHud(current, next) ? current : next));
    if (run.phase === "over" && !overRef.current) {
      overRef.current = true;
      onOver(run);
    }
  }, [run, onOver]);

  // Keep the canvas backing store at device resolution and the arena fitted to it.
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
      viewRef.current = fitView(width, height);
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, []);

  // One loop for the whole run: fixed-step sim while playing, a fresh frame every display refresh.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_CATCH_UP, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && run.phase === "playing") {
        pending += elapsed;
        while (pending >= STEP && run.phase === "playing") {
          step(run, STEP);
          pending -= STEP;
        }
      } else {
        pending = 0;
      }
      if (ctx && canvas) {
        const ratio = canvas.width / Math.max(1, viewRef.current.width);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawRun(ctx, run, viewRef.current, now / 1000);
      }
      refresh();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, refresh]);

  // Switching apps or tabs pauses rather than letting the wave chew through the wall.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && run.phase === "playing") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [run]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (paused) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = toWorld(viewRef.current, event.clientX - box.left, event.clientY - box.top);
    castVolley(run, point.x, point.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Escape") {
      if (run.phase === "playing") setPaused(true);
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    const target = nearestEnemy(run);
    if (target && !paused) castVolley(run, target.x, target.y);
  };

  const pick = (id: UpgradeId) => {
    chooseUpgrade(run, id);
    refresh();
    canvasRef.current?.focus();
  };

  const quit = () => {
    setPaused(false);
    giveUp(run);
    refresh();
  };

  const hpShare = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  const choices = hud.choices ? (hud.choices.split(",") as UpgradeId[]) : [];

  return (
    <div className="tower-run">
      <div className="tower-hud">
        <button
          type="button"
          className="tower-icon-button"
          onClick={() => setPaused(true)}
          disabled={hud.phase !== "playing"}
          aria-label={text.pause}
        >
          <Pause size={18} aria-hidden="true" />
        </button>
        <div className="tower-hud-wave">
          <span>{text.wave(hud.wave)}</span>
          {isBossWave(hud.wave) && <span className="tower-tag">{text.bossWave}</span>}
        </div>
        <div className="tower-hud-gold">{text.gold(hud.gold)}</div>
      </div>
      <div
        className="tower-hp"
        role="meter"
        aria-label={text.wall}
        aria-valuemin={0}
        aria-valuemax={hud.maxHp}
        aria-valuenow={hud.hp}
        aria-valuetext={`${hud.hp} / ${hud.maxHp}`}
      >
        <div
          className="tower-hp-fill"
          data-level={hpShare > 0.5 ? "good" : hpShare > 0.25 ? "warn" : "bad"}
          style={{ width: `${Math.max(0, Math.min(1, hpShare)) * 100}%` }}
        />
        <span className="tower-hp-text">
          {text.wall} {hud.hp} / {hud.maxHp}
        </span>
      </div>

      <div className="tower-field" ref={hostRef}>
        <canvas
          ref={canvasRef}
          className="tower-canvas"
          tabIndex={0}
          aria-label={text.fieldLabel}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        />

        {hud.phase === "choosing" && choices.length > 0 && (
          <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="tower-pick-title">
            <div className="tower-panel">
              <p className="tower-kicker">{hud.wave === 0 ? text.headStart : text.waveCleared(hud.wave)}</p>
              <h2 id="tower-pick-title">{text.chooseUpgrade}</h2>
              <div className="tower-choices">
                {choices.map((id, index) => (
                  <button
                    key={id}
                    type="button"
                    className="tower-choice"
                    onClick={() => pick(id)}
                    autoFocus={index === 0}
                  >
                    <span className="tower-choice-name">{text.upgrades[id].name}</span>
                    <span className="tower-choice-level">{text.levelUp(run.upgrades[id], run.upgrades[id] + 1)}</span>
                    <span className="tower-choice-description">{text.upgrades[id].description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {paused && hud.phase === "playing" && (
          <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="tower-pause-title">
            <div className="tower-panel">
              <h2 id="tower-pause-title">{text.paused}</h2>
              <div className="tower-actions">
                <button type="button" className="tower-button" onClick={() => setPaused(false)} autoFocus>
                  {text.resume}
                </button>
                <button type="button" className="tower-button tower-button-quiet" onClick={quit}>
                  {text.giveUp}
                </button>
              </div>
            </div>
          </div>
        )}

        {hud.phase === "over" && children}
      </div>

      <p className="tower-volley" data-ready={hud.volleyReady && hud.phase === "playing" ? "" : undefined}>
        {hud.volleyReady ? text.volleyReady : text.volleyCharging}
      </p>
    </div>
  );
}
