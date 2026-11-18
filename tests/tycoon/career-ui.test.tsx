// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/components/tycoon/App'
import { createCareerController, type CareerController } from '@/lib/tycoon/career-controller'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import { adoptCareerSave, createCareerSave, serializeCareerSave, settleCareerSave, type CareerSave } from '@/lib/tycoon/career-save'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { you } from '@/lib/tycoon/sim/founding'
import { SAVE_KEY } from '@/lib/tycoon/save'
import { identity, MemoryStorage, SerialLock, unwrap } from './career-persistence-fixtures'
import { paidFoundingSource } from './paid-founding-fixtures'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
const controllers: CareerController[] = []
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))
afterEach(() => { act(() => { root?.unmount(); for (const c of controllers.splice(0)) c.stop() }); root = null; document.body.innerHTML = ''; vi.unstubAllGlobals() })
function setup(save: CareerSave) {
  const storage = new MemoryStorage(), lock = new SerialLock(), token = unwrap(serializeCareerSave(save))
  storage.setItem(SAVE_KEY, token)
  let n = 0
  const c = createCareerController(createCareerPersistence(storage, lock, token), { id: () => `ui-${++n}` })
  controllers.push(c)
  root = createRoot(document.body)
  act(() => root!.render(<App store={c.store} career={c} />))
  return { c, storage }
}
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name)!
const click = async (name: string) => { await act(async () => { button(name).click() }) }
function companyName(value: string) {
  const input = document.querySelector<HTMLInputElement>('.career-form input:not([type])')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
function bankrupt() {
  const s = unwrap(createCareerSave(createInitialState(5), identity))
  s.game.day = 500; s.game.money = -100; s.game.gameOver = true; s.game.ending = { kind: 'bankrupt', day: 500, worth: 0 }
  return unwrap(settleCareerSave(s))
}

describe('live career browser screens', () => {
  it('keeps known native payouts distinct from older unknown valuation history without crediting on render', async () => {
    const { c } = setup(paidFoundingSource())
    companyName('Known Successor'); await click('Confirm investment and found company')
    const balance = unwrap(c.summary()).liquid
    act(() => c.store.openDialog({ kind: 'career' }))
    expect(document.body.textContent).toContain('Historical company valuations · not spendable')
    expect(document.body.textContent).toContain('Recorded settlements · cash already booked')
    expect(document.body.textContent).toContain('$5,000,000 personal cash credited once')
    expect(document.body.textContent).not.toContain('Historical company valuations · proceeds unknown')
    expect(unwrap(c.summary()).liquid).toBe(balance)
  })
  it('separates spendable cash, closing corporate cash and retained valuation with no free restart actions', () => {
    setup(paidFoundingSource())
    const text = document.body.textContent!
    expect(text).toContain('Spendable personal cash')
    expect(text).toContain('$5,000,000')
    expect(text).toContain('Closing company cash (not your wallet)')
    expect(text).toContain('Retained holdings')
    expect(text).not.toContain('Start something new')
    expect(text).not.toContain('Start again, alone')
    expect(document.querySelector('.career-form')?.textContent).not.toContain('Your name')
  })

  it('shows an exact prospective legacy settlement and records the explicit choice before offering funding', async () => {
    const legacy = unwrap(adoptCareerSave(serialize(paidFoundingSource().game), identity))
    const { c } = setup(legacy)
    expect(document.body.textContent).toContain('50% assumed stake')
    expect(document.body.textContent).toContain('Exact personal credit: $5,000,000')
    expect(document.querySelector('.career-form')).toBeNull()
    await click('Leave proceeds unpriced')
    expect(document.body.textContent).not.toContain('Choose legacy settlement')
    expect(unwrap(c.summary()).liquid).toBe(0)
    expect(document.querySelector('.career-form')).not.toBeNull()
  })

  it('disables unaffordable founding and offers explicit quoted work rather than inheritance', async () => {
    setup(bankrupt())
    companyName('Recovery')
    const dev = [...document.querySelectorAll<HTMLLabelElement>('.career-hire')].find((label) => label.textContent?.includes('developer'))!
    await act(async () => dev.querySelector<HTMLInputElement>('input')!.click())
    expect(document.body.textContent).toContain('Investment exceeds available personal cash')
    expect(button('Confirm investment and found company').disabled).toBe(true)
    expect(button('Accept 30-day consulting contract').disabled).toBe(false)
  })

  it('saves partial consulting and credits once after explicit completion, without selecting another contract', async () => {
    const { c } = setup(bankrupt())
    const people = structuredClone(c.store.state.employees)
    await click('Accept 30-day consulting contract')
    const payout = unwrap(c.summary()).consulting!.payout
    expect(document.body.textContent).toContain('30 game days remaining')
    await click('Work 7 days')
    expect(document.body.textContent).toContain('23 game days remaining')
    expect(unwrap(c.summary()).liquid).toBe(0)
    await click('Finish contract (23 days)')
    expect(unwrap(c.summary()).liquid).toBe(payout)
    expect(unwrap(c.summary()).consulting).toBeNull()
    expect(c.store.state.employees).toEqual(people)
    expect(button('Accept 30-day consulting contract')).toBeDefined()
  })

  it('uses exactly one company-name field and publishes actual investment/identity only after confirmation', async () => {
    const { c } = setup(paidFoundingSource())
    const founder = structuredClone(you(c.store.state))
    companyName('Copper Again')
    expect(document.body.textContent).toContain('Minimum / recommended investment')
    expect(document.body.textContent).toContain('Personal reserve after transfer')
    await click('Confirm investment and found company')
    expect(c.store.state.studioName).toBe('Copper Again')
    expect(c.store.state.chapter).toBe(2)
    expect(you(c.store.state)?.name).toBe(founder?.name)
    expect(you(c.store.state)?.skills).toEqual(founder?.skills)
    expect(c.store.state.products).toHaveLength(0)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows storage failure and retry controls inside the blocking modal without publishing a successor', async () => {
    const { c, storage } = setup(paidFoundingSource())
    companyName('Retry Studio')
    storage.failWrite = true
    await click('Confirm investment and found company')
    expect(c.store.state.gameOver).toBe(true)
    expect(document.querySelector('.modal [role="alert"]')?.textContent).toContain('could not store')
    expect(button('Retry save')).toBeDefined()
    expect(button('Export backup')).toBeDefined()
    storage.failWrite = false
    await click('Confirm investment and found company')
    expect(c.store.state.studioName).toBe('Retry Studio')
  })

  it('keeps an active first company separate from its wallet and requires explicit reset confirmation', async () => {
    const { c } = setup(unwrap(createCareerSave(createInitialState(1), identity)))
    act(() => c.store.openDialog({ kind: 'menu' }))
    await click('Personal finance')
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Personal finance')
    expect(document.body.textContent).not.toContain('Fund a new company')
    await click('Close')
    act(() => c.store.openDialog({ kind: 'menu' }))
    await click('New game')
    expect(c.store.state.freshChapter).not.toBe(true)
    expect(button('Really start over?')).toBeDefined()
  })
})
