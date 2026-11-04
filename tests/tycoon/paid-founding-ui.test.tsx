// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { JourneyTab } from '@/components/tycoon/JourneyTab'
import { StoreContext } from '@/components/tycoon/context'
import { createStore } from '@/lib/tycoon/store'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { foundPaidCompany, foundingOffers, quoteFounding } from '@/lib/tycoon/paid-founding'
import { paidFoundingSource, unwrap } from './paid-founding-fixtures'
import type { GameState } from '@/lib/tycoon/sim/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })
function render(state: GameState) {
  const store = createStore(state, 0)
  root = createRoot(document.body)
  act(() => root!.render(<StoreContext.Provider value={store}><JourneyTab /></StoreContext.Provider>))
}

describe('paid-start Journey provenance', () => {
  it.each(['studio', 'venture'] as const)('labels skipped %s chores not applicable, never completed/earned', (ambition) => {
    const source = paidFoundingSource()
    const candidateIds = ambition === 'studio' ? unwrap(foundingOffers(source)).offers.filter((p) => ['designer', 'tester'].includes(p.role)).map((p) => p.id) : []
    const quote = unwrap(quoteFounding(source, { companyId: 'new-company', companyName: 'Copper', ambition, focus: 'web_app', candidateIds }))
    const next = unwrap(foundPaidCompany(source, quote))
    render(next.game)
    const cafe = document.querySelector('.stage.not-applicable')!
    expect(cafe.textContent).toContain('Not applicable to this charter')
    expect(cafe.textContent).not.toContain('✓')
    const current = document.querySelector('.stage.current')!
    expect(current.querySelector('.goals')?.textContent).toContain('Make a product take off')
    expect(current.querySelector('.goals')?.textContent).not.toContain('Ship 3 products')
    expect(current.querySelector('[aria-label="Charter exceptions"]')?.textContent).toContain('Ship 3 products · Not applicable to this charter')
    expect(current.querySelectorAll('.goals .met')).toHaveLength(0)
  })

  it('leaves first-company Journey unchanged', () => {
    render(createInitialState(5))
    expect(document.querySelectorAll('[aria-label="Charter exceptions"]')).toHaveLength(0)
    expect(document.querySelector('.stage.current')?.textContent).toContain('Deliver 3 jobs')
    expect(document.querySelector('.stage.not-applicable')).toBeNull()
  })
})
