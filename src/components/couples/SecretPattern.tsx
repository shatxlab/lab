import { PatternToken } from "./PatternToken";
import { useReducer } from "react";
import {
  generatePattern, miniStrings, miniText, PATTERN_ROUNDS, patternTools, patternDifficulty, tileName,
  type Pattern,
} from "@/lib/couples/mini-games";
import { initialPattern, patternReducer } from "@/lib/couples/mini-session";
import type { Lang } from "@/lib/couples/types";
import { MiniHandoff, MiniResultsActions, useMiniPhaseFocus, type MiniPlayProps } from "./MiniGameUI";

function Board({ board, lang, onPlace, label, compare }: {
  board: Pattern; lang: Lang; onPlace?(cell: number): void; label: string; compare?: Pattern;
}) {
  const T = miniStrings(lang);
  return <div className="cp-pattern-board" role="group" aria-label={label}>
    {board.map((tile, i) => {
      const name = miniText(T.cell, { row: Math.floor(i / 3) + 1, col: i % 3 + 1, tile: tileName(tile, lang) });
      const body = <PatternToken tile={tile} />;
      const props = {
        className: "cp-pattern-cell", "data-tile": tile, "data-cell": i,
        "data-correct": compare ? compare[i] === tile : undefined,
        "aria-label": name,
      };
      return onPlace ? <button type="button" key={i} {...props} onClick={() => onPlace(i)}>{body}</button>
        : <div key={i} role="img" {...props}>{body}</div>;
    })}
  </div>;
}

export function SecretPattern({ lang, names, onReplay, onMenu }: MiniPlayProps) {
  const [state, dispatch] = useReducer(patternReducer, undefined, () => initialPattern(generatePattern(0)));
  const ref = useMiniPhaseFocus(state.phase);
  const T = miniStrings(lang);
  const describer = names[state.round % 2];
  const builder = names[1 - state.round % 2];
  const current = state.results[state.results.length - 1];
  const totals = state.results.reduce((sum, result) => ({
    correct: sum.correct + result.correct, total: sum.total + result.total,
    perfect: sum.perfect + Number(result.perfect), peeks: sum.peeks + result.peeks,
  }), { correct: 0, total: 0, perfect: 0, peeks: 0 });
  const handoff = state.phase === "handoff-study" || state.phase === "handoff-build" || state.phase === "handoff-peek";
  return <div className="cp-mini-content" ref={ref} data-mini-phase={state.phase}>
    {state.phase !== "summary" ? <p className="cp-counter">{T.round} {state.round + 1} / {PATTERN_ROUNDS} · {miniText(T.difficulty, patternDifficulty(state.round))}</p> : null}
    {handoff ? <MiniHandoff lang={lang} name={state.phase === "handoff-build" ? builder : describer}
      onReady={() => dispatch({ type: "ready" })} /> : null}

    {state.phase === "study" || state.phase === "peek" ? <section className="cp-mini-panel">
      <p className="cp-turn">{miniText(T.describe, { name: describer })}</p>
      <h2 tabIndex={-1}>{state.phase === "peek" ? T.peekTitle : T.study}</h2>
      <p className="cp-note">{T.studyHint}</p>
      <Board board={state.target} lang={lang} label={T.original} />
      {state.phase === "peek" ? <p className="cp-note">{T.peekHint}</p> : null}
      <p className="cp-note cp-note-small">{T.privacy}</p>
      <button type="button" className="cp-primary" data-action="pass" onClick={() => dispatch({ type: "pass" })}>
        {miniText(T.toBuilder, { name: builder })}
      </button>
    </section> : null}

    {state.phase === "build" ? <section className="cp-mini-panel">
      <h2 tabIndex={-1}>{miniText(T.build, { name: builder })}</h2>
      <p className="cp-note">{T.buildHint}</p>
      <div className="cp-pattern-palette" role="group" aria-label={T.palette}>
        {patternTools(state.round).map((tile) => <button type="button" key={tile} data-tool={tile}
          className="cp-pattern-cell" data-tile={tile} aria-pressed={state.tool === tile} aria-label={tileName(tile, lang)}
          onClick={() => dispatch({ type: "tool", tile })}>{tile === 0 ? <span aria-hidden="true">⌫</span> : <PatternToken tile={tile} />}</button>)}
      </div>
      <Board board={state.draft} lang={lang} label={T.rebuilt} onPlace={(cell) => dispatch({ type: "place", cell })} />
      <div className="cp-mini-actions">
        <button type="button" className="cp-secondary" data-action="peek" onClick={() => dispatch({ type: "peek" })}>{miniText(T.peek, { name: describer })}</button>
        <button type="button" className="cp-primary" data-action="prepare-reveal" onClick={() => dispatch({ type: "prepare-reveal" })}>{T.reveal}</button>
      </div>
    </section> : null}

    {state.phase === "reveal-ready" ? <section className="cp-mini-panel cp-mini-handoff">
      <span className="cp-pass-emoji" aria-hidden="true">🧩</span>
      <h2 tabIndex={-1}>{T.reveal}</h2><p>{T.revealHint}</p>
      <button type="button" className="cp-primary" data-action="reveal" onClick={() => dispatch({ type: "reveal" })}>{T.reveal}</button>
    </section> : null}

    {state.phase === "result" && current ? <section className="cp-mini-panel cp-mini-reveal">
      <h2 tabIndex={-1}>{current.perfect ? T.perfect : T.compare}</h2>
      <div className="cp-pattern-comparison">
        <section><h3>{T.original}</h3><Board board={state.target} lang={lang} label={T.original} /></section>
        <section><h3>{T.rebuilt}</h3><Board board={state.draft} lang={lang} label={T.rebuilt} compare={state.target} /></section>
      </div>
      <p className="cp-mini-result-number">{current.correct} / {current.total}</p>
      <p className="cp-note">{T.correct} · {T.extra}: {current.extra} · {T.peeks}: {current.peeks}</p>
      <button type="button" className="cp-primary" data-action="next" onClick={() => {
        if (state.round + 1 === PATTERN_ROUNDS) dispatch({ type: "finish" });
        else dispatch({ type: "next", target: generatePattern(state.round + 1) });
      }}>{state.round + 1 === PATTERN_ROUNDS ? T.finish : T.next}</button>
    </section> : null}

    {state.phase === "summary" ? <section className="cp-mini-panel">
      <h2 tabIndex={-1}>{T.patternSummary}</h2>
      <div className="cp-score cp-wide"><span className="cp-score-value">{totals.correct} / {totals.total}</span><span>{T.correct}</span></div>
      <p>{T.perfectCount}: {totals.perfect} / {PATTERN_ROUNDS} · {T.peeks}: {totals.peeks}</p>
      <ol className="cp-mini-history">{state.results.map((result, i) => <li key={i}>
        <span>{T.round} {i + 1}</span><strong>{result.correct} / {result.total}{result.perfect ? " ✓" : ""}</strong>
      </li>)}</ol>
      <p className="cp-note">{T.patternClosing}</p>
      <MiniResultsActions lang={lang} onReplay={onReplay} onMenu={onMenu} />
    </section> : null}
  </div>;
}
