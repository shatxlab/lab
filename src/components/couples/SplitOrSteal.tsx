import { useReducer } from "react";
import { miniStrings, miniText, SPLIT_ROUNDS, splitTotals, type SplitRound } from "@/lib/couples/mini-games";
import { firstChooser, initialSplit, splitReducer } from "@/lib/couples/mini-session";
import { MiniHandoff, MiniResultsActions, useMiniPhaseFocus, type MiniPlayProps } from "./MiniGameUI";
import type { Lang } from "@/lib/couples/types";

function Payoffs({ lang }: { lang: Lang }) {
  const T = miniStrings(lang);
  return <dl className="cp-mini-payoffs" aria-label={T.payoff}>
    <div><dt>{T.bothSplit}</dt><dd>{T.each3}</dd></div>
    <div><dt>{T.oneSteals}</dt><dd>{T.steal5}</dd></div>
    <div><dt>{T.bothSteal}</dt><dd>{T.each0}</dd></div>
  </dl>;
}
function ChoiceResult({ result, lang, names }: { result: SplitRound; lang: Lang; names: [string, string] }) {
  const T = miniStrings(lang);
  return <div className="cp-split-pair">{result.choices.map((choice, i) => <div className="cp-split-player" key={i} data-choice={choice}>
    <strong className="cp-mini-player-name">{names[i]}</strong>
    <span className="cp-split-choice">{choice === "split" ? "🤝" : "🪙"} {T[choice]}</span>
    <span className="cp-mini-result-number">+{result.coins[i]}</span><span className="cp-note">{T.coins}</span>
  </div>)}</div>;
}
export function SplitOrSteal({ lang, names, onReplay, onMenu }: MiniPlayProps) {
  const [state, dispatch] = useReducer(splitReducer, undefined, initialSplit);
  const ref = useMiniPhaseFocus(state.phase);
  const T = miniStrings(lang);
  const first = firstChooser(state.round);
  const player = state.phase === "handoff-second" || state.phase === "choose-second" ? 1 - first : first;
  const totals = splitTotals(state.results);
  const current = state.results[state.results.length - 1];
  const handoff = state.phase === "handoff-first" || state.phase === "handoff-second";
  const choosing = state.phase === "choose-first" || state.phase === "choose-second";
  return <div className="cp-mini-content" ref={ref} data-mini-phase={state.phase}>
    {state.phase !== "summary" ? <p className="cp-counter">{T.round} {state.round + 1} / {SPLIT_ROUNDS}</p> : null}
    {state.phase === "negotiate" ? <section className="cp-mini-panel">
      <h2 tabIndex={-1}>{T.negotiate}</h2>
      <p className="cp-note">{T.splitRules}</p>
      <Payoffs lang={lang} />
      <p className="cp-mini-caution">{T.fiction}</p>
      <button type="button" className="cp-primary" data-action="begin" onClick={() => dispatch({ type: "begin" })}>{miniText(T.firstChoose, { name: names[first] })}</button>
    </section> : null}

    {handoff ? <MiniHandoff lang={lang} name={names[player]} onReady={() => dispatch({ type: "ready" })} /> : null}

    {choosing ? <section className="cp-mini-panel">
      <h2 tabIndex={-1}>{miniText(T.choose, { name: names[player] })}</h2>
      <p className="cp-note">{T.chooseHint}</p>
      <div className="cp-split-options">
        <button type="button" className="cp-option" data-action="split" onClick={() => dispatch({ type: "choose", choice: "split" })}><span aria-hidden="true">🤝</span>{T.split}</button>
        <button type="button" className="cp-option" data-action="steal" onClick={() => dispatch({ type: "choose", choice: "steal" })}><span aria-hidden="true">🪙</span>{T.steal}</button>
      </div>
      <Payoffs lang={lang} />
      <p className="cp-note cp-note-small">{T.privacy}</p>
    </section> : null}

    {state.phase === "locked" ? <section className="cp-mini-panel cp-mini-handoff">
      <span className="cp-pass-emoji" aria-hidden="true">🔒</span>
      <h2 tabIndex={-1}>{T.locked}</h2><p>{T.lockedHint}</p>
      <button type="button" className="cp-primary" data-action="reveal" onClick={() => dispatch({ type: "reveal" })}>{T.reveal}</button>
    </section> : null}

    {state.phase === "result" && current ? <section className="cp-mini-panel cp-mini-reveal">
      <h2 tabIndex={-1}>{T.roundResult}</h2>
      <ChoiceResult result={current} lang={lang} names={names} />
      <div className="cp-mini-totals">{names[0]}: {totals[0]} · {names[1]}: {totals[1]}<br />{T.combined}: {totals[0] + totals[1]} {T.coins}</div>
      <button type="button" className="cp-primary" data-action="next" onClick={() => dispatch({ type: state.round + 1 === SPLIT_ROUNDS ? "finish" : "next" })}>
        {state.round + 1 === SPLIT_ROUNDS ? T.finish : T.next}
      </button>
    </section> : null}

    {state.phase === "summary" ? <section className="cp-mini-panel">
      <h2 tabIndex={-1}>{T.splitSummary}</h2>
      <p className="cp-mini-winner">{totals[0] === totals[1] ? T.tie : miniText(T.ahead, { name: names[totals[0] > totals[1] ? 0 : 1] })}</p>
      <div className="cp-split-pair">{names.map((name, i) => <div className="cp-split-player" key={i}>
        <strong className="cp-mini-player-name">{name}</strong><span className="cp-mini-result-number">{totals[i]}</span><span className="cp-note">{T.coins}</span>
      </div>)}</div>
      <p><strong>{T.combined}: {totals[0] + totals[1]} {T.coins}</strong></p>
      <h3>{T.history}</h3>
      <ol className="cp-mini-history">{state.results.map((result, i) => <li key={i}>
        <span>{T.round} {i + 1}</span>
        <span>{names[0]}: {T[result.choices[0]]} +{result.coins[0]}<br />{names[1]}: {T[result.choices[1]]} +{result.coins[1]}</span>
      </li>)}</ol>
      <p className="cp-note">{T.splitClosing}</p>
      <MiniResultsActions lang={lang} onReplay={onReplay} onMenu={onMenu} />
    </section> : null}
  </div>;
}
