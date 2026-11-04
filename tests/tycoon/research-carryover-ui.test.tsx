// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { StoreContext } from '@/components/tycoon/context'
import { ResearchDialog } from '@/components/tycoon/ResearchDialog'
import { GameOverDialog } from '@/components/tycoon/dialogs'
import { ResearchCarryover } from '@/components/tycoon/ResearchCarryover'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { createStore } from '@/lib/tycoon/store'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

it('explains known inactive versus active practice, mixed content permission and full-price re-establishment', () => {
  const s = createInitialState(1)
  s.research.known = ['ci_pipeline', 'ux_research', 'ml_foundations', 'test_automation']
  s.research.done = ['test_automation']
  const before = serialize(s), store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><ResearchDialog /></StoreContext.Provider>))
  const rows = Array.from(document.querySelectorAll('.research-node'))
  const row = (name: string) => rows.find((r) => r.querySelector('strong')?.textContent === name)!
  expect(row('CI engineering practice').textContent).toContain('Blueprint known — inactive in this company')
  expect(row('CI engineering practice').textContent).toContain('$6,000')
  expect(row('QA automation practice').textContent).toContain('Active in this company')
  expect(row('UX research lab').textContent).toContain('Accessibility permission is already retained; the speed multiplier is not active')
  expect(row('Machine learning').textContent).toContain('Knowledge retained')
  expect(document.querySelector('[aria-label="Research carry-over preview"]')!.textContent).toContain('normal full price and work again')
  expect(serialize(s)).toBe(before)
  expect(store.speed.value).toBe(0)
})

it.each(['bankrupt', 'retired'] as const)('shows an honest pre-decision transfer contract after %s', (kind) => {
  const s = createInitialState(1)
  s.research.done = ['ux_research', 'ci_pipeline']
  s.research.known = ['licensing']
  s.research.active = { id: 'design_system', finishDay: 50 }
  s.gameOver = true; s.ending = { kind, day: 0, worth: 100_000 }
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><GameOverDialog /></StoreContext.Provider>))
  const text = document.querySelector('[aria-label="Research carry-over preview"]')!.textContent!
  expect(text).toContain('1 learned content permissions · 3 company-practice blueprints · 0 studied audiences')
  expect(text).toContain('survive every ending, including bankruptcy')
  expect(text).toContain('No automatic charge or research selection')
  expect(text).toContain('Unfinished research (Design system) does not transfer or receive a refund')
  expect(text).toContain('Company stage:')
  expect(document.body.textContent).not.toContain('half of what you learned')
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === (kind === 'bankrupt' ? 'Start again, alone' : 'Start something new'))).toBe(true)
})

it('renders historical unknown audience labels safely instead of crashing the transfer decision', () => {
  const s = createInitialState(1)
  s.surveyed = ['removed_audience']
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><ResearchCarryover /></StoreContext.Provider>))
  expect(document.body.textContent).toContain('Studied audiences: removed_audience')
})
