// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { HitPanel } from '@/components/tycoon/HitPanel'
import { StoreContext } from '@/components/tycoon/context'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { createStore } from '@/lib/tycoon/store'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

it.each(['small', 'medium'] as const)('shows companion opportunity from earned scope, not just consumer-scale volume: %s', (size) => {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  const p = s.products[0]
  p.productTypeId = 'cloud_platform'; p.users = 8000; p.size = size
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
  const select = document.querySelector<HTMLSelectElement>('.operations-editor select')!
  const options = Array.from(select.options).map((option) => option.value)
  expect(options.includes('item:companion:free_edition')).toBe(size === 'medium')
  if (size === 'medium') {
    act(() => { select.value = 'item:companion:free_edition'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(document.querySelector('.initiative-contract')!.textContent).toContain('Medium-or-larger product scope or 300,000 users')
    const assign = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Assign initiative')!
    act(() => assign.click())
    expect(s.offices[0].assignment?.kind).toBe('initiative')
    expect(s.offices[0].project?.itemId).toBe('companion:free_edition')
    expect(s.products.some((product) => product.companionId === 'free_edition')).toBe(false)
  }
  expect(store.speed.value).toBe(0)
})
