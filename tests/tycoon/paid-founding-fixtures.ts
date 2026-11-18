import { createCareerSave, settleCareerSave, type CareerSave } from '@/lib/tycoon/career-save'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { FinanceResult } from '@/lib/tycoon/sim/founder-finance'

export function unwrap<T>(r: FinanceResult<T>): T {
  if (!r.ok) throw new Error(r.reason)
  return r.value
}
export function paidFoundingSource(): CareerSave {
  const save = unwrap(createCareerSave(createInitialState(5), { careerId: 'synthetic-career', companyId: 'synthetic-first' }))
  save.game.day = 1200
  save.game.money = 2_000_000
  save.game.gameOver = true
  save.game.ending = { kind: 'ipo', day: 1200, worth: 100_000_000 }
  save.game.research.known = ['ci_pipeline', 'user_research']
  save.game.research.done = ['ci_pipeline', 'user_research']
  save.game.surveyed = ['consumers']
  return unwrap(settleCareerSave(save))
}
