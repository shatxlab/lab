import { describe, expect, it } from 'vitest';
import { act, bestBonus, bonusCount, botTarget, makeDeck, newGame, score, triple, type Card, type Game } from '@/lib/potions/game';

const card = (id: number, value: number, down = false): Card => ({ id, value, down, kind: 'ingredient' });
function fixture(table: Card[], held: Card[] = []): Game {
  const g = newGame(2);
  g.table = table; g.players.forEach(p => { p.deck = []; p.bank = []; }); g.players[0]!.held = held;
  return g;
}
function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
function conservation(g: Game) {
  const all = [...g.table, ...g.players.flatMap(p => [...p.deck, ...p.bank, ...p.held])];
  expect(all).toHaveLength(g.total); expect(new Set(all.map(c => c.id)).size).toBe(g.total);
}

describe('Potion panic rules', () => {
  it('builds the exact deck and removes ladles for two players', () => {
    const deck = makeDeck(3);
    expect(deck).toHaveLength(112);
    for (let value = 1; value <= 9; value++) expect(deck.filter(c => c.value === value)).toHaveLength(12);
    expect(makeDeck(2)).toHaveLength(110);
    expect(makeDeck(2).some(c => c.kind === 'ladle')).toBe(false);
    expect(newGame(1, true).total).toBe(38);
    expect(newGame(6, true).total).toBe(40);
  });
  it('deals evenly and deterministically with an injected RNG', () => {
    const g = newGame(6, false, rng(3));
    expect(g.players.map(p => p.deck.length)).toEqual([16, 16, 16, 16, 16, 16, 16]);
    expect(g).toEqual(newGame(6, false, rng(3))); conservation(g);
  });
  it('ignores face-down cards and specials when finding a triple', () => {
    expect(triple([card(0, 2), card(1, 2), card(2, 2, true)])).toBeNull();
    expect(triple([card(0, 2), card(1, 2), card(2, 2)])).toBe(2);
    expect(triple([{ id: 0, value: 0, kind: 'recipe', down: false }])).toBeNull();
  });
  it('implements the rulebook example: face-down + 2,2,9,9 banks all five with one bonus', () => {
    const cards = [card(0, 5, true), card(1, 2), card(2, 2), card(3, 9), card(4, 9)];
    expect(score(cards, 2, 1).result).toEqual({ banked: 5, returned: 0, sum: 20, bonus: 1 });
    expect(score(cards, 2, 2).result).toEqual({ banked: 3, returned: 2, sum: 18, bonus: 2 });
    expect(bestBonus(cards, 2)).toBe(1);
  });
  it('does not cherry-pick a ten from 2,8,1; banks only the triggering 2', () => {
    const s = score([card(0, 2), card(1, 8), card(2, 1)], 2, 1);
    expect(s.result).toEqual({ banked: 1, returned: 2, sum: 9, bonus: 1 });
    expect(s.returned.map(c => c.value)).toEqual([8, 1]);
    expect(score([card(0, 2), card(1, 8), card(2, 1)], 2, 0).bank).toHaveLength(0);
  });
  it('clamps bonuses and never counts face-down values in the sum', () => {
    const held = [card(0, 8, true), card(1, 2), card(2, 8)];
    expect(bonusCount(held, 8)).toBe(1);
    expect(score(held, null, 100).bank).toHaveLength(3);
    expect(score(held, 2, -9).bank).toHaveLength(3);
    expect(score([], null, 0).result.banked).toBe(0);
  });
  it('rejects stale actions without mutation', () => {
    const g = newGame(); const before = JSON.stringify(g);
    expect(act(g, { type: 'reveal', player: 1 })).toBe(g);
    expect(act(g, { type: 'take', player: 0, id: 0 })).toBe(g);
    expect(act(g, { type: 'settle', bonus: 0 })).toBe(g);
    expect(act(g, { type: 'reveal', player: 99 })).toBe(g);
    const next = act(g, { type: 'reveal', player: 0 });
    expect(next).not.toBe(g); expect(JSON.stringify(g)).toBe(before);
    conservation(next);
  });
  it('penalizes false calls with one face-down bank card, including when bank is empty', () => {
    let g = fixture([card(0, 2)]); g.players[0]!.bank = [card(1, 8)];
    g = act(g, { type: 'call', player: 0 });
    expect(g.phase).toBe('reveal'); expect(g.event).toBe('penalty');
    expect(g.table[1]).toEqual(card(1, 8, true)); expect(g.players[0]!.bank).toHaveLength(0);
    expect(act(g, { type: 'call', player: 0 }).table).toHaveLength(2);
  });
  it('handles recipe pairs, mirrored controls, reverse order and locked specials', () => {
    let g = fixture([]);
    g.players[0]!.deck = [{ id: 1, value: 0, kind: 'recipe', down: false }, { id: 2, value: 0, kind: 'recipe', down: false }, card(9, 1)];
    g = act(g, { type: 'reveal', player: 0 }); expect(g.mirrored).toBe(true); expect(g.table[0]!.down).toBe(false);
    g = act(g, { type: 'reveal', player: 0 }); expect(g.mirrored).toBe(false); expect(g.table.every(c => c.down)).toBe(true);
    g = fixture([]); g.players.forEach((p, i) => { p.deck = [i === 0 ? { id: 0, kind: 'ladle', value: 0, down: false } : card(i, 1)]; });
    g = act(g, { type: 'reveal', player: 0 }); expect(g.direction).toBe(-1); expect(g.turn).toBe(2);
    g.phase = 'brew'; expect(act(g, { type: 'take', player: 0, id: 0 })).toBe(g);
  });
  it('captures table positions and prevents double claims and grabbing after passing', () => {
    let g = fixture([card(0, 2), card(1, 2), card(2, 2), card(3, 8)]);
    g = act(g, { type: 'call', player: 0 }); expect(g.phase).toBe('brew'); expect(g.slots).toEqual([0, 1, 2, 3]);
    g = act(g, { type: 'take', player: 0, id: 3 });
    expect(act(g, { type: 'take', player: 1, id: 3 })).toBe(g);
    g = act(g, { type: 'done', player: 0 }); expect(act(g, { type: 'take', player: 0, id: 0 })).toBe(g);
    g = act(act(g, { type: 'done', player: 1 }), { type: 'done', player: 2 }); expect(g.phase).toBe('settle');
    g = act(g, { type: 'settle', bonus: 0 }); expect(g.phase).toBe('results'); expect(g.table.some(c => c.id === 3)).toBe(true);
    g.players[1]!.deck = [card(10, 1)]; g.players[2]!.deck = [card(11, 1)];
    g = act(g, { type: 'next' }); expect(g.first).toBe(1); expect(g.turn).toBe(1); expect(g.round).toBe(2);
  });
  it('does the final brew without a triple and finishes only after settlement', () => {
    let g = fixture([]); g.players[0]!.deck = [card(1, 5)];
    g = act(g, { type: 'reveal', player: 0 }); expect(g.phase).toBe('brew'); expect(g.final).toBe(true); expect(g.trigger).toBeNull();
    for (let i = 0; i < g.players.length; i++) g = act(g, { type: 'done', player: i });
    expect(g.phase).toBe('settle'); g = act(g, { type: 'settle', bonus: 0 }); expect(g.phase).toBe('finished');
  });
  it('bots complete a held sum using only public cards, not hidden decks', () => {
    let g = fixture([card(0, 8), card(1, 1)], [card(2, 2)]); g.phase = 'brew'; g.trigger = 3;
    expect(botTarget(g, 0)).toBe(0);
    g = act(g, { type: 'take', player: 0, id: 0 }); expect(botTarget(g, 0)).toBeNull();
    g = fixture([card(0, 2), card(1, 8), card(2, 4)]); g.phase = 'brew';
    const first = botTarget(g, 0); expect([0, 1]).toContain(first);
    g.players[1]!.deck = [card(999, 2)]; expect(botTarget(g, 0)).toBe(first);
  });
  it('completes seeded full and quick games with 1–6 bots and conserves every card', () => {
    for (let bots = 1; bots <= 6; bots++) for (let seed = 1; seed <= 8; seed++) {
      let g = newGame(bots, seed % 2 === 0, rng(seed)); let steps = 0;
      while (g.phase !== 'finished' && steps++ < 4000) {
        if (g.phase === 'reveal') g = act(g, triple(g.table) === null ? { type: 'reveal', player: g.turn } : { type: 'call', player: seed % g.players.length });
        else if (g.phase === 'brew') {
          for (let i = 0; i < g.players.length; i++) {
            const id = botTarget(g, i); g = act(g, id === null ? { type: 'done', player: i } : { type: 'take', player: i, id });
          }
        } else if (g.phase === 'settle') g = act(g, { type: 'settle', bonus: bestBonus(g.players[0]!.held, g.trigger) });
        else g = act(g, { type: 'next' });
        conservation(g);
      }
      expect(g.phase, `bots=${bots}, seed=${seed}`).toBe('finished'); expect(steps).toBeLessThan(4000);
    }
  });
});
