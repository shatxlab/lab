import { describe, expect, it } from 'vitest'
import { FIT_TAKEOFF } from '@/lib/tycoon/sim/balance'
import { fitPressure, retention, sagFit, totalPressure } from '@/lib/tycoon/sim/fit'
import { makeProduct, makeState } from './helpers'

describe('pressure on a hit', () => {
  it('a fresh, clean hit alone in its market is not pressed', () => {
    const state = makeState()
    state.day = 100
    const hit = makeProduct({ hit: true, fit: 90, releaseDay: 95, bugs: 0 })
    expect(totalPressure(fitPressure(state, hit))).toBeLessThan(0.05)
  })

  it('sags while stale and buggy, never below zero, and recovers to the fit its release earned', () => {
    const state = makeState()
    state.day = 2000
    const hit = makeProduct({ hit: true, fit: 90, releaseDay: 0, bugs: 60, size: 'small' })
    hit.peakFit = 90
    for (let i = 0; i < 200; i++) sagFit(state, hit)
    expect(hit.fit!).toBeLessThan(60)
    expect(hit.fit!).toBeGreaterThanOrEqual(0)
    expect(hit.peakFit).toBe(90)
    state.day = 100
    hit.releaseDay = 99
    hit.bugs = 0
    for (let i = 0; i < 1000; i++) sagFit(state, hit)
    expect(hit.fit!).toBeCloseTo(90)
  })

  it('keeps all its users at a fit above the takeoff, fewer below, and Quality work wins some back', () => {
    const good = makeProduct({ hit: true, fit: FIT_TAKEOFF })
    const poor = makeProduct({ hit: true, fit: 20 })
    expect(retention(good)).toBe(1)
    const bare = retention(poor)
    expect(bare).toBeLessThan(0.7)
    poor.built = ['perf_pass', 'observability']
    expect(retention(poor)).toBeGreaterThan(bare)
    expect(retention(makeProduct({ fit: 10 }))).toBe(1) // not a hit
  })
})
