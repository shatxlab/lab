import { describe, expect, it } from 'vitest'
import { chapterKind, nextChapter, seedMoney } from '@/lib/tycoon/sim/chapters'
import { retireStudio } from '@/lib/tycoon/sim/exit'
import { you } from '@/lib/tycoon/sim/founding'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import type { GameState } from '@/lib/tycoon/sim/types'

function endedStudio(kind: 'retired' | 'bankrupt'): GameState {
  const state = createInitialState(5)
  state.day = 2000
  state.research.done = ['ux_research', 'design_system', 'ci_pipeline', 'test_automation']
  state.reputation = 80
  state.money = 3_000_000
  state.studioName = 'Copper Studios'
  if (kind === 'retired') retireStudio(state)
  else {
    state.gameOver = true
    state.ending = { kind: 'bankrupt', day: state.day, worth: 0 }
  }
  return state
}

describe('chapters', () => {
  it('only start once the run has ended, a good ending continuing and a bad one restarting', () => {
    expect(nextChapter(createInitialState(1))).toBeNull()
    expect(chapterKind(endedStudio('retired'))).toBe('continue')
    expect(chapterKind(endedStudio('bankrupt'))).toBe('restart')
  })

  it('after a good ending keep you, your friend, what you learned and a little of the money', () => {
    const old = endedStudio('retired')
    const next = nextChapter(old)!
    expect(next.chapter).toBe(2)
    expect(next.day).toBe(old.day)
    expect(next.stage).toBe(0)
    expect(next.gameOver).toBe(false)
    expect(next.ending).toBeNull()
    expect(next.employees).toHaveLength(2)
    expect(next.employees.every((e) => e.founder && next.offices.some((o) => o.id === e.officeId))).toBe(true)
    expect(you(next)?.name).toBe(you(old)?.name)
    expect(next.research.done).toEqual(old.research.done)
    expect(next.money).toBe(seedMoney(old))
    expect(next.money).toBeLessThan(old.money)
    expect(next.reputation).toBe(48)
    expect(next.legacy).toMatchObject([{ studio: 'Copper Studios', ending: 'retired' }])
    expect(next.freshChapter).toBe(true)
    expect(next.rivals).toEqual(old.rivals)
  })

  it('after a bad ending leave you alone with half of it, a smaller name and the starting money', () => {
    const old = endedStudio('bankrupt')
    const next = nextChapter(old)!
    expect(next.employees).toHaveLength(1)
    expect(you(next)?.name).toBe(you(old)?.name)
    expect(next.research.done).toEqual(old.research.done.slice(0, 2))
    expect(next.money).toBeLessThan(10_000)
    expect(next.reputation).toBe(20)
  })

  it('gives every new thing an id the old world has not used, and survives a save', () => {
    const old = endedStudio('retired')
    const next = nextChapter(old)!
    const ids = [...next.offices.map((o) => o.id), ...next.employees.map((e) => e.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(old.nextId)
    expect(deserialize(serialize(next))).not.toBeNull()
  })
})
