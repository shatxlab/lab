import { describe, expect, it } from "vitest";
import { isAnswer, matchResults, skippedRound, withPick } from "@/lib/couples/session";
import type { CouplesQuestion } from "@/lib/couples/types";

const cards: CouplesQuestion[] = Array.from({ length: 4 }, (_, i) => ({
  id: `card-${i}`, game: "norm", theme: "home", prompt: `Prompt ${i}`,
  options: ["Yes", "No"], group: `g${i}`,
}));

describe("Couples consent and private answers", () => {
  it("scores only mutually answered cards, not declines by either partner", () => {
    expect(matchResults(cards, [0, 1, null, 1], [0, 0, 1, null])).toEqual([
      { question: cards[0], picks: [0, 0], match: true },
      { question: cards[1], picks: [1, 0], match: false },
      skippedRound(cards[2]), skippedRound(cards[3]),
    ]);
  });

  it.each([0, 1])("discards withheld answer %i when the other partner declines", (first) => {
    const [result] = matchResults([cards[0]], [first], [null]);
    expect(result).toEqual({ question: cards[0], skipped: true, picks: [], match: false });
    expect(Object.keys(result).sort()).toEqual(["match", "picks", "question", "skipped"]);
  });

  it("never fabricates option zero for absent or invalid answers", () => {
    expect(matchResults(cards, [0, 9, 1], [])).toEqual(cards.map(skippedRound));
    expect(matchResults(cards, [], [1, 0, 1, 0])).toEqual(cards.map(skippedRound));
    expect([undefined, null, -1, 2, NaN].some(isAnswer)).toBe(false);
    expect([0, 1].every(isAnswer)).toBe(true);
  });

  it("clears a single withheld answer without losing later answers or mutating the original", () => {
    const before = [0, 1, 0, 1];
    const after = withPick(before, 1, null);
    expect(after).toEqual([0, null, 0, 1]);
    expect(before).toEqual([0, 1, 0, 1]);
    expect(matchResults(cards, after, [0, null, 1, 1]).map((r) => r.picks)).toEqual([[0, 0], [], [0, 1], [1, 1]]);
  });

  it("returns only anonymous empty results for an all-skipped session", () => {
    expect(matchResults(cards, [null, null, null, null], [])).toEqual(cards.map(skippedRound));
  });
});
