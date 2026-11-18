// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '@/components/tycoon/App'
import { studioLocation } from '@/lib/tycoon/studio-navigation'
import { createStore } from '@/lib/tycoon/store'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { serialize } from '@/lib/tycoon/sim/state'
import { stage0Fixture } from './stage0-fixtures'
import { makeProduct } from './helpers'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.unstubAllGlobals() })
function mount(managed = true) {
  const state = stage0Fixture(managed ? 'europe' : 'cafe')
  if (managed) initialiseOperations(state)
  const store = createStore(state, 0)
  root = createRoot(document.body)
  act(() => root!.render(<App store={store} />))
  return { state, store }
}
function button(text: string) { return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === text)! }
function selected() { return document.querySelector('[role="tab"][aria-selected="true"]')?.textContent }

it('uses three primary tabs in Operations, with metrics/ecosystem behind deliberate disclosures', () => {
  const { state, store } = mount()
  const before = serialize(state)
  act(() => store.openDialog({ kind: 'studio' }))
  expect(Array.from(document.querySelectorAll('[role="tab"]'), (e) => e.textContent)).toEqual(['Company', 'Industry', 'Journey'])
  expect(selected()).toBe('Company')
  expect(document.querySelector('.stats')).toBeNull()
  expect(document.querySelector('.products')).toBeNull()
  expect(document.querySelector('.modal-footer button')?.textContent).toBe('Close')
  act(() => button('Close').click())
  expect(serialize(state)).toBe(before)
  expect(store.speed.value).toBe(0)
})

it.each([
  ['stats', 'Company', 'Company metrics & history', '.stats'],
  ['milestones', 'Journey', 'Milestones & rewards', '.milestones'],
  ['products', 'Company', 'Products & ecosystem', '.products'],
] as const)('keeps the legacy %s deep link reachable through its new owner', (tab, target, summary, selector) => {
  const { store } = mount()
  act(() => store.openDialog({ kind: 'studio', tab }))
  expect(selected()).toBe(target)
  const disclosure = Array.from(document.querySelectorAll('details')).find((e) => e.querySelector('summary')?.textContent === summary)!
  expect(disclosure.open).toBe(true)
  expect(disclosure.querySelector(selector)).not.toBeNull()
})

it('updates an already-open Studio when a different direct-link dialog arrives', () => {
  const { store } = mount()
  act(() => store.openDialog({ kind: 'studio', tab: 'industry' }))
  expect(selected()).toBe('Industry')
  act(() => store.openDialog({ kind: 'studio', tab: 'stats' }))
  expect(selected()).toBe('Company')
  expect(document.querySelector('.stats')).not.toBeNull()
})

it('retains pre-hit discovery and handles an empty Company/metrics link', () => {
  const { store } = mount(false)
  act(() => store.openDialog({ kind: 'studio' }))
  expect(selected()).toBe('Products')
  expect(document.body.textContent).toContain('Nothing shipped yet.')
  act(() => store.openDialog({ kind: 'studio', tab: 'company' }))
  expect(selected()).toBe('Company')
  expect(document.body.textContent).toContain('No signature company yet.')
  expect(studioLocation('products', false, false).tab).toBe('products')
})

it('opens the chosen ecosystem product in Operations without selecting a different floor or assigning work', () => {
  const { state, store } = mount()
  const product = makeProduct({ id: state.nextId++, name: 'Synthetic companion', role: 'side' })
  state.products.push(product)
  const before = serialize(state)
  act(() => store.selectOffice(state.offices[1].id))
  act(() => store.openDialog({ kind: 'studio', tab: 'products' }))
  expect(document.body.textContent).not.toContain('Portfolio ')
  expect(document.querySelector(`[aria-label="Releases for ${product.name}"]`)).not.toBeNull()
  act(() => button(`Operate ${product.name}`).click())
  expect(store.dialog.value).toBeNull()
  expect(store.selectedProduct.value).toBe(product.id)
  expect(store.selectedOffice.value).toBe(state.offices[1].id)
  expect((document.querySelector('.operations-panel > label select') as HTMLSelectElement).value).toBe(String(product.id))
  expect(serialize(state)).toBe(before)
  act(() => store.selectProduct(-100))
  expect(store.selectedProduct.value).toBe(product.id)
  expect(store.speed.value).toBe(0)
})

it('has one keyboard tab stop and supports arrows/Home/End without changing game speed', () => {
  const { store } = mount()
  act(() => store.openDialog({ kind: 'studio' }))
  const current = document.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!
  act(() => { current.focus(); current.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  expect(selected()).toBe('Industry')
  expect(document.activeElement?.id).toBe('studio-tab-industry')
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
  expect(selected()).toBe('Journey')
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
  expect(selected()).toBe('Company')
  expect(document.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1)
  expect(store.speed.value).toBe(0)
})

it('uses one physical transfer control per employee, with no Works on/remote split', () => {
  const { state, store } = mount()
  act(() => store.openDialog({ kind: 'team' }))
  expect(document.body.textContent).not.toContain('Works on')
  expect(document.body.textContent).not.toContain('slower, even across')
  for (const employee of state.employees) {
    expect(document.querySelector(`[aria-label="Team for ${employee.name}"]`)).toBeNull()
    expect(document.querySelector(`[aria-label="Delivery team for ${employee.name}"]`)).not.toBeNull()
  }
})

it('keeps release history reachable from the regrouped ecosystem without changing company data', () => {
  const { state, store } = mount()
  const before = serialize(state)
  act(() => store.openDialog({ kind: 'studio', tab: 'products' }))
  const releases = document.querySelector<HTMLButtonElement>(`[aria-label="Releases for ${state.products[0].name}"]`)!
  act(() => releases.click())
  expect(store.dialog.value).toEqual({ kind: 'releases', productId: state.products[0].id })
  expect(serialize(state)).toBe(before)
  expect(store.speed.value).toBe(0)
})

it('falls back to the flagship when the selected side product is deliberately retired', () => {
  const { state, store } = mount()
  const side = makeProduct({ id: state.nextId++, name: 'Retirement fallback fixture', role: 'side' })
  state.products.push(side)
  act(() => store.selectProduct(side.id))
  expect((document.querySelector('.operations-panel > label select') as HTMLSelectElement).value).toBe(String(side.id))
  act(() => { expect(store.sunsetProduct(side.id).ok).toBe(true) })
  expect((document.querySelector('.operations-panel > label select') as HTMLSelectElement).value).toBe(String(state.signatureId))
  expect(document.body.textContent).not.toContain('Commercial decisions · Retirement fallback fixture')
  expect(store.speed.value).toBe(0)
})
