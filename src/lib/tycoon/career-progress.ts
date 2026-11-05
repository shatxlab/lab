import { settleCareerSave, validateCareerSave, type CareerSave } from './career-save'
import { recognizeCharter } from './charter-recognition'
import { advanceDay } from './sim/tick'
import type { FinanceResult } from './sim/founder-finance'

/** Sticky recognition, with no cash/reputation reward. IPO still rechecks today's actual charter requirements. */
export function refreshCareerCharter(save: CareerSave): FinanceResult<CareerSave> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  return checked.value.game.gameOver ? checked : recognizeCharter(checked.value)
}

/** Prepared active-company clock. Endings are booked in the same returned snapshot; interludes never use this path. */
export function advanceActiveCareer(save: CareerSave, days = 1): FinanceResult<CareerSave> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  let value = checked.value
  if (value.game.gameOver) return { ok: false, reason: 'An ended company cannot keep operating; choose a next venture or explicit consulting' }
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) return { ok: false, reason: 'Advance between 0 and 3650 whole game days per call' }
  const initial = recognizeCharter(value)
  if (!initial.ok) return initial
  value = initial.value
  for (let i = 0; i < days; i++) {
    advanceDay(value.game)
    const recognition = recognizeCharter(value)
    if (!recognition.ok) return recognition
    value = recognition.value
    if (value.game.gameOver) return settleCareerSave(value)
  }
  return validateCareerSave(value)
}
