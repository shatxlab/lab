import { hash } from './activity'
import { STEP_CYCLE, type Pose } from './poses'
import { pathLength, pointAlong, type Point } from './walkout'

/**
 * The café the two founders start in, as it is seen: a barista behind the counter, and now and then someone who
 * comes in, queues, says what they want, waits while the barista makes it and brings it to the end of the counter,
 * picks it up, and goes with it, or sits down with it at a table for a while. Everything is worked out from the
 * time the café has been open alone, a guest's choices from their number, so it plays the same way every time.
 * Positions are the middle of a person's feet, in scene pixels.
 */

/** The door (its middle, and the row a person's feet are on in its frame), and the lane people walk along. */
export const CAFE_DOOR_X = 40
export const CAFE_DOOR_FEET = 113
export const CAFE_LANE = 124
/** People on their way out keep to a lane nearer the front, so they pass those coming in rather than walk through them. */
export const CAFE_EXIT_LANE = 131
/**
 * The counter: its left end, and the top of its surface; the barista stands behind it, at the till or the machine.
 * At the till they take the order and hand the cup over, setting it down at `PICKUP_X`, at the end of the counter,
 * for the guest to take.
 */
export const COUNTER_LEFT = 170
export const COUNTER_TOP = 100
export const BARISTA_FEET = 106
export const TILL_X = 186
export const MACHINE_X = 216
export const PICKUP_X = 173
/** How far in front of the barista they hold a cup they carry. */
const CARRY = 9
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
/**
 * At the counter: ordering (the guest says what they want), the barista making the coffee, and handing it over:
 * the cup on the counter until the guest takes it, a first sip, and the barista's thanks.
 */
const ORDER_MS = 1400
const BREW_MS = 3200
const PICKUP_MS = 600
const FIRST_SIP_MS = 1000
const THANKS_MS = 1200
/** Of a hundred guests, how many sit down with their cup, and how long they stay. */
const SITTERS = 30
const SIT_MS: readonly [number, number] = [14000, 26000]

/** Look ids for the café's people, far from any employee's, so they get looks of their own. */
export const BARISTA_LOOK = 7_000_001
const GUEST_LOOK = 7_100_000

/** What someone says at the counter, in a speech bubble: the order, and the barista's thanks for it. */
export type Bubble = 'order' | 'thanks'

/** Someone in the café as drawn: who they look like, where their feet are, which way they face, in what pose, how faded. */
export interface CafeFigure {
  look: number
  x: number
  feet: number
  rightwards: boolean
  /** None: standing still. */
  pose: Pose | undefined
  alpha: number
  bubble?: Bubble
}

/**
 * A paper cup of coffee that is not at someone's lips: its middle, and the row just under it, in scene pixels.
 * `behindCounter` is the one in the barista's hands, which passes behind the till.
 */
export interface Cup {
  x: number
  bottom: number
  alpha: number
  behindCounter?: boolean
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
  /** The table they sit at, from when their cup is handed over, on their way there and at it. */
  seat: Seat | null
  /** Whether they have their cup yet. */
  cup: boolean
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
      cup: false,
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
      else if (place === 0 && this.serving === null && this.baristaPhase === 'till') {
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
    } else if (guest.phase === 'served') {
      guest.cup = guest.timer >= PICKUP_MS
      if (guest.timer < PICKUP_MS + FIRST_SIP_MS) return
      this.serving = null
      const seat = guest.seat
      if (seat) this.walk(guest, [{ x: seat.aisle, y: CAFE_LANE }, { x: seat.aisle, y: seat.feet }, { x: seat.x, y: seat.feet }], 'sit')
      else this.goHome(guest)
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

  /** Hands the cup over: sets it down at the end of the counter for the guest, who now knows whether they will sit. */
  private handOver(guest: Guest): void {
    guest.phase = 'served'
    guest.timer = 0
    const taken = this.guests.flatMap((g) => (g.seat ? [g.seat] : []))
    const free = SEATS.filter((seat) => !taken.includes(seat))
    guest.seat = guest.sits && free.length > 0 ? free[hash(guest.n, 0x5ea7) % free.length]! : null
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
        if (this.serving) this.handOver(this.serving)
      }
    } else if (this.baristaPhase === 'hand' && this.baristaTimer >= THANKS_MS) {
      ;[this.baristaPhase, this.baristaTimer] = ['till', 0]
    }
  }

  /**
   * The barista, behind the counter: facing the till and whoever is at it, or the espresso machine. They thank the
   * guest as they hand the cup over.
   */
  barista(): CafeFigure {
    const phase = this.baristaPhase
    const walking = phase === 'toMachine' || phase === 'toTill'
    return {
      look: BARISTA_LOOK,
      x: Math.round(this.baristaX),
      feet: BARISTA_FEET,
      rightwards: phase === 'toMachine' || phase === 'brew',
      pose: walking ? STEP_CYCLE[Math.floor(this.baristaX / STRIDE) % STEP_CYCLE.length] : undefined,
      alpha: 1,
      bubble: phase === 'hand' ? 'thanks' : undefined,
    }
  }

  /**
   * The cups not at anyone's lips: carried along the counter from the machine in the barista's hands, set down at
   * its end, held at a guest's side, or on the table in front of whoever sits there (and only while they do).
   */
  cups(): Cup[] {
    const cups: Cup[] = []
    if (this.baristaPhase === 'toTill') cups.push({ x: Math.round(this.baristaX) - CARRY, bottom: COUNTER_TOP, alpha: 1, behindCounter: true })
    for (const guest of this.guests) {
      const figure = this.figureOf(guest)
      if (guest.phase === 'served' && !guest.cup) cups.push({ x: PICKUP_X, bottom: COUNTER_TOP, alpha: 1 })
      if (!guest.cup || figure.pose === 'drink' || figure.pose === 'sip') continue
      if (figure.pose === 'sit' && guest.seat) {
        const { x, feet, rightwards } = guest.seat
        cups.push({ x: rightwards ? x + 12 : x - 12, bottom: feet - 15, alpha: 1 })
      } else {
        cups.push({ x: figure.x + (figure.rightwards ? 5 : -5), bottom: figure.feet - 5, alpha: figure.alpha })
      }
    }
    return cups
  }

  /** The guests, back to front. */
  guestsNow(): CafeFigure[] {
    return [...this.guests].sort((a, b) => a.feet - b.feet).map((guest) => this.figureOf(guest))
  }

  private figureOf(guest: Guest): CafeFigure {
    const walking = guest.phase === 'walk' || guest.phase === 'leave'
    const toDoor = pathLength(guest.path) - guest.walked
    const pose: Pose | undefined = walking
      ? STEP_CYCLE[Math.floor(guest.walked / STRIDE) % STEP_CYCLE.length]
      : guest.phase === 'served' && guest.cup
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
      bubble: guest.phase === 'order' ? 'order' : undefined,
    }
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
