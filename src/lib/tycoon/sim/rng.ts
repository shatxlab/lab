export interface RngHolder {
  rng: number
}

/** mulberry32: advances `holder.rng` and returns a float in [0, 1). */
export function rand(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0
  let t = holder.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randRange(holder: RngHolder, min: number, max: number): number {
  return min + (max - min) * rand(holder)
}

/** Integer in [min, max], inclusive. */
export function randInt(holder: RngHolder, min: number, max: number): number {
  return Math.floor(randRange(holder, min, max + 1))
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  return items[Math.floor(rand(holder) * items.length)]
}
