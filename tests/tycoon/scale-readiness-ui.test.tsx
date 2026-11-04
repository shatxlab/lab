// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { ScaleReadinessPanel } from '@/components/tycoon/ScaleReadinessPanel'
import { JourneyTab } from '@/components/tycoon/JourneyTab'
import { StoreContext } from '@/components/tycoon/context'
import { createStore } from '@/lib/tycoon/store'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { nemesisMonth, nemesisRival, strikeBackPreview } from '@/lib/tycoon/sim/nemesis'
import { NEMESIS_FIRST_DAYS } from '@/lib/tycoon/sim/balance'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

it('shows the same concrete requirements in operations and Journey without a full-desk target or modal', () => {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.stage = 4
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><ScaleReadinessPanel /><JourneyTab /></StoreContext.Provider>))
  const panel = document.querySelector('[aria-label="Company scale readiness"]')!
  const journey = document.querySelector('.journey .stage.current')!
  for (const text of ['Provision servers for 1,000,000 users', 'Keep a delivery team capable of regular flagship releases']) {
    expect(panel.textContent).toContain(text)
    expect(journey.textContent).toContain(text)
  }
  expect(panel.textContent).toContain('600,000 / 1,000,000 user capacity')
  expect(panel.textContent).toContain('Product-size growth expands scope and opportunities, not server capacity')
  expect(journey.textContent).not.toContain('24 people')
  expect(document.querySelector('.modal')).toBeNull()
  expect(store.speed.value).toBe(0)
})

it('explains and charges a deliberate rival campaign, preserving manual pause and floor assignments', () => {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.hitDay = s.day - NEMESIS_FIRST_DAYS
  nemesisMonth(s)
  const preview = strikeBackPreview(s)!, money = s.money
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><ScaleReadinessPanel /></StoreContext.Provider>))
  expect(document.body.textContent).toContain('A large cash balance alone does not lower this ratio')
  expect(document.body.textContent).toContain('does not instantly win the rivalry')
  const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent!.startsWith('Strike back ·'))!
  act(() => button.click())
  expect(s.money).toBe(money - preview.cost)
  expect(nemesisRival(s)!.ratio).toBe(preview.after)
  expect(document.body.textContent).toMatch(/Wait \d+ more day/)
  expect(s.offices.every((o) => o.assignment?.kind === 'idle')).toBe(true)
  expect(store.speed.value).toBe(0)
  expect(document.querySelector('.modal')).toBeNull()
})
