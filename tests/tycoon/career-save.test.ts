import { describe, expect, it } from 'vitest'
import {
  adoptCareerSave, CAREER_SAVE_VERSION, createCareerSave, deserializeCareerSave,
  serializeCareerSave, settleCareerSave, validateCareerSave, type CareerSave,
} from '@/lib/tycoon/career-save'
import { financeSummary, type FinanceResult } from '@/lib/tycoon/sim/founder-finance'
import { acceptBuyout, retireStudio } from '@/lib/tycoon/sim/exit'
import { stepDown } from '@/lib/tycoon/sim/crisis'
import { checkBankruptcy } from '@/lib/tycoon/sim/economy'
import { BANKRUPT_AFTER_DEBT_DAYS } from '@/lib/tycoon/sim/balance'
import { startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize, STATE_VERSION } from '@/lib/tycoon/sim/state'
import type { Ending } from '@/lib/tycoon/sim/types'

function unwrap<T>(r: FinanceResult<T>): T {
  if (!r.ok) throw new Error(r.reason)
  return r.value
}
const identity = { careerId: 'career:synthetic-1', companyId: 'company:synthetic-1' }
const json = (value: unknown) => JSON.stringify(value)
function career(): CareerSave {
  return unwrap(createCareerSave(createInitialState(5), identity))
}
function endedCareer(kind: Ending['kind'] = 'ipo'): CareerSave {
  const value = unwrap(createCareerSave(createInitialState(5), identity))
  value.game.day = 500
  value.game.money = 2_000_000
  value.game.gameOver = true
  value.game.ending = { kind, day: 500, worth: kind === 'sold' ? 2_000_000 : kind === 'bankrupt' || kind === 'ousted' ? 0 : 100_000_000 }
  return value
}
const summary = (save: CareerSave) => unwrap(financeSummary(save.finance))

describe('prepared v12 career save codec (live game remains v11)', () => {
  it('wraps a first-company state without consuming RNG, world ids, or changing company economics', () => {
    const game = createInitialState(5)
    const before = serialize(game)
    const save = unwrap(createCareerSave(game, identity))
    expect(save.version).toBe(CAREER_SAVE_VERSION)
    expect(save.game.version).toBe(STATE_VERSION)
    expect(serialize(game)).toBe(before)
    expect(save.game).toEqual(game)
    expect(summary(save).liquid).toBe(0)
    save.game.money = 0
    expect(game.money).toBe(2500)
  })

  it('round-trips the prepared format and keeps identity stable', () => {
    const save = career()
    const token = unwrap(serializeCareerSave(save))
    const loaded = unwrap(deserializeCareerSave(token))
    expect(loaded).toEqual(save)
    expect(unwrap(serializeCareerSave(loaded))).toBe(token)
    expect(loaded.finance.careerId).toBe(identity.careerId)
    // Deliberately not enabled through v11: no automatic partial career rollout.
    expect(deserialize(token)).toBeNull()
    expect(deserializeCareerSave(serialize(save.game)).ok).toBe(false)
  })

  it('requires adoption rather than treating a later company as a new initial career', () => {
    for (const change of [
      (s: CareerSave) => { s.game.day = 10 },
      (s: CareerSave) => { s.game.chapter = 2 },
      (s: CareerSave) => { s.game.gameOver = true },
    ]) {
      const save = career()
      change(save)
      expect(createCareerSave(save.game, identity).ok).toBe(false)
    }
    expect(createCareerSave(createInitialState(5), { ...identity, careerId: '' }).ok).toBe(false)
  })

  it('preserves paid work, people, cash, world, historical valuations and knowledge during active legacy adoption', () => {
    const game = createInitialState(5)
    game.money = 100_000
    expect(startProject(game, 'web_app', ['accounts']).ok).toBe(true)
    game.day = 500
    game.chapter = 3
    game.chapterStartDay = 490
    game.legacy = [{ studio: 'Historical', ending: 'ipo', worth: 1_000_000_000, years: 4 }]
    game.research.known = ['ci_pipeline']
    game.surveyed = ['consumers']
    const normalized = deserialize(serialize(game))!
    const save = unwrap(adoptCareerSave(serialize(game), identity))
    expect(save.game).toEqual(normalized)
    expect(summary(save)).toMatchObject({ liquid: 0, holdings: [], companies: [{ source: 'legacy-active', investment: null, shareBps: 5000 }] })
    expect(save.finance.records).toHaveLength(1)
    expect(save.game.legacy?.[0].worth).toBe(1_000_000_000)
    expect(save.game.rng).toBe(game.rng)
    expect(save.game.nextId).toBe(game.nextId)
    expect(game.offices[0].project).not.toBeNull()
  })

  it('uses existing older-save upgrades without reactivating archived practices or changing RNG', () => {
    const game = createInitialState(5)
    const raw = JSON.parse(serialize(game))
    raw.version = 10
    raw.day = 100
    raw.research.done = ['ci_pipeline']
    delete raw.research.known
    const expected = deserialize(json(raw))!
    const save = unwrap(adoptCareerSave(json(raw), identity))
    expect(save.game).toEqual(expected)
    expect(save.game.research.known).toEqual(['ci_pipeline'])
    expect(save.game.research.done).toEqual(['ci_pipeline'])
    expect(summary(save).liquid).toBe(0)
    expect(save.game.rng).toBe(game.rng)
  })

  it('rejects malformed in-memory envelopes and recognition before the company existed', () => {
    const cyclic: any = career()
    cyclic.game.circular = cyclic
    expect(validateCareerSave(cyclic).ok).toBe(false)
    expect(serializeCareerSave(cyclic).ok).toBe(false)
    const save = unwrap(adoptCareerSave(serialize(endedCareer().game), identity))
    save.charter.fulfilledDay = 499
    expect(validateCareerSave(save).ok).toBe(false)
  })

  it('does not settle a migrated ended company merely by adopting, serializing or reloading', () => {
    const game = endedCareer().game
    game.legacy = [{ studio: 'Earlier', ending: 'sold', worth: 900_000_000, years: 3 }]
    const save = unwrap(adoptCareerSave(serialize(game), identity))
    const loaded = unwrap(deserializeCareerSave(unwrap(serializeCareerSave(save))))
    expect(summary(loaded).liquid).toBe(0)
    expect(summary(loaded).holdings).toEqual([])
    expect(summary(loaded).companies[0]).toMatchObject({ source: 'legacy-ended', closed: false })
    expect(loaded.game.ending).toEqual(game.ending)
    expect(settleCareerSave(loaded).ok).toBe(false)
  })

  it.each(['apply', 'decline'] as const)('durably records legacy choice: %s', (decision) => {
    const save = unwrap(adoptCareerSave(serialize(endedCareer().game), identity))
    const booked = unwrap(settleCareerSave(save, decision))
    expect(summary(save).liquid).toBe(0)
    const loaded = unwrap(deserializeCareerSave(unwrap(serializeCareerSave(booked))))
    expect(summary(loaded).liquid).toBe(decision === 'apply' ? 5_000_000 : 0)
    expect(summary(loaded).companies[0].closed).toBe(true)
    expect(unwrap(settleCareerSave(loaded, decision))).toEqual(loaded)
    expect(settleCareerSave(loaded, decision === 'apply' ? 'decline' : 'apply').ok).toBe(false)
    expect(settleCareerSave(loaded).ok).toBe(false)
  })

  it.each([
    ['sold', 1_000_000], ['ipo', 5_000_000], ['retired', 1_000_000], ['bankrupt', 0], ['ousted', 0],
  ] as const)('settles a native %s ending once, preserving the ended company', (kind, cash) => {
    const save = endedCareer(kind)
    const before = json(save)
    const settled = unwrap(settleCareerSave(save))
    expect(json(save)).toBe(before)
    expect(settled.game).toEqual(save.game)
    expect(summary(settled).liquid).toBe(cash)
    expect(summary(settled).companies[0].closed).toBe(true)
    const loaded = unwrap(deserializeCareerSave(unwrap(serializeCareerSave(settled))))
    expect(unwrap(settleCareerSave(loaded))).toEqual(loaded)
    expect(loaded.finance.records).toHaveLength(2)
    expect(settleCareerSave(save, 'apply').ok).toBe(false)
  })

  it('takes the combined closing sale pot from the actual exit engine, not the offer twice', () => {
    const save = career()
    save.game.offices[0].kind = 'garage'
    save.game.day = 500
    save.game.money = 2_000_000.25
    save.game.exit.pending = { price: 18_000_001, bidder: 'Synthetic buyer' }
    expect(acceptBuyout(save.game).ok).toBe(true)
    const booked = unwrap(settleCareerSave(save))
    expect(summary(booked).liquid).toBe(10_000_000)
    expect(booked.game.money).toBe(20_000_001.25)
  })

  it('uses the actual retirement, bankruptcy and ousting engine boundaries', () => {
    const retirement = career()
    retirement.game.day = 500
    retirement.game.money = 20_000_001.75
    expect(retireStudio(retirement.game).ok).toBe(true)
    expect(summary(unwrap(settleCareerSave(retirement))).liquid).toBe(10_000_000)
    const bankrupt = career()
    bankrupt.game.day = 500
    bankrupt.game.money = -200
    bankrupt.game.debtDays = BANKRUPT_AFTER_DEBT_DAYS
    checkBankruptcy(bankrupt.game)
    expect(summary(unwrap(settleCareerSave(bankrupt))).liquid).toBe(0)
    const ousted = career()
    ousted.game.day = 500
    stepDown(ousted.game)
    expect(summary(unwrap(settleCareerSave(ousted))).holdings[0].status).toBe('disputed')
  })

  it('uses the frozen 50% ownership even after a cofounder leaves', () => {
    const save = endedCareer('sold')
    save.game.employees = save.game.employees.slice(0, 1)
    expect(summary(unwrap(settleCareerSave(save))).liquid).toBe(1_000_000)
  })

  it('rejects active settlement and malformed/mismatched imports without repairing financial fields', () => {
    expect(settleCareerSave(career()).ok).toBe(false)
    const source = unwrap(settleCareerSave(endedCareer()))
    const corrupt = (change: (s: any) => void) => {
      const raw = JSON.parse(json(source))
      change(raw)
      expect(deserializeCareerSave(json(raw)).ok).toBe(false)
    }
    corrupt((r) => { delete r.finance })
    corrupt((r) => { delete r.charter })
    corrupt((r) => { r.version = 13 })
    corrupt((r) => { r.game.version = 999 })
    corrupt((r) => { r.charter.companyId = 'stale-company' })
    corrupt((r) => { r.charter.ambition = 'venture' })
    corrupt((r) => { r.charter.fulfilledDay = 501 })
    corrupt((r) => { r.charter.fulfilledDay = 1.5 })
    corrupt((r) => { r.finance.records[1].distribution.liquid++ })
    corrupt((r) => { r.game.ending.worth++ })
    corrupt((r) => { r.game.money++ })
    corrupt((r) => { r.game.ending.kind = 'sold' })
    corrupt((r) => { r.game.ending.day-- })
    corrupt((r) => { r.game.day = 499 })
    corrupt((r) => { r.game.gameOver = false })
    corrupt((r) => { r.game.ending = null })
    corrupt((r) => { r.game.chapter = 2 })
    corrupt((r) => { r.game.rng = -1 })
    for (const text of ['null', '[]', '{}', 'not json']) expect(deserializeCareerSave(text).ok).toBe(false)
  })

  it('does not accept a malformed pending ending as a recoverable unsettled company', () => {
    const corrupt = (change: (s: CareerSave) => void) => {
      const save = endedCareer()
      change(save)
      expect(validateCareerSave(save).ok).toBe(false)
    }
    corrupt((s) => { s.game.ending!.worth = 1 })
    corrupt((s) => { s.game.ending!.day = 501 })
    corrupt((s) => { s.game.ending!.day = 1.5 })
    corrupt((s) => { s.game.money = Infinity })
    corrupt((s) => { s.game.ending!.kind = 'unknown' as Ending['kind'] })
    const adopted = unwrap(adoptCareerSave(serialize(endedCareer().game), identity))
    adopted.game.ending = null
    adopted.game.gameOver = false
    expect(validateCareerSave(adopted).ok).toBe(false)
  })
})
