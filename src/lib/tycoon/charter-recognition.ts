import type { CareerSave } from './career-save'
import { charterRequirements } from './sim/charter'
import { financeSummary, fulfillCompanyCharter, type FinanceResult } from './sim/founder-finance'

/** Internal pure booking step for a validated career. Recognition survives replacing its company charter. */
export function recognizeCharter(save: CareerSave): FinanceResult<CareerSave> {
  if (save.charter.fulfilledDay !== null || (save.game.gameOver && save.game.day !== save.game.ending?.day)) return { ok: true, value: save }
  const summary = financeSummary(save.finance)
  if (!summary.ok) return summary
  if (summary.value.companies.at(-1)?.closed) return { ok: true, value: save }
  const requirements = charterRequirements(save.game)
  if (!requirements.length || !requirements.every((r) => r.met)) return { ok: true, value: save }
  const finance = fulfillCompanyCharter(save.finance, save.charter.companyId, save.game.day)
  return finance.ok ? { ok: true, value: { ...save, finance: finance.value, charter: { ...save.charter, fulfilledDay: save.game.day } } } : finance
}
