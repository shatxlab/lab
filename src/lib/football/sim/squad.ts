import { random } from "@/lib/tower/sim/random";
import { SLOTS } from "./balance";
import type { Footballer, Role, Side, StatKey, Stats, Tactics } from "./types";

const FIRST = [
  "Tom", "Ivan", "Leo", "Max", "Dan", "Pete", "Karl", "Sasha", "Ben", "Rico", "Hugo", "Otto", "Vik", "Nate", "Jonas", "Misha",
  "Gus", "Lars", "Theo", "Alf", "Boris", "Cole", "Dima", "Eli", "Finn", "Greg", "Ike", "Joel", "Kai", "Lev", "Marco", "Nils",
];
const LAST = [
  "Brook", "Volkov", "Stone", "Hart", "Novak", "Fox", "Reyes", "Kane", "Marsh", "Orlov", "Quinn", "Rowe", "Sokol", "Tate", "Vale", "Wolf",
  "Young", "Zeman", "Bell", "Crane", "Dunn", "Egan", "Frost", "Grady", "Holt", "Ito", "Joyce", "Keen", "Lund", "Moss", "Nash", "Pike",
];

/** What each role is good and bad at, added to the squad's strength. */
const BIAS: Record<Role, Partial<Record<StatKey, number>>> = {
  GK: { keeping: 3, pace: -2, shooting: -3, dribbling: -2 },
  DF: { tackling: 2, shooting: -2, dribbling: -1 },
  MF: { passing: 2, stamina: 1, tackling: 0 },
  FW: { shooting: 2, pace: 1, dribbling: 1, tackling: -2, keeping: -3 },
};
const STAT_KEYS: readonly StatKey[] = ["pace", "shooting", "passing", "tackling", "dribbling", "keeping", "stamina"];

export const DEFAULT_TACTICS: Tactics = { press: 0.5, risk: 0.5 };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** An ordinary man of the given role at the given strength (about 1 to 10): a role's strengths sit above it, its weaknesses below. */
export function makeStats(source: { rng: number }, role: Role, strength: number): Stats {
  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    const noise = (random(source) + random(source) - 1) * 3;
    stats[key] = clamp(Math.round(strength + (BIAS[role][key] ?? 0) + noise), 1, 10);
  }
  return stats;
}

/** A squad of eight for the 1-2-3-2, drawn from the seed. Ids are `firstId` upwards so a league can keep them apart. */
export function makeSide(seed: number, name: string, kit: number, strength: number, firstId = 0): Side {
  const source = { rng: seed };
  const used = new Set<string>();
  const players: Footballer[] = SLOTS.map((slot, index) => {
    let label: string;
    do {
      label = `${FIRST[Math.floor(random(source) * FIRST.length)]} ${LAST[Math.floor(random(source) * LAST.length)]}`;
    } while (used.has(label));
    used.add(label);
    return { id: firstId + index, name: label, role: slot.role, stats: makeStats(source, slot.role, strength) };
  });
  return { name, kit, players, tactics: { ...DEFAULT_TACTICS } };
}

/** The average of a side's stats the ratings are built from; handy for showing "strength" and for balancing. */
export function strengthOf(side: Side): number {
  let sum = 0;
  for (const player of side.players) for (const key of STAT_KEYS) sum += player.stats[key];
  return sum / (side.players.length * STAT_KEYS.length);
}
