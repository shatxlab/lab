/** Deterministic saved states for UI/browser regression checks, never a reconstruction of a player's journal. */
import { RESEARCH } from '@/lib/tycoon/data/research'
import { STAGES } from '@/lib/tycoon/data/stages'
import { IPO_PROFIT_DAYS, IPO_REVENUE, IPO_USERS } from '@/lib/tycoon/sim/balance'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { retireStudio } from '@/lib/tycoon/sim/exit'
import { foundStudio } from '@/lib/tycoon/sim/founding'
import { generateEmployee, ROLES } from '@/lib/tycoon/sim/hiring'
import { freeDesks } from '@/lib/tycoon/sim/offices'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { GameState } from '@/lib/tycoon/sim/types'
import { makeProduct } from './helpers'

export type Stage0Fixture = 'cafe' | 'one-floor' | 'europe' | 'large-company' | 'ipo' | 'continued'

export function stage0Fixture(kind: Stage0Fixture): GameState {
  const state = createInitialState(42)
  foundStudio(state, 'Alex Okafor', 'Bright Interactive Labs')
  if (kind === 'cafe') return state
  if (kind === 'continued') {
    retireStudio(state)
    return nextChapter(state)!
  }
  state.day = 3600
  state.lastEventDay = state.day
  state.money = 100_000_000
  state.reputation = 100
  state.stage = kind === 'one-floor' ? 3 : 5
  state.research.done = RESEARCH.filter((node) => !node.repeatable).map((node) => node.id)
  state.offices[0].kind = 'office'
  const count = kind === 'one-floor' ? 1 : kind === 'europe' ? 2 : 10
  for (let i = 1; i < count; i++) state.offices.push({ id: state.nextId++, kind: 'office', theme: i, region: i >= count / 2 ? 'eu' : 'us', project: null })
  for (const office of state.offices) {
    while (freeDesks(state, office) > 0) {
      const person = generateEmployee(state, ROLES[state.employees.length % ROLES.length])
      state.employees.push({ ...person, officeId: office.id, region: office.region ?? 'us' })
    }
  }
  const hit = makeProduct({ id: state.nextId++, name: 'Wren', productTypeId: 'marketplace_app', hit: true, fit: 90, peakFit: 90, users: 100_000, reach: 200_000, releaseDay: state.day, built: ['load_balancer'] })
  state.products = [hit]
  state.signatureId = hit.id
  state.offices.forEach((office) => { office.productId = hit.id })
  if (kind === 'ipo') {
    state.stage = STAGES.length - 1
    state.lifetimeRevenue = IPO_REVENUE + 1
    state.profitDays = IPO_PROFIT_DAYS
    state.incomeAverage = 1_000_000
    hit.users = IPO_USERS + 1
    hit.reach = IPO_USERS * 2
  }
  state.events = []
  return state
}
