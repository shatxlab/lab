import { describe, expect, it } from 'vitest'
import { chairTucked, hasComputer, vacancyFor, type Vacancy } from '@/lib/tycoon/render-support/vacancy'

describe('vacancyFor', () => {
  it('always dresses the same desk the same way', () => {
    for (let desk = 0; desk < 24; desk++) expect(vacancyFor(desk)).toBe(vacancyFor(desk))
  })

  it('repeats past the end of the pattern, so any office size gets a look', () => {
    expect(vacancyFor(12)).toBe(vacancyFor(0))
    expect(vacancyFor(25)).toBe(vacancyFor(1))
  })

  it('mixes all three looks across an office of twelve desks', () => {
    const seen = new Set<Vacancy>(Array.from({ length: 12 }, (_, desk) => vacancyFor(desk)))
    expect(seen).toEqual(new Set(['away', 'bare', 'spare']))
  })

  it('mixes the looks among the six desks that stay empty when the office has six people', () => {
    const seen = new Set<Vacancy>([6, 7, 8, 9, 10, 11].map((desk) => vacancyFor(desk)))
    expect(seen.size).toBe(3)
  })
})

describe('a desk somebody was let go from', () => {
  it('is never dressed as someone being away', () => {
    for (let desk = 0; desk < 24; desk++) expect(vacancyFor(desk, true)).not.toBe('away')
  })

  it('keeps the look it would have had anyway when that was not away', () => {
    for (let desk = 0; desk < 24; desk++) if (vacancyFor(desk) !== 'away') expect(vacancyFor(desk, true)).toBe(vacancyFor(desk))
  })
})

describe('what a vacancy looks like', () => {
  it('only an away desk keeps its computer', () => {
    expect(hasComputer('away')).toBe(true)
    expect(hasComputer('bare')).toBe(false)
    expect(hasComputer('spare')).toBe(false)
  })

  it('leaves the chair out only at a spare desk', () => {
    expect(chairTucked('away')).toBe(true)
    expect(chairTucked('bare')).toBe(true)
    expect(chairTucked('spare')).toBe(false)
  })
})
