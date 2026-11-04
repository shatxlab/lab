import { expect, it } from 'vitest'
import { companyHistoryWithNow, sampleNow } from '@/lib/tycoon/sim/history'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'

it('separates current-company charts from previous ventures without deleting career history', () => {
  const s = createInitialState(7)
  s.day = 120; s.chapter = 2; s.chapterStartDay = 90
  s.history = [
    { day: 30, money: 9000000, income: 10000, burn: 500 },
    { day: 90, money: 8000000, income: 9000, burn: 500 },
    { day: 90, money: 15000, income: 0, burn: 0 },
  ]
  const before = serialize(s)
  expect(companyHistoryWithNow(s)).toEqual([s.history[2], sampleNow(s)])
  expect(serialize(s)).toBe(before)
})

it('uses today rather than stale same-day cash, ignores future history and keeps a safe empty state for unknown legacy tenure', () => {
  const s = createInitialState(7)
  s.money = 1234
  s.history = [{ day: 0, money: 999999, income: 1000, burn: 0 }, { day: 90, money: 777777, income: 900, burn: 0 }]
  expect(companyHistoryWithNow(s)).toEqual([sampleNow(s)])
  s.chapter = 3; s.day = 100
  expect(companyHistoryWithNow(s)).toEqual([sampleNow(s)])
  expect(s.history).toHaveLength(2)
})
