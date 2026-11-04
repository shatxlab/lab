// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { StoreContext } from '@/components/tycoon/context'
import { HitPanel } from '@/components/tycoon/HitPanel'
import { createStore } from '@/lib/tycoon/store'
import { assignOperation, initialiseOperations } from '@/lib/tycoon/sim/operations'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

it('keeps planning/reassignment inline while another team advances, without double staffing', () => {
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  state.exit.closed = true
  const [a, b] = state.offices, p = state.products[0]
  assignOperation(state, a.id, { kind: 'standing', productId: p.id, service: 'reliability' })
  assignOperation(state, b.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'polish', id: 'polish' } })
  const store = createStore(state)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
  expect(document.body.textContent).toContain('Company operations')
  expect(document.body.textContent).not.toContain('Time waits for you')
  const idle = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Leave team idle')!
  act(() => idle.click())
  expect(document.querySelector('[aria-label="Confirm reassignment"]')?.textContent).toContain('Stops reliability coverage')
  expect(document.querySelector('.modal')).toBeNull()
  expect(store.running()).toBe(true)
  const before = b.project!.progress.engineering
  act(() => { for (let i = 0; i < 20; i++) store.tick(100) })
  expect(b.project!.progress.engineering).toBeGreaterThan(before)
  expect(state.dayWork.map((w) => w.employeeId).length).toBe(new Set(state.dayWork.map((w) => w.employeeId)).size)
  act(() => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Confirm reassignment')!.click())
  expect(a.assignment).toEqual({ kind: 'idle' })
  expect(document.body.textContent).toContain('This team is idle')
})

it('shows shared ecosystem health and measured bonuses without a blocking dialog', async () => {
  const { launchCompanion } = await import('@/lib/tycoon/sim/companions')
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  const companion = launchCompanion(state, 'mobile_app')!
  const store = createStore(state)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
  const panel = () => document.querySelector('[aria-label="Ecosystem health"]')!
  expect(panel().textContent).toContain('Shared reliability coverage: 0%')
  expect(panel().textContent).toContain('1 companion')
  expect(panel().textContent).toContain('No fixed companion-count limit')
  expect(panel().textContent).toContain('fresh and healthy')
  act(() => { store.assignOperation(state.offices[0].id, { kind: 'standing', productId: state.signatureId!, service: 'reliability' }) })
  expect(panel().textContent).not.toContain('Shared reliability coverage: 0%')
  companion.releaseDay = 0
  act(() => { store.selectOffice(state.offices[1].id) })
  expect(panel().textContent).toContain('needs an update or bug fixes')
  expect(document.querySelector('.modal')).toBeNull()
})

it('offers growth and commercial decisions inline and keeps the post-hit catalogue read-only', async () => {
  const { ProductsTab } = await import('@/components/tycoon/ProductsTab')
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  state.products[0].releaseDay = state.day - 300
  state.products[0].updates.push({ day: state.day })
  const store = createStore(state, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /><ProductsTab /></StoreContext.Provider>))
  const select = document.querySelector<HTMLSelectElement>('.operations-editor select')!
  act(() => { select.value = 'grow:medium'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(document.querySelector('.initiative-contract')?.textContent).toContain('Grow to Medium')
  const assign = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Assign initiative')!
  act(() => assign.click())
  expect(state.offices[0].project!.grows).toBe('medium')
  expect(store.speed.value).toBe(0)
  expect(document.querySelector('[aria-label="Product commercial controls"]')?.textContent).toContain('Paid promotion')
  expect(document.querySelector('.products')?.textContent).toContain('Back to operations')
  expect(document.querySelector('.products .product-actions')).toBeNull()
  expect(document.querySelector('.modal')).toBeNull()
})

it('requires explicit deposit/reputation confirmation for abandoning an operating client job', () => {
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  state.contracts[0].expiresDay = state.day + 100
  const store = createStore(state, 0)
  expect(store.acceptContract(state.contracts[0].id, state.offices[0].id).ok).toBe(true)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
  const click = (text: string) => act(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text)!.click())
  click('Abandon client work…')
  expect(document.querySelector('[aria-label="Confirm contract abandonment"]')?.textContent).toContain('deposit and loses')
  expect(state.offices[0].project).not.toBeNull()
  click('Confirm abandonment')
  expect(state.offices[0].project).toBeNull()
  expect(store.speed.value).toBe(0)
})

it('applies licensing and paid promotion from the commercial surface without consuming or unpausing a team', async () => {
  const { ProductOperations } = await import('@/components/tycoon/ProductOperations')
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  const product = state.products[0]
  product.size = 'flagship'
  const store = createStore(state, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><ProductOperations product={product} /></StoreContext.Provider>))
  const click = (text: string) => act(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text)!.click())
  click('License to other companies')
  expect(product.licensed).toBe(true)
  click('End the licence')
  expect(product.licensed).toBeUndefined()
  const before = state.money
  act(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent!.startsWith('Small ·'))!.click())
  expect(state.money).toBeLessThan(before)
  expect(product.boostUntil).toBeGreaterThan(state.day)
  expect(store.speed.value).toBe(0)
  expect(state.offices.every((o) => o.project === null && o.assignment?.kind === 'idle')).toBe(true)
})
