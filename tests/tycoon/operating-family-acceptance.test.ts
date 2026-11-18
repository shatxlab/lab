import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { itemBlocker } from '@/lib/tycoon/sim/roadmap'
import { COMPANIONS } from '@/lib/tycoon/data/companions'
import { initialiseOperations, assignOperation, operationPreview, standingDay } from '@/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '@/lib/tycoon/sim/people-management'
import { companionEffects, companionHealthy, companionCoverage } from '@/lib/tycoon/sim/companions'
import { productsDay, interest } from '@/lib/tycoon/sim/products'
import { productService } from '@/lib/tycoon/sim/services'
import { scaleRequirements } from '@/lib/tycoon/sim/scale-readiness'
import { hostingCost, capacityOf } from '@/lib/tycoon/sim/scale'
import { costsDay } from '@/lib/tycoon/sim/economy'
import { workDay } from '@/lib/tycoon/sim/work'
import { teamDay } from '@/lib/tycoon/sim/teams'
import { serialize, deserialize } from '@/lib/tycoon/sim/state'
import { stage0Fixture } from './stage0-fixtures'
import { dayOfEra } from './helpers'

function setup(typeId: string) {
  const s = stage0Fixture('europe')
  s.day = dayOfEra(7)
  initialiseOperations(s); initialisePeopleManagement(s)
  const p = s.products[0]
  p.productTypeId = typeId
  p.users = PRODUCT_TYPES.find((t) => t.id === typeId)!.audience * 20
  p.reach = p.users; p.quality = 95; p.bugs = p.pendingBugs = 0
  p.releaseDay = s.day - 300; p.updates = [{ day: s.day }]
  return s
}

/** Production kernels, not the global clock: no event choices, macro economy, morale or career policy are
 * silently answered here. Work uses real employee contributions, variance, payroll and minimum release time;
 * no target/progress injection. Full unattended acceptance remains a separate Stage 7 requirement.
 */
function deliver(s: ReturnType<typeof setup>, index = 0) {
  let days = 0
  while (s.offices[index].project && days < 720) {
    s.day++; days++; s.dayWork = []
    workDay(s); teamDay(s); standingDay(s); costsDay(s)
    expect(new Set(s.dayWork.map((w) => w.employeeId)).size).toBe(s.dayWork.length)
  }
  expect(s.offices[index].project, 'must finish with this floor, not borrowed helpers').toBeNull()
  expect(days).toBeGreaterThan(0)
  expect(days).toBeLessThan(720)
  expect(s.offices[index].assignment).toEqual({ kind: 'idle' })
  return days
}

for (const type of PRODUCT_TYPES) describe(`${type.name} operating acceptance`, () => {
  it('pays the exact growth preview, retains scope/progress on reload and grows without gifting server capacity', () => {
    let s = setup(type.id)
    const p = s.products[0], office = s.offices[0]
    const proposal = { kind: 'grow' as const, id: 'medium' }
    const preview = operationPreview(s, office, p, proposal)
    expect(preview.blocker).toBeNull()
    expect(Number.isFinite(preview.days)).toBe(true)
    expect(preview.cash).toBeGreaterThan(0)
    const money = s.money, servers = capacityOf(p)
    expect(assignOperation(s, office.id, { kind: 'initiative', productId: p.id, proposal }).ok).toBe(true)
    expect(s.money).toBe(money - preview.cash)
    s.day++; s.dayWork = []; workDay(s)
    const progress = { ...office.project!.progress }
    s = deserialize(serialize(s))!
    expect(s.offices[0].project!.progress).toEqual(progress)
    expect(s.offices[0].project!.target).toEqual(preview.target)
    deliver(s)
    expect(s.products[0].size).toBe('medium')
    expect(capacityOf(s.products[0])).toBe(servers)
    expect(s.offices[1].assignment).toEqual({ kind: 'idle' })
    const companion = COMPANIONS.find((c) => c.suits.includes(type.id))!
    expect(operationPreview(s, s.offices[0], s.products[0], { kind: 'item', id: `companion:${companion.id}` }).blocker).toBeNull()
  })

  it('rejects unaffordable reassignment atomically and warns when traffic outgrows finite reliability', () => {
    const s = setup(type.id), p = s.products[0], office = s.offices[0]
    expect(assignOperation(s, office.id, { kind: 'standing', productId: p.id, service: 'reliability' }).ok).toBe(true)
    s.money = 0
    const before = serialize(s)
    const choice = { kind: 'initiative' as const, productId: p.id, proposal: { kind: 'grow' as const, id: 'medium' } }
    expect(operationPreview(s, office, p, choice.proposal).blocker).not.toBeNull()
    expect(assignOperation(s, office.id, choice, true).ok).toBe(false)
    expect(serialize(s)).toBe(before)
    const output = productService(s, p, 'reliability').provided
    p.users = 1e12
    const stressed = productService(s, p, 'reliability')
    expect(stressed.provided).toBe(output)
    expect(stressed.demand).toBeGreaterThan(output)
    expect(stressed.headroom).toBeLessThan(0)
    expect(stressed.risk).not.toBeNull()
    expect(scaleRequirements(s).find((r) => r.id === 'shared_reliability')?.met).toBe(false)
    expect(s.stage).toBe(5) // Neglect delays the next chapter, not an earned-title rollback.
  })

  it('opens suitable companion work through earned scope without deleting the old traffic or legacy path', () => {
    const s = setup(type.id), p = s.products[0]
    const companion = COMPANIONS.find((c) => c.suits.includes(type.id))!
    const item = getWorkItem(`companion:${companion.id}`)!
    p.users = 1
    expect(itemBlocker(s, p, item)).toMatch(/Needs Medium product scope or 300,000 users/)
    for (const size of ['medium', 'large', 'flagship'] as const) {
      p.size = size
      expect(itemBlocker(s, p, item)).toBeNull()
    }
    p.size = 'small'; p.users = 300_000
    expect(itemBlocker(s, p, item)).toBeNull()
    p.size = 'medium'; p.users = 1
    for (const office of s.offices) delete office.assignment
    expect(itemBlocker(s, p, item)).toBe('From 300,000 users')
  })

  it('loses neglected companion value, retains assets/billing, and recovers only after staffing and a real release', () => {
    let s = setup(type.id)
    const p = s.products[0]
    p.size = 'medium' // Declared mature fixture; the growth case above earns this scope through real work.
    const companion = COMPANIONS.find((c) => c.suits.includes(type.id))!
    expect(companion).toBeDefined()
    expect(assignOperation(s, s.offices[0].id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: `companion:${companion.id}` } })).toEqual({ ok: true })
    deliver(s)
    let c = s.products.find((product) => product.companionId === companion.id)!
    expect(c).toBeDefined()
    const release = c.updates.length ? c.updates.at(-1)!.day : c.releaseDay
    const paidMoney = s.money
    // Products + standing-work kernels: 400 days without a team or release, not a shortcut setting age/bugs.
    for (let day = 0; day < 400; day++) {
      s.day++; s.dayWork = []
      productsDay(s); standingDay(s); costsDay(s)
    }
    expect(s.money).toBeLessThan(paidMoney)
    expect(interest(c, s.day)).toBeLessThan(0.6)
    expect(companionHealthy(s, c)).toBe(false)
    expect(companionCoverage(s)).toBe(0)
    expect(companionEffects(s)).toEqual({ reach: 0, retention: 0, pay: 0 })
    expect(hostingCost(s)).toBeGreaterThan(0)
    expect(s.products.map((product) => product.id)).toContain(c.id)
    expect(s.offices.every((office) => office.assignment?.kind === 'idle' && !office.project)).toBe(true)
    s = deserialize(serialize(s))!; c = s.products.find((product) => product.id === c.id)!
    expect(assignOperation(s, s.offices[0].id, { kind: 'standing', productId: p.id, service: 'reliability' }).ok).toBe(true)
    for (let day = 0; day < 4000 && s.products.some((product) => product.bugs > 0); day++) {
      s.day++; s.dayWork = []; standingDay(s); costsDay(s)
    }
    expect(s.products.every((product) => product.bugs === 0)).toBe(true)
    expect(companionCoverage(s)).toBeGreaterThan(0)
    expect(companionEffects(s)).toEqual({ reach: 0, retention: 0, pay: 0 }) // Care does not refresh stale products.
    expect(c.updates.length ? c.updates.at(-1)!.day : c.releaseDay).toBe(release)
    expect(assignOperation(s, s.offices[1].id, { kind: 'initiative', productId: c.id, proposal: { kind: 'polish', id: 'polish' } }).ok).toBe(true)
    deliver(s, 1)
    expect(companionHealthy(s, c)).toBe(true)
    const effects = companionEffects(s)
    expect(effects.reach + effects.retention + effects.pay).toBeGreaterThan(0)
    expect(s.offices[0].assignment?.kind).toBe('standing')
    expect(scaleRequirements(s).find((r) => r.id === 'operating_health')?.met).toBe(false) // The flagship still needs its own fresh release.
  })
})

it.each(['type', 'era', 'reputation', 'knowledge'] as const)('the low-volume scope route does not bypass AI companion %s gates', (gate) => {
  const s = setup('data_platform'), p = s.products[0]
  p.size = 'medium'; p.users = 1000
  const item = getWorkItem('companion:ai_assistant')!
  expect(itemBlocker(s, p, item)).toBeNull()
  if (gate === 'type') p.productTypeId = 'game'
  if (gate === 'era') s.day = 0
  if (gate === 'reputation') s.reputation = 69
  if (gate === 'knowledge') s.research.done = s.research.done.filter((id) => id !== 'ml_foundations')
  expect(itemBlocker(s, p, item)).toMatch(gate === 'type' ? /Does not suit/ : gate === 'era' ? /Not until/ : gate === 'reputation' ? /Reputation 70/ : /Machine learning/)
})
