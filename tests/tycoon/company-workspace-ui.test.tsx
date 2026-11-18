// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '@/components/tycoon/App'
import { createStore } from '@/lib/tycoon/store'
import { companyOverview } from '@/lib/tycoon/sim/offices'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.unstubAllGlobals() })
function mount(kind: Parameters<typeof stage0Fixture>[0]) {
  const s = stage0Fixture(kind)
  if (kind !== 'cafe') initialiseOperations(s)
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<App store={store} />))
  return { s, store }
}

it.each(['cafe', 'one-floor'] as const)('preserves the small-workplace layout before a second floor: %s', (kind) => {
  const { s, store } = mount(kind)
  expect(companyOverview(s)).toBe(false)
  expect(document.querySelector('.company-overview')).toBeNull()
  expect(document.querySelector('[aria-label="Current workplace"]')).not.toBeNull()
  expect(document.querySelector('.building-overlay')).toBeNull()
  expect(store.speed.value).toBe(0)
})

it('counts one US and one European floor as a company overview; selecting either never opens an interior', () => {
  const { s, store } = mount('europe')
  expect(s.offices.map((o) => o.region)).toEqual(['us', 'eu'])
  expect(companyOverview(s)).toBe(true)
  const scene = document.querySelector('#scene-host')!
  // jsdom has zero layout width: use the same regional switch as a narrow browser.
  const europe = Array.from(document.querySelectorAll<HTMLButtonElement>('.building-switch button')).find((b) => b.textContent === 'Europe')!
  act(() => europe.click())
  const button = document.querySelector<HTMLButtonElement>('[aria-label="Select Europe"]')!
  act(() => button.click())
  expect(store.selectedOffice.value).toBe(s.offices[1].id)
  expect(document.querySelector('#scene-host')).toBe(scene)
  expect(document.querySelector('.building-floor[aria-pressed="true"]')?.getAttribute('aria-label')).toBe('Select Europe')
  expect(document.querySelector('.floor-back')).toBeNull()
  expect(document.querySelector('.office-tabs')).toBeNull()
  expect(document.querySelector('[aria-label="Operating workspace"]')).not.toBeNull()
  expect('view' in store).toBe(false)
  expect('setView' in store).toBe(false)
  expect(store.speed.value).toBe(0)
})

it('keeps the exact scene host when a second floor opens rather than remounting the canvas', () => {
  const { s, store } = mount('one-floor')
  s.stage = 5
  const scene = document.querySelector('#scene-host')!
  const canvas = document.createElement('canvas'); scene.appendChild(canvas)
  act(() => { expect(store.openOffice('eu')).toEqual({ ok: true }) })
  expect(companyOverview(s)).toBe(true)
  expect(document.querySelector('#scene-host')).toBe(scene)
  expect(document.querySelector('#scene-host canvas')).toBe(canvas)
  expect(document.querySelector('.company-overview')).not.toBeNull()
  expect(document.querySelector('.company-topbar')).not.toBeNull()
})

it('selects the operating team from management without the obsolete Show/interior flow', () => {
  const { s, store } = mount('europe')
  act(() => store.openDialog({ kind: 'team' }))
  const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Select team')!
  expect(button).toBeDefined()
  act(() => button.click())
  expect(store.selectedOffice.value).toBe(s.offices[1].id)
  expect(store.dialog.value).toBeNull()
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Show')).toBe(false)
  expect(document.querySelector('.company-overview')).not.toBeNull()
  expect(store.speed.value).toBe(0)
})


it('reserves Space for focused controls and text fields, while preserving the deliberate background hotkey', () => {
  const { store } = mount('europe')
  const button = document.querySelector('.operations-teams button')!
  const key = () => new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
  const control = key()
  act(() => { button.dispatchEvent(control) })
  expect(control.defaultPrevented).toBe(false)
  expect(store.speed.value).toBe(0)
  const input = document.createElement('input'); document.body.appendChild(input)
  const typing = key()
  act(() => { input.dispatchEvent(typing) })
  expect(typing.defaultPrevented).toBe(false)
  expect(store.speed.value).toBe(0)
  const background = key()
  act(() => { document.body.dispatchEvent(background) })
  expect(background.defaultPrevented).toBe(true)
  expect(store.speed.value).toBe(1)
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true })) })
  expect(store.speed.value).toBe(1)
})


it('does not steal native disclosure Space for the game-speed hotkey', () => {
  const { store } = mount('europe')
  const summary = document.querySelector('summary')!
  const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
  act(() => { summary.dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(false)
  expect(store.speed.value).toBe(0)
})
