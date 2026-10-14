import type { Pose } from './poses'

/**
 * What someone at a desk is doing from moment to moment. Working, they type in long stretches and now and then
 * stop to think, sip their coffee or stretch; not working, they sit still and only now and then do one of those.
 * Each person keeps their own rhythm, worked out from their id and the time alone, so nobody moves in step with
 * the next desk and the same moment always looks the same.
 */

/** What they are doing: the pose to draw them in (none: sitting still), and whether their keyboard is going. */
export interface Moment {
  pose: Pose | undefined
  typing: boolean
}

/** How long a hand stays up or down on the keyboard. */
export const TAP_MS = 150

/** Someone's time is cut into periods like this; a period is spent typing (or sitting) and may end in a break. */
export const PERIOD_MS = 12_000

type Interlude = 'think' | 'sip' | 'stretch'

/** How long each kind of break lasts, shortest and longest. */
export const INTERLUDE_MS: Readonly<Record<Interlude, readonly [number, number]>> = {
  think: [2000, 3600],
  sip: [1600, 2600],
  stretch: [1300, 2100],
}

/** Of a hundred periods, how many end in a break: working, and sitting about. */
const BREAKS_WORKING = 60
const BREAKS_IDLE = 25

const hash = (a: number, b: number): number => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return h >>> 0
}

/** The break that ends period `period` of person `id`, if there is one. */
function interludeOf(id: number, period: number, working: boolean): { kind: Interlude; ms: number } | undefined {
  const h = hash(id, period)
  if (h % 100 >= (working ? BREAKS_WORKING : BREAKS_IDLE)) return undefined
  const roll = (h >>> 8) % 100
  // Thinking is the usual pause; nobody stretches every time.
  const kind: Interlude = roll < 45 ? 'think' : roll < 80 ? 'sip' : 'stretch'
  const [shortest, longest] = INTERLUDE_MS[kind]
  return { kind, ms: shortest + ((h >>> 16) % (longest - shortest + 1)) }
}

/** About how often someone blinks, and how long their eyes stay shut. */
export const BLINK_EVERY_MS = 4000
export const BLINK_MS = 140

/** Are person `id`'s eyes shut at `timeMs`? Once in every `BLINK_EVERY_MS`, at a different moment each time. */
export function blinkingAt(id: number, timeMs: number): boolean {
  const at = timeMs + (hash(id, -2) % BLINK_EVERY_MS)
  const beat = Math.floor(at / BLINK_EVERY_MS)
  const into = at - beat * BLINK_EVERY_MS
  const shut = hash(id, beat * 2 + 1) % (BLINK_EVERY_MS - BLINK_MS)
  return into >= shut && into < shut + BLINK_MS
}

/** What person `id` is doing at `timeMs`, working (at their keyboard) or not. */
export function momentAt(id: number, timeMs: number, working: boolean): Moment {
  // Everyone's periods start at a different time, so the office never breaks all at once.
  const at = timeMs + (hash(id, -1) % PERIOD_MS)
  const period = Math.floor(at / PERIOD_MS)
  const into = at - period * PERIOD_MS
  const interlude = interludeOf(id, period, working)
  if (interlude && into >= PERIOD_MS - interlude.ms) return { pose: interlude.kind, typing: false }
  if (!working) return { pose: undefined, typing: false }
  // Hands take turns on the keys, out of step with the next desk.
  const tap = Math.floor((at + id * 37) / TAP_MS)
  return { pose: tap % 2 === 0 ? 'typeA' : 'typeB', typing: true }
}
