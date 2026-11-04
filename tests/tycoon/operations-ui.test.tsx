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
