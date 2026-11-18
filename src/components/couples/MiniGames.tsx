import { useEffect, useRef, useState, type ReactNode } from "react";
import { MINI_GAMES, miniStrings, type MiniGameId } from "@/lib/couples/mini-games";
import { effectiveNames } from "@/lib/couples/storage";
import { stringsFor } from "@/lib/couples/i18n";
import type { Lang } from "@/lib/couples/types";
import { useMiniPhaseFocus, type MiniPlayProps } from "./MiniGameUI";
import { SecretPattern } from "./SecretPattern";
import { NeverHaveIEver } from "./NeverHaveIEver";
import { dealNever } from "@/lib/couples/never/game";
import { neverStrings } from "@/lib/couples/never/i18n";
import type { NeverCard, NeverDeck } from "@/lib/couples/never/types";

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
  const [neverDeck, setNeverDeck] = useState<NeverDeck>("mix");
  const [neverCount, setNeverCount] = useState(15);
  const [neverRun, setNeverRun] = useState<{ cards: NeverCard[]; lang: Lang } | null>(null);
  const N = neverStrings(lang);
  const replay = () => {
    if (game === "never") setNeverRun({ cards: dealNever(lang, neverDeck, neverCount), lang });
    setRun(n => n + 1);
  };
  const [confirmExit, setConfirmExit] = useState(false);
  const exitButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirmExit) exitButton.current?.focus();
    wasConfirming.current = confirmExit;
  }, [confirmExit]);
  const setupRef = useMiniPhaseFocus(started ? "play" : "setup");
  const playProps: MiniPlayProps = {
    lang, names: effectiveNames(names, lang), onReplay: replay, onMenu,
  };
  let content: ReactNode;
  if (!started) {
    content = <div className="cp-mini-content" ref={setupRef}>
      <section className="cp-mini-panel">
        <h2 tabIndex={-1}>{T.rules}</h2>
        <p>{game === "never" ? N.rules : T.patternRules}</p>
      </section>
      {game === "never" ? <>
        <fieldset className="cp-never-decks"><legend>{N.deck}</legend>
          {(["mix", "light", "stories", "closer"] as const).map(deck => <label key={deck} className="cp-never-deck">
            <input type="radio" name="never-deck" value={deck} checked={neverDeck === deck} onChange={() => setNeverDeck(deck)} />
            <span><strong>{N[deck]}</strong><span className="cp-note cp-note-small">{N[`${deck}Hint`]}</span></span>
          </label>)}
        </fieldset>
        <p className="cp-note">{N.consent}</p>
        <label className="cp-never-count">{N.count}<select value={neverCount} onChange={event => setNeverCount(Number(event.target.value))}>
          {[10, 15, 20].map(count => <option key={count} value={count}>{count}</option>)}
        </select></label>
      </> : null}
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
      <p className="cp-note cp-note-small">{game === "never" ? N.privacy : T.noStats}</p>
      <button type="button" className="cp-primary cp-wide" data-action="start" onClick={() => {
        onNames(effectiveNames(names, lang));
        if (game === "never") setNeverRun({ cards: dealNever(lang, neverDeck, neverCount), lang });
        setStarted(true);
      }}>{T.start}</button>
    </div>;
  } else {
    content = game === "never" && neverRun ? <NeverHaveIEver key={run} {...playProps} cards={neverRun.cards} cardLang={neverRun.lang} /> : <SecretPattern key={run} {...playProps} />;
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
