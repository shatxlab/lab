import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { Coins, FastForward, Heart, Pause, X } from "lucide-react";

import { statChange } from "@/lib/tower/i18n";
import type { KingsroadText } from "@/lib/kingsroad/i18n";
import { drawGame, fitView, toWorld, type Selection, type View } from "@/lib/kingsroad/render/draw";
import { ARCHER_BRANCHES, ARENA, MAX_LEVEL, PLOT_REACH, TOWER_KINDS, TOWERS, VOLLEY } from "@/lib/kingsroad/sim/balance";
import {
  build,
  buildCost,
  callWave,
  castVolley,
  earlyBonus,
  giveUp,
  leadFoe,
  atFork,
  levelOf,
  refundFor,
  sell,
  step,
  STEP,
  towerOn,
  upgrade,
  upgradeCost,
} from "@/lib/kingsroad/sim/game";
import { mapById } from "@/lib/kingsroad/sim/maps";
import { isBossWave } from "@/lib/kingsroad/sim/waves";
import type { ArcherBranch, Game, TowerKind } from "@/lib/kingsroad/sim/types";

interface Hud {
  status: Game["status"];
  wave: number;
  lives: number;
  gold: number;
  /** Whole seconds until the next wave sets off on its own, or null while one is coming. */
  nextWaveIn: number | null;
  /** 0 just loosed, 1 ready; in twentieths so the HUD only re-renders when the bar visibly moves. */
  volleyCharge: number;
  /** Every tower's plot, kind and level, so the sheet follows builds, upgrades and sales. */
  towers: string;
}

function snapshot(game: Game): Hud {
  return {
    status: game.status,
    wave: game.wave,
    lives: game.lives,
    gold: game.gold,
    nextWaveIn: game.nextWaveIn === null ? null : Math.ceil(game.nextWaveIn),
    volleyCharge: Math.floor((1 - game.volleyLeft / VOLLEY.cooldown) * 20) / 20,
    towers: game.towers.map((tower) => `${tower.plot}${tower.kind}${tower.level}`).join(","),
  };
}

function sameHud(a: Hud, b: Hud): boolean {
  return (Object.keys(a) as (keyof Hud)[]).every((key) => a[key] === b[key]);
}

/** Longest frame gap the sim catches up on; after that it just runs slower instead of lurching. */
const MAX_CATCH_UP = 0.1;

export function GameView({
  game,
  text,
  onOver,
  children,
}: {
  game: Game;
  text: KingsroadText;
  /** Called once, the moment the gate falls, the last wave is beaten or the player gives up. */
  onOver: (game: Game) => void;
  /** The end-of-game panel, shown over the field once it's over. */
  children?: React.ReactNode;
}) {
  const map = mapById(game.map);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(fitView(1, 1));
  const [hud, setHud] = useState<Hud>(() => snapshot(game));
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [aiming, setAiming] = useState(false);
  const [selection, setSelection] = useState<Selection>({ plot: null, preview: null });
  // The loop reads these every frame without re-subscribing.
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const fastRef = useRef(false);
  fastRef.current = fast;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const overRef = useRef(false);

  const refresh = useCallback(() => {
    const next = snapshot(game);
    setHud((current) => (sameHud(current, next) ? current : next));
    if ((game.status === "won" || game.status === "lost") && !overRef.current) {
      overRef.current = true;
      setSelection({ plot: null, preview: null });
      setAiming(false);
      onOver(game);
    }
  }, [game, onOver]);

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

  // One loop for the whole game: fixed-step sim, twice as many steps at double speed, a fresh frame every refresh.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_CATCH_UP, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        pending += elapsed * (fastRef.current ? 2 : 1);
        while (pending >= STEP) {
          step(game, STEP);
          pending -= STEP;
        }
      } else {
        pending = 0;
      }
      if (ctx && canvas) {
        const ratio = canvas.width / Math.max(1, viewRef.current.width);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawGame(ctx, game, viewRef.current, selectionRef.current, now / 1000);
      }
      refresh();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [game, refresh]);

  const pause = useCallback(() => {
    setAiming(false);
    setPaused(true);
  }, []);

  // Switching apps or tabs pauses rather than letting the wave walk in unopposed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && game.status === "playing") pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [game, pause]);

  const over = hud.status === "won" || hud.status === "lost";
  const select = (plot: number | null) => setSelection({ plot, preview: null });

  const onFieldClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (paused || over) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = toWorld(viewRef.current, event.clientX - box.left, event.clientY - box.top);
    if (aiming) {
      if (castVolley(game, point.x, point.y)) {
        setAiming(false);
        refresh();
      }
      return;
    }
    let nearest: number | null = null;
    let nearestDistance: number = PLOT_REACH;
    map.plots.forEach((plot, index) => {
      const distance = Math.hypot(plot.x - point.x, plot.y - point.y);
      if (distance <= nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    select(nearest === selection.plot ? null : nearest);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (over) return;
    if (event.key === "Escape") {
      if (aiming) setAiming(false);
      else if (selection.plot !== null) select(null);
      else pause();
      return;
    }
    if (paused) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const count = map.plots.length;
      const from = selection.plot ?? (forward ? -1 : 0);
      select((from + (forward ? 1 : -1) + count) % count);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const target = leadFoe(game);
      if (target && castVolley(game, target.x, target.y)) refresh();
      return;
    }
    if (event.key === "n" || event.key === "N") {
      if (callWave(game)) refresh();
    }
  };

  const act = (done: boolean) => {
    if (done) refresh();
  };

  const onWave = () => act(callWave(game));

  const onVolley = () => {
    if (hud.status !== "playing" || hud.volleyCharge < 1) return;
    setAiming((current) => !current);
    select(null);
  };

  const quit = () => {
    setPaused(false);
    giveUp(game);
    refresh();
  };

  const volleyReady = hud.status === "playing" && hud.volleyCharge >= 1;
  const selectedPlot = selection.plot === null ? null : map.plots[selection.plot];
  const tower = selection.plot === null ? undefined : towerOn(game, selection.plot);
  // Keep the sheet clear of the plot it is about: over the top of the field for plots low down, else the bottom.
  const sheetSide = selectedPlot && selectedPlot.y > ARENA.height * 0.55 ? "top" : "bottom";
  const bossNow = hud.wave > 0 && isBossWave(hud.wave, map);

  return (
    <div className="tower-run kr-run">
      <div className="tower-hud">
        <button type="button" className="tower-icon-button" onClick={pause} disabled={over} aria-label={text.pause}>
          <Pause size={18} aria-hidden="true" />
        </button>
        <div className="tower-hud-wave">
          <span>{text.wave(hud.wave, map.waves)}</span>
          {bossNow && <span className="tower-tag">{text.bossWave}</span>}
        </div>
        <span className="kr-hud-stat" aria-label={text.lives(hud.lives)}>
          <Heart size={16} aria-hidden="true" />
          {hud.lives}
        </span>
        <span className="kr-hud-stat tower-hud-gold" aria-label={text.gold(hud.gold)}>
          <Coins size={16} aria-hidden="true" />
          {hud.gold}
        </span>
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

      <div className="tower-field" ref={hostRef}>
        <canvas
          ref={canvasRef}
          className="tower-canvas"
          data-aiming={aiming}
          tabIndex={0}
          aria-label={text.fieldLabel}
          onClick={onFieldClick}
          onKeyDown={onKeyDown}
        />

        {selection.plot !== null && !over && !paused && (
          <div className="kr-sheet" data-side={sheetSide} role="dialog" aria-label={tower ? text.towers[tower.kind].name : text.buildHere}>
            <button type="button" className="kr-sheet-close" onClick={() => select(null)} aria-label={text.close}>
              <X size={16} aria-hidden="true" />
            </button>
            {tower ? (
              <TowerSheet
                text={text}
                kind={tower.kind}
                level={tower.level}
                branch={tower.branch}
                fork={atFork(game, tower)}
                upgradeCost={upgradeCost(tower)}
                refund={refundFor(game, tower)}
                gold={hud.gold}
                onUpgrade={(branch) => act(upgrade(game, tower.plot, branch))}
                onSell={() => {
                  if (sell(game, tower.plot)) {
                    select(null);
                    refresh();
                  }
                }}
              />
            ) : (
              <BuildSheet
                text={text}
                gold={hud.gold}
                preview={selection.preview}
                onPreview={(kind) => setSelection({ plot: selection.plot, preview: kind })}
                onBuild={(kind) => {
                  if (selection.plot !== null && build(game, selection.plot, kind)) {
                    setSelection({ plot: selection.plot, preview: null });
                    refresh();
                  }
                }}
              />
            )}
          </div>
        )}

        {paused && !over && (
          <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="kr-pause-title">
            <div className="tower-panel">
              <h2 id="kr-pause-title">{text.paused}</h2>
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

        {over && children}
      </div>

      <div className="kr-bar">
        <button
          type="button"
          className="tower-button kr-wave"
          onClick={onWave}
          disabled={!(hud.status === "ready" || (hud.status === "playing" && hud.nextWaveIn !== null))}
        >
          {hud.status === "ready"
            ? text.startWave
            : hud.nextWaveIn !== null
              ? text.nextWave(hud.nextWaveIn, earlyBonus(game))
              : hud.wave >= map.waves
                ? text.lastWave
                : text.marching}
        </button>
        <button
          type="button"
          className="tower-volley kr-volley"
          data-ready={volleyReady}
          data-aiming={aiming}
          aria-pressed={aiming}
          disabled={!volleyReady}
          onClick={onVolley}
          style={{ "--charge": hud.status === "playing" ? hud.volleyCharge : 0 } as CSSProperties}
        >
          <span className="tower-volley-fill" aria-hidden="true" />
          <span className="tower-volley-label" aria-live="polite">
            {aiming ? text.volleyAiming : volleyReady || hud.status === "ready" ? text.volleyReady : text.volleyCharging}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The four towers an empty plot can take. A first tap weighs one up, showing
 * its range on the field and what it does; a second tap, or Build, builds it.
 */
function BuildSheet({
  text,
  gold,
  preview,
  onPreview,
  onBuild,
}: {
  text: KingsroadText;
  gold: number;
  preview: TowerKind | null;
  onPreview: (kind: TowerKind) => void;
  onBuild: (kind: TowerKind) => void;
}) {
  return (
    <>
      <p className="kr-sheet-title">{preview ? text.towers[preview].name : text.buildHere}</p>
      <div className="kr-cards">
        {TOWER_KINDS.map((kind) => {
          const cost = buildCost(kind);
          return (
            <button
              key={kind}
              type="button"
              className="kr-card"
              aria-pressed={preview === kind}
              onClick={() => (preview === kind ? onBuild(kind) : onPreview(kind))}
            >
              <TowerIcon kind={kind} />
              <span className="kr-card-name">{text.towers[kind].name}</span>
              <span className="kr-card-cost" data-short={gold < cost}>
                {cost}
              </span>
            </button>
          );
        })}
      </div>
      {preview && (
        <div className="kr-sheet-detail">
          <p className="kr-sheet-description">{text.towers[preview].description}</p>
          <p className="kr-sheet-stats">{statChange([], text.levelStats[preview](TOWERS[preview].levels[0]))}</p>
          <button type="button" className="tower-button tower-button-small" disabled={gold < buildCost(preview)} onClick={() => onBuild(preview)}>
            {text.build(buildCost(preview))}
          </button>
        </div>
      )}
    </>
  );
}

function TowerSheet({
  text,
  kind,
  level,
  branch,
  fork,
  upgradeCost,
  refund,
  gold,
  onUpgrade,
  onSell,
}: {
  text: KingsroadText;
  kind: TowerKind;
  level: number;
  branch: ArcherBranch | undefined;
  /** The archer's next level is a choice of arrows. */
  fork: boolean;
  upgradeCost: number | null;
  refund: number;
  gold: number;
  onUpgrade: (branch?: ArcherBranch) => void;
  onSell: () => void;
}) {
  const now = text.levelStats[kind](levelOf({ kind, level, branch }));
  const next = level < MAX_LEVEL && !fork ? text.levelStats[kind](levelOf({ kind, level: level + 1 })) : now;
  return (
    <>
      <p className="kr-sheet-title">
        <TowerIcon kind={kind} /> {text.towers[kind].name} <span className="tower-perk-level">{text.level(level)}</span>
      </p>
      <p className="kr-sheet-description">{branch ? text.branches[branch].description : text.towers[kind].description}</p>
      <p className="kr-sheet-stats">{statChange(now, next)}</p>
      {fork && (
        <>
          <p className="kr-sheet-description">{text.chooseArrows}</p>
          {(Object.keys(ARCHER_BRANCHES) as ArcherBranch[]).map((pick) => (
            <p key={pick} className="kr-sheet-stats">
              {text.branches[pick].name}: {statChange(now, text.levelStats.archer(ARCHER_BRANCHES[pick]))}
            </p>
          ))}
        </>
      )}
      <div className="kr-sheet-actions">
        {fork ? (
          (Object.keys(ARCHER_BRANCHES) as ArcherBranch[]).map((pick) => (
            <button
              key={pick}
              type="button"
              className="tower-button tower-button-small"
              disabled={upgradeCost === null || gold < upgradeCost}
              onClick={() => onUpgrade(pick)}
            >
              {text.branches[pick].name} · {ARCHER_BRANCHES[pick].cost}
            </button>
          ))
        ) : (
          <button
            type="button"
            className="tower-button tower-button-small"
            disabled={upgradeCost === null || gold < upgradeCost}
            onClick={() => onUpgrade()}
          >
            {upgradeCost === null ? text.topLevel : text.upgrade(upgradeCost)}
          </button>
        )}
        <button type="button" className="tower-button tower-button-small tower-button-quiet" onClick={onSell}>
          {text.sell(refund)}
        </button>
      </div>
    </>
  );
}

/** Each tower's little badge: its floor colour and what stands on it, as the field draws it. */
function TowerIcon({ kind }: { kind: TowerKind }) {
  const floor = { archer: "#a0703f", catapult: "#8a6a45", frost: "#9cc3df", ballista: "#7a5a3a" }[kind];
  return (
    <svg className="kr-icon" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="18" fill="#b9b2a6" stroke="#8c8478" strokeWidth="2" />
      <circle r="11" fill={floor} />
      {kind === "archer" && (
        <>
          <circle r="5" fill="#3b6ea5" />
          <circle cx="-0.8" r="3" fill="#f1c9a0" />
          <path d="M 3.5 -5.5 A 6.5 6.5 0 0 1 3.5 5.5" fill="none" stroke="#6b4423" strokeWidth="1.8" />
        </>
      )}
      {kind === "catapult" && (
        <>
          <rect x="-7" y="-6" width="13" height="2.4" fill="#5a3a1a" />
          <rect x="-7" y="3.6" width="13" height="2.4" fill="#5a3a1a" />
          <line x1="2" y1="0" x2="-7" y2="0" stroke="#6b4423" strokeWidth="2.2" />
          <circle cx="-7" r="2.8" fill="#9a958c" />
        </>
      )}
      {kind === "frost" && (
        <>
          <circle r="5.5" fill="#2f4a8a" />
          <circle r="2.4" fill="#c9d8ff" />
          <circle cx="7" cy="2.5" r="3" fill="#7fd4ff" />
        </>
      )}
      {kind === "ballista" && (
        <>
          <rect x="-7" y="-1.6" width="13" height="3.2" fill="#4a3a2e" />
          <path d="M 1.6 -6.8 A 7.5 7.5 0 0 1 1.6 6.8" fill="none" stroke="#6b4423" strokeWidth="2" />
          <line x1="-3" y1="0" x2="9" y2="0" stroke="#3a2c22" strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}
