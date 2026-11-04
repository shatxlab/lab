import { expect, it } from 'vitest'
import { operatingRivalResponse } from '../../scripts/tycoon/operating-policy'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { nemesisDay, nemesisMonth, nemesisRival, strikeBack, strikeBackPreview } from '@/lib/tycoon/sim/nemesis'
import { NEMESIS_FIRST_DAYS, NEMESIS_MIN_RATIO } from '@/lib/tycoon/sim/balance'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { serialize } from '@/lib/tycoon/sim/state'
import { stage0Fixture } from './stage0-fixtures'

function setup() {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.hitDay = s.day - NEMESIS_FIRST_DAYS
  nemesisMonth(s)
  nemesisRival(s)!.ratio = 2.2
  return s
}

it('previews exactly the paid ratio change executed, without consuming RNG or labour', () => {
  const s = setup(), before = serialize(s), preview = strikeBackPreview(s)!
  expect(serialize(s)).toBe(before)
  const cash = s.money, assignments = s.offices.map((o) => o.assignment)
  expect(strikeBack(s).ok).toBe(true)
  expect(s.money).toBe(cash - preview.cost)
  expect(nemesisRival(s)!.ratio).toBe(preview.after)
  expect(s.offices.map((o) => o.assignment)).toEqual(assignments)
  expect(strikeBackPreview(s)!.blocker).toMatch(/Wait/)
})

it('clamps the preview and command identically without promising a defeated rival', () => {
  const s = setup()
  nemesisRival(s)!.ratio = NEMESIS_MIN_RATIO
  const preview = strikeBackPreview(s)!
  expect(preview.after).toBe(NEMESIS_MIN_RATIO)
  strikeBack(s)
  expect(s.nemesesBeaten ?? 0).toBe(0)
  expect(s.nemesis).toBeDefined()
})

it('restores a deliberate affordable rival response to the parallel bot', () => {
  const s = setup(), before = serialize(s)
  expect(operatingRivalResponse(s)).not.toBeNull()
  expect(serialize(s)).toBe(before) // The policy proposes; it does not act.
  expect(strikeBack(s).ok).toBe(true)
  expect(operatingRivalResponse(s)).toBeNull() // Cooldown is authoritative.
})

it('does not spend through the old four-campaign-cost affordability threshold or while already ahead', () => {
  const s = setup(), preview = strikeBackPreview(s)!
  s.money = 4 * preview.cost
  expect(operatingRivalResponse(s)).toBeNull()
  s.money = Math.max(4 * preview.cost + 1, preview.cost + 6 * monthlyBurn(s))
  expect(operatingRivalResponse(s)).not.toBeNull()
  s.money = preview.cost + 6 * monthlyBurn(s) - 1
  expect(operatingRivalResponse(s)).toBeNull()
  s.money = 1e9
  nemesisRival(s)!.ratio = preview.threshold
  expect(operatingRivalResponse(s)).toBeNull()
  s.money = 0
  expect(strikeBackPreview(s)!.blocker).toBe('Not enough money')
})

it('does not silently make the policy an automatic simulation or pre-hit decision', () => {
  const s = setup(), before = s.money, ratio = nemesisRival(s)!.ratio
  s.nemesis!.nextMoveDay = s.day + 1000
  nemesisDay(s)
  expect(s.money).toBe(before)
  expect(nemesisRival(s)!.ratio).toBe(ratio)
  for (const office of s.offices) delete office.assignment
  expect(operatingRivalResponse(s)).toBeNull()
})
