import { useEffect, useRef, useState } from 'react';
import { useAppLang, useLangReady } from '@/lib/apps/use-app-lang';
import { act, bestBonus, bonusCount, botTarget, collectible, newGame, score, triple, type Card, type Game } from '@/lib/potions/game';
import { copy } from '@/lib/potions/i18n';

/** Small original SVG illustrations; no licensed game assets. */
function IngredientArt({ value, down = false, kind = 'ingredient' }: { value: number; down?: boolean; kind?: string }) {
  return <svg viewBox="0 0 80 88" fill="none" aria-hidden="true" className="p-art">
    {down ? <><path d="M40 8 66 25v35L40 78 14 60V25Z" stroke="currentColor" strokeWidth="2"/><path d="m40 22 15 22-15 22-15-22Z" fill="currentColor" opacity=".35"/><path d="M29 44h22M40 33v22" stroke="currentColor" strokeWidth="2"/></>
      : kind === 'recipe' ? <><path d="M19 15h45v55H19z" fill="currentColor" opacity=".15"/><path d="M57 15H24c-13 0-13 14-2 14h35v44H22c-10 0-10-13 0-13h35" stroke="currentColor" strokeWidth="3"/><path d="M29 39h19M29 48h13" stroke="currentColor" strokeWidth="3"/></>
      : kind === 'ladle' ? <><path d="m53 12-8 42" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><path d="M25 52c-9 21 27 30 34 7Z" fill="currentColor" opacity=".5"/><path d="M25 52c-9 21 27 30 34 7Z" stroke="currentColor" strokeWidth="2"/></>
      : <><path d="M30 10h20v8H30z" fill="currentColor" opacity=".6"/><path d="M32 18v15C8 48 15 76 40 76s32-28 8-43V18" stroke="currentColor" strokeWidth="2.5"/><path d="M22 50c12-7 24 8 36 0 8 30-44 30-36 0Z" fill="currentColor" opacity=".27"/>
        {value % 3 === 1 ? <><path d="M40 65V40M40 55c-13 0-13-12-13-12 12 0 13 12 13 12Zm0 7c13 0 13-12 13-12-12 0-13 12-13 12Z" stroke="currentColor" strokeWidth="2"/></>
          : value % 3 === 2 ? <><path d="m40 37 4 10 11 1-9 7 3 11-9-6-9 6 3-11-9-7 11-1Z" fill="currentColor" opacity=".75"/></>
          : <><path d="M40 37c-5 9-12 15-12 21a12 12 0 0 0 24 0c0-6-7-12-12-21Z" fill="currentColor" opacity=".65"/><path d="M34 54c-3 5-2 8 1 9" stroke="white" opacity=".65" strokeWidth="2" strokeLinecap="round"/></>}
        <path d="M27 32V22" stroke="currentColor" opacity=".4" strokeWidth="2"/><circle cx="57" cy="24" r="3" fill="currentColor" opacity=".4"/><circle cx="22" cy="17" r="2" fill="currentColor" opacity=".4"/></>}
  </svg>;
}

export default function PotionsGame() {
  const lang = useAppLang(), ready = useLangReady<HTMLElement>(), t = copy[lang];
  const [game, setGame] = useState<Game | null>(null);
  const [bots, setBots] = useState(2), [quick, setQuick] = useState(true), [speed, setSpeed] = useState('calm');
  const [paused, setPaused] = useState(false), [rules, setRules] = useState(false), [bonus, setBonus] = useState(0);
  const lastTake = useRef(0);
  const phase = game?.phase, turn = game?.turn, round = game?.round;
  const hasTriple = game ? triple(game.table) !== null : false;
  const stopped = paused || rules;
  const name = (i: number) => i === 0 ? t.you : t.rivals[i - 1]!;
  const dispatch = (action: Parameters<typeof act>[1]) => setGame(g => g ? act(g, action) : g);

  useEffect(() => {
    const hide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (stopped || phase !== 'reveal' || turn === 0 || turn === undefined) return;
    const timer = setTimeout(() => setGame(g => g ? act(g, { type: 'reveal', player: turn }) : g), speed === 'calm' ? 1350 : 800);
    return () => clearTimeout(timer);
  }, [phase, turn, round, stopped, speed]);
  useEffect(() => {
    if (stopped || phase !== 'reveal' || !hasTriple) return;
    const timer = setTimeout(() => setGame(g => g ? act(g, { type: 'call', player: 1 + Math.floor(Math.random() * (g.players.length - 1)) }) : g), speed === 'calm' ? 1900 : 900);
    return () => clearTimeout(timer);
  }, [phase, hasTriple, round, stopped, speed]);
  useEffect(() => {
    if (stopped || phase !== 'brew') return;
    const timers = Array.from({ length: bots }, (_, index) => {
      const player = index + 1;
      return setInterval(() => setGame(g => {
        if (!g || g.phase !== 'brew' || g.players[player]!.done) return g;
        const id = botTarget(g, player);
        return act(g, id === null ? { type: 'done', player } : { type: 'take', player, id });
      }), (speed === 'calm' ? 1100 : 650) + index * 173);
    });
    return () => timers.forEach(clearInterval);
  }, [phase, round, stopped, speed, bots]);
  useEffect(() => { if (phase === 'settle') setBonus(0); }, [phase]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || stopped || !game || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (e.code === 'Space' && game.phase === 'reveal' && game.turn === 0) { e.preventDefault(); dispatch({ type: 'reveal', player: 0 }); }
      if (e.code === 'KeyB' && game.phase === 'reveal') { e.preventDefault(); dispatch({ type: 'call', player: 0 }); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [game, stopped]);

  function start() { setGame(newGame(bots, quick)); setPaused(false); setBonus(0); lastTake.current = 0; }
  function take(id: number) {
    if (stopped || performance.now() - lastTake.current < 160) return;
    lastTake.current = performance.now(); dispatch({ type: 'take', player: 0, id });
  }
  function renderCard(card: Card, interactive = false) {
    const label = card.down ? t.faceDown : card.kind === 'ingredient' ? `${card.value} ${t.names[card.value - 1]}` : card.kind === 'recipe' ? t.recipe : t.ladle;
    const content = <><span className="p-card-value">{card.down ? '✦' : card.kind === 'ingredient' ? card.value : card.kind === 'recipe' ? '↔' : '↶'}</span>{' '}<IngredientArt value={card.value} kind={card.kind} down={card.down}/><span className="p-card-name">{card.down ? '✦ ✦ ✦' : card.kind === 'ingredient' ? t.names[card.value - 1] : card.kind === 'recipe' ? lang === 'ru' ? 'Рецепт' : 'Recipe' : lang === 'ru' ? 'Черпак' : 'Ladle'}</span></>;
    const className = `p-card p-v${card.down ? 0 : card.value} ${!card.down && card.value === game?.trigger ? 'p-match' : ''}`;
    return interactive ? <button key={card.id} className={className} aria-label={label} disabled={!collectible(card) || stopped || game?.players[0]!.done} onClick={() => take(card.id)}>{content}</button>
      : <div key={card.id} className={className} role="img" aria-label={label}>{content}</div>;
  }
  const p = game?.players[0];
  const preview = p && game ? score(p.held, game.trigger, bonus) : null;
  const slots = game ? (phase === 'brew' || phase === 'settle' ? game.slots : game.table.map(c => c.id)) : [];
  let notice = t.startEvent as string;
  if (game) {
    if (game.event === 'recipe') notice = t.recipeEvent;
    if (game.event === 'ladle') notice = t.ladleEvent;
    if (game.event === 'penalty') notice = t.penalty;
    if (game.event === 'call') notice = `${name(game.actor)} ${t.called}`;
    if (game.event === 'final') notice = t.final;
    if (game.event === 'settled') notice = t.result;
    if (game.event === 'ingredient') notice = t.hunt;
  }
  const maxBank = game ? Math.max(...game.players.map(p => p.bank.length)) : 0;
  const winners = game?.players.map((p, i) => p.bank.length === maxBank ? i : -1).filter(i => i >= 0) ?? [];

  return <section ref={ready} data-lang-sensitive="" className="potions">
    <header className="p-heading"><div><p className="p-eyebrow">{t.prototype}</p><h1>{t.title}<span aria-hidden="true"> ✦</span></h1></div><div className="p-toolbar">
      {game && phase !== 'finished' && <button className="p-quiet" onClick={() => setPaused(v => !v)}>{paused ? t.resume : t.pause}</button>}
      <button className="p-quiet" aria-expanded={rules} onClick={() => setRules(v => !v)}>{rules ? t.close : t.rules}</button>
    </div></header>

    {rules && <aside className="p-rules"><h2>{t.rules}</h2><ol>{t.rulesList.map(r => <li key={r}>{r}</li>)}</ol><p>{t.adaptation}</p><button className="p-primary" onClick={() => setRules(false)}>{t.close}</button></aside>}

    {!game ? <div className="p-lobby">
      <div className="p-lobby-art"><div className="p-halo"/><span className="p-spark p-spark-one">✦</span><span className="p-spark p-spark-two">✧</span><IngredientArt value={7}/><div className="p-fan">{[2, 5, 9].map(n => renderCard({ id: n, kind: 'ingredient', value: n, down: false }))}</div></div>
      <div className="p-lobby-copy"><p className="p-eyebrow">{t.eyebrow}</p><h2>{t.intro}</h2><p>{lang === 'ru' ? 'Вы против алхимиков-ботов. Быстрые руки помогают, но круглая сумма решает всё.' : 'You versus a table of bot alchemists. Fast hands help. A perfect sum wins.'}</p>
        <div className="p-options"><label>{t.bots}<select value={bots} onChange={e => setBots(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>{t.pace}<select value={speed} onChange={e => setSpeed(e.target.value)}><option value="calm">{t.calm}</option><option value="fast">{t.fast}</option></select></label>
        <label>{t.deck}<select value={quick ? 'quick' : 'full'} onChange={e => setQuick(e.target.value === 'quick')}><option value="quick">{bots === 1 ? t.quick.replace('40', '38') : t.quick}</option><option value="full">{bots === 1 ? t.full.replace('112', '110') : t.full}</option></select></label></div>
        <button className="p-primary p-start" onClick={start}>{t.start} <span aria-hidden="true">→</span></button>
        <p className="p-fine">{lang === 'ru' ? '2–7 игроков · локально в браузере · без регистрации' : '2–7 players · entirely in your browser · no sign-up'}</p>
      </div>
    </div> : <>
      <div className="p-scoreboard">{game.players.map((player, i) => <div key={i} className={`p-player ${phase === 'reveal' && game.turn === i ? 'p-active' : ''} ${i === 0 ? 'p-self' : ''}`}>
        <span className="p-avatar" aria-hidden="true">{i === 0 ? '✧' : ['☽', '✹', '❋', '◇', '♧', '✺'][i - 1]}</span><div><strong>{name(i)} {game.first === i && <span title={lang === 'ru' ? 'Первый игрок' : 'First player'}>⚑</span>}</strong><span>{player.deck.length} {t.left}{phase === 'brew' || phase === 'settle' ? ` · ${player.held.length} ${t.held}${player.done ? ' ✓' : ''}` : ''}</span></div><b>{player.bank.length}<small>{t.bank}</small></b>
      </div>)}</div>
      <div className="p-table-top"><span>{t.round} {game.round} <span aria-hidden="true">/</span> {game.direction === 1 ? '↻' : '↺'}</span><span>{game.mirrored ? t.mirrored : `${game.total} ${t.cards}`}</span></div>
      <div className="p-notice" role="status">{notice}</div>
      {paused ? <div className="p-paused"><span aria-hidden="true">☾</span><h2>{t.paused}</h2><button className="p-primary" onClick={() => setPaused(false)}>{t.resume}</button><button className="p-quiet" onClick={() => { setGame(null); setPaused(false); }}>{t.again}</button></div>
      : !rules && <>
        {phase === 'finished' ? <div className="p-finish"><span className="p-trophy" aria-hidden="true">✧</span><p className="p-eyebrow">{t.result}</p><h2>{winners.length > 1 ? t.tie : `${name(winners[0]!)} ${t.winner}`}</h2><p>{t.resultsIntro}</p><div className="p-podium">{game.players.map((player, i) => ({ player, i })).sort((a, b) => b.player.bank.length - a.player.bank.length).map(({ player, i }) => <div key={i}><strong>{name(i)}</strong><b>{player.bank.length}</b></div>)}</div><button className="p-primary" onClick={() => setGame(null)}>{t.again}</button></div>
        : <>
          <div className={`p-table ${phase === 'brew' ? 'p-brewing' : ''}`} aria-label={lang === 'ru' ? 'Карты на столе' : 'Table cards'}>
            {!slots.length && <div className="p-table-empty"><span aria-hidden="true">✦</span>{t.empty}</div>}
            {slots.map(id => { const c = game.table.find(c => c.id === id); return c ? renderCard(c, phase === 'brew') : <div key={id} className="p-card-hole" aria-hidden="true">✧</div>; })}
          </div>
          {(phase === 'brew' || phase === 'settle') && <section className="p-tray"><div className="p-tray-heading"><h2>{t.tray}</h2><span>{p!.held.length} {t.cards}</span></div><div className="p-held">{p!.held.length ? p!.held.map(c => renderCard(c)) : <p>{t.emptyTray}</p>}</div>
            {phase === 'brew' && <div className="p-sum">{t.total}: <strong>{p!.held.filter(c => !c.down).reduce((s, c) => s + c.value, 0)}</strong><span>{game.trigger !== null ? `${lang === 'ru' ? 'Число тройки' : 'Trigger value'}: ${game.trigger}` : t.finalHint}</span></div>}
            {phase === 'settle' && <div className="p-settle"><p>{t.choose}</p>{bonusCount(p!.held, game.trigger) > 0 && <><label>{t.bonus}<select value={bonus} onChange={e => setBonus(Number(e.target.value))}>{Array.from({ length: bonusCount(p!.held, game.trigger) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label><p className="p-fine">{t.bonusHint}</p></>}
              <div className="p-preview"><span>{t.total} <b>{preview!.result.sum}</b></span><span className="p-success">{t.safe} <b>{preview!.result.banked}</b></span><span>{t.returned} <b>{preview!.result.returned}</b></span></div>
              {bestBonus(p!.held, game.trigger) !== bonus && <button className="p-quiet" onClick={() => setBonus(bestBonus(p!.held, game.trigger))}>{lang === 'ru' ? 'Подобрать лучший вариант' : 'Use best split'}</button>}
            </div>}
          </section>}
          {phase === 'results' && <section className="p-round-results"><h2>{t.result}</h2>{game.results.map((r, i) => <p key={i}><strong>{name(i)}</strong><span className="p-success">+{r.banked} {t.banked.toLowerCase()}</span><span>{r.returned} {t.bounced.toLowerCase()}</span></p>)}</section>}
          <div className={`p-controls ${game.mirrored ? 'p-mirrored' : ''}`}>
            <p>{phase === 'reveal' ? game.turn === 0 ? t.turn : `${name(game.turn)} ${t.botTurn}` : phase === 'brew' ? p!.done ? t.waiting : t.grab : phase === 'settle' ? t.choose : t.result}</p>
            <div className="p-actions">
              {phase === 'reveal' && <><button className="p-secondary" disabled={game.turn !== 0} onClick={() => dispatch({ type: 'reveal', player: 0 })}>{t.reveal}<kbd>Space</kbd></button><button className="p-primary" onClick={() => dispatch({ type: 'call', player: 0 })}>{t.call}<kbd>B</kbd></button></>}
              {phase === 'brew' && <button className="p-primary" disabled={p!.done} onClick={() => dispatch({ type: 'done', player: 0 })}>{p!.done ? t.waiting : t.done}</button>}
              {phase === 'settle' && <button className="p-primary" onClick={() => dispatch({ type: 'settle', bonus })}>{t.settle}</button>}
              {phase === 'results' && <button className="p-primary" onClick={() => dispatch({ type: 'next' })}>{t.next}</button>}
            </div>
          </div>
        </>}
      </>}
    </>}
    <footer className="p-footer">{t.adaptation}</footer>
  </section>;
}
