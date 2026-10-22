/** mulberry32 over the run's own state, so a run replays from its seed. */
export function random(source: { rng: number }): number {
  source.rng = (source.rng + 0x6d2b79f5) | 0;
  let t = source.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomBetween(source: { rng: number }, min: number, max: number): number {
  return min + random(source) * (max - min);
}

/** Fisher–Yates in place. */
export function shuffle<T>(source: { rng: number }, items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random(source) * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}
