import { describe, expect, it } from 'vitest'
import { RESEARCH } from '@/lib/tycoon/data/research'
import { createStore } from '@/lib/tycoon/store'
import { assignOperation, initialiseOperations, operationPreview, operationChoices, reassignmentCost } from '@/lib/tycoon/sim/operations'
import { helpersOf, assignTeam } from '@/lib/tycoon/sim/offices'
import { productService, operatingGrowth } from '@/lib/tycoon/sim/services'
import { updateFit } from '@/lib/tycoon/sim/project'
import { researchDay, startResearch } from '@/lib/tycoon/sim/research'
import { startDeepWork } from '@/lib/tycoon/sim/deepwork'
import { advanceDay } from '@/lib/tycoon/sim/tick'
import { workDay } from '@/lib/tycoon/sim/work'
import { teamDay } from '@/lib/tycoon/sim/teams'
import { standingDay } from '@/lib/tycoon/sim/operations'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'
import { makeProduct } from './helpers'

function setup() {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.exit.ipoAcknowledged = true
  s.exit.closed = true
  return s
}
const polish = (id: number) => ({ kind: 'initiative' as const, productId: id, proposal: { kind: 'polish' as const, id: 'polish' } })

describe('parallel operations', () => {
  it('leaves every floor explicitly idle with no global choice or hidden helpers', () => {
    const s = setup()
    expect(s.offices.map((o) => o.assignment)).toEqual([{ kind: 'idle' }, { kind: 'idle' }])
    for (let i = 0; i < 20; i++) advanceDay(s)
    expect(s.offices.every((o) => !o.project)).toBe(true)
    expect(s.plan).toBeUndefined()
    expect(helpersOf(s, s.offices[0])).toEqual([])
  })

  it('runs finite A alongside reliability B, with every worker accounted for once', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    p.bugs = 80
    expect(assignOperation(s, a.id, polish(p.id)).ok).toBe(true)
    expect(assignOperation(s, b.id, { kind: 'standing', productId: p.id, service: 'reliability' }).ok).toBe(true)
    const before = p.bugs
    workDay(s); standingDay(s)
    expect(p.bugs).toBeLessThan(before)
    const ids = s.dayWork.map((w) => w.employeeId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(s.employees.filter((e) => e.role !== 'analyst' && e.role !== 'pm').length)
    expect(a.project!.progress.engineering).toBeGreaterThan(0)
    expect(b.project).toBeNull()
  })

  it('changing another floor’s staffing does not inflate A’s target or ETA', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    const before = operationPreview(s, a, p, polish(p.id).proposal)
    s.employees = s.employees.filter((e) => e.officeId === a.id)
    const after = operationPreview(s, a, p, polish(p.id).proposal)
    expect(after.target).toEqual(before.target)
    expect(after.days).toEqual(before.days)
  })

  it('finishes A into idle and keeps B assigned without another click or modal', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    assignOperation(s, a.id, polish(p.id))
    assignOperation(s, b.id, { kind: 'standing', productId: p.id, service: 'reliability' })
    for (const d of DISCIPLINES) a.project!.progress[d] = a.project!.target[d]
    teamDay(s)
    expect(a.assignment).toEqual({ kind: 'idle' })
    expect(b.assignment?.kind).toBe('standing')
    expect(s.events.some((e) => e.type === 'released')).toBe(false)
    expect(s.businessDecisions?.[0].after).toBeDefined()
    teamDay(s)
    expect(a.project).toBeNull()
  })

  it('reserves unique work and assigns versions in completion order with correct attribution', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    expect(assignOperation(s, a.id, polish(p.id)).ok).toBe(true)
    expect(assignOperation(s, b.id, polish(p.id)).ok).toBe(false)
    const choice = operationChoices(s, p, b).find((c) => c.kind === 'item')!
    expect(assignOperation(s, b.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: choice.id } }).ok).toBe(true)
    for (const o of [a, b]) for (const d of DISCIPLINES) o.project!.progress[d] = o.project!.target[d]
    teamDay(s)
    expect(p.releases).toHaveLength(2)
    expect(p.releases![0].version).not.toBe(p.releases![1].version)
    expect(p.releases![0].by).not.toBe(p.releases![1].by)
    expect(p.releases![1].title).not.toBe('Stability')
    expect(s.businessDecisions?.every((entry) => entry.after)).toBe(true)
  })

  it('does not erase an earlier item’s additive fit effect when a parallel release completes', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    assignOperation(s, a.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: 'ads' } })
    assignOperation(s, b.id, polish(p.id))
    for (const o of [a, b]) for (const d of DISCIPLINES) o.project!.progress[d] = o.project!.target[d]
    const base = updateFit(s, p, b.project!, 70)
    p.built = [...p.built!, 'ads']
    expect(updateFit(s, p, b.project!, 70)).toBeCloseTo(base - 2)
    p.built = p.built.filter((id) => id !== 'ads')
    teamDay(s)
    expect(p.built).toContain('ads')
    expect(p.releases).toHaveLength(2)
  })

  it('requires confirmation to abandon progress; rejected replacement preserves everything', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    assignOperation(s, a.id, polish(p.id)); workDay(s)
    const before = JSON.stringify(a)
    expect(reassignmentCost(a)).toMatch(/not refunded/)
    expect(assignOperation(s, a.id, { kind: 'idle' }).ok).toBe(false)
    expect(JSON.stringify(a)).toBe(before)
    expect(assignOperation(s, a.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: 'not-real' } }, true).ok).toBe(false)
    expect(JSON.stringify(a)).toBe(before)
    const money = s.money
    expect(assignOperation(s, a.id, { kind: 'idle' }, true).ok).toBe(true)
    expect(a.project).toBeNull()
    expect(s.money).toBe(money)
  })

  it('reports missing disciplines instead of starting an infinite build', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    s.employees = s.employees.filter((e) => e.role === 'analyst')
    expect(operationPreview(s, a, p, polish(p.id).proposal).blocker).toMatch(/Missing build skills/)
    expect(assignOperation(s, a.id, polish(p.id)).ok).toBe(false)
    expect(a.assignment).toEqual({ kind: 'idle' })
  })

  it('caps shared growth output and preserves unstaffed organic growth', () => {
    const s = setup(), p = s.products[0]
    expect(operatingGrowth(s, p)).toBe(0)
    for (const a of s.offices) assignOperation(s, a.id, { kind: 'standing', productId: p.id, service: 'growth' })
    expect(operatingGrowth(s, p)).toBeGreaterThan(0)
    expect(operatingGrowth(s, p)).toBeLessThanOrEqual(0.25)
    expect(productService(s, p, 'reliability').risk).not.toBeNull()
  })

  it('keeps choice/results disclosures nonblocking and manual pause / event decisions blocking', () => {
    const s = setup(), store = createStore(s)
    store.openDialog({ kind: 'studio', tab: 'company' })
    expect(store.running()).toBe(true)
    const before = s.day
    for (let i = 0; i < 20; i++) store.tick(100)
    expect(s.day).toBeGreaterThan(before)
    store.openDialog({ kind: 'release-card', productId: s.products[0].id })
    expect(store.running()).toBe(true)
    store.setSpeed(0); expect(store.running()).toBe(false)
    store.setSpeed(1); store.openDialog({ kind: 'event' }); expect(store.running()).toBe(false)
  })

  it('does not allow remote team reassignment to silently bypass floor accounting', () => {
    const s = setup()
    expect(assignTeam(s, s.employees[1].id, s.offices[1].id).ok).toBe(false)
  })

  it('lets deep work coexist, excluding the founder from staffed research', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    assignOperation(s, a.id, { kind: 'standing', productId: p.id, service: 'research' })
    const before = productService(s, p, 'research').provided
    expect(startDeepWork(s, 'signature').ok).toBe(true)
    expect(productService(s, p, 'research').provided).toBeLessThan(before)
  })
})

describe('staffed research', () => {
  it('works with analysts only, charges once, stalls on reassignment, and resumes', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    s.research.done = []
    s.employees = s.employees.filter((e) => e.role === 'analyst')
    const node = RESEARCH.find((n) => !n.requires.length && !n.repeatable && (n.era ?? 0) <= 10)!
    expect(startResearch(s, node.id).ok).toBe(false)
    expect(assignOperation(s, a.id, { kind: 'standing', productId: p.id, service: 'research' }).ok).toBe(true)
    const money = s.money
    expect(startResearch(s, node.id).ok).toBe(true)
    expect(s.money).toBe(money - node.cost)
    s.day++; researchDay(s)
    const left = s.research.active!.remainingWork!
    expect(left).toBeLessThan(node.days)
    assignOperation(s, a.id, { kind: 'idle' }, true)
    for (let i = 0; i < node.days + 5; i++) { s.day++; researchDay(s) }
    expect(s.research.active!.remainingWork).toBe(left)
    assignOperation(s, a.id, { kind: 'standing', productId: p.id, service: 'research' })
    for (let i = 0; i < node.days * 5 && s.research.active; i++) { s.day++; researchDay(s) }
    expect(s.research.done).toContain(node.id)
    expect(s.money).toBe(money - node.cost)
  })
})

describe('v8 persistence boundary', () => {
  it('migrates paid v7 builds and absolute progress, clears global plan/remote helpers, preserves side products', () => {
    const s = stage0Fixture('europe'), a = s.offices[0], p = s.products[0]
    s.products.push(makeProduct({ id: s.nextId++, hit: true, role: 'side' }))
    initialiseOperations(s); assignOperation(s, a.id, polish(p.id))
    const id = a.project!.id
    a.project!.progress.engineering = 11
    a.project!.target.engineering *= 50
    s.version = 7
    for (const o of s.offices) delete o.assignment
    s.employees[1].teamId = s.offices[1].id
    s.plan = { clarity: 80, cards: [] }
    const restored = deserialize(serialize(s))!
    expect(restored.version).toBe(10)
    expect(restored.plan).toBeUndefined()
    expect(restored.employees.every((e) => e.teamId === undefined)).toBe(true)
    expect(restored.offices[0].assignment?.kind).toBe('initiative')
    expect(restored.offices[0].project!.id).toBe(id)
    expect(restored.offices[0].project!.progress.engineering).toBe(11)
    expect(restored.offices[0].project!.target.engineering).toBeLessThan(a.project!.target.engineering)
    expect(restored.products).toEqual(s.products)
    expect(deserialize(serialize(restored))!.offices).toEqual(restored.offices)
  })

  it('round-trips standing assignments and rejects dangling, malformed and double-booked values', () => {
    const s = setup(), a = s.offices[0]
    assignOperation(s, a.id, { kind: 'standing', service: 'research', productId: s.products[0].id })
    expect(deserialize(serialize(s))!.offices).toEqual(s.offices)
    const raw = JSON.parse(serialize(s))
    raw.offices[0].assignment.productId = 999999
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    raw.offices[0].assignment = { kind: 'idle', queue: [] }
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    raw.offices[0].assignment = { kind: 'initiative', projectId: 1, productId: s.products[0].id, startedDay: 0, proposal: { kind: 'polish', id: 'polish' } }
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})
