import { useCallback, useEffect, useRef, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { clock, HR_TEXT, quirkLine, type HrText } from "@/lib/hr/i18n";
import { bakeHero, loadSheet, type Sheet } from "@/lib/hr/render/heroes";
import { AUDIT_CLOSES } from "@/lib/hr/sim/balance";
import { createRun } from "@/lib/hr/sim/run";
import type { Run } from "@/lib/hr/sim/types";
import { clearRun, readRun, writeRun } from "@/lib/hr/snapshot";
import { DEPARTMENTS } from "@/lib/roster/data";
import { readSave, writeSave } from "@/lib/roster/save";
import { STATS, type Coworker, type RosterSave } from "@/lib/roster/types";

import { RunView } from "./RunView";

interface Result {
  status: Run["status"];
  abandoned: boolean;
  /** The audit closed with the Auditor still standing. */
  closed: boolean;
  time: number;
  level: number;
  kills: number;
  gold: number;
}

export default function HrApp() {
  const lang = useAppLang();
  const text = HR_TEXT[lang];
  const readyRef = useLangReady<HTMLDivElement>();
  const [roster, setRoster] = useState<RosterSave | null>(null);
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
    setSaved(readRun());
    let live = true;
    void loadSheet().then((loaded) => live && setSheet(loaded));
    return () => {
      live = false;
    };
  }, []);

  const coworkerOf = (target: Run | null) => roster?.coworkers.find((coworker) => coworker.id === target?.coworkerId) ?? null;

  const start = (coworker: Coworker) => {
    setResult(null);
    const next = createRun(coworker, Math.floor(Math.random() * 2 ** 31));
    writeRun(next);
    setSaved(null);
    setRun(next);
  };

  const resume = () => {
    setResult(null);
    setRun(saved);
    setSaved(null);
  };

  const finish = useCallback((ended: Run) => {
    clearRun();
    setResult({
      status: ended.status,
      abandoned: ended.abandoned,
      closed: ended.status === "lost" && ended.hero.hp > 0 && ended.time >= AUDIT_CLOSES,
      time: ended.time,
      level: ended.level,
      kills: ended.kills,
      gold: Math.floor(ended.gold),
    });
  }, []);

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
                  <li>{text.kills(result.kills)}</li>
                  <li>{text.goldEarned(result.gold)}</li>
                </ul>
                <div className="tower-actions">
                  <button type="button" className="tower-button" onClick={() => start(current)} autoFocus>
                    {text.playAgain}
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
  return (
    <div className="tower-root hr-root" ref={readyRef} data-lang-sensitive>
      <div className="tower-screen">
        <div className="tower-panel hr-menu">
          <h1>{text.title}</h1>
          <p className="tower-tagline">{text.tagline}</p>
          <ul className="tower-howto">
            {text.howTo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {saved && savedCoworker && (
            <div className="tower-actions">
              <button type="button" className="tower-button" onClick={resume}>
                {text.continueRun}
              </button>
              <p className="hr-continue-hint">{text.continueHint(savedCoworker.name, clock(saved.time))}</p>
            </div>
          )}
          <h2 className="hr-menu-heading">{text.whoGoesIn}</h2>
          <ul className="hr-coworkers">
            {(roster?.coworkers ?? [])
              .filter((coworker) => coworker.status.kind !== "quit")
              .map((coworker) => (
                <li key={coworker.id}>
                  <CoworkerCard coworker={coworker} sheet={sheet} text={text} onSend={() => start(coworker)} />
                </li>
              ))}
          </ul>
          <a className="tower-home" href={withBase("/")}>
            {text.home}
          </a>
        </div>
      </div>
    </div>
  );
}

function resultTitle(text: HrText, result: Result): string {
  if (result.status === "won") return text.won;
  if (result.abandoned) return text.walkedOut;
  return result.closed ? text.auditClosed : text.fell;
}

function CoworkerCard({ coworker, sheet, text, onSend }: { coworker: Coworker; sheet: Sheet | null; text: HrText; onSend: () => void }) {
  return (
    <article className="hr-card">
      <Portrait coworker={coworker} sheet={sheet} />
      <div className="hr-card-body">
        <p className="hr-card-name">{coworker.name}</p>
        <p className="hr-card-department">
          {text.departments[coworker.department]} · {text.weapons[departmentWeapon(coworker)].name}
        </p>
        {coworker.quirks.map((quirk) => (
          <p key={quirk} className="hr-card-quirk">
            <strong>{text.quirks[quirk]}</strong> {quirkLine(text, quirk)}
          </p>
        ))}
      </div>
      <dl className="hr-card-stats">
        {STATS.map((stat) => (
          <div key={stat}>
            <dt>{text.stats[stat]}</dt>
            <dd>{coworker.stats[stat]}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="tower-button tower-button-small hr-card-send" onClick={onSend}>
        {text.send}
      </button>
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
