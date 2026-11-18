// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { HitPanel } from '@/components/tycoon/HitPanel'
import { StoreContext } from '@/components/tycoon/context'
import { createStore } from '@/lib/tycoon/store'
import { businessSnapshot, recordBusinessDecision } from '@/lib/tycoon/sim/business-history'
import { stage0Fixture } from './stage0-fixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

describe('business explanations stay informational', () => {
  it('keeps business disclosure inside the scrolling hit area without pausing the clock', () => {
    const state = stage0Fixture('one-floor')
    const store = createStore(state, 1)
    root = createRoot(document.body)
    act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
    const details = document.querySelector<HTMLDetailsElement>('.business-panel')!
    expect(details.closest('.hit-panel')).not.toBeNull()
    expect(store.running()).toBe(true)
    act(() => details.querySelector('summary')!.click())
    expect(details.open).toBe(true)
    expect(store.dialog.value).toBeNull()
    expect(store.running()).toBe(true)
  })
  it('shows observed deltas with attribution caveats and accessible card details', () => {
    const state = stage0Fixture('one-floor')
    const before = businessSnapshot(state, state.products[0])
    state.money -= 100
    recordBusinessDecision(state, state.products[0], 'Example decision', 'strike', before)
    state.plan = { clarity: 90, cards: [{ kind: 'polish', id: 'polish', why: 'Fix bugs' }] }
    const store = createStore(state, 1)
    root = createRoot(document.body)
    act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
    expect(document.body.textContent).toContain('not all caused by this initiative')
    expect(document.body.textContent).toContain('cash -$100')
    const details = document.querySelector('.initiative-contract')!
    expect(details.closest('button')).toBeNull()
    act(() => details.querySelector('summary')!.click())
    expect(store.dialog.value).toBeNull()
    expect(state.businessDecisions).toHaveLength(1)
  })
})
