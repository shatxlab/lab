import { useCallback, useEffect, useRef, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { choosePerk, careerBuild, clearCareer, defaultCareer, difficultyFor, promotionTradeoff, withCareerFocus, perkOffer, perksPending, rankOf, readCareer, settle, writeCareer, type Career } from "@/lib/hr/career";
import { clock, HR_TEXT, quirkLine, type HrText } from "@/lib/hr/i18n";
import { bakeHero, loadSheet, type Sheet } from "@/lib/hr/render/heroes";
import { HERO_BASE, PASSIVE_IDS, WEAPON_IDS, xpToNext } from "@/lib/hr/sim/balance";
import { createRun, startingLoadout } from "@/lib/hr/sim/run";
import { CLASSES, CLASS_IDS, type ClassId } from "@/lib/hr/sim/classes";
import type { Run } from "@/lib/hr/sim/types";
import { mergeKit, type ItemState } from "@/lib/hr/kit";
import { baseNumbers } from "@/lib/hr/sim/hero";
import { clearRun, readRun, writeRun } from "@/lib/hr/snapshot";
import { DEPARTMENTS } from "@/lib/roster/data";
import { defaultSave, readSave, writeSave } from "@/lib/roster/save";
import { type Coworker, type PerkId, type RosterSave } from "@/lib/roster/types";

import { RunView } from "./RunView";

interface Result {
  status: Run["status"];
  abandoned: boolean;
  time: number;
  level: number;
  kills: number;
  /** Floors of the floor plan cleared on the way down. */
  floors: number;
  gold: number;
  /** The performance review that followed. */
  review: { level: number; levelsGained: number; promotedTo: number | null } | null;
  /** The items the bosses dropped today. */
  loot: string[];
  /** What the desk scrapped to make room, with the savings it paid. */
  scrapped: { names: string; gold: number } | null;
}

export default function HrApp() {
  const lang = useAppLang();
  const text = HR_TEXT[lang];
  const readyRef = useLangReady<HTMLDivElement>();
  const [roster, setRoster] = useState<RosterSave | null>(null);
  const [career, setCareer] = useState<Career | null>(null);
  const [pendingClass, setPendingClass] = useState<ClassId | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saved, setSaved] = useState<Run | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Storage and the sprite sheet only exist in the browser; read them after mount.
  useEffect(() => {
    const save = readSave();
    // Written straight back, so a first visit keeps the roster it was dealt.
    writeSave(save);
    setRoster(save);
    const suspended = readRun();
    const next = withCareerFocus(save, readCareer(), suspended?.coworkerId);
    writeCareer(next);
    setCareer(next);
    setSaved(suspended);
    let live = true;
    void loadSheet().then((loaded) => live && setSheet(loaded));
    return () => {
      live = false;
    };
  }, []);

  // The latest saves, for `finish`, which the run view holds on to.
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const careerRef = useRef(career);
  careerRef.current = career;

  const coworkerOf = (target: Run | null) => roster?.coworkers.find((coworker) => coworker.id === target?.coworkerId) ?? null;

  const begin = (next: Run) => {
    setResult(null);
    writeRun(next);
    setSaved(null);
    setRun(next);
  };

  const start = (coworker: Coworker) => {
    const before = careerRef.current;
    const classId = before?.classId ?? pendingClass;
    if (!before || !classId) return;
    if (!before.classId) {
      const next = { ...before, classId };
      writeCareer(next);
      setCareer(next);
      setPendingClass(null);
    }
    begin(createRun(coworker, Math.floor(Math.random() * 2 ** 31), difficultyFor(coworker.level, coworker.rarity, coworker.perks, before.slump), null, before.kit, before.build, classId));
  };

  const resume = () => {
    setResult(null);
    setRun(saved);
    setSaved(null);
  };

  /**
   * One run is one day: the review raises the coworker, the day moves on, and the gold and loot go into savings.
   */
  const finish = useCallback((ended: Run) => {
    clearRun();
    const before = rosterRef.current;
    const worker = before?.coworkers.find((coworker) => coworker.id === ended.coworkerId);
    let reviewed: Result["review"] = null;
    let scrapped: Result["scrapped"] = null;
    if (before && worker) {
      // The day is the hero's: the level, the XP and the build they leave the office with are theirs to keep.
      const outcome = settle(worker, ended.level, ended.xp);
      const after: RosterSave = { ...before, day: before.day + 1, coworkers: before.coworkers.map((coworker) => (coworker.id === worker.id ? outcome.coworker : coworker)) };
      writeSave(after);
      setRoster(after);
      const current = careerRef.current ?? defaultCareer();
      // A lost day deepens the slump (the office goes easier tomorrow), a win ends it.
      const slump = ended.status === "won" ? 0 : Math.min(current.slump + 1, 5);
      // The desk takes the day's loot: new items join, a full desk scraps its oldest — or the one the player
      // swapped out at the clear — for savings, and a won day levels up what was carried.
      const merge = mergeKit(current.kit, ended.lootFound, ended.status === "won", ended.swapOut);
      const savings: Career = { ...current, slump, gold: current.gold + Math.floor(ended.gold) + merge.gold, kit: merge.kit, build: careerBuild(ended, current.build) };
      writeCareer(savings);
      setCareer(savings);
      scrapped = merge.scrapped.length > 0 ? { names: merge.scrapped.map((item) => text.itemNames[item.id]).join(", "), gold: merge.gold } : null;
      reviewed = { level: outcome.coworker.level, levelsGained: outcome.levelsGained, promotedTo: outcome.promoted ? rankOf(outcome.coworker.level) : null };
    }
    setResult({
      status: ended.status,
      abandoned: ended.abandoned,
      time: ended.time,
      level: ended.level,
      kills: ended.kills,
      floors: ended.floorsCleared,
      gold: Math.floor(ended.gold),
      review: reviewed,
      /** The loot the bosses dropped today, and what the desk scrapped to make room. */
      loot: ended.lootFound.map((item) => text.itemNames[item.id]),
      scrapped: scrapped,
    });
  }, []);

  /** Take a perk for a promotion that is waiting for one. */
  const takePerk = (coworker: Coworker, perk: PerkId) => {
    const before = rosterRef.current;
    const upgraded = choosePerk(coworker, perk);
    if (!before || !upgraded) return;
    const after: RosterSave = { ...before, coworkers: before.coworkers.map((member) => (member.id === upgraded.id ? upgraded : member)) };
    writeSave(after);
    setRoster(after);
  };

  const startOver = () => {
    if (!window.confirm(text.startOverConfirm)) return;
    const fresh = defaultSave();
    clearRun();
    clearCareer();
    writeSave(fresh);
    setRoster(fresh);
    const next = withCareerFocus(fresh, defaultCareer());
    writeCareer(next);
    setCareer(next);
    setPendingClass(null);
    setSaved(null);
  };

  const current = coworkerOf(run);
  if (run && current) {
    return (
      <div className="tower-root hr-root" ref={readyRef} data-lang-sensitive>
        <RunView key={run.seed} run={run} coworker={current} sheet={sheet} text={text} onOver={finish}>
          {result && (
            <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="hr-over-title">
              <div className="tower-panel">
                <h2 id="hr-over-title">{resultTitle(text, result)}</h2>
                <p className="tower-result">{text.lasted(clock(result.time))}</p>
                <ul className="tower-stats">
                  <li>{text.reached(result.level)}</li>
                  <li>{text.floors(result.floors)}</li>
                  <li>{text.kills(result.kills)}</li>
                  <li>{text.goldEarned(result.gold)}</li>
                  {result.loot.length > 0 && <li className="hr-promoted">{text.lootFound(result.loot.join(", "))}</li>}
                  {result.scrapped && <li>{text.scrapped(result.scrapped.names, text.goldAmount(result.scrapped.gold))}</li>}
                </ul>
                {result.review && (
                  <ul className="tower-stats hr-review">
                    {result.review.levelsGained > 0 && <li>{text.leveledUp(result.review.level)}</li>}
                    {result.review.promotedTo !== null && <li className="hr-promoted">{text.promoted(rankName(text, result.review.promotedTo))}</li>}
                  </ul>
                )}
                <PerkPicker coworker={current} text={text} onPick={(perk) => takePerk(current, perk)} />
                <div className="tower-actions">
                  <button type="button" className="tower-button" onClick={() => career?.classId ? start(current) : setRun(null)} autoFocus>
                    {career?.classId ? text.playAgain : text.chooseClass}
                  </button>
                  <button type="button" className="tower-button tower-button-quiet" onClick={() => setRun(null)}>
                    {text.menu}
                  </button>
                </div>
              </div>
            </div>
          )}
        </RunView>
      </div>
    );
  }

  const savedCoworker = coworkerOf(saved);
  const focus = roster?.coworkers.find((coworker) => coworker.id === career?.focusId) ?? null;
  return (
    <div className="tower-root hr-root" ref={readyRef} data-lang-sensitive>
      <a className="tower-home" href={withBase("/")}>
        {text.home}
      </a>
      <div className="tower-screen">
        <div className="tower-panel hr-menu">
          <button type="button" className="tower-button tower-button-quiet tower-button-small hr-start-over" onClick={startOver} disabled={!roster}>
            {text.startOver}
          </button>
          <h1>{text.title}</h1>
          <p className="tower-tagline">{text.tagline}</p>
          <details className="tower-howto-details">
            <summary>{text.howToTitle}</summary>
            <ul className="tower-howto">
              {text.howTo.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
          <details className="hr-trait-help">
            <summary>{text.traitHelpTitle}</summary>
            <p className="hr-continue-hint">{text.traitHelp}</p>
          </details>
          {roster && career && focus && (
            <>
              <p className="hr-day-line">
                {text.day(roster.day + 1)}
                {" · "}
                {text.savings(text.goldAmount(career.gold))}
              </p>
              {career.slump > 0 && (
                <p className="hr-day-line hr-slump">{text.slumpLine(Math.min(career.slump, 3))}</p>
              )}
              <section className="hr-hero" aria-label={focus.name}>
                <CoworkerCard
                  coworker={focus}
                  sheet={sheet}
                  text={text}
                  action={savedCoworker ? text.continueRun : career.classId ? text.goToWork : undefined}
                  classId={career.classId}
                  onAct={savedCoworker ? resume : () => start(focus)}
                  showCareer
                  kit={career.kit}
                />
                {saved && savedCoworker && (
                  <p className="hr-continue-hint">{text.continueHint(savedCoworker.name, clock(saved.time))}</p>
                )}
              </section>
              {!savedCoworker && !career.classId && (
                <ClassPicker coworker={focus} text={text} build={career.build} selected={pendingClass} onSelect={setPendingClass} onStart={() => start(focus)} />
              )}
              {[focus]
                .filter((coworker) => perksPending(coworker) > 0)
                .map((coworker) => (
                  <PerkPicker key={coworker.id} coworker={coworker} text={text} onPick={(perk) => takePerk(coworker, perk)} />
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassPicker({ coworker, text, build, selected, onSelect, onStart }: {
  coworker: Coworker; text: HrText; build: Career["build"]; selected: ClassId | null;
  onSelect: (id: ClassId) => void; onStart: () => void;
}) {
  const ready = selected ? startingLoadout(coworker, build, selected) : null;
  const starting = ready ? [
    ...ready.weapons.map(({ id, level }) => `${text.weapons[id].name} · ${text.level(level)}`),
    ...PASSIVE_IDS.filter((id) => ready.passives[id]).map((id) => `${text.passives[id].name} · ${text.level(ready.passives[id]!)}`),
  ] : [];
  const archived = ready ? [
    ...WEAPON_IDS.filter((id) => build.weapons[id] && !ready.weapons.some((weapon) => weapon.id === id)).map((id) => `${text.weapons[id].name} · ${text.level(build.weapons[id]!)}`),
    ...PASSIVE_IDS.filter((id) => build.passives[id] && !ready.passives[id]).map((id) => `${text.passives[id].name} · ${text.level(build.passives[id]!)}`),
  ] : [];
  return (
    <div className="hr-class-picker">
      <fieldset aria-describedby="hr-class-hint">
        <legend>{text.chooseClass}</legend>
        <p id="hr-class-hint">{text.classHint}</p>
        {CLASS_IDS.map((id) => (
          <label key={id} className="hr-class-choice">
            <input type="radio" name="hr-class" value={id} checked={selected === id} onChange={() => onSelect(id)} aria-label={text.classes[id].name} />
            <span>
              <strong>{text.classes[id].name}</strong>
              <span>{text.classes[id].description}</span>
              <small>{[...CLASSES[id].weapons.filter((weapon) => weapon !== departmentWeapon(coworker)).map((weapon) => text.weapons[weapon].name), ...CLASSES[id].passives.map((passive) => text.passives[passive].name)].join(" · ")}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {ready && <p><strong>{text.classStartingGear}:</strong> {starting.join(", ")}</p>}
      {archived.length > 0 && <p><strong>{text.classArchived}:</strong> {archived.join(", ")}</p>}
      <button type="button" className="tower-button hr-card-send" disabled={!selected} onClick={onStart}>{text.goToWork}</button>
    </div>
  );
}

function resultTitle(text: HrText, result: Result): string {
  if (result.status === "won") return text.won;
  if (result.abandoned) return text.walkedOut;
  return text.fell;
}

/** The card's stat block: the meal, not the recipe — what the stats and the desk's gear come to. */
function cardStatLines(text: HrText, coworker: Coworker, kit: readonly ItemState[] = []) {
  const numbers = baseNumbers(coworker, kit);
  return text.cardStats({
    hp: numbers.maxHp,
    damage: (numbers.damage / HERO_BASE.damage - 1) * 100,
    speed: (numbers.speed / HERO_BASE.speed - 1) * 100,
    rate: (HERO_BASE.cooldown / numbers.cooldown - 1) * 100,
    gold: (numbers.gold / HERO_BASE.gold - 1) * 100,
    loot: (numbers.loot / HERO_BASE.loot - 1) * 100,
  });
}

/** A promotion waiting for its perk: three to choose from, each a permanent power for this coworker. */
function PerkPicker({ coworker, text, onPick }: { coworker: Coworker; text: HrText; onPick: (perk: PerkId) => void }) {
  if (perksPending(coworker) === 0) return null;
  return (
    <section className="hr-perks" aria-label={text.perkTitle(coworker.name)}>
      <h3>{text.perkTitle(coworker.name)}</h3>
      <ul>
        {perkOffer(coworker).map((perk) => {
          const tradeoff = promotionTradeoff(coworker, perk);
          return (
            <li key={perk}>
              <button type="button" className="tower-button tower-button-small" onClick={() => onPick(perk)}>
                <strong>{text.perks[perk].name}</strong>
                <span>{text.perks[perk].description}</span>
                <span className="hr-perk-tradeoff">{text.perkTradeoff(tradeoff.day, tradeoff.interview)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function rankName(text: HrText, rank: number): string {
  return text.ranks[Math.min(rank, text.ranks.length - 1)];
}

interface CardProps {
  coworker: Coworker;
  sheet: Sheet | null;
  text: HrText;
  /** The button's label and what it does; none for a card that is only shown. */
  action?: string;
  onAct?: () => void;
  /** Show the career: rank, level and progress to the next level. */
  showCareer?: boolean;
  /** The desk kit, only on the focus's own card. */
  kit?: ItemState[];
  classId?: ClassId | null;
}

function CoworkerCard({ coworker, sheet, text, action, onAct, showCareer, kit, classId }: CardProps) {
  return (
    <article className={`hr-card hr-card-${coworker.rarity}`}>
      <Portrait coworker={coworker} sheet={sheet} />
      <div className="hr-card-body">
        <p className="hr-card-name">{coworker.name}</p>
        {showCareer && (
          <>
            <p className="hr-card-rank">
              {rankName(text, rankOf(coworker.level))} · {text.careerLevel(coworker.level)}
            </p>
            <progress className="hr-card-progress" max={xpToNext(coworker.level)} value={coworker.xp} aria-label={text.xpProgress(coworker.xp, xpToNext(coworker.level))} />
            <p className="hr-card-rank">{text.xpProgress(coworker.xp, xpToNext(coworker.level))}</p>
            {coworker.perks.length > 0 && <p className="hr-card-rank">{text.perksLine(coworker.perks.map((perk) => text.perks[perk].name).join(", "))}</p>}
          </>
        )}
        <p className="hr-card-department">
          {classId ? text.classes[classId].name : text.departments[coworker.department]} · {text.weapons[departmentWeapon(coworker)].name}
        </p>
        {departmentWeapon(coworker) === "rubberDuck" && <p className="hr-card-quirk">{text.weapons.rubberDuck.description}</p>}
        {coworker.quirks.map((quirk) => (
          <p key={quirk} className="hr-card-quirk">
            <strong>{text.quirks[quirk]}</strong> {quirkLine(text, quirk)}
          </p>
        ))}
      </div>
      {kit && (
        <p className="hr-card-kit">
          <strong>{text.kitLabel}:</strong>{" "}
          {kit.length > 0 ? kit.map((item) => text.itemLine(item)).join(" · ") : text.kitEmpty}
        </p>
      )}
      <dl className="hr-card-stats">
        {cardStatLines(text, coworker, kit).map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
      {action && (
        <button type="button" className="tower-button hr-card-send" onClick={onAct}>
          {action}
        </button>
      )}
    </article>
  );
}

function departmentWeapon(coworker: Coworker) {
  return DEPARTMENTS[coworker.department].weapon;
}

/** The coworker's standing frame, drawn big with crisp pixels; empty until the sheet has loaded. */
function Portrait({ coworker, sheet }: { coworker: Coworker; sheet: Sheet | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !sheet) return;
    const frames = bakeHero(sheet, coworker.id, coworker.department);
    canvas.width = frames.width * 3;
    canvas.height = frames.height * 3;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frames.stand, 0, 0, canvas.width, canvas.height);
  }, [coworker, sheet]);
  return <canvas ref={canvasRef} className="hr-portrait" aria-hidden="true" />;
}
