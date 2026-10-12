import { describe, expect, it } from 'vitest'
import { compactMoney, monthLabel, monthTicks, nearestIndex, niceStep, niceTicks } from '@/lib/tycoon/chartMath'

describe('niceStep / niceTicks', () => {
  it('uses 1, 2 or 5 times a power of ten', () => {
    for (const range of [3, 7, 40, 130, 900, 12_345, 2_000_000]) {
      const step = niceStep(range, 4)
      const mantissa = step / 10 ** Math.floor(Math.log10(step))
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6)
    }
  })

  it('covers the data with round numbers and starts at the first tick', () => {
    const { ticks, lo, hi } = niceTicks(0, 87_000)
    expect(lo).toBeLessThanOrEqual(0)
    expect(hi).toBeGreaterThanOrEqual(87_000)
    expect(ticks[0]).toBe(lo)
    expect(ticks[ticks.length - 1]).toBe(hi)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(7)
    for (const t of ticks) expect(t % 10_000 === 0 || t % 20_000 === 0 || t % 25_000 === 0).toBe(true)
  })

  it('includes negative territory when the data goes below zero', () => {
    const { ticks, lo } = niceTicks(-4200, 9000)
    expect(lo).toBeLessThanOrEqual(-4200)
    expect(ticks).toContain(0)
  })

  it('handles a flat series and a single value', () => {
    const flat = niceTicks(500, 500)
    expect(flat.hi).toBeGreaterThan(flat.lo)
    expect(flat.ticks.length).toBeGreaterThanOrEqual(2)
    const zero = niceTicks(0, 0)
    expect(zero.hi).toBeGreaterThan(zero.lo)
  })

  it('has evenly spaced ticks', () => {
    const { ticks } = niceTicks(120, 3_800_000)
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBe(1)
  })
})

describe('compactMoney', () => {
  it.each([
    [0, '$0'],
    [499.6, '$500'],
    [1500, '$1.5k'],
    [50_000, '$50k'],
    [1_250_000, '$1.3M'],
    [-2000, '-$2k'],
    [-45, '-$45'],
    [999_999, '$1000k'],
  ])('%s -> %s', (amount, text) => {
    expect(compactMoney(amount)).toBe(text)
  })
})

describe('monthTicks', () => {
  it('labels month boundaries, no more than asked for', () => {
    for (const [first, last] of [[0, 120], [0, 360], [0, 1800], [90, 4000]]) {
      const ticks = monthTicks(first, last, 5)
      expect(ticks.length).toBeGreaterThan(0)
      expect(ticks.length).toBeLessThanOrEqual(5)
      for (const t of ticks) {
        expect(t % 30).toBe(0)
        expect(t).toBeGreaterThanOrEqual(first)
        expect(t).toBeLessThanOrEqual(last)
      }
    }
  })

  it('steps in whole, even months', () => {
    const ticks = monthTicks(0, 360, 5)
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
    expect(new Set(gaps).size).toBe(1)
  })

  it('has nothing to label inside a single month', () => {
    expect(monthTicks(31, 59)).toEqual([])
  })
})

describe('nearestIndex / monthLabel', () => {
  it('finds the closest point, ties going to the earlier one', () => {
    expect(nearestIndex([0, 30, 60, 90], 44)).toBe(1)
    expect(nearestIndex([0, 30, 60, 90], 46)).toBe(2)
    expect(nearestIndex([0, 30], 15)).toBe(0)
    expect(nearestIndex([0, 30, 60], 1000)).toBe(2)
    expect(nearestIndex([5], -50)).toBe(0)
  })

  it('names a month by year and month', () => {
    expect(monthLabel(0)).toBe('Y1 M1')
    expect(monthLabel(29)).toBe('Y1 M1')
    expect(monthLabel(30)).toBe('Y1 M2')
    expect(monthLabel(360)).toBe('Y2 M1')
    expect(monthLabel(360 * 3 + 30 * 5)).toBe('Y4 M6')
  })
})
