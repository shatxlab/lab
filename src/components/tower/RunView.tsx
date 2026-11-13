import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Pause } from "lucide-react";

import { CHECKPOINT_MS } from "@/lib/tower/snapshot";
import { statChange, type TowerText } from "@/lib/tower/i18n";
import { ARENA, TOWER } from "@/lib/tower/sim/balance";
import { drawRun, fitView, toWorld, type View } from "@/lib/tower/render/draw";
import { aimAt, castSkill, chooseUpgrade, giveUp, holdFire, nearestEnemy, stats, step, STEP } from "@/lib/tower/sim/run";
import { towerStats } from "@/lib/tower/sim/stats";
import { isBossWave } from "@/lib/tower/sim/waves";
import type { Run, UpgradeId } from "@/lib/tower/sim/types";

interface Hud {
  phase: Run["phase"];
  wave: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** 0 just cast, 1 ready; in twentieths so the HUD only re-renders when the bar visibly moves. */
  skillCharge: number;
  skillSeconds: number;
  choices: string;
}

interface Point { x: number; y: number }

function snapshot(run: Run): Hud {
  return {
    phase: run.phase,
    wave: run.wave,
    hp: Math.ceil(run.hp),
    maxHp: stats(run).maxHp,
    gold: run.gold,
    skillCharge: Math.floor((1 - run.skillLeft / stats(run).skillCooldown) * 20) / 20,
    skillSeconds: Math.ceil(run.skillLeft * 10) / 10,
    choices: run.choices.join(","),
  };
}

function sameHud(a: Hud, b: Hud): boolean {
  return (Object.keys(a) as (keyof Hud)[]).every((key) => a[key] === b[key]);
}

/** Longest frame gap the sim catches up on; after that it just runs slower instead of lurching. */
const MAX_CATCH_UP = 0.1;
const KEY_TARGET_STEP = 14;

export function RunView({
  run,
  text,
  onOver,
  initiallyPaused,
  onCheckpoint,
  onSuspend,
  storageFailed,
  children,
}: {
  run: Run;
  text: TowerText;
  /** Called once, the moment the tower falls or the player gives up. */
  onOver: (run: Run) => void;
  initiallyPaused: boolean;
  onCheckpoint: () => boolean;
  onSuspend: () => void;
  storageFailed: boolean;
  /** The game-over panel, shown over the field once the run is over. */
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(fitView(1, 1));
  const [hud, setHud] = useState<Hud>(() => snapshot(run));
  const [paused, setPaused] = useState(initiallyPaused);
  const pausedRef = useRef(initiallyPaused);
  pausedRef.current = paused;
  // One finger steers arrows; an independent finger can place the active skill.
  const aimPointerRef = useRef<number | null>(null);
  const targetPointerRef = useRef<number | null>(null);
  const [targeting, setTargeting] = useState(false);
  const targetingRef = useRef(false);
  const [, setTarget] = useState<Point | null>(null);
  const targetRef = useRef<Point | null>(null);
  const overRef = useRef(false);

  const updateTarget = (point: Point) => {
    const next = { x: Math.max(0, Math.min(ARENA.width, point.x)), y: Math.max(0, Math.min(ARENA.height, point.y)) };
    targetRef.current = next;
    setTarget(next);
  };

  const cancelTargeting = useCallback(() => {
    const pointer = targetPointerRef.current;
    targetPointerRef.current = null;
    const canvas = canvasRef.current;
    if (pointer !== null && canvas?.hasPointerCapture?.(pointer)) canvas.releasePointerCapture?.(pointer);
    targetingRef.current = false;
    targetRef.current = null;
    setTargeting(false);
    setTarget(null);
  }, []);

  const beginTargeting = useCallback(() => {
    if (pausedRef.current || run.phase !== "playing" || run.skillLeft > 0 || targetingRef.current) return;
    const nearest = nearestEnemy(run);
    targetingRef.current = true;
    setTargeting(true);
    updateTarget(nearest ? { x: nearest.x, y: nearest.y } : { x: TOWER.x + Math.cos(run.aim) * 180, y: TOWER.y + Math.sin(run.aim) * 180 });
    canvasRef.current?.focus();
  }, [run]);

  const phaseRef = useRef(`${run.phase}:${run.wave}:${run.picksLeft}`);
  const refresh = useCallback((changed = false) => {
    if (run.phase !== "playing" && targetingRef.current) cancelTargeting();
    const next = snapshot(run);
    setHud((current) => (sameHud(current, next) ? current : next));
    const phase = `${run.phase}:${run.wave}:${run.picksLeft}`;
    const transitioned = phaseRef.current !== phase;
    phaseRef.current = phase;
    if (run.phase === "over") {
      if (!overRef.current) {
        overRef.current = true;
        onOver(run);
      }
    } else if (changed || transitioned) onCheckpoint();
  }, [run, onOver, onCheckpoint, cancelTargeting]);

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
        drawRun(ctx, run, viewRef.current, now / 1000, targetingRef.current ? targetRef.current : null);
      }
      refresh();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, refresh]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    cancelTargeting();
    holdFire(run);
    aimPointerRef.current = null;
    setPaused(true);
    if (run.phase !== "over") onCheckpoint();
  }, [run, onCheckpoint, cancelTargeting]);

  // Cover the picker as well as combat; don't rely on an unload callback to keep progress.
  // Cleanup only removes listeners/timers, never resurrects an old run by saving it.
  useEffect(() => {
    const save = () => { if (run.phase !== "over") onCheckpoint(); };
    const onHide = () => { if (document.visibilityState === "hidden") pause(); else save(); };
    const timer = window.setInterval(save, CHECKPOINT_MS);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", pause);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", pause);
    };
  }, [run, pause, onCheckpoint]);

  const worldPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return toWorld(viewRef.current, event.clientX - box.left, event.clientY - box.top);
  };

  const finishSkill = (point: Point) => {
    updateTarget(point);
    if (!pausedRef.current && run.phase === "playing" && castSkill(run, point.x, point.y)) refresh(true);
    cancelTargeting();
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pausedRef.current || run.phase !== "playing") return;
    const point = worldPoint(event);
    if (targetingRef.current) {
      if (targetPointerRef.current !== null) return;
      targetPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateTarget(point);
      return;
    }
    if (aimPointerRef.current !== null) return;
    aimPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    aimAt(run, point.x, point.y);
    onCheckpoint();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pausedRef.current) return;
    const point = worldPoint(event);
    if (targetingRef.current && event.pointerId === targetPointerRef.current) updateTarget(point);
    else if (event.pointerId === aimPointerRef.current) aimAt(run, point.x, point.y);
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = worldPoint(event);
    if (targetingRef.current && event.pointerId === targetPointerRef.current) {
      finishSkill(point);
      return;
    }
    if (event.pointerId !== aimPointerRef.current) return;
    aimPointerRef.current = null;
    holdFire(run);
    if (run.phase !== "over") onCheckpoint();
  };

  const onPointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId === targetPointerRef.current) {
      cancelTargeting();
      return;
    }
    if (event.pointerId !== aimPointerRef.current) return;
    aimPointerRef.current = null;
    holdFire(run);
    if (run.phase !== "over") onCheckpoint();
  };

  const moveKeyboardTarget = (key: string) => {
    if (key === "ArrowLeft" || key.toLowerCase() === "a") return { x: -KEY_TARGET_STEP, y: 0 };
    if (key === "ArrowRight" || key.toLowerCase() === "d") return { x: KEY_TARGET_STEP, y: 0 };
    if (key === "ArrowUp" || key.toLowerCase() === "w") return { x: 0, y: -KEY_TARGET_STEP };
    if (key === "ArrowDown" || key.toLowerCase() === "s") return { x: 0, y: KEY_TARGET_STEP };
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (targetingRef.current) cancelTargeting();
      else if (run.phase !== "over") pause();
      return;
    }
    if (pausedRef.current || run.phase !== "playing") return;
    if ((event.key === "1" || event.key === "Enter") && !targetingRef.current) {
      event.preventDefault();
      beginTargeting();
      return;
    }
    if (targetingRef.current) {
      const direction = moveKeyboardTarget(event.key);
      if (direction && targetRef.current) {
        event.preventDefault();
        updateTarget({ x: targetRef.current.x + direction.x, y: targetRef.current.y + direction.y });
      } else if ((event.key === "Enter" || event.key === " ") && targetRef.current) {
        event.preventDefault();
        finishSkill(targetRef.current);
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      run.firing = true;
      if (!event.repeat) onCheckpoint();
      return;
    }
    const direction = moveKeyboardTarget(event.key);
    if (direction) {
      event.preventDefault();
      const firing = run.firing;
      aimAt(run, TOWER.x + Math.cos(run.aim) * 180 + direction.x, TOWER.y + Math.sin(run.aim) * 180 + direction.y);
      run.firing = firing;
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    holdFire(run);
    if (run.phase !== "over") onCheckpoint();
  };

  const pick = (id: UpgradeId) => {
    if (pausedRef.current || !chooseUpgrade(run, id)) return;
    refresh(true);
    canvasRef.current?.focus();
  };

  const quit = () => {
    cancelTargeting();
    pausedRef.current = false;
    setPaused(false);
    giveUp(run);
    refresh();
  };

  const hpShare = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  const choices = hud.choices ? (hud.choices.split(",") as UpgradeId[]) : [];
  const skillName = text.skills[run.skill].name;
  const skillReady = hud.phase === "playing" && hud.skillCharge >= 1;

  return (
    <div className="tower-run">
      <div className="tower-hud">
        <button
          type="button"
          className="tower-icon-button"
          onClick={pause}
          disabled={hud.phase === "over"}
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

      <div className="tower-field" ref={hostRef} data-targeting={targeting}>
        <canvas
          ref={canvasRef}
          className="tower-canvas"
          tabIndex={0}
          aria-label={text.fieldLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />

        {targeting && <p className="tower-target-help" role="status">{text.skillTarget(skillName)}</p>}

        {!paused && hud.phase === "choosing" && choices.length > 0 && (
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
                    <span className="tower-choice-stats">{upgradeChange(text, run, id)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {paused && hud.phase !== "over" && (
          <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="tower-pause-title">
            <div className="tower-panel">
              <h2 id="tower-pause-title">{text.paused}</h2>
              <div className="tower-actions">
                <button type="button" className="tower-button" onClick={() => { pausedRef.current = false; setPaused(false); }} autoFocus>
                  {text.resume}
                </button>
                {storageFailed && <button type="button" className="tower-button tower-button-quiet" onClick={onCheckpoint}>{text.retrySave}</button>}
                <button type="button" className="tower-button tower-button-quiet" onClick={onSuspend}>
                  {text.saveAndMenu}
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

      <button
        type="button"
        className="tower-skill"
        data-ready={skillReady}
        data-targeting={targeting}
        aria-pressed={targeting}
        aria-label={targeting ? text.skillCancel : text.skillTarget(skillName)}
        disabled={!targeting && (paused || hud.phase !== "playing" || hud.skillSeconds > 0)}
        onClick={() => { if (targetingRef.current) cancelTargeting(); else beginTargeting(); }}
      >
        <span
          className="tower-skill-fill"
          aria-hidden="true"
          style={{ "--charge": hud.phase === "playing" ? hud.skillCharge : 0 } as CSSProperties}
        />
        <span className="tower-skill-name">{skillName}</span>
        <span className="tower-skill-label">
          {targeting ? text.skillCancel : skillReady ? text.skillReady : text.skillRecharging(hud.skillSeconds.toFixed(1))}
        </span>
      </button>
    </div>
  );
}

/** The card's numbers as they are now and after taking this upgrade; a new one shows only where it starts. */
function upgradeChange(text: TowerText, run: Run, id: UpgradeId): string {
  const after = text.upgradeStats[id](towerStats({ ...run.upgrades, [id]: run.upgrades[id] + 1 }, run.perks, run.skill));
  return statChange(run.upgrades[id] === 0 ? after : text.upgradeStats[id](stats(run)), after);
}
