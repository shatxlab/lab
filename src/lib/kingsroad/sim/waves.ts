import { random, shuffle } from "@/lib/tower/sim/random";
import type { MapDef } from "./maps";
import type { FoeKind, NewFoeKind, PendingSpawn } from "./types";

export type Roster = Record<FoeKind, number>;

/**
 * How many of each enemy a wave sends: runners from wave 2, a bat swarm every third wave, brutes from wave 4, a warlord
 * at the end. A map that lists new foes adds scamp swarms on even waves from 2, knights from 5, imps on odd waves from 7,
 * healers from 7 and gargoyles every fourth wave from 8.
 */
export function waveRoster(wave: number, map: MapDef): Roster {
  const sends = (kind: NewFoeKind, count: number) => (map.foes.includes(kind) ? Math.max(0, count) : 0);
  return {
    scamp: sends("scamp", wave >= 2 && wave % 2 === 0 ? 6 + wave : 0),
    knight: sends("knight", wave >= 5 ? 1 + Math.floor((wave - 5) / 3) : 0),
    imp: sends("imp", wave >= 7 && wave % 2 === 1 ? 3 + Math.floor((wave - 7) / 3) : 0),
    healer: sends("healer", wave >= 7 ? 1 + Math.floor((wave - 7) / 5) : 0),
    gargoyle: sends("gargoyle", wave >= 8 && wave % 4 === 0 ? 1 + Math.floor((wave - 8) / 6) : 0),
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
const SPACING: Record<FoeKind, number> = {
  grunt: 0.75,
  runner: 0.55,
  brute: 1.8,
  bat: 0.45,
  boss: 0,
  knight: 1.2,
  imp: 0.8,
  healer: 0,
  scamp: 0.2,
  gargoyle: 1.2,
};
/** Breathing room between one column and the next. */
const COLUMN_GAP = 2;

/**
 * The wave's spawn schedule in time order: each kind marches as its own
 * column, the columns in a shuffled order, each down one road; the warlord
 * comes last. Healers do not march as a column: each is slipped in among the
 * grunts so it walks with them and has someone to mend.
 */
export function buildSpawns(wave: number, map: MapDef, source: { rng: number }): PendingSpawn[] {
  const roster = waveRoster(wave, map);
  const columns = shuffle(
    source,
    (["grunt", "runner", "brute", "bat", "knight", "imp", "scamp", "gargoyle"] as const).filter((kind) => roster[kind] > 0),
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
  const footmen = spawns.filter((spawn) => spawn.kind === "grunt");
  for (let count = 0; count < roster.healer && footmen.length > 0; count += 1) {
    const escort = footmen[Math.floor((footmen.length * (count + 1)) / (roster.healer + 1))];
    spawns.push({ kind: "healer", at: escort.at + 0.35, road: escort.road });
  }
  spawns.sort((a, b) => a.at - b.at);
  for (let count = 0; count < roster.boss; count += 1) {
    spawns.push({ kind: "boss", at, road: Math.floor(random(source) * map.roads.length) });
  }
  return spawns;
}
