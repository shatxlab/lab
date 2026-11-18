import { describe, expect, it } from 'vitest'
import { BLINK_EVERY_MS, BLINK_MS, blinkingAt, INTERLUDE_MS, momentAt, PERIOD_MS, TAP_MS, type Moment } from '@/lib/tycoon/render-support/activity'

const STEP = 50
const HOUR = 60 * 60 * 1000

/** Someone's moments, every `STEP` ms over `ms`. */
function timeline(id: number, working: boolean, ms = 10 * 60 * 1000): Moment[] {
  return Array.from({ length: ms / STEP }, (_, i) => momentAt(id, i * STEP, working))
}

/** Runs of the same break, as [pose, length in ms]. */
function breaks(moments: Moment[]): [string, number][] {
  const runs: [string, number][] = []
  let current: string | undefined
  let length = 0
  for (const { pose } of moments) {
    const interlude = pose === 'think' || pose === 'sip' || pose === 'stretch' ? pose : undefined
    if (interlude !== current && current) runs.push([current, length])
    if (interlude !== current) length = 0
    current = interlude
    length += STEP
  }
  return runs
}

describe('momentAt, at work', () => {
  it('is mostly typing, with breaks', () => {
    const moments = timeline(7, true)
    const typing = moments.filter((m) => m.typing).length / moments.length
    expect(typing).toBeGreaterThan(0.7)
    expect(typing).toBeLessThan(0.97)
  })

  it('types with the hands taking turns, and the keyboard going only while typing', () => {
    for (const moment of timeline(3, true, 60_000)) {
      if (moment.typing) expect(['typeA', 'typeB']).toContain(moment.pose)
      else expect(['think', 'sip', 'stretch']).toContain(moment.pose)
    }
    // a run of typing switches hands every tap
    let start = 0
    const runAt = (t: number) => Array.from({ length: 6 }, (_, i) => momentAt(3, t + i * TAP_MS, true))
    while (!runAt(start).every((m) => m.typing)) start += 1000
    const run = runAt(start)
    for (let i = 1; i < run.length; i++) expect(run[i]!.pose).not.toBe(run[i - 1]!.pose)
  })

  it('takes every kind of break, each as long as that kind lasts', () => {
    const seen = new Set<string>()
    for (let id = 0; id < 6; id++) {
      for (const [pose, ms] of breaks(timeline(id, true))) {
        seen.add(pose)
        const [shortest, longest] = INTERLUDE_MS[pose as keyof typeof INTERLUDE_MS]
        expect(ms).toBeGreaterThanOrEqual(shortest - STEP)
        expect(ms).toBeLessThanOrEqual(longest + STEP)
      }
    }
    expect(seen).toEqual(new Set(['think', 'sip', 'stretch']))
  })

  it('never breaks more than once a period', () => {
    const runs = breaks(timeline(11, true, HOUR / 4))
    expect(runs.length).toBeLessThanOrEqual(HOUR / 4 / PERIOD_MS + 1)
  })
})

describe('momentAt, not at work', () => {
  it('never types, and mostly sits still', () => {
    const moments = timeline(5, false)
    expect(moments.some((m) => m.typing)).toBe(false)
    const still = moments.filter((m) => m.pose === undefined).length / moments.length
    expect(still).toBeGreaterThan(0.85)
    expect(moments.some((m) => m.pose !== undefined)).toBe(true)
  })
})

describe('momentAt, between people', () => {
  it('gives the same moment for the same person and time', () => {
    for (let t = 0; t < 30_000; t += 1234) expect(momentAt(4, t, true)).toEqual(momentAt(4, t, true))
  })

  it('keeps people out of step: their breaks do not line up', () => {
    const a = timeline(1, true).map((m) => m.typing)
    const b = timeline(2, true).map((m) => m.typing)
    const same = a.filter((typing, i) => typing === b[i]).length / a.length
    expect(same).toBeLessThan(0.95)
  })
})

describe('blinkingAt', () => {
  it('shuts the eyes briefly, about once every few seconds', () => {
    const shut = Array.from({ length: (10 * 60 * 1000) / 10 }, (_, i) => blinkingAt(9, i * 10))
    const blinks = shut.filter((now, i) => now && !shut[i - 1]).length
    expect(blinks).toBeGreaterThan((10 * 60 * 1000) / BLINK_EVERY_MS - 5)
    expect(blinks).toBeLessThanOrEqual((10 * 60 * 1000) / BLINK_EVERY_MS + 1)
    expect(shut.filter(Boolean).length * 10).toBeLessThanOrEqual(blinks * (BLINK_MS + 10) * 2)
  })

  it('keeps people from blinking together', () => {
    const at = (id: number) => Array.from({ length: 6000 }, (_, i) => blinkingAt(id, i * 10))
    const a = at(1)
    const b = at(2)
    const together = a.filter((shut, i) => shut && b[i]).length
    expect(together).toBeLessThan(a.filter(Boolean).length)
  })
})
