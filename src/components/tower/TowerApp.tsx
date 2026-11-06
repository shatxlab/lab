import { useCallback, useEffect, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { statChange, TOWER_TEXT, type TowerText } from "@/lib/tower/i18n";
import { buyPerk, defaultSave, perkCost, readSaveState, writeSave, type TowerSave } from "@/lib/tower/meta";
import { clearRun, createCheckpoint, readRunState, settleRun, writeRun, type RunCheckpoint } from "@/lib/tower/snapshot";
import { PERK_IDS } from "@/lib/tower/sim/balance";
import { towerStats } from "@/lib/tower/sim/stats";
import { emptyUpgrades } from "@/lib/tower/sim/upgrades";
import { createRun, holdFire } from "@/lib/tower/sim/run";
import type { PerkId, PerkLevels, Run } from "@/lib/tower/sim/types";

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
  const [active, setActive] = useState<RunCheckpoint | null>(null);
  const [saved, setSaved] = useState<RunCheckpoint | null>(null);
  const [pending, setPending] = useState<RunCheckpoint | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [runReadFailed, setRunReadFailed] = useState(false);
  const run = active?.run;
  const [result, setResult] = useState<Result | null>(null);

  // Meta receipts also suppress an old active checkpoint if journaling/cleanup failed after banking.
  const load = useCallback(() => {
    const before = readSaveState();
    const stored = readRunState();
    const checkpoint = stored.checkpoint;
    setRunReadFailed(!stored.readable);
    if (checkpoint?.run.phase === "over") {
      const settled = settleRun(checkpoint);
      setSave(settled.save);
      setStorageFailed(!settled.persisted);
      if (!settled.persisted) setPending(checkpoint);
    } else {
      setSave(before.save);
      setStorageFailed(!before.readable || !stored.readable);
      if (checkpoint && before.readable && before.save.settledRunIds.includes(checkpoint.id)) clearRun(undefined, checkpoint.id);
      else setSaved(checkpoint);
    }
    setHydrated(true);
  }, []);
  useEffect(load, [load]);

  const checkpoint = useCallback((current: RunCheckpoint) => {
    const kept = writeRun(current);
    setStorageFailed(!kept || !readSaveState().readable);
    return kept;
  }, []);

  const settle = useCallback((ended: RunCheckpoint) => {
    const settled = settleRun(ended);
    setSave(settled.save);
    setStorageFailed(!settled.persisted);
    setPending(settled.persisted ? null : ended);
    return settled;
  }, []);

  const updateSave = (id: PerkId) => {
    // Never turn a failed meta read (especially unknown receipts) into a fresh account write.
    const current = readSaveState();
    if (!current.readable) { setStorageFailed(true); return; }
    const next = buyPerk(current.save, id);
    if (!next) { setSave(current.save); return; }
    const kept = writeSave(next);
    setStorageFailed(!kept);
    if (kept) setSave(next);
  };

  const start = () => {
    if (!hydrated) return;
    if ((saved || runReadFailed) && !window.confirm(saved ? text.replaceRunConfirm : text.unknownRunConfirm)) return;
    let before = save;
    if (pending) {
      const settled = settle(pending);
      if (!settled.persisted) return;
      before = settled.save;
    }
    const next = createCheckpoint(createRun(Math.floor(Math.random() * 2 ** 31), before.perks));
    checkpoint(next);
    setRunReadFailed(false);
    setSaved(null);
    setRestored(false);
    setResult(null);
    setActive(next);
    setScreen("run");
  };

  const resume = () => {
    if (!saved) return;
    // A held finger is transient input, not an instruction to keep firing after reload.
    holdFire(saved.run);
    setRestored(true);
    setResult(null);
    setActive(saved);
    setSaved(null);
    setScreen("run");
  };

  const discard = () => {
    if (!window.confirm(text.discardRunConfirm)) return;
    const cleared = clearRun();
    setStorageFailed(!cleared);
    if (cleared) setSaved(null);
  };

  const suspend = useCallback(() => {
    if (!active) return;
    checkpoint(active);
    setSaved(active);
    setActive(null);
    setScreen("menu");
  }, [active, checkpoint]);

  const checkpointActive = useCallback(() => active ? checkpoint(active) : false, [active, checkpoint]);

  const finish = useCallback((ended: Run) => {
    if (!active) return;
    const settled = settle(active);
    setSaved(null);
    setResult({ wave: ended.wave, kills: ended.kills, gold: ended.gold, newBest: settled.newBest, fell: ended.hp <= 0 });
  }, [active, settle]);

  const retry = () => {
    if (pending) settle(pending);
    else if (active?.run.phase === "over") settle(active);
    else if (active) checkpoint(active);
    else if (saved) checkpoint(saved);
    else load();
  };

  return (
    <div className="tower-root" ref={readyRef} data-lang-sensitive>
      {storageFailed && (
        <div className="tower-save-warning" role="status">
          <p>{text.saveUnavailable}</p>
          {screen !== "run" && (
            <button type="button" className="tower-button tower-button-small tower-button-quiet" onClick={retry}>
              {text.retrySave}
            </button>
          )}
        </div>
      )}
      {screen === "run" && run && active ? (
        <RunView
          key={active.id}
          run={run}
          text={text}
          onOver={finish}
          initiallyPaused={restored}
          onCheckpoint={checkpointActive}
          onSuspend={suspend}
          storageFailed={storageFailed}
        >
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
                  {pending && (
                    <button type="button" className="tower-button tower-button-quiet" onClick={retry}>{text.retrySave}</button>
                  )}
                  <button type="button" className="tower-button" onClick={start} autoFocus>
                    {text.playAgain}
                  </button>
                  <button type="button" className="tower-button tower-button-quiet" onClick={() => { setActive(null); setScreen("menu"); }}>
                    {text.menu}
                  </button>
                </div>
              </div>
            </div>
          )}
        </RunView>
      ) : screen === "perks" ? (
        <PerksScreen text={text} save={save} onBuy={updateSave} onBack={() => setScreen("menu")} hasSavedRun={!!saved} />
      ) : (
        <MenuScreen
          text={text}
          save={save}
          onPlay={start}
          onPerks={() => setScreen("perks")}
          saved={saved}
          onContinue={resume}
          onDiscard={discard}
          hydrated={hydrated}
          pending={!!pending}
        />
      )}
    </div>
  );
}

function MenuScreen({
  text,
  save,
  onPlay,
  onPerks,
  saved,
  onContinue,
  onDiscard,
  hydrated,
  pending,
}: {
  text: TowerText;
  save: TowerSave;
  onPlay: () => void;
  onPerks: () => void;
  saved: RunCheckpoint | null;
  onContinue: () => void;
  onDiscard: () => void;
  hydrated: boolean;
  pending: boolean;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-menu">
        <TowerMark />
        <h1>{text.title}</h1>
        <p className="tower-tagline">{text.tagline}</p>
        <ul className="tower-howto">
          {text.howTo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {saved && (
          <section className="tower-continue" aria-label={text.continueRun}>
            <p>{text.continueHint(saved.run.wave, saved.run.gold)}</p>
            <div className="tower-actions">
              <button type="button" className="tower-button" onClick={onContinue}>{text.continueRun}</button>
              <button type="button" className="tower-button tower-button-quiet" onClick={onDiscard}>{text.discardRun}</button>
            </div>
            <p className="tower-continue-hint">{text.continuePaused}</p>
          </section>
        )}
        <p className="tower-meta">
          <span>{text.best(save.best)}</span>
          <span>{text.gold(save.gold)}</span>
        </p>
        <div className="tower-actions">
          <button type="button" className="tower-button" onClick={onPlay} disabled={!hydrated}>
            {text.play}
          </button>
          <button type="button" className="tower-button tower-button-quiet" onClick={onPerks} disabled={!hydrated || pending}>
            {text.perksTitle}
          </button>
        </div>
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
  hasSavedRun,
}: {
  text: TowerText;
  save: TowerSave;
  onBuy: (id: PerkId) => void;
  onBack: () => void;
  hasSavedRun: boolean;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-perks">
        <h1>{text.perksTitle}</h1>
        <p className="tower-tagline">{text.perksHint}</p>
        {hasSavedRun && <p className="tower-continue-hint">{text.savedPerksHint}</p>}
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
                  <p className="tower-perk-stats">{perkChange(text, save.perks, id, cost !== null)}</p>
                </div>
                <button
                  type="button"
                  className="tower-button tower-button-small"
                  disabled={!next}
                  onClick={() => next && onBuy(id)}
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

/** What the perk gives now and at its next level; a fresh one shows its first level, a maxed one its total. */
function perkChange(text: TowerText, perks: PerkLevels, id: PerkId, canLevel: boolean): string {
  const at = (level: number) => text.perkStats[id](towerStats(emptyUpgrades(), { ...perks, [id]: level }), level);
  const level = perks[id];
  if (!canLevel) return statChange(at(level), at(level));
  return statChange(level === 0 ? at(1) : at(level), at(level + 1));
}
