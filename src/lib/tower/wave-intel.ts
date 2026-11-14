import type { EnemyKind, Run } from "./sim/types";
import { waveRoster } from "./sim/waves";

/** A stable reading order for rosters: the order enemies unlock, bosses last. */
export const ENEMY_ORDER: EnemyKind[] = ["grunt", "runner", "brute", "bat", "boss"];

/**
 * What the next wave will actually send, read from the same wave definitions the
 * simulation uses. Previewing never consumes RNG or mutates the run.
 */
export function incomingRoster(nextWave: number): [EnemyKind, number][] {
  const roster = waveRoster(nextWave);
  return ENEMY_ORDER.map((kind) => [kind, roster[kind]] as [EnemyKind, number]).filter(([, count]) => count > 0);
}

/** Enemies still to deal with: waiting in the spawn queue plus already on the field. */
export function enemiesLeft(run: Run): number {
  return run.spawns.length + run.enemies.length;
}
