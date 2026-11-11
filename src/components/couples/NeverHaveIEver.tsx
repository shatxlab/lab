import { useReducer } from "react";
import type { NeverCard } from "@/lib/couples/never/types";
import type { Lang } from "@/lib/couples/types";
import { initialNever, neverReducer } from "@/lib/couples/never/game";
import { neverStrings } from "@/lib/couples/never/i18n";
import { MiniResultsActions, useMiniPhaseFocus, type MiniPlayProps } from "./MiniGameUI";

function CardText({ text }: { text: string }) {
  // Keep Russian inclusive verb endings together instead of breaking at “(-ась)”.
  return <>{text.split(/(\S*\([^)]*\)\S*)/g).map((part, i) => part.includes("(")
    ? <span key={i} className="cp-never-word">{part}</span> : part)}</>;
}

export function NeverHaveIEver({ lang, names, cards, cardLang, onReplay, onMenu }: MiniPlayProps & { cards: readonly NeverCard[]; cardLang: Lang }) {
  const [state, dispatch] = useReducer(neverReducer, cards.length, initialNever);
  const T = neverStrings(lang);
  const ref = useMiniPhaseFocus(`never-${state.index}`);
  const card = cards[state.index];
  return <div className="cp-mini-content cp-never" ref={ref} data-never-phase={state.phase}>
    {state.phase !== "summary" && card ? <>
      <p className="cp-counter">{state.index + 1} / {cards.length} · {T[card.category]}</p>
      <section className="cp-mini-panel cp-never-prompt" lang={cardLang}>
        <span className="cp-never-spark" aria-hidden="true">✦</span>
        <h2 tabIndex={-1}><CardText text={card.prompt} /></h2>
      </section>
      {lang !== cardLang ? <p className="cp-note cp-note-small">{T.cardLanguage}</p> : null}
      <p className="cp-note">{T.answerHint}</p>
      <div className="cp-never-players" role="group" aria-label={T.answers}>
        {names.map((name, player) => <fieldset key={player}>
          <legend>{name}</legend>
          <div className="cp-never-answers">{(["have", "never"] as const).map(answer => <button key={answer} type="button"
            className="cp-secondary" data-never-player={player} data-answer={answer}
            aria-pressed={state.answers[player] === answer} onClick={() => dispatch({ type: "answer", index: state.index, player: player as 0 | 1, answer })}>
            {T[answer]}
          </button>)}</div>
        </fieldset>)}
      </div>
      {state.phase === "story" ? <section className="cp-mini-panel cp-never-story" aria-label={T.optional} aria-live="polite">
        <h3>{T.answered}</h3><p className="cp-eyebrow">{T.optional}</p><p lang={cardLang}><CardText text={card.followUp} /></p>
      </section> : null}
      <div className="cp-mini-actions">
        {state.phase === "story" ? <button type="button" className="cp-primary" data-action="never-next"
          onClick={() => dispatch({ type: "next", index: state.index })}>{state.index + 1 === cards.length ? T.finish : T.next}</button> : null}
        <button type="button" className="cp-secondary" data-action="never-skip"
          onClick={() => dispatch({ type: "skip", index: state.index })}>{T.skip}</button>
      </div>
    </> : <section className="cp-mini-panel">
      <span className="cp-never-spark" aria-hidden="true">✦</span><h2 tabIndex={-1}>{T.summary}</h2>
      <p>{T.explored}: {state.explored} · {T.skipped}: {state.skipped}</p>
      <p className="cp-note">{T.closing}</p><p className="cp-note cp-note-small">{T.privacy}</p>
      <MiniResultsActions lang={lang} onReplay={onReplay} onMenu={onMenu} />
    </section>}
  </div>;
}
