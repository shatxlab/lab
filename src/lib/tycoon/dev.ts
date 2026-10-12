import { STAGES } from '@/lib/tycoon/data/stages'
import { MAX_OFFICES } from '@/lib/tycoon/sim/balance'
import { generateEmployee, ROLES } from '@/lib/tycoon/sim/hiring'
import { freeDesks } from '@/lib/tycoon/sim/offices'
import type { GameState } from '@/lib/tycoon/sim/types'

const DEV_PARAMS = ['offices', 'money', 'rep', 'stage'] as const

/** True when the URL asks for dev shortcuts; such sessions never read or write the real save. */
export function hasDevParams(): boolean {
  const params = new URLSearchParams(location.search)
  return DEV_PARAMS.some((name) => params.has(name))
}

/**
 * Dev-only shortcuts read from the URL: `?offices=2` (out of the garage into that many full offices),
 * `?money=1e6`, `?rep=60`, `?stage=3`.
 */
export function applyDevParams(state: GameState): void {
  const params = new URLSearchParams(location.search)

  const offices = params.get('offices')
  if (offices !== null) {
    const count = Math.min(Math.max(Number(offices) || 0, 0), MAX_OFFICES)
    if (count > 0) state.offices[0].kind = 'office'
    while (state.offices.length < count) state.offices.push({ id: state.nextId++, kind: 'office', theme: state.offices.length, project: null })
    for (const office of state.offices) {
      while (freeDesks(state, office) > 0) {
        state.employees.push({ ...generateEmployee(state, ROLES[state.employees.length % ROLES.length]), officeId: office.id })
      }
    }
  }

  const money = params.get('money')
  if (money !== null) state.money = Number(money) || state.money

  const rep = params.get('rep')
  if (rep !== null) state.reputation = Number(rep) || 0

  const stage = params.get('stage')
  if (stage !== null) state.stage = Math.min(Math.max(Number(stage) || 0, 0), STAGES.length - 1)
}
