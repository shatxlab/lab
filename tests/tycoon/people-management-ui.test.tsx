// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { StoreContext } from '@/components/tycoon/context'
import { PeopleManagementPanel } from '@/components/tycoon/PeopleManagementPanel'
import { TeamDialog } from '@/components/tycoon/TeamDialog'
import { EmployeeDialog } from '@/components/tycoon/EmployeeDialog'
import { createStore } from '@/lib/tycoon/store'
import { initialisePeopleManagement, peopleDay } from '@/lib/tycoon/sim/people-management'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import { stage0Fixture } from './stage0-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})
function setup() {
  const state = stage0Fixture('large-company')
  initialiseOperations(state)
  initialisePeopleManagement(state)
  for (const e of state.employees) {
    e.level = 1
    e.career!.grade = 1
    e.career!.gradeDay = 0
    e.skills = { design: 95, engineering: 95, qa: 95 }
    e.analysis = 95
  }
  state.exit.closed = true
  state.exit.ipoAcknowledged = true
  state.day += 30
  peopleDay(state)
  const store = createStore(state)
  root = createRoot(document.body)
  return {
    state,
    store,
    render: (children: React.ReactNode) =>
      act(() => root!.render(<StoreContext.Provider value={store}>{children}</StoreContext.Provider>)),
  }
}
it('completes a 120-person review and shows its company-wide result without rendering a roster or promotion approvals', () => {
  const { state, store, render } = setup()
  expect(state.employees).toHaveLength(120)
  render(<PeopleManagementPanel />)
  expect(document.body.textContent).toContain('120 reviewed')
  expect(document.body.textContent).toContain('120 promoted')
  expect(document.body.textContent).toContain('no individual promotion approvals')
  expect(document.querySelector('.person')).toBeNull()
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Promote')).toBe(false)
  const automatic = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  act(() => automatic.click())
  expect(state.peopleManagement!.policy.automatic).toBe(false)
  expect(store.dialog.value).toBeNull()
})
it('shows budget exceptions as one company constraint above the ordinary roster', () => {
  const { state, render } = setup()
  state.peopleManagement!.policy.payrollCap = 0
  for (const e of state.employees) e.career!.gradeDay = 0
  state.day += 360
  peopleDay(state)
  render(<TeamDialog />)
  expect(document.querySelector('.modal-body')?.firstElementChild?.getAttribute('aria-label')).toBe(
    'Company people management',
  )
  expect(document.querySelector('.people-management')?.textContent).toContain('120 deferred')
  expect(document.querySelector('.people-management')?.textContent).toContain('Company payroll cap')
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Promote')).toBe(false)
})
it('individual inspection explains specialist grade, management skill and automatic review instead of an approval button', () => {
  const { state, render } = setup()
  const e = state.employees.find((e) => e.role === 'developer')!
  e.career!.grade = 3
  e.level = 3
  render(<EmployeeDialog id={e.id} />)
  expect(document.body.textContent).toContain('Staff specialist')
  expect(document.body.textContent).toContain('management skill')
  expect(document.body.textContent).toContain('company policy')
  expect(document.body.textContent).not.toContain('A Lead: their office')
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Promote')).toBe(false)
})
