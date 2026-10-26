import { random, shuffle } from "@/lib/tower/sim/random";
import type { MapDef } from "./maps";
import type { EnemyKind, PendingSpawn } from "./types";

export type Roster = Record<EnemyKind, number>;

/** How many of each enemy a wave sends: runners from wave 2, a bat swarm every third wave, brutes from wave 4, a warlord at the end. */
export function waveRoster(wave: number, map: MapDef): Roster {
  return {
    grunt: 4 + Math.floor(1.6 * wave),
    runner: wave >= 2 ? Math.floor(0.9 * wave) : 0,
    brute: wave >= 4 ? 1 + Math.floor((wave - 4) / 2.5) : 0,
    bat: wave >= 3 && wave % 3 === 0 ? 2 + Math.floor(wave / 2) : 0,
    boss: isBossWave(wave, map) ? 1 : 0,
  };
}

/** The last wave of every map brings the warlord, and so does every tenth on the way. */
export function isBossWave(wave: number, map: MapDef): boolean {
  return wave === map.waves || wave % 10 === 0;
}

/** Seconds between two of a kind leaving the woods: a column of footmen, a swarm of bats. */
const SPACING: Record<EnemyKind, number> = { grunt: 0.75, runner: 0.55, brute: 1.8, bat: 0.45, boss: 0 };
/** Breathing room between one column and the next. */
const COLUMN_GAP = 2;

/**
 * The wave's spawn schedule in time order: each kind marches as its own
 * column, the columns in a shuffled order, each down one road; the warlord
 * comes last.
 */
export function buildSpawns(wave: number, map: MapDef, source: { rng: number }): PendingSpawn[] {
  const roster = waveRoster(wave, map);
  const columns = shuffle(
    source,
    (["grunt", "runner", "brute", "bat"] as const).filter((kind) => roster[kind] > 0),
  );
  const spawns: PendingSpawn[] = [];
  let at = 0;
  for (const kind of columns) {
    const road = Math.floor(random(source) * map.roads.length);
    for (let count = 0; count < roster[kind]; count += 1) {
      spawns.push({ kind, at, road });
      at += SPACING[kind];
    }
    at += COLUMN_GAP;
  }
  for (let count = 0; count < roster.boss; count += 1) {
    spawns.push({ kind: "boss", at, road: Math.floor(random(source) * map.roads.length) });
  }
  return spawns;
}
