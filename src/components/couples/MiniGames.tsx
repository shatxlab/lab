import { useEffect, useRef, useState, type ReactNode } from "react";
import { MINI_GAMES, miniStrings, type MiniGameId } from "@/lib/couples/mini-games";
import { effectiveNames } from "@/lib/couples/storage";
import { stringsFor } from "@/lib/couples/i18n";
import type { Lang } from "@/lib/couples/types";
import { useMiniPhaseFocus, type MiniPlayProps } from "./MiniGameUI";
import { SecretPattern } from "./SecretPattern";
import { SplitOrSteal } from "./SplitOrSteal";

function ExitDialog({ lang, onCancel, onLeave }: { lang: Lang; onCancel(): void; onLeave(): void }) {
  const T = miniStrings(lang);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  return <div className="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-mini-exit-title" aria-describedby="cp-mini-exit-body"
    ref={ref} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      if (event.key === "Tab") {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    }}>
    <div className="cp-modal-card">
      <h2 id="cp-mini-exit-title">{T.exitTitle}</h2>
      <p id="cp-mini-exit-body">{T.exitBody}</p>
      <div className="cp-modal-actions">
        <button type="button" className="cp-secondary" onClick={onCancel}>{T.cancel}</button>
        <button type="button" className="cp-danger" onClick={onLeave}>{T.leave}</button>
      </div>
    </div>
  </div>;
}

export function MiniGames({ game, lang, names, onNames, onMenu }: {
  game: MiniGameId; lang: Lang; names: [string, string]; onNames(names: [string, string]): void; onMenu(): void;
}) {
  const T = miniStrings(lang);
  const gameDef = MINI_GAMES.find((entry) => entry.id === game)!;
  const [started, setStarted] = useState(false);
  const [run, setRun] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const exitButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirmExit) exitButton.current?.focus();
    wasConfirming.current = confirmExit;
  }, [confirmExit]);
  const setupRef = useMiniPhaseFocus(started ? "play" : "setup");
  const playProps: MiniPlayProps = {
    lang, names: effectiveNames(names, lang), onReplay: () => setRun((n) => n + 1), onMenu,
  };
  let content: ReactNode;
  if (!started) {
    content = <div className="cp-mini-content" ref={setupRef}>
      <section className="cp-mini-panel">
        <h2 tabIndex={-1}>{T.rules}</h2>
        <p>{game === "pattern" ? T.patternRules : T.splitRules}</p>
        {game === "split" ? <p className="cp-mini-caution">{T.fiction}</p> : null}
      </section>
      <section className="cp-field">
        <h2>{T.names}</h2>
        <div className="cp-name-grid">
          {names.map((name, i) => <label className="cp-name" key={i}>
            <span>{i === 0 ? T.firstName : T.secondName}</span>
            <input type="text" value={name} maxLength={24} autoComplete="off" onChange={(event) => {
              const next: [string, string] = [...names]; next[i] = event.target.value; onNames(next);
            }} />
          </label>)}
        </div>
      </section>
      <p className="cp-note cp-note-small">{T.noStats}</p>
      <button type="button" className="cp-primary cp-wide" data-action="start" onClick={() => {
        onNames(effectiveNames(names, lang)); setStarted(true);
      }}>{T.start}</button>
    </div>;
  } else {
    content = game === "pattern" ? <SecretPattern key={run} {...playProps} /> : <SplitOrSteal key={run} {...playProps} />;
  }
  return <div className="cp-mini" data-mini-game={game}>
    <div className="cp-mini-layout" inert={confirmExit}>
      <header className="cp-mini-header">
        <div><p className="cp-eyebrow">{stringsFor(lang).appName}</p><h1>{gameDef.emoji} {gameDef.name[lang]}</h1></div>
        <button type="button" className="cp-secondary cp-mini-exit" ref={exitButton} onClick={() => started ? setConfirmExit(true) : onMenu()}>
          {started ? T.exit : T.back}
        </button>
      </header>
      <div className="cp-mini-scroll">{content}</div>
    </div>
    {confirmExit ? <ExitDialog lang={lang} onCancel={() => setConfirmExit(false)} onLeave={onMenu} /> : null}
  </div>;
}
