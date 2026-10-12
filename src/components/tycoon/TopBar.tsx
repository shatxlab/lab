import { getStage } from '@/lib/tycoon/data/stages'
import { netPerDay } from '@/lib/tycoon/sim/economy'
import { deskCount } from '@/lib/tycoon/sim/offices'
import { researchDaysLeft } from '@/lib/tycoon/sim/research'
import { SPEEDS, type Speed } from '@/lib/tycoon/store'
import { formatDateShort, formatDelta, formatMoney } from '@/lib/tycoon/format'
import { useGame, useSignal, useStore } from './context'

const SPEED_LABEL: Record<Speed, string> = { 0: 'Pause', 1: '1×', 2: '2×' }

export function TopBar() {
  const store = useStore()
  const state = useGame()
  const speed = useSignal(store.speed)
  const net = netPerDay(state)

  return (
    <header className="topbar">
      <div className="topbar-row topbar-stats">
        <div className="stat">
          <span className="label">Money</span>
          <span className={`value ${state.money < 0 ? 'bad' : ''}`}>{formatMoney(state.money)}</span>
          <span className={`sub ${net < 0 ? 'bad' : 'good'}`}>{formatDelta(net)} / day</span>
        </div>
        {/* The date itself is shown over the office doors; kept here, off-screen, for screen readers and tests. */}
        <div className="stat sr-only">
          <span className="label">Date</span>
          <span className="value">{formatDateShort(state.day)}</span>
        </div>
        <div className="speed" role="group" aria-label="Game speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={s === speed ? 'active' : ''}
              aria-pressed={s === speed}
              onClick={() => store.setSpeed(s)}
            >
              {SPEED_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="stat stat-right">
          <span className="label">Reputation</span>
          <span className="value">{Math.round(state.reputation)}</span>
          <span className="sub muted">{getStage(state.stage).name}</span>
        </div>
      </div>
      <div className="topbar-row topbar-actions">
        <button onClick={() => store.openDialog({ kind: 'team' })}>
          Team {state.employees.length}/{deskCount(state)}
        </button>
        <button onClick={() => store.openDialog({ kind: 'research' })}>
          Research{researchDaysLeft(state) !== null && <small> · {researchDaysLeft(state)}d</small>}
        </button>
        <button onClick={() => store.openDialog({ kind: 'studio' })}>Studio</button>
        <button onClick={() => store.openDialog({ kind: 'menu' })}>Menu</button>
      </div>
    </header>
  )
}
