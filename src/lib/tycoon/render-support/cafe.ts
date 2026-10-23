import { hash } from './activity'
import { STEP_CYCLE, type Pose } from './poses'
import { pathLength, pointAlong, type Point } from './walkout'

/**
 * The café the two founders start in, as it is seen: a barista behind the counter, and now and then someone who
 * comes in, queues, orders, waits for their cup and goes, or sits down with it at the table by the window for a
 * while. Everything is worked out from the time the café has been open alone, a guest's choices from their number,
 * so it plays the same way every time. Positions are the middle of a person's feet, in scene pixels.
 */

/** The door (its middle, and the row a person's feet are on in its frame), and the lane people walk along. */
export const CAFE_DOOR_X = 40
export const CAFE_DOOR_FEET = 113
export const CAFE_LANE = 124
/** People on their way out keep to a lane nearer the front, so they pass those coming in rather than walk through them. */
export const CAFE_EXIT_LANE = 131
/** The counter: its left end, and the top of its surface; the barista stands behind it, at the till or the machine. */
export const COUNTER_LEFT = 170
export const COUNTER_TOP = 100
export const BARISTA_FEET = 106
export const TILL_X = 194
export const MACHINE_X = 216
/** Places in the queue, the first at the counter. */
export const QUEUE_X = [160, 146, 132] as const
/**
 * The two café tables a guest can sit at with their cup: by the window, facing right, and over by the counter,
 * facing left. `aisle` is the column they walk down from the lane to get there, clear of the founders' desks.
 */
export interface Seat {
  x: number
  feet: number
  rightwards: boolean
  aisle: number
}
export const SEATS: readonly Seat[] = [
  { x: 48, feet: 152, rightwards: true, aisle: 48 },
  { x: 214, feet: 158, rightwards: false, aisle: 166 },
]

/** How fast people walk, in scene pixels a second, and how far they go on each frame of their stride. */
const WALK_SPEED = 30
const STRIDE = 4
const FADE = 400
/** Between one guest and the next, shortest and longest; never more than this many inside at once. */
const ARRIVAL_MS: readonly [number, number] = [7000, 16000]
const MAX_GUESTS = 4
/** At the counter: ordering, the barista making the coffee, and handing it over. */
const ORDER_MS = 1600
const BREW_MS = 3200
const HAND_MS = 1200
/** Of a hundred guests, how many sit down with their cup, and how long they stay. */
const SITTERS = 30
const SIT_MS: readonly [number, number] = [14000, 26000]

/** Look ids for the café's people, far from any employee's, so they get looks of their own. */
export const BARISTA_LOOK = 7_000_001
const GUEST_LOOK = 7_100_000

/** Someone in the café as drawn: who they look like, where their feet are, which way they face, in what pose, how faded. */
export interface CafeFigure {
  look: number
  x: number
  feet: number
  rightwards: boolean
  /** None: standing still. */
  pose: Pose | undefined
  alpha: number
}

type GuestPhase = 'walk' | 'queue' | 'order' | 'wait' | 'served' | 'sit' | 'leave'

interface Guest {
  n: number
  phase: GuestPhase
  /** The way they are walking now, the distance gone, and what they do when they get there. */
  path: Point[]
  walked: number
  next: GuestPhase
  /** Milliseconds in the phase so far, and in the café. */
  timer: number
  age: number
  sits: boolean
  /** The table they sit at, while they are on their way there or at it. */
  seat: Seat | null
  x: number
  feet: number
  rightwards: boolean
}

type BaristaPhase = 'till' | 'toMachine' | 'brew' | 'toTill' | 'hand'

const between = (n: number, salt: number, [low, high]: readonly [number, number]) => low + (hash(n, salt) % (high - low + 1))

export class CafeCrowd {
  private guests: Guest[] = []
  private count = 0
  private untilNext = 2500
  private baristaPhase: BaristaPhase = 'till'
  private baristaTimer = 0
  private baristaX = TILL_X
  /** The guest being served, while the barista is busy with their cup. */
  private serving: Guest | null = null

  /** Moves the café on by `dtMs` of running time. */
  update(dtMs: number): void {
    this.untilNext -= dtMs
    if (this.untilNext <= 0) {
      this.untilNext = between(this.count, 0xa1, ARRIVAL_MS)
      if (this.guests.length < MAX_GUESTS) this.arrive()
    }
    for (const guest of this.guests) this.advanceGuest(guest, dtMs)
    this.guests = this.guests.filter((g) => !(g.phase === 'leave' && g.walked >= pathLength(g.path)))
    this.advanceBarista(dtMs)
  }

  private arrive(): void {
    const n = this.count++
    const door = { x: CAFE_DOOR_X, y: CAFE_DOOR_FEET }
    const guest: Guest = {
      n,
      phase: 'walk',
      path: [door, { x: CAFE_DOOR_X, y: CAFE_LANE }],
      walked: 0,
      next: 'queue',
      timer: 0,
      age: 0,
      sits: hash(n, 0x5e) % 100 < SITTERS,
      seat: null,
      x: door.x,
      feet: door.y,
      rightwards: true,
    }
    this.guests.push(guest)
  }

  /** Where in the queue a guest is: 0 at the counter; guests further along (ordering, waiting) are ahead of everyone. */
  private placeInQueue(guest: Guest): number {
    return this.guests.filter((g) => g !== guest && g.n < guest.n && (g.phase === 'queue' || g.phase === 'order' || g.phase === 'wait' || g.phase === 'served' || (g.phase === 'walk' && g.next === 'queue'))).length
  }

  private walk(guest: Guest, to: Point[], next: GuestPhase): void {
    guest.phase = 'walk'
    guest.path = [{ x: guest.x, y: guest.feet }, ...to]
    guest.walked = 0
    guest.next = next
  }

  private advanceGuest(guest: Guest, dtMs: number): void {
    guest.age += dtMs
    guest.timer += dtMs
    if (guest.phase === 'walk' || guest.phase === 'leave') {
      // In the doorway they walk in; then on to their place in the queue, as it moves up.
      if (guest.phase === 'walk' && guest.next === 'queue' && guest.walked >= pathLength(guest.path)) {
        const target = QUEUE_X[Math.min(this.placeInQueue(guest), QUEUE_X.length - 1)]!
        if (Math.abs(guest.x - target) < 0.5) {
          guest.phase = 'queue'
          guest.timer = 0
        } else {
          this.walk(guest, [{ x: target, y: CAFE_LANE }], 'queue')
        }
      }
      guest.walked = Math.min(pathLength(guest.path), guest.walked + (dtMs / 1000) * WALK_SPEED)
      const at = pointAlong(guest.path, guest.walked)
      guest.x = at.x
      guest.feet = at.y
      if (at.dx !== 0) guest.rightwards = at.dx > 0
      if (guest.phase === 'walk' && guest.walked >= pathLength(guest.path) && guest.next !== 'queue') {
        guest.phase = guest.next
        guest.timer = 0
      }
      return
    }
    if (guest.phase === 'queue') {
      guest.rightwards = true
      const place = this.placeInQueue(guest)
      const target = QUEUE_X[Math.min(place, QUEUE_X.length - 1)]!
      if (Math.abs(guest.x - target) >= 0.5) this.walk(guest, [{ x: target, y: CAFE_LANE }], 'queue')
      else if (place === 0 && this.serving === null) {
        guest.phase = 'order'
        guest.timer = 0
        this.serving = guest
      }
      return
    }
    if (guest.phase === 'order' && guest.timer >= ORDER_MS) {
      guest.phase = 'wait'
      guest.timer = 0
      this.baristaPhase = 'toMachine'
      this.baristaTimer = 0
    } else if (guest.phase === 'served' && guest.timer >= HAND_MS) {
      this.serving = null
      const taken = this.guests.flatMap((g) => (g.seat ? [g.seat] : []))
      const free = SEATS.filter((seat) => !taken.includes(seat))
      const seat = guest.sits && free.length > 0 ? free[hash(guest.n, 0x5ea7) % free.length]! : null
      if (seat) {
        guest.seat = seat
        this.walk(guest, [{ x: seat.aisle, y: CAFE_LANE }, { x: seat.aisle, y: seat.feet }, { x: seat.x, y: seat.feet }], 'sit')
      } else {
        this.goHome(guest)
      }
    } else if (guest.phase === 'sit' && guest.timer >= between(guest.n, 0x51, SIT_MS)) {
      const seat = guest.seat!
      guest.seat = null
      this.goHome(guest, [{ x: seat.aisle, y: seat.feet }])
    }
  }

  /** Off to the door by the exit lane, by way of `via`, and out of it. */
  private goHome(guest: Guest, via: Point[] = []): void {
    const from = via.at(-1) ?? { x: guest.x, y: guest.feet }
    this.walk(guest, [...via, { x: from.x, y: CAFE_EXIT_LANE }, { x: CAFE_DOOR_X, y: CAFE_EXIT_LANE }, { x: CAFE_DOOR_X, y: CAFE_DOOR_FEET }], 'leave')
    guest.phase = 'leave'
  }

  private advanceBarista(dtMs: number): void {
    this.baristaTimer += dtMs
    const step = (dtMs / 1000) * WALK_SPEED
    if (this.baristaPhase === 'toMachine') {
      this.baristaX = Math.min(MACHINE_X, this.baristaX + step)
      if (this.baristaX >= MACHINE_X) [this.baristaPhase, this.baristaTimer] = ['brew', 0]
    } else if (this.baristaPhase === 'brew' && this.baristaTimer >= BREW_MS) {
      ;[this.baristaPhase, this.baristaTimer] = ['toTill', 0]
    } else if (this.baristaPhase === 'toTill') {
      this.baristaX = Math.max(TILL_X, this.baristaX - step)
      if (this.baristaX <= TILL_X) {
        ;[this.baristaPhase, this.baristaTimer] = ['hand', 0]
        if (this.serving) {
          this.serving.phase = 'served'
          this.serving.timer = 0
        }
      }
    } else if (this.baristaPhase === 'hand' && this.baristaTimer >= HAND_MS) {
      ;[this.baristaPhase, this.baristaTimer] = ['till', 0]
    }
  }

  /** The barista, behind the counter: facing the till and whoever is at it, or the espresso machine. */
  barista(): CafeFigure {
    const walking = this.baristaPhase === 'toMachine' || this.baristaPhase === 'toTill'
    return {
      look: BARISTA_LOOK,
      x: Math.round(this.baristaX),
      feet: BARISTA_FEET,
      rightwards: this.baristaPhase === 'toMachine' || this.baristaPhase === 'brew',
      pose: walking ? STEP_CYCLE[Math.floor(this.baristaX / STRIDE) % STEP_CYCLE.length] : undefined,
      alpha: 1,
    }
  }

  /** The guests, back to front. */
  guestsNow(): CafeFigure[] {
    return [...this.guests]
      .sort((a, b) => a.feet - b.feet)
      .map((guest) => {
        const walking = guest.phase === 'walk' || guest.phase === 'leave'
        const toDoor = pathLength(guest.path) - guest.walked
        const pose: Pose | undefined = walking
          ? STEP_CYCLE[Math.floor(guest.walked / STRIDE) % STEP_CYCLE.length]
          : guest.phase === 'served'
            ? 'drink'
            : guest.phase === 'sit'
              ? sitting(guest)
              : undefined
        return {
          look: GUEST_LOOK + guest.n,
          x: Math.round(guest.x),
          feet: Math.round(guest.feet),
          rightwards: guest.phase === 'sit' && guest.seat ? guest.seat.rightwards : guest.rightwards,
          pose,
          // They fade in through the door, and out of it again.
          alpha: Math.min(1, guest.age / FADE, guest.phase === 'leave' ? ((toDoor / WALK_SPEED) * 1000) / FADE : 1),
        }
      })
  }

  /** How many guests are in, for tests. */
  get inside(): number {
    return this.guests.length
  }
}

/** Sitting at the table they mostly sit still, and now and then take a sip. */
function sitting(guest: Guest): Pose {
  return Math.floor(guest.timer / 2500) % 3 === 1 ? 'sip' : 'sit'
}
