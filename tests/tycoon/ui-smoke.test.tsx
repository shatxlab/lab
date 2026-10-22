// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AbsorbDialog } from '@/components/tycoon/AbsorbDialog'
import { StoreContext } from '@/components/tycoon/context'
import { EmployeeDialog } from '@/components/tycoon/EmployeeDialog'
import { IndustryTab } from '@/components/tycoon/IndustryTab'
import { NewProjectDialog } from '@/components/tycoon/NewProjectDialog'
import { ProductsTab } from '@/components/tycoon/ProductsTab'
import { ResearchDialog } from '@/components/tycoon/ResearchDialog'
import { TeamDialog } from '@/components/tycoon/TeamDialog'
import { JourneyTab } from '@/components/tycoon/JourneyTab'
import { MilestonesTab } from '@/components/tycoon/MilestonesTab'
import { ANALYST_RESEARCH, generateAnalyst, PM_RESEARCH, refreshCandidates } from '@/lib/tycoon/sim/hiring'
import { contractsDay, ENTERPRISE_RESEARCH } from '@/lib/tycoon/sim/contracts'
import { openOffice } from '@/lib/tycoon/sim/offices'
import { rivalProductsOf } from '@/lib/tycoon/sim/rivals'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { createStore } from '@/lib/tycoon/store'
import { LICENSING_RESEARCH } from '@/lib/tycoon/sim/licensing'
import type { ReactNode } from 'react'
import { makeProduct } from './helpers'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

/** A rich mid-game studio: Europe open, an analyst and a PM, studied audiences, a localised and a licensed product, an enterprise offer. */
function richStore() {
  const state = createInitialState(9)
  state.money = 5_000_000
  state.day = 1500
  state.stage = 3
  state.reputation = 80
  state.offices[0].kind = 'office'
  state.research.done.push(ANALYST_RESEARCH, PM_RESEARCH, ENTERPRISE_RESEARCH, LICENSING_RESEARCH, 'marketing_automation', 'incident_management')
  openOffice(state)
  state.insight = 120
  state.surveyed.push('web_business')
  refreshCandidates(state)
  state.products.push(
    makeProduct({ id: 501, name: 'Anchor', size: 'large', audienceId: 'web_business', featureIds: ['payments', 'accounts'], releaseDay: 900, updates: [{ day: 1480 }], reach: 40_000, users: 30_000, euShare: 0.3, euUsers: 8000, hit: true }),
    makeProduct({ id: 502, name: 'Titan', size: 'flagship', releaseDay: 700, updates: [{ day: 1490 }], reach: 60_000, users: 50_000, licensed: true }),
  )
  const analyst = { ...generateAnalyst(state), officeId: state.offices[0].id, hiredDay: 0, level: 2, levelDay: 0, analysis: 80 }
  state.employees.push(analyst)
  contractsDay(state)
  return createStore(state, 0)
}

function mount(store: ReturnType<typeof createStore>, ui: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<StoreContext.Provider value={store}>{ui}</StoreContext.Provider>))
  return host
}

describe('the tycoon screens render for a studio with everything in play', () => {
  it('the team dialog, with offices in two regions, an analyst and candidates from both', () => {
    const store = richStore()
    const host = mount(store, <TeamDialog />)
    expect(host.textContent).toContain('Europe')
    expect(host.textContent).toContain('Insight')
    expect(host.textContent).toContain('Make product manager')
  })

  it('the products tab, with a localised product, a licensed flagship and a localise button', () => {
    const store = richStore()
    store.state.products.push(makeProduct({ id: 503, name: 'Plain', releaseDay: 1000, updates: [{ day: 1480 }] }))
    const host = mount(store, <ProductsTab />)
    expect(host.textContent).toContain('Anchor')
    expect(host.textContent).toContain('Europe')
    expect(host.textContent).toContain('Localise for Europe')
    expect(host.textContent).toContain('Licensed')
  })

  it('the industry tab, with a Europe column and absorb buttons', () => {
    const store = richStore()
    const host = mount(store, <IndustryTab />)
    expect(host.textContent).toContain('Absorb')
    expect(host.textContent).toContain('Europe')
  })

  it('the absorb dialog lists the products to keep and the price', () => {
    const store = richStore()
    const rival = store.state.rivals.find((r) => (r.region ?? 'us') === 'us')!
    const host = mount(store, <AbsorbDialog rivalId={rival.id} />)
    expect(host.textContent).toContain(`Absorb ${rival.name}`)
    expect(host.textContent).toContain(rivalProductsOf(store.state, rival)[0].name)
    const confirm = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Absorb')!
    act(() => confirm.click())
    expect(store.state.rivals.some((r) => r.id === rival.id)).toBe(false)
  })

  it('the new project dialog, with studied audience tags, a budget and enterprise work', () => {
    const store = richStore()
    const host = mount(store, <NewProjectDialog />)
    expect(host.textContent).toContain('Budget')
    const client = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Client work'))
    expect(client).toBeDefined()
    act(() => client!.click())
    expect(host.textContent).toContain('enterprise')
  })

  it('the new project dialog for a studied audience shows its tastes', () => {
    const store = richStore()
    const host = mount(store, <NewProjectDialog />)
    const web = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Web App'))!
    act(() => web.click())
    const audience = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Small businesses'))
    expect(audience).toBeDefined()
    act(() => audience!.click())
    expect(host.textContent).toMatch(/loved/)
    expect(host.textContent).toContain('small businesses love the ones at the top')
    // The first feature they can pick is one they love.
    const first = host.querySelector('.features .feature:not(.locked)')!
    expect(first.textContent).toContain('loved')
  })

  it('the team dialog hires in the region with room, and says what a product manager adds', () => {
    const store = richStore()
    const host = mount(store, <TeamDialog />)
    expect(host.textContent).toMatch(/Europe · \d+ free desks/)
    const europe = [...host.querySelectorAll<HTMLButtonElement>('.segmented button')].find((b) => b.textContent?.startsWith('Europe'))!
    act(() => europe.click())
    expect(host.textContent).toContain('these are from Europe')
    expect(host.textContent).toContain('Works on')
  })

  it('the products tab shows the team that looks after a product, and the next release can be queued', () => {
    const store = richStore()
    store.state.offices[0].productId = 501
    store.state.offices[0].direction = 'grow'
    const host = mount(store, <ProductsTab />)
    expect(host.textContent).toContain('Direction')
    expect(host.textContent).toContain('Next release: nothing queued')
    act(() => root?.unmount())
    const queue = mount(store, <NewProjectDialog updateOf={501} queue />)
    expect(queue.textContent).toContain('Next release of Anchor')
    const feature = [...queue.querySelectorAll<HTMLInputElement>('.feature input')].find((i) => !i.disabled)!
    act(() => feature.click())
    const button = [...queue.querySelectorAll('button')].find((b) => b.textContent === 'Queue for the next release')!
    act(() => button.click())
    expect(store.state.products.find((p) => p.id === 501)?.nextFeatures).toHaveLength(1)
  })

  it('the products tab says what a promotion pays back', () => {
    const store = richStore()
    const host = mount(store, <ProductsTab />)
    const promote = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Promote'))
    expect(promote).toBeDefined()
    act(() => promote!.click())
    expect(host.textContent).toMatch(/Pays back about|Loses money/)
  })

  it('the employee dialog for an analyst, and for a builder with experience', () => {
    const store = richStore()
    const analyst = store.state.employees.find((e) => e.role === 'analyst')!
    const host = mount(store, <EmployeeDialog id={analyst.id} />)
    expect(host.textContent).toContain('Analysis')
    const builder = store.state.employees.find((e) => e.role === 'developer')!
    builder.knowledge = { types: { web_app: 100 }, products: { '501': 60 } }
    act(() => root?.unmount())
    const next = mount(store, <EmployeeDialog id={builder.id} />)
    expect(next.textContent).toContain('Experience')
    expect(next.textContent).toContain('Anchor')
  })

  it('the research dialog, with the audience study picker', () => {
    const store = richStore()
    store.state.stage = 4
    const host = mount(store, <ResearchDialog />)
    expect(host.textContent).toContain('Audience study')
    expect(host.textContent).toContain('Enterprise sales')
  })

  it('the journey and milestones', () => {
    const store = richStore()
    store.state.stage = 5
    const journey = mount(store, <JourneyTab />)
    expect(journey.textContent).toContain('Tech giant')
    act(() => root?.unmount())
    const milestones = mount(store, <MilestonesTab />)
    expect(milestones.textContent).toContain('Across the Atlantic')
  })
})
