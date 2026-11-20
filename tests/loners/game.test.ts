import { describe, expect, it } from 'vitest';
import { applyMove, botMove, compareCrews, crewType, deal, legalMoves, type Game } from '../../src/lib/loners/game';

const table = (overrides: Partial<Game> = {}): Game => ({
  ...deal(false, () => 0.25), turn: 0, hands: [[4, 6, 'guard'], [3, 2]], circle: [5, 1], ...overrides,
});

describe('Street Table', () => {
  it('ranks size first, then sets over runs, and treats run directions equally', () => {
    expect(crewType([3, 4, 3])).toBeNull();
    expect(compareCrews([3, 2, 1], [1, 2, 3])).toBe(0);
    expect(compareCrews([1, 1], [6, 7])).toBeGreaterThan(0);
    expect(compareCrews([1, 2, 3], [7, 7])).toBeGreaterThan(0);
  });

  it('deals 11 ordered cards each and six numbered Loners without rank 8', () => {
    const game = deal();
    expect(game.hands.map(hand => hand.length)).toEqual([11, 11]);
    expect(game.circle).toHaveLength(6);
    expect(game.circle.every(card => card >= 1 && card <= 7)).toBe(true);
    expect(game.hands.flat()).not.toContain(8);
  });

  it('bridges an adjacent gap by recruiting a Loner, then allows one steal', () => {
    const game = table();
    expect(legalMoves(game)).not.toContainEqual({ type: 'fight', start: 0, count: 2, cards: [4, 6] });
    const fight = legalMoves(game).find(move => move.type === 'fight' && move.count === 2 && move.loner === 0)!;
    const recruited = applyMove(game, fight);
    expect(recruited.hands[0]).toEqual(['guard']);
    expect(recruited.street).toEqual({ cards: [4, 5, 6], owner: 0, volatile: true });
    const steal = legalMoves(recruited).find(move => move.type === 'steal')!;
    const stolen = applyMove(recruited, steal);
    expect(stolen.street).toEqual({ cards: [3, 4, 5, 6], owner: 1, volatile: false });
    expect(game.hands[0]).toEqual([4, 6, 'guard']);
    expect(legalMoves(table({ hands: [[4, 'guard', 6], [3, 2]] }))
      .some(move => move.type === 'fight' && move.count > 1)).toBe(false);
  });

  it('keeps the crew after security, reverses strength, and restores it on the next guard', () => {
    const game = table({ hands: [[4, 'guard'], [3, 'guard']], street: { cards: [5], owner: 1, volatile: false } });
    const reversed = applyMove(game, { type: 'guard', index: 1 });
    expect(reversed.street).toEqual(game.street);
    expect(reversed.turn).toBe(1);
    expect(legalMoves(reversed)).toContainEqual({ type: 'fight', start: 0, count: 1, cards: [3] });
    const restored = applyMove(reversed, { type: 'guard', index: 1 });
    expect(legalMoves(restored).some(move => move.type === 'fight' && move.loner === undefined)).toBe(false);
    const cleared = applyMove(restored, { type: 'retreat', loner: 0, slot: 1 });
    expect(cleared.hands[0]).toEqual([4, 5]);
    expect(cleared.street).toBeNull();
    expect(cleared.guards).toBe(0);
    expect(legalMoves({ ...game, hands: [['guard'], [3]] }).some(move => move.type === 'guard')).toBe(false);
  });

  it('requires picking up the remaining circle in order before a player can go out', () => {
    const game = table({ hands: [[4], [3]], circle: [5, 1, 2] });
    const empty = applyMove(game, { type: 'fight', start: 0, count: 1, cards: [4] });
    expect(empty.pickup).toBe(0);
    expect(empty.winner).toBeNull();
    const refill = applyMove(empty, { type: 'pickup', start: 1 });
    expect(refill.hands[0]).toEqual([1, 2, 5]);
    expect(refill.turn).toBe(1);
    expect(refill.circle).toEqual([]);
    expect(legalMoves({ ...empty, layered: true })).toEqual([{ type: 'pickup', start: 2 }]);
    const win = applyMove({ ...game, scores: [1, 0], circle: [] }, { type: 'fight', start: 0, count: 1, cards: [4] });
    expect(win.winner).toBe(0);
    expect(win.scores).toEqual([2, 0]);
  });

  it('finishes seeded bot matches in standard and layered modes', () => {
    for (const layered of [false, true]) {
      for (let seed = 1; seed <= 20; seed++) {
        let n = seed;
        const rng = () => (n = (Math.imul(1664525, n) + 1013904223) >>> 0) / 2 ** 32;
        let game = deal(layered, rng);
        for (let i = 0; i < 300 && Math.max(...game.scores) < 2; i++) {
          game = game.winner === null ? applyMove(game, botMove(game)) : deal(layered, rng, game);
        }
        expect(Math.max(...game.scores)).toBe(2);
      }
    }
  });
});
