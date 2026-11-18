import { describe, expect, it } from 'vitest'
import { BARISTA_LOOK, CafeCrowd, CAFE_DOOR_X, CAFE_EXIT_LANE, CAFE_LANE, COUNTER_TOP, MACHINE_X, PICKUP_X, QUEUE_X, SEATS, TILL_X, type CafeFigure, type Cup } from '@/lib/tycoon/render-support/cafe'

/** Runs the café for `ms` in steps of `step`, calling `look` after each. */
function run(crowd: CafeCrowd, ms: number, look: (guests: CafeFigure[], barista: CafeFigure, cups: Cup[]) => void = () => {}, step = 100): void {
  for (let t = 0; t < ms; t += step) {
    crowd.update(step)
    look(crowd.guestsNow(), crowd.barista(), crowd.cups())
  }
}

describe('the café crowd', () => {
  it('starts empty, with the barista at the till', () => {
    const crowd = new CafeCrowd()
    expect(crowd.guestsNow()).toEqual([])
    expect(crowd.barista()).toMatchObject({ look: BARISTA_LOOK, x: TILL_X, rightwards: false, pose: undefined })
  })

  it('brings guests in at the door, faded in, and walks them to the counter', () => {
    const crowd = new CafeCrowd()
    let first: CafeFigure | undefined
    run(crowd, 12000, (guests) => (first ??= guests[0]))
    expect(first).toMatchObject({ x: CAFE_DOOR_X })
    expect(first!.alpha).toBeLessThan(1)
    expect(crowd.guestsNow().some((g) => g.x === QUEUE_X[0] && g.feet === CAFE_LANE)).toBe(true)
  })

  it('sends the barista to the machine for each order and back to hand it over, cup to the guest’s lips', () => {
    const crowd = new CafeCrowd()
    let atMachine = false
    let drinking = false
    run(crowd, 20000, (guests, barista) => {
      if (barista.x === MACHINE_X && barista.rightwards) atMachine = true
      if (guests.some((g) => g.pose === 'drink' && g.x === QUEUE_X[0])) drinking = true
    })
    expect(atMachine).toBe(true)
    expect(drinking).toBe(true)
  })

  it('takes the order, carries the cup back behind the counter, and sets it down at its end for the guest', () => {
    const crowd = new CafeCrowd()
    const seen: string[] = []
    const note = (what: string) => seen.at(-1) !== what && seen.push(what)
    run(crowd, 20000, (guests, barista, cups) => {
      if (guests.some((g) => g.bubble === 'order')) note('order')
      if (cups.some((c) => c.behindCounter)) note('carried')
      if (cups.some((c) => c.x === PICKUP_X && c.bottom === COUNTER_TOP) && barista.bubble === 'thanks') note('handed')
      if (guests.some((g) => g.pose === 'drink')) note('drink')
    })
    expect(seen.slice(0, 4)).toEqual(['order', 'carried', 'handed', 'drink'])
  })

  it('puts a cup on a table only while someone sits there, and has guests carry theirs when they walk', () => {
    const crowd = new CafeCrowd()
    let onTable = 0
    let carried = 0
    run(crowd, 600_000, (guests, _barista, cups) => {
      for (const seat of SEATS) {
        const cup = cups.some((c) => c.x === seat.x + (seat.rightwards ? 12 : -12) && c.bottom === seat.feet - 15)
        const sitting = guests.some((g) => g.x === seat.x && g.feet === seat.feet && g.pose === 'sit')
        expect(cup).toBe(sitting)
        if (cup) onTable++
      }
      if (guests.some((g) => g.feet === CAFE_EXIT_LANE) && cups.some((c) => c.bottom === CAFE_EXIT_LANE - 5)) carried++
    })
    expect(onTable).toBeGreaterThan(0)
    expect(carried).toBeGreaterThan(0)
  })

  it('serves everyone in time: some leave by the exit lane, some sit at a free table, never two at one', () => {
    const crowd = new CafeCrowd()
    let leftByExit = false
    const sat = new Set<number>()
    run(crowd, 600_000, (guests) => {
      if (guests.some((g) => g.feet === CAFE_EXIT_LANE)) leftByExit = true
      const sitting = guests.filter((g) => g.pose === 'sit' || g.pose === 'sip')
      for (const seat of SEATS) expect(sitting.filter((g) => g.x === seat.x && g.feet === seat.feet).length).toBeLessThanOrEqual(1)
      for (const g of sitting) sat.add(g.look)
      expect(guests.length).toBeLessThanOrEqual(4)
    })
    expect(leftByExit).toBe(true)
    expect(sat.size).toBeGreaterThan(0)
  })

  it('plays the same way every time', () => {
    const a = new CafeCrowd()
    const b = new CafeCrowd()
    run(a, 90_000)
    run(b, 90_000, () => {}, 50)
    expect(a.guestsNow().map((g) => g.look)).toEqual(b.guestsNow().map((g) => g.look))
  })
})
