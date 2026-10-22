import { ARENA, BOSS_EVERY } from "./balance";
import { random, randomBetween, shuffle } from "./random";
import type { EnemyKind, PendingSpawn } from "./types";

export type Roster = Record<EnemyKind, number>;

/** How many of each enemy a wave sends. Bats join at wave 4, a boss every fifth wave. */
export function waveRoster(wave: number): Roster {
  return {
    grunt: 3 + Math.floor(1.5 * wave),
    runner: wave >= 2 ? Math.floor(wave * 0.6) : 0,
    brute: wave >= 3 ? Math.floor((wave - 1) / 3) : 0,
    bat: wave >= 4 ? Math.floor((wave - 2) / 2) : 0,
    boss: wave % BOSS_EVERY === 0 ? 1 : 0,
  };
}

/** Seconds over which a wave's enemies trickle in. */
export function waveDuration(wave: number): number {
  return 6 + 1.1 * wave;
}

export function isBossWave(wave: number): boolean {
  return wave % BOSS_EVERY === 0;
}

/** The wave's spawn schedule in time order: shuffled, evenly spread with a little jitter, the boss halfway. */
export function buildSpawns(wave: number, source: { rng: number }): PendingSpawn[] {
  const roster = waveRoster(wave);
  const kinds: EnemyKind[] = [];
  for (const kind of ["grunt", "runner", "brute", "bat"] as const) {
    for (let count = 0; count < roster[kind]; count += 1) kinds.push(kind);
  }
  shuffle(source, kinds);
  const duration = waveDuration(wave);
  const gap = duration / Math.max(1, kinds.length);
  const spawns: PendingSpawn[] = kinds.map((kind, index) => ({
    kind,
    at: Math.max(0, index * gap + randomBetween(source, -0.3, 0.3) * gap),
  }));
  for (let count = 0; count < roster.boss; count += 1) spawns.push({ kind: "boss", at: duration / 2 });
  return spawns.sort((a, b) => a.at - b.at);
}

/** A random point on the arena's edge, with each side as likely as its length. */
export function edgePoint(source: { rng: number }): { x: number; y: number } {
  const { width, height } = ARENA;
  let along = random(source) * 2 * (width + height);
  if (along < width) return { x: along, y: 0 };
  along -= width;
  if (along < height) return { x: width, y: along };
  along -= height;
  if (along < width) return { x: width - along, y: height };
  along -= width;
  return { x: 0, y: height - along };
}
