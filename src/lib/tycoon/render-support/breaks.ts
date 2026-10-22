import type { Pose } from './poses'
import { hash } from './activity'

/**
 * Breaks, for a host that has them (the Focus office): while one lasts, people get up from their desks and go and
 * do something else, one outing after another, each walking there along the free floor (see `walkout.ts`), doing it
 * and walking back. Which outing, when, and for how long all come from the person's id, the number of the break and
 * the round alone, so the same break always plays out the same way.
 */

export type Errand = 'coffee' | 'water' | 'sofa' | 'book' | 'snack'

export const ERRANDS: readonly Errand[] = ['coffee', 'water', 'sofa', 'book', 'snack']

/** A place in the room to do an errand: where one person stands (the middle of their feet) and which way they face. */
export interface Spot {
  errand: Errand
  x: number
  /** The row of their feet. Sitting down, the sofa's seats are higher up than the floor in front. */
  feet: number
  rightwards: boolean
}

/** The row of the floor in front of the wall, where the wall's furniture stands; and the row of a person's feet sitting on the sofa. */
const FLOOR_FEET = 121
const SOFA_FEET = 118

/**
 * Where each errand is done, in scene coordinates (the room's art is 256 wide, whatever the screen shows). Everything
 * but the bookshelf is something the pack drew; there are two coolers and two places to buy a snack.
 */
export const SPOTS: readonly Spot[] = [
  { errand: 'snack', x: 17, feet: FLOOR_FEET, rightwards: false }, // the vending machine
  { errand: 'snack', x: 239, feet: FLOOR_FEET, rightwards: true }, // the snack cabinet
  { errand: 'water', x: 34, feet: FLOOR_FEET, rightwards: false }, // the cooler by the vending machine
  { errand: 'water', x: 224, feet: FLOOR_FEET, rightwards: true }, // the cooler by the cabinet
  { errand: 'coffee', x: 61, feet: FLOOR_FEET, rightwards: false },
  { errand: 'book', x: 172, feet: FLOOR_FEET, rightwards: true },
  { errand: 'sofa', x: 195, feet: SOFA_FEET, rightwards: true }, // the sofa's left seat
  { errand: 'sofa', x: 210, feet: SOFA_FEET, rightwards: false }, // and its right one, facing the other
]

/** Two people cannot stand closer than this (their middles, in sprite pixels) at once. */
export const SPOT_CLEARANCE = 14

/** Is the spot free, given the spots people are at or on their way to? */
export function spotFree(spot: Pick<Spot, 'x'>, taken: readonly Pick<Spot, 'x'>[]): boolean {
  return taken.every((other) => Math.abs(other.x - spot.x) >= SPOT_CLEARANCE)
}

/** One stretch of an errand: what they do, and for how long (shortest, longest); `undefined` is plain standing. */
export interface Step {
  pose: Pose | undefined
  ms: readonly [number, number]
}

/** What each errand is, in order: a moment at the thing, then the drink, the snack or the book itself. */
export const STEPS: Readonly<Record<Errand, readonly Step[]>> = {
  coffee: [
    { pose: undefined, ms: [2400, 3600] },
    { pose: 'drink', ms: [7000, 12_000] },
  ],
  water: [
    { pose: undefined, ms: [1200, 2000] },
    { pose: 'drink', ms: [4000, 7000] },
  ],
  snack: [
    { pose: undefined, ms: [2200, 3200] },
    { pose: 'eat', ms: [6000, 10_000] },
  ],
  book: [
    { pose: undefined, ms: [1500, 2500] },
    { pose: 'read', ms: [15_000, 32_000] },
  ],
  sofa: [{ pose: 'sit', ms: [14_000, 38_000] }],
}

/** A hand with something in it stays at the mouth this long, then drops it for the second time it takes to bite or sip. */
export const RAISED_MS = 2200
export const LOWERED_MS = 1200

/** How long after a break starts someone first gets up, and how long they sit at their desk between outings. */
export const FIRST_OUT_MS: readonly [number, number] = [1000, 22_000]
export const BETWEEN_MS: readonly [number, number] = [6000, 34_000]

const within = (h: number, [shortest, longest]: readonly [number, number]): number => shortest + (h % (longest - shortest + 1))

/** When person `id` heads out on round `round` of break `breakNo` (the first round is 0), given when they last sat down or the break began. */
export function nextOutAt(id: number, breakNo: number, round: number, after: number): number {
  return after + within(hash(id ^ 0x5bd1e995, breakNo * 64 + round) >>> 4, round === 0 ? FIRST_OUT_MS : BETWEEN_MS)
}

/**
 * The errand for this outing among `available` (the ones with a spot to go to): seeded, and not the one they did
 * last time if there is anything else, so nobody drinks coffee all break.
 */
export function chooseErrand(id: number, breakNo: number, round: number, available: readonly Errand[], last?: Errand): Errand | undefined {
  const others = available.filter((errand) => errand !== last)
  const from = others.length > 0 ? others : available
  if (from.length === 0) return undefined
  return from[(hash(id ^ 0x1b873593, breakNo * 64 + round) >>> 4) % from.length]
}

/** The spot among `free` ones for an errand, seeded. */
export function chooseSpot<T extends Spot>(id: number, breakNo: number, round: number, free: readonly T[]): T | undefined {
  return free.length === 0 ? undefined : free[(hash(id ^ 0x2545f491, breakNo * 64 + round) >>> 4) % free.length]
}

export interface Stay {
  steps: readonly { pose: Pose | undefined; ms: number }[]
  /** How long the whole errand lasts at the spot. */
  total: number
}

/** How long each stretch of an errand takes this time, for this person. */
export function stayFor(id: number, breakNo: number, round: number, errand: Errand): Stay {
  const steps = STEPS[errand].map((step, i) => ({ pose: step.pose, ms: within(hash(id ^ (0x68e31da4 + i), breakNo * 64 + round) >>> 4, step.ms) }))
  return { steps, total: steps.reduce((sum, step) => sum + step.ms, 0) }
}

/** What they are doing `into` milliseconds into the errand: a drink or a snack goes up and comes down again. */
export function poseAtSpot(stay: Stay, into: number): Pose | undefined {
  let left = Math.max(0, into)
  for (const [i, step] of stay.steps.entries()) {
    if (left < step.ms || i === stay.steps.length - 1) {
      if (step.pose !== 'drink' && step.pose !== 'eat') return step.pose
      return left % (RAISED_MS + LOWERED_MS) < RAISED_MS ? step.pose : undefined
    }
    left -= step.ms
  }
  return undefined
}
