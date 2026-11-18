/*
 * The desk kit: the loot a coworker carries from day to day. Bosses drop their signature item (Luck rolls the
 * drop), the kit holds three, each grants stat points and sometimes a unique effect, and each levels up with a
 * won day — or scraps into savings when the desk is full.
 */
import type { Stat } from "@/lib/roster/types";

/** The signature drops: one per act's end, the audit's pen, and the two relics of the boardroom act. */
export type ItemId = "shredderGuard" | "goldenBadge" | "cableUntangler" | "redPen" | "guardianWings" | "hermesLoafers";

export interface ItemState {
  id: ItemId;
  /** Grows with a won day carried: 1..3. */
  level: number;
  /** The floor it dropped on, for the scrap value and the card's flavour. */
  floor: number;
}

export interface ItemDef {
  /** The stat points it grants, by its level: `points + (level - 1) * pointStep`. */
  stat: Partial<Record<Stat, number>>;
  /** The unique effect's strength, by its level: 1 + (level - 1) * effectStep. */
  effect: number;
  effectStep: number;
  points: number;
}

/** The catalogue; names and flavour lines live in the game's i18n. */
export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  shredderGuard: { stat: { grit: 2 }, effect: 0.5, effectStep: 0.15, points: 1 },
  goldenBadge: { stat: { luck: 3 }, effect: 1, effectStep: 0, points: 1 },
  cableUntangler: { stat: { hustle: 2 }, effect: 1, effectStep: 0, points: 1 },
  redPen: { stat: { focus: 2 }, effect: 1.5, effectStep: 0.25, points: 1 },
  /** The guardian wings: the hero hovers over the floor's spills, and the stage's blasts hurt less. */
  guardianWings: { stat: { grit: 2 }, effect: 0.4, effectStep: 0.15, points: 1 },
  /** The winged loafers: every step is quicker, and the trail is unmistakable. */
  hermesLoafers: { stat: { hustle: 2 }, effect: 0.08, effectStep: 0.03, points: 1 },
};

/** Which boss drops which item: each act's end, the boardroom's relics, and the audit's pen. */
export const ITEM_DROPS: Readonly<Record<number, ItemId>> = {
  5: "shredderGuard",
  9: "goldenBadge",
  13: "cableUntangler",
  17: "guardianWings",
  18: "hermesLoafers",
  20: "redPen",
};

export const KIT_SIZE = 3;

/** The item's stat points at its level. */
export function itemStat(item: ItemState): Partial<Record<Stat, number>> {
  const def = ITEMS[item.id];
  const points: Partial<Record<Stat, number>> = {};
  for (const [stat, value] of Object.entries(def.stat) as [Stat, number][]) points[stat] = value + (item.level - 1) * def.points;
  return points;
}

/** The item's unique effect at its level (multiplicative; 1 for stat-only items). */
export function itemEffect(item: ItemState): number {
  const def = ITEMS[item.id];
  return def.effect + (item.level - 1) * def.effectStep;
}

/** The kit's whole stat spread, summed. */
export function kitStats(kit: readonly ItemState[]): Partial<Record<Stat, number>> {
  const points: Partial<Record<Stat, number>> = {};
  for (const item of kit) {
    for (const [stat, value] of Object.entries(itemStat(item)) as [Stat, number][]) {
      points[stat] = (points[stat] ?? 0) + value;
    }
  }
  return points;
}

/** What scrapping the item pays: the deeper it was won, the more it is worth. */
export function scrapValue(item: ItemState): number {
  return 30 + 20 * item.floor;
}

/**
 * Fold the day's finds into the kit: new items join, a full desk scraps its oldest find for the value returned.
 * Items carried through a won day level up; a lost day keeps them as they are.
 */
export function mergeKit(kit: readonly ItemState[], found: readonly ItemState[], won: boolean, swapOut?: ItemId): { kit: ItemState[]; scrapped: ItemState[]; gold: number } {
  const kept: ItemState[] = kit.map((item) => (won ? { ...item, level: Math.min(3, item.level + 1) } : { ...item }));
  const scrapped: ItemState[] = [];
  let gold = 0;
  // The player's mid-run swap choice: that carried item makes way first, before any automatic oldest.
  const chosen = swapOut ? kept.findIndex((item) => item.id === swapOut) : -1;
  if (chosen >= 0) {
    const [out] = kept.splice(chosen, 1);
    gold += scrapValue(out);
    scrapped.push(out);
  }
  for (const item of found) {
    if (kept.some((carried) => carried.id === item.id)) {
      // Already on the desk: the spare goes straight to savings.
      gold += scrapValue(item);
      scrapped.push(item);
      continue;
    }
    if (kept.length < KIT_SIZE) {
      kept.push(item);
      continue;
    }
    // The desk is full: the new item takes the oldest's place, and the oldest pays its scrap into savings.
    const oldest = kept.shift()!;
    kept.push(item);
    gold += scrapValue(oldest);
    scrapped.push(oldest);
  }
  return { kit: kept, scrapped, gold };
}

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** A kit from storage, or null: unknown items, bad levels or too many are not a kit. */
export function normalizeKit(raw: unknown): ItemState[] | null {
  if (!Array.isArray(raw) || raw.length > KIT_SIZE) return null;
  const kit: ItemState[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Partial<ItemState>;
    if (!ITEM_IDS.includes(item.id as ItemId)) return null;
    if (typeof item.level !== "number" || !Number.isFinite(item.level) || item.level < 1 || item.level > 3) return null;
    if (typeof item.floor !== "number" || !Number.isFinite(item.floor) || item.floor < 1) return null;
    kit.push({ id: item.id as ItemId, level: item.level, floor: item.floor });
  }
  return kit;
}
