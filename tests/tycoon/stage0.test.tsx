// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { StoreContext } from '@/components/tycoon/context'
import { FoundingDialog } from '@/components/tycoon/FoundingDialog'
import { IpoDialog } from '@/components/tycoon/IpoDialog'
import { StudioDialog } from '@/components/tycoon/StudioDialog'
import { TopBar } from '@/components/tycoon/TopBar'
import { FOUNDER_TABLE, founderCafeStation } from '@/lib/tycoon/render-support/cafe-desk'
import { WORKSTATIONS } from '@/lib/tycoon/render-support/workstations'
import { appearanceFor, employeeLook } from '@/lib/tycoon/render-support/characters'
import { IPO_PROFIT_DAYS } from '@/lib/tycoon/sim/balance'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { retireStudio } from '@/lib/tycoon/sim/exit'
import { companyOnlyFounding, foundStudio, you } from '@/lib/tycoon/sim/founding'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { createStore } from '@/lib/tycoon/store'
import { stage0Fixture, type Stage0Fixture } from './stage0-fixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { if (root) act(() => root?.unmount()); root = null; document.body.innerHTML = '' })
function render(content: React.ReactNode, store = createStore(createInitialState(1), 0)) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<StoreContext.Provider value={store}>{content}</StoreContext.Provider>))
  return host
}
function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
  expect(button, text).toBeDefined()
  act(() => button!.click())
}

describe('Stage 0 fixtures and persistent founder identity', () => {
  it.each<Stage0Fixture>(['cafe', 'one-floor', 'europe', 'large-company', 'ipo', 'continued'])('round-trips the %s fixture', (kind) => {
    const state = stage0Fixture(kind)
    expect(deserialize(serialize(state))).not.toBeNull()
    expect(new Set([...state.offices, ...state.employees, ...state.products].map((r) => r.id)).size).toBe(state.offices.length + state.employees.length + state.products.length)
  })

  it('preserves names and appearance across three successful chapter transitions and save reloads', () => {
    let state = stage0Fixture('cafe')
    const original = state.employees.map((e) => ({ name: e.name, look: appearanceFor(employeeLook(e)) }))
    for (let chapter = 2; chapter <= 4; chapter++) {
      const oldIds = state.employees.map((e) => e.id)
      retireStudio(state)
      state = deserialize(serialize(nextChapter(state)!))!
      expect(state.chapter).toBe(chapter)
      expect(state.employees.map((e) => e.id)).not.toEqual(oldIds)
      expect(state.employees.map((e) => ({ name: e.name, look: appearanceFor(employeeLook(e)) }))).toEqual(original)
      expect(foundStudio(state, 'A different person', `Studio ${chapter}`).ok).toBe(true)
      expect(you(state)?.name).toBe(original[0].name)
    }
  })

  it('keeps first-run and failed-restart naming, but only asks for the company after a successful chapter', () => {
    const state = stage0Fixture('continued')
    render(<FoundingDialog />, createStore(state, 0))
    expect(document.querySelectorAll('input')).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Your name')
    expect(document.body.textContent).toContain('Alex Okafor')
    expect(companyOnlyFounding(createInitialState(1))).toBe(false)
    state.legacy![0].ending = 'bankrupt'
    expect(companyOnlyFounding(state)).toBe(false)
  })

  it('keeps identity on a successful continuation even when the friend is absent', () => {
    const state = stage0Fixture('continued')
    state.employees = [you(state)!]
    expect(companyOnlyFounding(state)).toBe(true)
    foundStudio(state, 'New name', 'New studio')
    expect(you(state)?.name).toBe('Alex Okafor')
  })

  it('retains the old ID-based look without adding fields; rejects malformed new appearance data', () => {
    const state = stage0Fixture('cafe')
    expect(employeeLook(state.employees[0])).toBe(state.employees[0].id)
    const raw = JSON.parse(serialize(state))
    for (const value of [-1, 1.5, 'blue']) {
      raw.employees[0].appearanceSeed = value
      expect(deserialize(JSON.stringify(raw))).toBeNull()
    }
  })
})

describe('IPO discovery', () => {
  it('announces an eligible saved company immediately, but not again after acknowledgement and reload', () => {
    const state = stage0Fixture('ipo')
    const store = createStore(state, 0)
    expect(store.dialog.value?.kind).toBe('ipo')
    store.closeDialog()
    expect(state.exit.ipoAcknowledged).toBe(true)
    expect(state.gameOver).toBe(false)
    const reloaded = deserialize(serialize(state))!
    expect(createStore(reloaded, 0).dialog.value).toBeNull()
    render(<TopBar />, createStore(reloaded, 0))
    click('Ring the bell')
    expect(state.journal.filter((e) => e.kind === 'ipo.acknowledged')).toHaveLength(1)
  })

  it('does not lose eligibility when another saved decision must be shown first', () => {
    const state = stage0Fixture('ipo')
    state.exit.pending = { price: 1_000_000, bidder: 'Buyer' }
    const store = createStore(state, 0)
    expect(store.dialog.value?.kind).toBe('offer')
    expect(state.exit.ipoAcknowledged).toBeUndefined()
    store.closeDialog()
    expect(store.dialog.value?.kind).toBe('ipo')
  })

  it('notifies when the last requirement is reached while the clock runs', () => {
    const state = stage0Fixture('ipo')
    state.profitDays = IPO_PROFIT_DAYS - 1
    // Avoid an unrelated hit taking off or a planning pause while exercising the live clock.
    state.products[0].built = ['multi_cluster', 'db_sharding', 'load_balancer', 'cdn']
    state.offices.forEach((o) => { delete o.productId })
    const store = createStore(state, 1)
    for (let i = 0; i < 40 && store.dialog.value === null; i++) store.tick(250)
    expect(state.profitDays).toBeGreaterThanOrEqual(IPO_PROFIT_DAYS)
    expect(store.dialog.value?.kind).toBe('ipo')
  })

  it('requires an explicit second confirmation to end the company', () => {
    const state = stage0Fixture('ipo')
    const store = createStore(state, 0)
    render(<IpoDialog />, store)
    expect(document.body.textContent).toContain('not cash paid into your account')
    click('Take the company public')
    expect(state.gameOver).toBe(false)
    click('Confirm IPO')
    expect(state.ending?.kind).toBe('ipo')
    expect(store.dialog.value?.kind).toBe('game-over')
  })

  it('rejects a malformed saved acknowledgement and rechecks current eligibility on confirmation', () => {
    const state = stage0Fixture('ipo')
    const raw = JSON.parse(serialize(state))
    raw.exit.ipoAcknowledged = 'yes'
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    const store = createStore(state, 0)
    state.profitDays = 0
    expect(store.goPublic().ok).toBe(false)
    expect(state.gameOver).toBe(false)
  })
})

describe('Stage 0 presentation', () => {
  it('puts Studio Close outside the scrollable body', () => {
    const host = render(<StudioDialog tab="industry" />, createStore(stage0Fixture('large-company'), 0))
    expect(host.querySelector('.modal-footer button')?.textContent).toBe('Close')
    expect(host.querySelector('.modal-body .actions')).toBeNull()
    expect(Array.from(host.querySelectorAll('[role="tab"]'), (tab) => tab.textContent)).toEqual(['Company', 'Industry', 'Journey', 'Products'])
  })

  it('seats founders across one office-height table with two laptops and no founder cup anchors', () => {
    const left = founderCafeStation(0, 0, false)
    const right = founderCafeStation(0, 0, true)
    expect(left.seatX).toBe(16.5 + 2)
    expect(right.seatX).toBe(59.5 - 2)
    expect(left.seatX).toBeLessThan(FOUNDER_TABLE.left)
    expect(right.seatX).toBeGreaterThan(FOUNDER_TABLE.left + FOUNDER_TABLE.width)
    expect(FOUNDER_TABLE.feet - FOUNDER_TABLE.top).toBe(12)
    for (const station of [left, right]) {
      expect(station).not.toHaveProperty('cupX')
      expect(station).not.toHaveProperty('cupBottom')
      expect(station.laptopY).toBe(WORKSTATIONS.laptop.top)
      expect(station.laptopY + WORKSTATIONS.laptop.height - 1).toBe(FOUNDER_TABLE.top)
    }
    expect(left.laptopX + WORKSTATIONS.laptop.width).toBeLessThan(right.laptopX)
  })
})

