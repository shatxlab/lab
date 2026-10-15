import { describe, expect, it } from 'vitest'
import {
  BETWEEN_MS,
  chooseErrand,
  chooseSpot,
  ERRANDS,
  FIRST_OUT_MS,
  LOWERED_MS,
  nextOutAt,
  poseAtSpot,
  RAISED_MS,
  SPOT_CLEARANCE,
  SPOTS,
  spotFree,
  STEPS,
  stayFor,
  type Errand,
} from '@/lib/tycoon/render-support/breaks'
import { BOOKSHELF_HEIGHT, BOOKSHELF_WIDTH, bookshelfRects } from '@/lib/tycoon/render-support/bookshelf'
import { SCENE_WIDTH } from '@/lib/tycoon/render-support/layout'

describe('SPOTS', () => {
  it('offers every errand somewhere, inside the room', () => {
    for (const errand of ERRANDS) expect(SPOTS.some((spot) => spot.errand === errand)).toBe(true)
    for (const spot of SPOTS) {
      expect(spot.x).toBeGreaterThan(0)
      expect(spot.x).toBeLessThan(SCENE_WIDTH)
    }
  })

  it('has a place for two people on the sofa, who can sit at once', () => {
    const [left, right] = SPOTS.filter((spot) => spot.errand === 'sofa')
    expect(SPOTS.filter((spot) => spot.errand === 'sofa')).toHaveLength(2)
    expect(spotFree(left!, [right!])).toBe(true)
  })
})

describe('spotFree', () => {
  it('is free unless somebody stands too close', () => {
    const [first] = SPOTS
    expect(spotFree(first!, [])).toBe(true)
    expect(spotFree(first!, [first!])).toBe(false)
    expect(spotFree(first!, [{ ...first!, x: first!.x + SPOT_CLEARANCE - 1 }])).toBe(false)
    expect(spotFree(first!, [{ ...first!, x: first!.x + SPOT_CLEARANCE }])).toBe(true)
  })
})

describe('choosing', () => {
  const all = [...ERRANDS]

  it('is the same every time for the same person, break and round', () => {
    expect(chooseErrand(7, 2, 1, all)).toBe(chooseErrand(7, 2, 1, all))
    expect(nextOutAt(7, 2, 1, 5000)).toBe(nextOutAt(7, 2, 1, 5000))
    expect(chooseSpot(7, 2, 1, SPOTS)).toBe(chooseSpot(7, 2, 1, SPOTS))
  })

  it('never repeats the last errand while there is another, and falls back to it when there is not', () => {
    for (let id = 0; id < 40; id++) for (const last of all) expect(chooseErrand(id, 1, 3, all, last)).not.toBe(last)
    expect(chooseErrand(1, 1, 1, ['sofa'], 'sofa')).toBe('sofa')
    expect(chooseErrand(1, 1, 1, [])).toBeUndefined()
    expect(chooseSpot(1, 1, 1, [])).toBeUndefined()
  })

  it('gives different people and rounds different errands, all of them in time', () => {
    const seen = new Set<Errand>()
    for (let id = 0; id < 30; id++) for (let round = 0; round < 6; round++) seen.add(chooseErrand(id, 1, round, all)!)
    expect([...seen].sort()).toEqual([...ERRANDS].sort())
  })

  it('has people get up at different times, in the ranges for the first outing and for later ones', () => {
    const firsts = Array.from({ length: 40 }, (_, id) => nextOutAt(id, 1, 0, 0))
    for (const at of firsts) {
      expect(at).toBeGreaterThanOrEqual(FIRST_OUT_MS[0])
      expect(at).toBeLessThanOrEqual(FIRST_OUT_MS[1])
    }
    expect(new Set(firsts).size).toBeGreaterThan(20)
    for (let id = 0; id < 40; id++) {
      const gap = nextOutAt(id, 1, 2, 10_000) - 10_000
      expect(gap).toBeGreaterThanOrEqual(BETWEEN_MS[0])
      expect(gap).toBeLessThanOrEqual(BETWEEN_MS[1])
    }
  })
})

describe('stayFor and poseAtSpot', () => {
  it.each(ERRANDS.map((errand) => [errand]))('%s: each stretch lasts as long as that kind of stretch does', (errand) => {
    for (let id = 0; id < 20; id++) {
      const stay = stayFor(id, 1, 0, errand)
      expect(stay.steps).toHaveLength(STEPS[errand].length)
      stay.steps.forEach((step, i) => {
        expect(step.pose).toBe(STEPS[errand][i]!.pose)
        expect(step.ms).toBeGreaterThanOrEqual(STEPS[errand][i]!.ms[0])
        expect(step.ms).toBeLessThanOrEqual(STEPS[errand][i]!.ms[1])
      })
      expect(stay.total).toBe(stay.steps.reduce((sum, step) => sum + step.ms, 0))
    }
  })

  it('stands at the machine first, then drinks, with the cup going up and coming down again', () => {
    const stay = stayFor(3, 1, 0, 'coffee')
    const wait = stay.steps[0]!.ms
    expect(poseAtSpot(stay, 0)).toBeUndefined()
    expect(poseAtSpot(stay, wait - 1)).toBeUndefined()
    expect(poseAtSpot(stay, wait)).toBe('drink')
    expect(poseAtSpot(stay, wait + RAISED_MS - 1)).toBe('drink')
    expect(poseAtSpot(stay, wait + RAISED_MS)).toBeUndefined()
    expect(poseAtSpot(stay, wait + RAISED_MS + LOWERED_MS)).toBe('drink')
  })

  it('eats a snack, reads a book and sits on the sofa', () => {
    const at = (errand: Errand, last = false) => {
      const stay = stayFor(1, 1, 0, errand)
      return poseAtSpot(stay, last ? stay.total - 1 : stay.steps[0]!.ms)
    }
    expect(at('snack')).toBe('eat')
    expect(at('book')).toBe('read')
    expect(at('book', true)).toBe('read')
    expect(at('sofa')).toBe('sit')
    expect(poseAtSpot(stayFor(1, 1, 0, 'sofa'), 0)).toBe('sit')
  })
})

describe('bookshelfRects', () => {
  const rects = bookshelfRects()

  it('stays inside its box and is the same every time', () => {
    for (const { x, y, w, h } of rects) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(BOOKSHELF_WIDTH)
      expect(y + h).toBeLessThanOrEqual(BOOKSHELF_HEIGHT)
    }
    expect(bookshelfRects()).toEqual(rects)
  })

  it('holds books in more than one colour on every shelf', () => {
    expect(new Set(rects.map((rect) => rect.color)).size).toBeGreaterThan(6)
  })
})
