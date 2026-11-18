/** Pure, local-only rules engine. No clocks, DOM, network or hidden bot information. */
export type Kind = 'ingredient' | 'recipe' | 'ladle';
export interface Card { id: number; kind: Kind; value: number; down: boolean }
export interface Player { deck: Card[]; bank: Card[]; held: Card[]; done: boolean }
export type Phase = 'reveal' | 'brew' | 'settle' | 'results' | 'finished';
export interface Result { banked: number; returned: number; sum: number; bonus: number }
export interface Game {
  players: Player[]; table: Card[]; phase: Phase; turn: number; first: number;
  direction: 1 | -1; mirrored: boolean; trigger: number | null; final: boolean;
  round: number; slots: number[]; results: Result[]; event: 'start' | 'ingredient' | 'recipe' | 'ladle' | 'call' | 'penalty' | 'final' | 'settled';
  actor: number; total: number;
}
export type Action = { type: 'reveal'; player: number } | { type: 'call'; player: number }
  | { type: 'take'; player: number; id: number } | { type: 'done'; player: number }
  | { type: 'settle'; bonus: number } | { type: 'next' };

export function makeDeck(players: number, copies = 12): Card[] {
  let id = 0;
  const cards: Card[] = [];
  for (let value = 1; value <= 9; value++) for (let n = 0; n < copies; n++) cards.push({ id: id++, kind: 'ingredient', value, down: false });
  for (const kind of (players === 2 ? ['recipe'] : ['recipe', 'ladle']) as Kind[]) {
    for (let n = 0; n < 2; n++) cards.push({ id: id++, kind, value: 0, down: false });
  }
  return cards;
}
export function newGame(bots = 2, quick = false, random: () => number = Math.random): Game {
  const count = Math.max(2, Math.min(7, Math.floor(bots) + 1));
  const deck = makeDeck(count, quick ? 4 : 12);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
  const players = Array.from({ length: count }, (): Player => ({ deck: [], bank: [], held: [], done: false }));
  deck.forEach((c, i) => players[i % count]!.deck.push(c));
  return { players, table: [], phase: 'reveal', turn: 0, first: 0, direction: 1, mirrored: false, trigger: null, final: false, round: 1, slots: [], results: [], event: 'start', actor: 0, total: deck.length };
}
export function triple(table: Card[]): number | null {
  const counts = new Map<number, number>();
  for (const c of table) if (!c.down && c.kind === 'ingredient') {
    const n = (counts.get(c.value) ?? 0) + 1; counts.set(c.value, n);
    if (n >= 3) return c.value;
  }
  return null;
}
export function collectible(c: Card): boolean { return c.down || c.kind === 'ingredient'; }
export function bonusCount(cards: Card[], trigger: number | null): number {
  return cards.filter(c => !c.down && c.kind === 'ingredient' && c.value === trigger).length;
}
export function score(cards: Card[], trigger: number | null, requestedBonus: number): { bank: Card[]; returned: Card[]; result: Result } {
  let left = Math.max(0, Math.min(bonusCount(cards, trigger), Math.floor(requestedBonus)));
  const bank: Card[] = [], remaining: Card[] = [];
  for (const c of cards) {
    if (c.down) bank.push(c);
    else if (c.value === trigger && left > 0) { bank.push(c); left--; }
    else remaining.push(c);
  }
  const bonus = bank.filter(c => !c.down).length;
  const sum = remaining.reduce((s, c) => s + c.value, 0);
  const success = sum % 10 === 0;
  if (success) bank.push(...remaining);
  return { bank, returned: success ? [] : remaining, result: { banked: bank.length, returned: success ? 0 : remaining.length, sum, bonus } };
}
export function bestBonus(cards: Card[], trigger: number | null): number {
  let best = 0, count = -1;
  for (let n = 0; n <= bonusCount(cards, trigger); n++) {
    const points = score(cards, trigger, n).bank.length;
    if (points > count) { best = n; count = points; }
  }
  return best;
}
function neighbor(g: Game, from: number): number { return (from + g.direction + g.players.length) % g.players.length; }
function nextDeck(g: Game, from: number): number {
  let n = from;
  for (let i = 0; i < g.players.length; i++, n = neighbor(g, n)) if (g.players[n]!.deck.length) return n;
  return from;
}
function brew(g: Game, actor: number, final = false) {
  g.slots = g.table.map(c => c.id); g.trigger = triple(g.table); g.final = final; g.phase = 'brew'; g.actor = actor; g.event = final ? 'final' : 'call';
  for (const p of g.players) p.done = false;
}
function penalty(g: Game, player: number) {
  const c = g.players[player]!.bank.pop();
  if (c) g.table.push({ ...c, down: true });
  g.event = 'penalty'; g.actor = player;
}
/** Illegal/stale actions are no-ops. UI timers can safely race with human input. */
export function act(state: Game, a: Action): Game {
  if ('player' in a && !state.players[a.player]) return state;
  if (a.type === 'reveal' && (state.phase !== 'reveal' || state.turn !== a.player || !state.players[a.player]!.deck.length)) return state;
  if (a.type === 'call' && state.phase !== 'reveal') return state;
  if ((a.type === 'take' || a.type === 'done') && (state.phase !== 'brew' || state.players[a.player]!.done)) return state;
  if (a.type === 'take' && !state.table.some(c => c.id === a.id && collectible(c))) return state;
  if (a.type === 'settle' && state.phase !== 'settle') return state;
  if (a.type === 'next' && state.phase !== 'results') return state;
  const g: Game = { ...state, table: [...state.table], players: state.players.map(p => ({ ...p, deck: [...p.deck], bank: [...p.bank], held: [...p.held] })) };
  if (a.type === 'reveal') {
    const c = g.players[a.player]!.deck.shift()!; g.table.push(c); g.actor = a.player; g.event = c.kind;
    if (c.kind !== 'ingredient') {
      if (c.kind === 'ladle') g.direction = g.direction === 1 ? -1 : 1;
      else g.mirrored = !g.mirrored;
      const pair = g.table.filter(k => k.kind === c.kind && !k.down);
      if (pair.length === 2) g.table = g.table.map(k => pair.some(p => p.id === k.id) ? { ...k, down: true } : k);
    }
    if (g.players.every(p => !p.deck.length)) brew(g, a.player, true);
    else g.turn = nextDeck(g, neighbor(g, a.player));
  } else if (a.type === 'call') {
    if (triple(g.table) === null) penalty(g, a.player); else brew(g, a.player);
  } else if (a.type === 'take') {
    const c = g.table.find(c => c.id === a.id)!;
    g.table = g.table.filter(k => k.id !== c.id); g.players[a.player]!.held.push(c);
  } else if (a.type === 'done') {
    g.players[a.player]!.done = true;
    if (g.players.every(p => p.done)) g.phase = 'settle';
  } else if (a.type === 'settle') {
    g.results = g.players.map((p, i) => {
      const s = score(p.held, g.trigger, i === 0 ? a.bonus : bestBonus(p.held, g.trigger));
      p.bank.push(...s.bank); g.table.push(...s.returned); p.held = []; return s.result;
    });
    g.phase = g.final ? 'finished' : 'results'; g.event = 'settled';
  } else if (a.type === 'next') {
    g.first = neighbor(g, g.first); g.turn = nextDeck(g, g.first); g.round++; g.trigger = null; g.phase = 'reveal';
  }
  return g;
}
/** Public table + this bot's held cards only. Max-card subset-sum, modulo 10.
 * Trigger cards are always safe to bank. Complete the mandatory held sum with
 * a subset of available non-trigger cards; never peek at decks or opponents. */
export function botTarget(g: Game, player: number): number | null {
  const p = g.players[player]!;
  if (g.phase !== 'brew' || p.done) return null;
  const free = g.table.find(c => c.down || (c.kind === 'ingredient' && c.value === g.trigger));
  if (free) return free.id;
  const available = g.table.filter(c => collectible(c));
  let best: Card[] = [], bestScore = -1;
  for (let bonus = 0; bonus <= bonusCount(p.held, g.trigger); bonus++) {
    const mandatory = p.held.filter(c => !c.down).reduce((s, c) => s + c.value, 0) - bonus * (g.trigger ?? 0);
    let dp: (Card[] | null)[] = Array.from({ length: 10 }, () => null); dp[0] = [];
    for (const c of available) {
      const next = [...dp];
      dp.forEach((list, mod) => {
        if (!list) return;
        const m = (mod + c.value) % 10, candidate = [...list, c];
        if (!next[m] || next[m]!.length < candidate.length) next[m] = candidate;
      }); dp = next;
    }
    const plan = dp[(10 - mandatory % 10) % 10];
    if (plan && plan.length > bestScore) { best = plan; bestScore = plan.length; }
  }
  return best[0]?.id ?? null;
}
