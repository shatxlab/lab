export type Card = number | 'guard';
export type Seat = 0 | 1;
type Crew = { cards: number[]; owner: Seat; volatile: boolean };
export type Game = {
  hands: [Card[], Card[]]; circle: number[]; street: Crew | null; guards: number;
  turn: Seat; starter: Seat; scores: [number, number]; winner: Seat | null;
  pickup: Seat | null; layered: boolean; log: string;
};
export type Move =
  | { type: 'fight'; start: number; count: number; loner?: number; cards: number[] }
  | { type: 'steal'; index: number; cards: number[] }
  | { type: 'guard'; index: number }
  | { type: 'retreat'; loner?: number; slot: number }
  | { type: 'pickup'; start: number }
  | { type: 'clear-guards' };

const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;
const insert = <T>(items: T[], index: number, value: T) => [...items.slice(0, index), value, ...items.slice(index)];
const remove = <T>(items: T[], index: number, count = 1) => [...items.slice(0, index), ...items.slice(index + count)];
const name = (seat: Seat) => seat === 0 ? 'You' : 'Rival';

export function crewType(cards: number[]) {
  if (cards.length === 1) return 'single';
  if (cards.length < 2) return null;
  if (cards.every(card => card === cards[0])) return 'set';
  const step = cards[1] - cards[0];
  return Math.abs(step) === 1 && cards.slice(1).every((card, i) => card - cards[i] === step) ? 'run' : null;
}

export function compareCrews(a: number[], b: number[]) {
  return a.length - b.length || Number(crewType(a) === 'set') - Number(crewType(b) === 'set') || Math.max(...a) - Math.max(...b);
}

function shuffle<T>(items: T[], rng: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function deal(layered = false, rng = Math.random, previous?: Game): Game {
  // Placeholder mix: six of each rank (1–8), plus three guards. Two-player rules remove all 8s.
  const numbers = Array.from({ length: 42 }, (_, i) => i % 7 + 1);
  const circle = shuffle(numbers, rng).splice(0, 6);
  const deck = shuffle<Card>([...numbers, 'guard', 'guard', 'guard'], rng);
  const starter = previous ? other(previous.starter) : rng() < 0.5 ? 0 : 1;
  return { hands: [deck.slice(0, 11), deck.slice(11, 22)], circle, starter, turn: starter,
    scores: previous?.scores ?? [0, 0], street: null, guards: 0, winner: null, pickup: null,
    layered, log: 'New round. The street is open.' };
}

export function availableLoners(game: Game) {
  return game.circle.flatMap((_, i) => !game.layered || i === game.circle.length - 1 ? [i] : []);
}

export function legalMoves(game: Game): Move[] {
  if (game.winner !== null) return [];
  const loners = availableLoners(game);
  if (game.pickup !== null) return loners.map(start => ({ type: 'pickup', start }));
  const { street, guards, turn } = game;
  const hand = game.hands[turn];
  const moves: Move[] = [];
  const beats = (cards: number[]) => !street || compareCrews(cards, street.cards) * (guards % 2 ? -1 : 1) > 0;
  for (let start = 0; start < hand.length; start++) {
    const cards: number[] = [];
    for (let end = start; end < hand.length; end++) {
      const card = hand[end];
      if (card === 'guard') break;
      cards.push(card);
      const count = end - start + 1;
      if (crewType(cards) && beats(cards)) moves.push({ type: 'fight', start, count, cards: [...cards] });
      for (const loner of loners) {
        for (let slot = 0; slot <= count; slot++) {
          // Identical neighbouring ranks would produce the same crew.
          if (slot && cards[slot - 1] === game.circle[loner]) continue;
          const joined = insert(cards, slot, game.circle[loner]);
          if (crewType(joined) && beats(joined)) moves.push({ type: 'fight', start, count, loner, cards: joined });
        }
      }
    }
  }
  if (street) {
    hand.forEach((card, index) => {
      if (card === 'guard') {
        if (hand.length > 1) moves.push({ type: 'guard', index });
      } else if (street.volatile && street.owner !== turn) {
        const type = crewType(street.cards);
        for (const cards of [[card, ...street.cards], [...street.cards, card]]) {
          if (crewType(cards) !== type || !beats(cards)) continue;
          moves.push({ type: 'steal', index, cards });
          break;
        }
      }
    });
    for (const loner of loners) {
      for (let slot = 0; slot <= hand.length; slot++) moves.push({ type: 'retreat', loner, slot });
    }
    if (!loners.length) moves.push({ type: 'retreat', slot: 0 });
  } else if (!moves.length) {
    // Prototype tie-break: the printed rules don't say how a guard-only hand opens a fight.
    moves.push({ type: 'clear-guards' });
  }
  return moves;
}

export function applyMove(game: Game, move: Move): Game {
  const { turn } = game;
  const next: Game = { ...game, hands: [...game.hands], scores: [...game.scores] };
  const hand = game.hands[turn];
  const endTurn = () => { next.turn = other(turn); };
  const checkEmpty = () => {
    if (next.hands[turn].length) endTurn();
    else if (next.circle.length) next.pickup = turn;
    else { next.winner = turn; next.scores[turn]++; }
  };
  switch (move.type) {
    case 'fight':
    case 'steal': {
      const loner = move.type === 'fight' ? move.loner : undefined;
      if (loner !== undefined) next.circle = remove(game.circle, loner);
      next.hands[turn] = move.type === 'fight' ? remove(hand, move.start, move.count) : remove(hand, move.index);
      next.street = { cards: move.cards, owner: turn, volatile: loner !== undefined };
      next.log = `${name(turn)} ${move.type === 'steal' ? 'stole' : 'played'} ${move.cards.join('–')}${loner !== undefined ? ' with a Loner' : ''}.`;
      checkEmpty();
      break;
    }
    case 'guard':
      next.hands[turn] = remove(hand, move.index);
      next.guards++;
      next.log = `${name(turn)} called security. ${next.guards % 2 ? 'Lower crews beat higher ones.' : 'Normal strength is back.'}`;
      endTurn();
      break;
    case 'retreat':
      if (move.loner !== undefined) {
        next.hands[turn] = insert(hand, move.slot, game.circle[move.loner]);
        next.circle = remove(game.circle, move.loner);
      }
      next.log = `${name(turn)} retreated${move.loner !== undefined ? ` and drew a ${game.circle[move.loner]}` : ''}.`;
      endTurn();
      if (next.street?.owner === next.turn) {
        next.street = null;
        next.guards = 0;
        next.log += ' The street is open.';
      }
      break;
    case 'pickup':
      next.hands[turn] = game.layered ? [...game.circle].reverse() : [...game.circle.slice(move.start), ...game.circle.slice(0, move.start)];
      next.circle = [];
      next.pickup = null;
      next.log = `${name(turn)} picked up the remaining Loners.`;
      endTurn();
      break;
    case 'clear-guards':
      next.hands[turn] = [];
      next.log = `${name(turn)} discarded a guard-only hand (prototype rule).`;
      checkEmpty();
      break;
  }
  return next;
}

export function botMove(game: Game): Move {
  const moves = legalMoves(game);
  const hand = game.hands[game.turn];
  const score = (move: Move) => {
    switch (move.type) {
      case 'pickup': case 'clear-guards': return 100;
      case 'steal': return 14;
      case 'fight': return move.count * 10 + (move.loner !== undefined ? 2 : 0) - Math.max(...move.cards) / 8;
      case 'guard': return 1;
      case 'retreat': {
        if (move.loner === undefined) return 0;
        const rank = game.circle[move.loner];
        return [hand[move.slot - 1], hand[move.slot]].reduce<number>((s, card) => (
          s + (typeof card === 'number' ? card === rank ? 2 : Math.abs(card - rank) === 1 ? 1 : 0 : 0)
        ), 0) / 5;
      }
    }
  };
  return moves.reduce((best, move) => score(move) > score(best) ? move : best);
}
