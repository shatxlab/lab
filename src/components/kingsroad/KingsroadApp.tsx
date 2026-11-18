import { useCallback, useEffect, useState } from "react";
import { Lock, Star } from "lucide-react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { KINGSROAD_TEXT, type KingsroadText } from "@/lib/kingsroad/i18n";
import { defaultSave, isUnlocked, nextMap, readSave, type KingsroadSave } from "@/lib/kingsroad/meta";
import { clearRun, readRun, settleRun, writeRun } from "@/lib/kingsroad/snapshot";
import { starsFor } from "@/lib/kingsroad/sim/balance";
import { createGame } from "@/lib/kingsroad/sim/game";
import { MAPS, mapById } from "@/lib/kingsroad/sim/maps";

/** The settings in the order their maps unlock, one menu section each. */
const CANVASES = [...new Set(MAPS.map((map) => map.canvas))];
import type { Game, MapId } from "@/lib/kingsroad/sim/types";

import { GameView } from "./GameView";

interface Result {
  map: MapId;
  won: boolean;
  /** 0 for a loss. */
  stars: number;
  wave: number;
  lives: number;
  kills: number;
  newBest: boolean;
}

export default function KingsroadApp() {
  const lang = useAppLang();
  const text = KINGSROAD_TEXT[lang];
  const readyRef = useLangReady<HTMLDivElement>();
  const [save, setSave] = useState<KingsroadSave>(defaultSave);
  const [game, setGame] = useState<Game | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Game | null>(null);
  const [restored, setRestored] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState(0);
  const [pendingWin, setPendingWin] = useState<Game | null>(null);

  // Storage only exists in the browser; read it after mount.
  useEffect(() => {
    const checkpoint = readRun();
    if (checkpoint && (checkpoint.status === "won" || checkpoint.status === "lost")) {
      const settled = settleRun(checkpoint);
      setSave(settled.save);
      setStorageFailed(!settled.persisted);
      if (checkpoint.status === "won" && !settled.persisted) setPendingWin(checkpoint);
    } else {
      setSave(readSave());
      setSaved(checkpoint);
    }
    setHydrated(true);
  }, []);

  const checkpoint = useCallback((current: Game) => {
    const kept = writeRun(current);
    setStorageFailed(!kept);
    return kept;
  }, []);

  const start = (map: MapId) => {
    if (!hydrated || (saved && !window.confirm(text.replaceRunConfirm))) return;
    if (pendingWin) {
      const settled = settleRun(pendingWin);
      setStorageFailed(!settled.persisted);
      if (!settled.persisted) return;
      setSave(settled.save);
      setPendingWin(null);
    }
    setSession((value) => value + 1);
    const next = createGame(map, Math.floor(Math.random() * 2 ** 31));
    checkpoint(next);
    setSaved(null);
    setRestored(false);
    setResult(null);
    setGame(next);
  };

  const resume = () => {
    if (!saved) return;
    setSession((value) => value + 1);
    setRestored(true);
    setResult(null);
    setGame(saved);
    setSaved(null);
  };

  const discard = () => {
    if (!window.confirm(text.discardRunConfirm)) return;
    setStorageFailed(!clearRun());
    setSaved(null);
  };

  const suspend = useCallback((current: Game) => {
    checkpoint(current);
    setSaved(current);
    setGame(null);
  }, [checkpoint]);

  const finish = useCallback((ended: Game) => {
    // Settlement is idempotent, including reloads between the result journal and campaign write.
    const settled = settleRun(ended);
    const won = ended.status === "won";
    const stars = won ? starsFor(ended.lives) : 0;
    setSave(settled.save);
    setSaved(null);
    setStorageFailed(!settled.persisted);
    setPendingWin(won && !settled.persisted ? ended : null);
    // A wave only counts as held once it has been beaten; a loss is on the wave in progress.
    const held = won ? ended.wave : Math.max(0, ended.wave - 1);
    setResult({ map: ended.map, won, stars, wave: held, lives: ended.lives, kills: ended.kills, newBest: settled.newBest });
  }, []);

  const next = result?.won ? nextMap(result.map) : null;

  return (
    <div className="tower-root kr-root" ref={readyRef} data-lang-sensitive>
      {game ? (
        <GameView key={session} game={game} text={text} onOver={finish} initiallyPaused={restored} onCheckpoint={checkpoint} onSuspend={suspend} storageFailed={storageFailed}>
          {result && (
            <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="kr-over-title">
              <div className="tower-panel">
                <h2 id="kr-over-title">{result.won ? text.won : text.lost}</h2>
                {result.won && <Stars count={result.stars} label={text.starsLabel(result.stars)} large />}
                {result.newBest && <p className="tower-tag tower-tag-best">{text.newBest}</p>}
                <ul className="tower-stats">
                  <li>{text.wavesHeld(result.wave, mapById(result.map).waves)}</li>
                  {result.won && <li>{text.livesLeft(result.lives)}</li>}
                  <li>{text.kills(result.kills)}</li>
                </ul>
                <div className="tower-actions">
                  {storageFailed && result.won && <button type="button" className="tower-button" onClick={() => finish(game)}>{text.retrySave}</button>}
                  {next && (
                    <button type="button" className="tower-button" onClick={() => start(next)} autoFocus>
                      {text.nextRoad}
                    </button>
                  )}
                  <button
                    type="button"
                    className={next ? "tower-button tower-button-quiet" : "tower-button"}
                    onClick={() => start(result.map)}
                    autoFocus={!next}
                  >
                    {text.playAgain}
                  </button>
                  <button type="button" className="tower-button tower-button-quiet" onClick={() => setGame(null)}>
                    {text.menu}
                  </button>
                </div>
              </div>
            </div>
          )}
        </GameView>
      ) : (
        <MenuScreen text={text} save={save} onPlay={start} saved={saved} onContinue={resume} onDiscard={discard} storageFailed={storageFailed} hydrated={hydrated} />
      )}
    </div>
  );
}

function MenuScreen({ text, save, onPlay, saved, onContinue, onDiscard, storageFailed, hydrated }: {
  text: KingsroadText; save: KingsroadSave; onPlay: (map: MapId) => void;
  saved: Game | null; onContinue: () => void; onDiscard: () => void; storageFailed: boolean; hydrated: boolean;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-menu">
        <RoadMark />
        <h1>{text.title}</h1>
        <p className="tower-tagline">{text.tagline}</p>
        <ul className="tower-howto">
          {text.howTo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {storageFailed && <p className="kr-save-warning" role="status">{text.saveUnavailable}</p>}
        {saved && (
          <section className="kr-continue" aria-label={text.continueRun}>
            <p>{text.continueHint(text.maps[saved.map].name, saved.wave, mapById(saved.map).waves)}</p>
            <div className="tower-actions">
              <button type="button" className="tower-button" onClick={onContinue}>{text.continueRun}</button>
              <button type="button" className="tower-button tower-button-quiet" onClick={onDiscard}>{text.discardRun}</button>
            </div>
            <p className="kr-continue-hint">{text.continuePaused}</p>
          </section>
        )}
        <h2 className="kr-menu-heading">{text.chooseRoad}</h2>
        {CANVASES.map((canvas) => (
          <section key={canvas}>
            <h3 className="kr-canvas-heading">{text.canvases[canvas]}</h3>
            <ul className="kr-maps">
              {MAPS.filter((map) => map.canvas === canvas).map((map) => {
                const open = isUnlocked(save, map.id);
                return (
                  <li key={map.id}>
                    <button type="button" className="kr-map" disabled={!hydrated || !open} onClick={() => onPlay(map.id)}>
                      <span className="kr-map-name">
                        {!open && <Lock size={14} aria-hidden="true" />} {text.maps[map.id].name}
                      </span>
                      <Stars count={save.stars[map.id]} label={text.starsLabel(save.stars[map.id])} />
                      <span className="kr-map-description">{open ? text.maps[map.id].description : text.locked}</span>
                      <span className="kr-map-waves">{text.waves(map.waves)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <a className="tower-home" href={withBase("/")}>
          {text.home}
        </a>
      </div>
    </div>
  );
}

function Stars({ count, label, large = false }: { count: number; label: string; large?: boolean }) {
  return (
    <span className="kr-stars" data-large={large} role="img" aria-label={label}>
      {[0, 1, 2].map((index) => (
        <Star key={index} size={large ? 28 : 16} aria-hidden="true" data-on={index < count} />
      ))}
    </span>
  );
}

/** The menu's emblem: a stretch of road winding past one of the round towers, as drawn in the game. */
function RoadMark() {
  const merlons = Array.from({ length: 10 }, (_, index) => (index / 10) * 360);
  return (
    <svg className="tower-mark" viewBox="-40 -40 80 80" aria-hidden="true">
      <circle r="38" fill="#8cc56b" />
      <path d="M -40 -14 C -10 -14, -14 22, 18 22 S 40 30, 40 30" fill="none" stroke="#b39565" strokeWidth="17" />
      <path d="M -40 -14 C -10 -14, -14 22, 18 22 S 40 30, 40 30" fill="none" stroke="#d8c08c" strokeWidth="13" />
      <g transform="translate(10 -10)">
        <circle r="17" fill="#b9b2a6" stroke="#8c8478" strokeWidth="1.6" />
        {merlons.map((angle) => (
          <rect key={angle} x="11.5" y="-2.5" width="4" height="5" fill="#d2cbbe" transform={`rotate(${angle})`} />
        ))}
        <circle r="10" fill="#a0703f" />
        <circle r="4.5" fill="#3b6ea5" />
        <circle cx="-0.7" r="2.8" fill="#f1c9a0" />
        <path d="M 3.9 -4.9 A 5.6 5.6 0 0 1 3.9 4.9" fill="none" stroke="#6b4423" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
