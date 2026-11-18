// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { HitPanel } from '@/components/tycoon/HitPanel'
import { StoreContext } from '@/components/tycoon/context'
import { initialiseOperations, assignOperation } from '@/lib/tycoon/sim/operations'
import { launchCompanion } from '@/lib/tycoon/sim/companions'
import { createStore } from '@/lib/tycoon/store'
import { dayOfEra } from './helpers'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

it('shows real capacity instead of slots and warns before borrowing the only care team for a fourth launch', () => {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.day = dayOfEra(4)
  s.products[0].productTypeId = 'data_platform'; s.products[0].releaseDay = s.day; s.products[0].users = 500_000
  for (const id of ['mobile_app', 'free_edition', 'integrations']) launchCompanion(s, id)
  assignOperation(s, s.offices[0].id, { kind: 'standing', productId: s.signatureId!, service: 'reliability' })
  const store = createStore(s, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><HitPanel /></StoreContext.Provider>))
  const health = () => document.querySelector('[aria-label="Ecosystem health"]')!
  expect(health().textContent).toContain('3 companions')
  expect(health().textContent).toContain('No fixed companion-count limit')
  const select = document.querySelector<HTMLSelectElement>('.operations-editor select')!
  act(() => { select.value = 'item:companion:ai_assistant'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  const preview = document.querySelector('.initiative-contract')!
  expect(preview.textContent).toContain('0% coverage')
  expect(preview.textContent).toContain("This floor's previous care output is excluded")
  expect(preview.textContent).toContain('forecast extra hosting')
  expect(preview.querySelector('.warn')?.textContent).toContain('only 0%')
  const assign = Array.from(preview.querySelectorAll('button')).find((b) => b.textContent === 'Assign initiative')!
  act(() => assign.click())
  expect(s.offices[0].assignment?.kind).toBe('standing') // Preview/confirmation is not an automatic decision.
  act(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Confirm reassignment')!.click())
  expect(s.offices[0].assignment?.kind).toBe('initiative')
  expect(health().textContent).toContain('Pending launches: 1')
  expect(health().textContent).toContain('Shared reliability coverage: 0%')
  expect(store.speed.value).toBe(0)
  expect(document.querySelector('.modal')).toBeNull()
})
