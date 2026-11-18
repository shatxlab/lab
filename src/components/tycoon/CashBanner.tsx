import { BANKRUPT_AFTER_DEBT_DAYS } from '@/lib/tycoon/sim/balance'
import { cashRunwayDays } from '@/lib/tycoon/sim/economy'
import { useGame } from './context'

/** Warn when cash would run out within this many days at the current burn. */
const LOW_CASH_DAYS = 30

export function CashBanner() {
  const state = useGame()
  if (state.gameOver) return null

  if (state.money < 0) {
    const left = BANKRUPT_AFTER_DEBT_DAYS - state.debtDays
    return (
      <div className="banner bad" role="alert">
        In debt. Bankruptcy in {left} day{left === 1 ? '' : 's'} unless your money turns positive.
      </div>
    )
  }

  const runway = cashRunwayDays(state)
  if (runway !== null && runway < LOW_CASH_DAYS) {
    return (
      <div className="banner warn" role="status">
        Low cash: about {Math.floor(runway)} days of wages left at the current burn.
      </div>
    )
  }
  return null
}
