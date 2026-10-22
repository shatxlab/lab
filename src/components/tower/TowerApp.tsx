import { useCallback, useEffect, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { TOWER_TEXT, type TowerText } from "@/lib/tower/i18n";
import { bankRun, buyPerk, defaultSave, perkCost, readSave, writeSave, type TowerSave } from "@/lib/tower/meta";
import { PERK_IDS } from "@/lib/tower/sim/balance";
import { createRun } from "@/lib/tower/sim/run";
import type { Run } from "@/lib/tower/sim/types";

import { RunView } from "./RunView";

type Screen = "menu" | "perks" | "run";

interface Result {
  wave: number;
  kills: number;
  gold: number;
  newBest: boolean;
  /** False when the player gave up with the wall still standing. */
  fell: boolean;
}

export default function TowerApp() {
  const lang = useAppLang();
  const text = TOWER_TEXT[lang];
  const readyRef = useLangReady<HTMLDivElement>();
  const [save, setSave] = useState<TowerSave>(defaultSave);
  const [screen, setScreen] = useState<Screen>("menu");
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Storage only exists in the browser; read it after mount.
  useEffect(() => setSave(readSave()), []);

  const updateSave = useCallback((next: TowerSave) => {
    setSave(next);
    writeSave(next);
  }, []);

  const start = () => {
    setResult(null);
    setRun(createRun(Math.floor(Math.random() * 2 ** 31), save.perks));
    setScreen("run");
  };

  const finish = useCallback(
    (ended: Run) => {
      // Read the stored save rather than the render's copy: the loop calls this from a frame callback.
      const before = readSave();
      updateSave(bankRun(before, ended));
      setResult({ wave: ended.wave, kills: ended.kills, gold: ended.gold, newBest: ended.wave > before.best, fell: ended.hp <= 0 });
    },
    [updateSave],
  );

  return (
    <div className="tower-root" ref={readyRef} data-lang-sensitive>
      {screen === "run" && run ? (
        <RunView key={run.seed} run={run} text={text} onOver={finish}>
          {result && (
            <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="tower-over-title">
              <div className="tower-panel">
                <h2 id="tower-over-title">{result.fell ? text.fallen : text.retreated}</h2>
                <p className="tower-result">{text.reached(result.wave)}</p>
                {result.newBest && <p className="tower-tag tower-tag-best">{text.newBest}</p>}
                <ul className="tower-stats">
                  <li>{text.kills(result.kills)}</li>
                  <li>{text.goldEarned(result.gold)}</li>
                </ul>
                <div className="tower-actions">
                  <button type="button" className="tower-button" onClick={start} autoFocus>
                    {text.playAgain}
                  </button>
                  <button type="button" className="tower-button tower-button-quiet" onClick={() => setScreen("menu")}>
                    {text.menu}
                  </button>
                </div>
              </div>
            </div>
          )}
        </RunView>
      ) : screen === "perks" ? (
        <PerksScreen text={text} save={save} onBuy={updateSave} onBack={() => setScreen("menu")} />
      ) : (
        <MenuScreen text={text} save={save} onPlay={start} onPerks={() => setScreen("perks")} />
      )}
    </div>
  );
}

function MenuScreen({
  text,
  save,
  onPlay,
  onPerks,
}: {
  text: TowerText;
  save: TowerSave;
  onPlay: () => void;
  onPerks: () => void;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-menu">
        <TowerMark />
        <h1>{text.title}</h1>
        <p className="tower-tagline">{text.tagline}</p>
        <p className="tower-meta">
          <span>{text.best(save.best)}</span>
          <span>{text.gold(save.gold)}</span>
        </p>
        <div className="tower-actions">
          <button type="button" className="tower-button" onClick={onPlay}>
            {text.play}
          </button>
          <button type="button" className="tower-button tower-button-quiet" onClick={onPerks}>
            {text.perksTitle}
          </button>
        </div>
        <ul className="tower-howto">
          {text.howTo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a className="tower-home" href={withBase("/")}>
          {text.home}
        </a>
      </div>
    </div>
  );
}

function PerksScreen({
  text,
  save,
  onBuy,
  onBack,
}: {
  text: TowerText;
  save: TowerSave;
  onBuy: (next: TowerSave) => void;
  onBack: () => void;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-perks">
        <h1>{text.perksTitle}</h1>
        <p className="tower-tagline">{text.perksHint}</p>
        <p className="tower-meta">
          <span>{text.gold(save.gold)}</span>
        </p>
        <ul className="tower-perk-list">
          {PERK_IDS.map((id) => {
            const cost = perkCost(save.perks, id);
            const next = buyPerk(save, id);
            return (
              <li key={id} className="tower-perk">
                <div>
                  <p className="tower-perk-name">
                    {text.perks[id].name} <span className="tower-perk-level">{text.level(save.perks[id])}</span>
                  </p>
                  <p className="tower-perk-description">{text.perks[id].description}</p>
                </div>
                <button
                  type="button"
                  className="tower-button tower-button-small"
                  disabled={!next}
                  onClick={() => next && onBuy(next)}
                >
                  {cost === null ? text.maxed : text.buy(cost)}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="tower-actions">
          <button type="button" className="tower-button tower-button-quiet" onClick={onBack}>
            {text.back}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The menu's emblem: the tower from above, as drawn in the game. */
function TowerMark() {
  const merlons = Array.from({ length: 10 }, (_, index) => (index / 10) * 360);
  return (
    <svg className="tower-mark" viewBox="-40 -40 80 80" aria-hidden="true">
      <circle r="34" fill="#d3bb86" />
      <circle r="24" fill="#b9b2a6" stroke="#8c8478" strokeWidth="2" />
      {merlons.map((angle) => (
        <rect key={angle} x="17" y="-3.5" width="6" height="7" fill="#d2cbbe" transform={`rotate(${angle})`} />
      ))}
      <circle r="15" fill="#a0703f" />
      <circle r="6.5" fill="#3b6ea5" />
      <circle cx="-1" r="4" fill="#f1c9a0" />
      <path d="M 5.6 -7.1 A 8 8 0 0 1 5.6 7.1" fill="none" stroke="#6b4423" strokeWidth="2" />
    </svg>
  );
}
