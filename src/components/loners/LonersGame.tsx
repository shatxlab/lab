import { useEffect, useState } from 'react';
import { applyMove, availableLoners, botMove, crewType, deal, legalMoves, type Card, type Game, type Move } from '@/lib/loners/game';

const saveKey = 'lab.street-table.v1';
const cardName = (card: Card) => card === 'guard' ? 'Security guard' : String(card);

function Face({ card }: { card: Card }) {
  return <span className="street-face" data-rank={card} aria-hidden="true">
    <small>{card === 'guard' ? 'SEC' : 'RANK'}</small>
    <b>{card === 'guard' ? '◆' : card}</b>
  </span>;
}

export default function LonersGame() {
  const [game, setGame] = useState<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [layered, setLayered] = useState(false);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [loner, setLoner] = useState<number>();
  const [slot, setSlot] = useState(0);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(saveKey);
      if (stored) setGame(JSON.parse(stored));
    } catch { /* The game can run without storage. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (game) localStorage.setItem(saveKey, JSON.stringify(game));
      else localStorage.removeItem(saveKey);
    } catch { /* Storage is optional. */ }
  }, [game, ready]);
  useEffect(() => {
    if (!game || game.turn !== 1 || game.winner !== null) return;
    const timer = window.setTimeout(() => setGame(applyMove(game, botMove(game))), 650);
    return () => window.clearTimeout(timer);
  }, [game]);

  const resetSelection = () => { setRange(null); setLoner(undefined); setSlot(0); };
  const play = (move: Move) => {
    if (!game) return;
    setGame(applyMove(game, move));
    resetSelection();
  };
  const newRound = () => {
    if (!game) return;
    setGame(deal(game.layered, Math.random, game));
    resetSelection();
  };
  const yourTurn = game?.turn === 0 && game.winner === null;
  const moves = yourTurn ? legalMoves(game) : [];
  const start = range ? Math.min(...range) : -1;
  const end = range ? Math.max(...range) : -1;
  const fight = moves.find(move => move.type === 'fight' && move.start === start && move.count === end - start + 1 && move.loner === loner);
  const steal = moves.find(move => move.type === 'steal' && move.index === start && start === end);
  const guard = moves.find(move => move.type === 'guard' && move.index === start && start === end);
  const retreat = moves.find(move => move.type === 'retreat' && move.loner === loner && move.slot === (loner === undefined ? 0 : slot));
  const clear = moves.find(move => move.type === 'clear-guards');
  const openLoners = game ? availableLoners(game) : [];
  const select = (index: number) => setRange(!range || range[0] !== range[1] ? [index, index] : range[0] === index ? null : [range[0], index]);
  const hint = () => {
    const move = moves.find(move => move.type === 'fight' && move.loner === undefined)
      ?? moves.find(move => ['fight', 'steal', 'guard'].includes(move.type)) ?? moves[0];
    if (!move) return;
    resetSelection();
    if (move.type === 'fight') { setRange([move.start, move.start + move.count - 1]); setLoner(move.loner); }
    if (move.type === 'steal' || move.type === 'guard') setRange([move.index, move.index]);
    if (move.type === 'retreat') { setLoner(move.loner); setSlot(move.slot); }
  };

  return <>
    <header className="street-heading">
      <p className="street-label">Rules prototype · {game?.layered ? 'Layered' : 'Standard'}</p>
      <h1>Street Table</h1>
      <p>Build a crew. Empty your hand. Win two rounds.</p>
    </header>
    {!game ? <section className="street-panel street-lobby">
      <h2>Take a seat</h2>
      <p>Play a two-player match against the computer.</p>
      <label><input type="checkbox" checked={layered} onChange={event => setLayered(event.target.checked)} /> Layered Loners</label>
      <button className="street-action primary" disabled={!ready} onClick={() => setGame(deal(layered))}>Deal cards</button>
    </section> : <>
      <section className="street-score" aria-label="Match score">
        <span>You <b>{game.scores[0]}</b></span>
        <span>First to 2</span>
        <span><b>{game.scores[1]}</b> Rival · {game.hands[1].length} in hand</span>
      </section>
      <div className="street-board">
        <section className="street-panel">
          <h2>The Street <small>{game.guards % 2 ? 'Lower wins' : 'Higher wins'}</small></h2>
          {game.street ? <>
            <div className="street-cards" aria-label={`Active crew: ${game.street.cards.join(', ')}`}>
              {game.street.cards.map((card, i) => <Face key={i} card={card} />)}
            </div>
            <p>{game.street.owner === 0 ? 'Your crew' : 'Rival’s crew'} · {crewType(game.street.cards)}{game.street.volatile ? ' · Volatile' : ''}</p>
          </> : <p className="street-empty">Open street. Lead with any crew.</p>}
        </section>
        <section className="street-panel">
          <h2>Loner Circle <small>{game.circle.length} left</small></h2>
          {game.circle.length ? <div className="street-cards">
            {game.circle.map((card, i) => <button key={i} className="street-card" aria-label={`${cardName(card)}, Loner ${i + 1}`}
              aria-pressed={loner === i} disabled={!yourTurn || !openLoners.includes(i)} onClick={() => {
                if (game.pickup === 0) {
                  const pickup = moves.find(move => move.type === 'pickup' && move.start === i);
                  if (pickup) play(pickup);
                } else setLoner(loner === i ? undefined : i);
              }}><Face card={card} /></button>)}
          </div> : <p className="street-empty">No Loners left. You can go out.</p>}
        </section>
      </div>
      <section className="street-panel street-hand">
        <h2>Your hand <small>{game.hands[0].length} cards</small></h2>
        <p className="street-status" role="status">{game.log} {game.winner !== null
          ? `${game.winner === 0 ? 'You won' : 'Rival won'} the ${game.scores[game.winner] === 2 ? 'match' : 'round'}.`
          : game.pickup === 0 ? 'Pick a Loner to start taking the remaining cards.' : yourTurn ? 'Your turn.' : 'Rival’s turn.'}</p>
        <div className="street-cards">
          {game.hands[0].map((card, i) => <button key={i} className="street-card" aria-label={`${cardName(card)}, hand card ${i + 1}`}
            aria-pressed={i >= start && i <= end} disabled={!yourTurn || game.pickup !== null}
            onClick={() => select(i)}><Face card={card} /></button>)}
        </div>
        {game.winner !== null ? <div className="street-actions">
          <button className="street-action primary" onClick={() => game.scores[game.winner!] === 2 ? setGame(null) : newRound()}>
            {game.scores[game.winner] === 2 ? 'Back to lobby' : 'Next round'}
          </button>
        </div> : game.pickup === null && <>
          <p className="street-instruction">Tap one hand card, then another to select every card between them. Tap a Loner to recruit it or draw it when retreating.</p>
          {yourTurn && loner !== undefined && game.street && <label className="street-slot">Retreat insert position <select value={slot} onChange={event => setSlot(Number(event.target.value))}>
            {Array.from({ length: game.hands[0].length + 1 }, (_, pos) => <option key={pos} value={pos}>
              {pos === 0 ? 'At the start' : pos === game.hands[0].length ? 'At the end' : `After card ${pos} (${cardName(game.hands[0][pos - 1])})`}
            </option>)}
          </select></label>}
          <div className="street-actions">
            <button className="street-action primary" disabled={!fight} onClick={() => fight && play(fight)}>{fight?.type === 'fight' ? `Fight · ${fight.cards.join('–')}` : 'Fight'}</button>
            <button className="street-action" disabled={!steal} onClick={() => steal && play(steal)}>Steal</button>
            <button className="street-action" disabled={!guard} onClick={() => guard && play(guard)}>Call security</button>
            <button className="street-action" disabled={!retreat} onClick={() => retreat && play(retreat)}>Retreat</button>
            {clear && <button className="street-action" onClick={() => play(clear)}>Discard guards</button>}
            <button className="street-action muted" disabled={!yourTurn || !!clear} onClick={hint}>Hint</button>
            <button className="street-action muted" disabled={!yourTurn || (!range && loner === undefined)} onClick={resetSelection}>Clear</button>
          </div>
        </>}
      </section>
      <button className="street-action muted street-reset" onClick={() => {
        if (window.confirm('Abandon this match and return to the lobby?')) { setGame(null); resetSelection(); }
      }}>End match</button>
    </>}
    <details className="street-rules">
      <summary>How to play · prototype notes</summary>
      <ul>
        <li>Fight with adjacent cards: a single, a set, or a run in either direction. More cards win; at equal size, sets beat runs, then higher ranks win.</li>
        <li>Recruit one Loner into a crew to make it volatile. An opponent can steal it by extending its pattern with one card.</li>
        <li>Retreat by taking a Loner and inserting it anywhere in your hand, or pass if the circle is empty. When a pass returns play to the crew’s owner, the street clears.</li>
        <li>Security reverses strength until another guard restores it or the street clears. Guards can’t be played as the last card or on an open street. This prototype applies reversed strength to steals too.</li>
        <li>If you go out with Loners still visible, take all of them instead of winning. In Layered mode only the rightmost Loner is available; take any remaining cards right to left.</li>
        <li>Provisional deck: six of each rank 1–7 and three guards in the two-player game. Prototype fallback: if you must lead but hold only guards, discard them, then resolve your empty hand as usual.</li>
      </ul>
      <p>Unofficial prototype based on <a href="https://weastcoast.games/products/loners-card-game">Loners by Weast Coast Games</a>. No original card artwork used.</p>
    </details>
  </>;
}
