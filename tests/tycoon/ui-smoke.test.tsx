// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AbsorbDialog } from '@/components/tycoon/AbsorbDialog'
import { StoreContext } from '@/components/tycoon/context'
import { EmployeeDialog } from '@/components/tycoon/EmployeeDialog'
import { HitDashboard } from '@/components/tycoon/HitDashboard'
import { RoadmapDialog } from '@/components/tycoon/RoadmapDialog'
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
  state.stage = 4
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
    // It competes with the hit, Anchor, a web app.
    store.state.signatureId = 501
    store.state.rivalProducts.push({ ...rivalProductsOf(store.state, rival)[0], id: 9999, productTypeId: 'web_app' })
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
    store.state.offices[0].workstream = 'features'
    const host = mount(store, <ProductsTab />)
    expect(host.textContent).toContain('Focus (optional)')
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
    store.state.stage = 5
    const host = mount(store, <ResearchDialog />)
    expect(host.textContent).toContain('Audience study')
    expect(host.textContent).toContain('Enterprise sales')
  })

  it('the journey and milestones', () => {
    const store = richStore()
    store.state.stage = 6
    const journey = mount(store, <JourneyTab />)
    expect(journey.textContent).toContain('Global company')
    act(() => root?.unmount())
    const milestones = mount(store, <MilestonesTab />)
    expect(milestones.textContent).toContain('Across the Atlantic')
  })

  it('the hit dashboard shows users, income, servers and fit, and opens the roadmap', () => {
    const store = richStore()
    store.state.signatureId = 501
    store.state.products[0].fit = 82
    const host = mount(store, <HitDashboard />)
    expect(host.textContent).toContain('Anchor')
    expect(host.textContent).toContain('% full')
    expect(host.textContent).toContain('Income')
    expect(host.textContent).toContain('keeps')
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(store.dialog.value).toMatchObject({ kind: 'roadmap', productId: 501 })
  })

  it('the roadmap dialog ranks items, with the ones not on offer yet saying why', () => {
    const store = richStore()
    const host = mount(store, <RoadmapDialog productId={501} />)
    expect(host.textContent).toContain('Nothing planned')
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add')!.click())
    expect(store.state.products[0].roadmap?.length).toBe(1)
  })

  it('the move out of the garage lists the other products to keep or sell', () => {
    const store = richStore()
    store.state.offices = [store.state.offices[0]]
    store.state.offices[0].kind = 'garage'
    store.state.stage = 2
    store.state.signatureId = 501
    const host = mount(store, <TeamDialog />)
    expect(host.textContent).toContain('Your hit comes with you')
    expect(host.textContent).toContain('Titan')
  })
})
