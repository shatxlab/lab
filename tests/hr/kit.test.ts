import { describe, expect, it } from "vitest";

import { itemEffect, itemStat, kitStats, mergeKit, normalizeKit, scrapValue, type ItemState } from "@/lib/hr/kit";

const item: ItemState = { id: "goldenBadge", level: 1, floor: 8 };

describe("the desk kit", () => {
  it("grants its stat points, deeper floors' items worth more when scrapped", () => {
    expect(itemStat(item)).toEqual({ luck: 3 });
    expect(scrapValue(item)).toBe(190);
    expect(itemStat({ ...item, level: 3 })).toEqual({ luck: 5 });
    // The unique effect scales with the level for the items that have one.
    expect(itemEffect(item)).toBe(1);
    expect(itemEffect({ id: "redPen", level: 2, floor: 13 })).toBeCloseTo(1.75);
  });

  it("sums the kit's stats", () => {
    const kit: ItemState[] = [
      { id: "goldenBadge", level: 1, floor: 8 },
      { id: "shredderGuard", level: 2, floor: 4 },
    ];
    expect(kitStats(kit)).toEqual({ luck: 3, grit: 3 });
  });

  it("folds the day's finds in, levels up on a won day, and scraps the oldest when the desk is full", () => {
    const kit: ItemState[] = [
      { id: "shredderGuard", level: 1, floor: 4 },
      { id: "goldenBadge", level: 1, floor: 8 },
    ];
    const won = mergeKit(kit, [{ id: "redPen", level: 1, floor: 13 }], true);
    expect(won.kit).toEqual([
      { id: "shredderGuard", level: 2, floor: 4 },
      { id: "goldenBadge", level: 2, floor: 8 },
      { id: "redPen", level: 1, floor: 13 },
    ]);
    expect(won.gold).toBe(0);
    // A duplicate is spare savings.
    const spare = mergeKit(kit, [{ id: "goldenBadge", level: 1, floor: 8 }], false);
    expect(spare.kit).toEqual(kit);
    expect(spare.gold).toBe(scrapValue(item));
    // A full desk scraps the oldest carried, plus the new one, into savings.
    const full: ItemState[] = [
      { id: "shredderGuard", level: 1, floor: 4 },
      { id: "goldenBadge", level: 1, floor: 8 },
      { id: "cableUntangler", level: 1, floor: 12 },
    ];
    const cramped = mergeKit(full, [{ id: "redPen", level: 1, floor: 13 }], false);
    expect(cramped.kit).toEqual([full[1], full[2], { id: "redPen", level: 1, floor: 13 }]);
    expect(cramped.gold).toBe(scrapValue(full[0]));
  });

  it("normalizes the kit from storage, refusing unknown or broken items", () => {
    expect(normalizeKit([])).toEqual([]);
    expect(normalizeKit([{ id: "redPen", level: 2, floor: 13 }])).toEqual([{ id: "redPen", level: 2, floor: 13 }]);
    expect(normalizeKit([{ id: "stapler", level: 1, floor: 1 }])).toBeNull();
    expect(normalizeKit([{ id: "redPen", level: 9, floor: 13 }])).toBeNull();
    expect(normalizeKit([{ id: "redPen", level: 1 }, { id: "redPen", level: 1, floor: 13 }])).toBeNull();
    expect(normalizeKit("desk")).toBeNull();
  });
});
