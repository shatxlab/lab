import { describe, expect, it } from 'vitest'
import { createAutosave, importSave, loadGame, type KeyValueStorage } from '@/lib/tycoon/save'
import { createStore } from '@/lib/tycoon/store'
import { AUDIENCES } from '@/lib/tycoon/data/audiences'
import { FEATURES } from '@/lib/tycoon/data/features'
import { getResearch, RESEARCH } from '@/lib/tycoon/data/research'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { initialiseOperations, assignOperation } from '@/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '@/lib/tycoon/sim/people-management'
import { knowsResearch, learnedResearchIds, researchTransferPreview } from '@/lib/tycoon/sim/research-knowledge'
import { researchBlocker, researchDay, startResearch, studyTargets } from '@/lib/tycoon/sim/research'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { surveyAudience } from '@/lib/tycoon/sim/insight'
import { licenseBlocker } from '@/lib/tycoon/sim/licensing'
import { onCallUnlocked } from '@/lib/tycoon/sim/fixes'
import { autoPromoteUnlocked } from '@/lib/tycoon/sim/lifecycle'
import { serviceOutput } from '@/lib/tycoon/sim/services'
import { createInitialState, deserialize, serialize, STATE_VERSION } from '@/lib/tycoon/sim/state'
import { featureLock, isResearched } from '@/lib/tycoon/sim/unlocks'
import { STATS, type Ending } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'
import { makeProduct } from './helpers'

const all = RESEARCH.filter((n) => !n.repeatable).map((n) => n.id)
function ended(kind: Ending['kind'] = 'retired') {
  const s = createInitialState(17)
  s.day = 6000; s.money = 1_000_000; s.reputation = 100
  s.research.done = [...all]
  s.research.known = [...all]
  s.gameOver = true
  s.ending = { kind, day: s.day, worth: s.money }
  return s
}

describe('research knowledge versus active company practice', () => {
  it('classifies every saved ID explicitly, with only the intended mixed/repeatable nodes', () => {
    expect(RESEARCH.every((n) => ['knowledge', 'practice', 'mixed', 'study'].includes(n.carry))).toBe(true)
    expect(RESEARCH.filter((n) => n.carry === 'mixed').map((n) => n.id)).toEqual(['ux_research'])
    expect(RESEARCH.filter((n) => n.carry === 'study').map((n) => n.id)).toEqual(['audience_study'])
    expect(RESEARCH.filter((n) => n.carry === 'knowledge').every((n) => n.effects.length === 0)).toBe(true)
  })

  it.each(['sold', 'retired', 'ipo', 'bankrupt', 'ousted'] as const)('keeps all learning after %s without carrying company multipliers', (kind) => {
    const s = ended(kind), before = serialize(s)
    const next = nextChapter(s)!
    expect(next.research.known).toEqual(all)
    expect(next.research.done).toEqual(RESEARCH.filter((n) => n.carry === 'knowledge').map((n) => n.id))
    for (const stat of STATS) expect(statMultiplier(next, stat), stat).toBe(1)
    expect(next.research.active).toBeNull()
    expect(serialize(s)).toBe(before)
    expect(deserialize(serialize(next))!.research).toEqual(next.research)
  })

  it.each(['sold', 'retired', 'ipo', 'bankrupt', 'ousted'] as const)('restores the explicit next-venture decision when resuming %s', (kind) => {
    const data = new Map<string, string>()
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
    expect(importSave(serialize(ended(kind)), storage).ok).toBe(true)
    const s = loadGame(storage)!, before = serialize(s)
    const store = createStore(s, 0)
    const autosave = createAutosave(store, storage)
    store.version.value += 1
    autosave.flush(); autosave.stop()
    expect(loadGame(storage)!.research.known).toEqual(all)
    expect(loadGame(storage)!.ending?.kind).toBe(kind)
    expect(store.dialog.value).toEqual({ kind: 'game-over' })
    expect(serialize(s)).toBe(before)
    expect(store.speed.value).toBe(0)
  })

  it('retains mixed UX accessibility permission without granting the old lab speed', () => {
    const next = nextChapter(ended())!
    expect(knowsResearch(next, 'ux_research')).toBe(true)
    expect(isResearched(next, 'ux_research')).toBe(false)
    expect(featureLock(next, FEATURES.find((f) => f.id === 'a11y')!)).toBeNull()
    expect(statMultiplier(next, 'designSpeed')).toBe(1)
    next.money = 100_000
    const node = getResearch('ux_research')!, money = next.money
    expect(startResearch(next, node.id).ok).toBe(true)
    expect(next.money).toBe(money - node.cost)
    next.day = next.research.active!.finishDay
    researchDay(next)
    expect(statMultiplier(next, 'designSpeed')).toBe(1.08)
    expect(next.research.known.filter((id) => id === node.id)).toHaveLength(1)
  })

  it('does not reactivate service, licensing, payroll or promotion from a known blueprint', () => {
    const s = stage0Fixture('europe')
    initialiseOperations(s)
    s.research.known = [...all]; s.research.done = []
    const output = serviceOutput(s, s.offices[0], 'reliability')
    expect(autoPromoteUnlocked(s)).toBe(false)
    expect(onCallUnlocked(s)).toBe(false)
    expect(statMultiplier(s, 'wage')).toBe(1)
    expect(licenseBlocker(s, makeProduct({ size: 'flagship' }))).toMatch(/Research/)
    s.research.done.push('incident_management')
    expect(serviceOutput(s, s.offices[0], 'reliability')).toBeCloseTo(output * 1.1)
  })

  it('requires prerequisite company practices active here, but accepts learned theory for theory research', () => {
    const next = nextChapter(ended())!
    next.stage = 3; next.money = 100_000
    expect(researchBlocker(next, getResearch('ci_pipeline_2')!)).toMatch(/Needs Code review/)
    expect(researchBlocker(next, getResearch('code_review')!)).toMatch(/Needs CI engineering practice/)
    expect(researchBlocker(next, getResearch('ml_foundations')!)).toBe('Done')
    // A newly learned architecture topic may build on known methods, not invented deployed facilities.
    next.research.known = next.research.known.filter((id) => id !== 'spatial_computing')
    next.research.done = next.research.done.filter((id) => id !== 'spatial_computing')
    expect(researchBlocker(next, getResearch('spatial_computing')!)).toBeNull()
    expect(statMultiplier(next, 'engineeringSpeed')).toBe(1)
  })

  it('retains inactive blueprints over several ventures, rather than forgetting what was not re-established', () => {
    const first = nextChapter(ended())!
    first.gameOver = true; first.ending = { kind: 'bankrupt', day: first.day, worth: 0 }
    const second = nextChapter(deserialize(serialize(first))!)!
    expect(second.research.known).toEqual(all)
    expect(isResearched(second, 'ci_pipeline')).toBe(false)
    expect(knowsResearch(second, 'ci_pipeline')).toBe(true)
  })

  it('preserves both paid and insight audience results, but not unfinished research or fictitious repeatable completion', () => {
    const s = createInitialState(4)
    s.stage = 2; s.day = 2000; s.reputation = 100; s.money = 1_000_000; s.insight = 1000
    s.research.done = ['marketing_dept', 'user_research']
    const targets = AUDIENCES.filter((a) => a.productTypeId === 'web_app').map((a) => a.id)
    expect(surveyAudience(s, targets[0]).ok).toBe(true)
    expect(startResearch(s, 'audience_study', targets[1]).ok).toBe(true)
    s.day = s.research.active!.finishDay; researchDay(s)
    expect(startResearch(s, 'audience_study', studyTargets(s)[0]).ok).toBe(true)
    s.gameOver = true; s.ending = { kind: 'bankrupt', day: s.day, worth: 0 }
    const next = nextChapter(s)!
    expect(next.surveyed).toEqual(targets.slice(0, 2))
    expect(next.surveyed).not.toBe(s.surveyed)
    expect(next.research.known).not.toContain('audience_study')
    expect(next.research.active).toBeNull()
    expect(next.research.done).not.toContain('audience_study')
    expect(deserialize(serialize(next))!.surveyed).toEqual(next.surveyed)
  })

  it('makes the pre-commit preview pure and identical to actual transfer, without charging re-establishment automatically', () => {
    const s = ended(), before = serialize(s), preview = researchTransferPreview(s)
    expect(preview.knowledge.some((n) => n.id === 'ux_research')).toBe(true)
    expect(preview.practices.some((n) => n.id === 'ux_research')).toBe(true)
    expect(preview.known).toHaveLength(all.length)
    expect(serialize(s)).toBe(before)
    const next = nextChapter(s)!
    expect(next.research.known).toEqual(preview.known)
    expect(next.research.done).toEqual(preview.knowledge.filter((n) => n.carry === 'knowledge').map((n) => n.id))
    expect(next.money).toBe(15_000) // Original seed-money formula, no blueprint charges.
  })
})

describe('v11 research persistence', () => {
  it('migrates v10 active benefits and paid work without reinitialising staff, assignments or RNG', () => {
    const s = stage0Fixture('europe')
    initialiseOperations(s); initialisePeopleManagement(s)
    assignOperation(s, s.offices[0].id, { kind: 'initiative', productId: s.signatureId!, proposal: { kind: 'polish', id: 'polish' } })
    s.offices[0].project!.progress.engineering = 17
    s.research.done = all.filter((id) => id !== 'ci_pipeline_3')
    s.research.active = { id: 'ci_pipeline_3', finishDay: s.day + 100, remainingWork: 13.5 }
    const raw = JSON.parse(serialize(s)); raw.version = 10; delete raw.research.known
    const loaded = deserialize(JSON.stringify(raw))!
    expect(loaded.version).toBe(STATE_VERSION)
    expect(loaded.research.done).toEqual(s.research.done)
    expect(loaded.research.known).toEqual(s.research.done)
    expect(loaded.research.active).toEqual(s.research.active)
    for (const stat of STATS) expect(statMultiplier(loaded, stat)).toBe(statMultiplier(s, stat))
    expect(loaded.employees).toEqual(s.employees)
    expect(loaded.offices).toEqual(s.offices)
    expect(loaded.peopleManagement).toEqual(s.peopleManagement)
    expect(loaded.rng).toBe(s.rng); expect(loaded.money).toBe(s.money)
    expect(deserialize(serialize(loaded))!.research).toEqual(loaded.research)
  })

  it.each([undefined, null, 'all', [3], ['ci_pipeline', 'ci_pipeline'], ['audience_study']])('rejects malformed current-version knowledge: %j', (known) => {
    const raw = JSON.parse(serialize(createInitialState(1)))
    raw.research.known = known
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })

  it('keeps future-content removal tolerance for string IDs without inventing completed knowledge', () => {
    const raw = JSON.parse(serialize(createInitialState(1)))
    raw.research.known = ['ci_pipeline', 'removed_later']
    const loaded = deserialize(JSON.stringify(raw))!
    expect(loaded.research.known).toEqual(['ci_pipeline'])
    expect(loaded.research.done).toEqual([])
    expect(learnedResearchIds(loaded)).toEqual(['ci_pipeline'])
  })
})
