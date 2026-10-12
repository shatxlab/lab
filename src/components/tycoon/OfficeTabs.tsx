import { officeName, staffOf } from '@/lib/tycoon/sim/offices'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import type { GameState, Office } from '@/lib/tycoon/sim/types'
import { OFFICE_THEME_COLORS } from '@/lib/tycoon/theme'
import { useGame, useSignal, useStore } from './context'
import { cssVars } from './style'

/** What an office is up to, in a couple of words. */
function status(state: GameState, office: Office): string {
  const project = office.project
  if (!project) return staffOf(state, office).length === 0 ? 'empty' : 'idle'
  const done = `${Math.round(overallProgress(project) * 100)}%`
  if (project.kind === 'fix') return `fixing · ${done}`
  if (project.kind === 'contract') return `client · ${done}`
  return `${project.name} · ${done}`
}

/** One tab per office, once there is more than one: which one the scene and the panel show. */
export function OfficeTabs() {
  const store = useStore()
  const state = useGame()
  // Subscribed before the early return: a conditional useSignal would break the rules of hooks
  // when a second office is added to a game that had only one.
  const selected = useSignal(store.selectedOffice)
  if (state.offices.length < 2) return null

  return (
    <nav className="office-tabs" aria-label="Offices">
      {state.offices.map((office) => (
        <button
          key={office.id}
          className={office.id === selected ? 'active' : ''}
          aria-pressed={office.id === selected}
          style={cssVars({ '--c': OFFICE_THEME_COLORS[office.theme % OFFICE_THEME_COLORS.length] })}
          onClick={() => store.selectOffice(office.id)}
        >
          <span className="office-dot" />
          <strong>{officeName(state, office)}</strong>
          <small className="muted">{status(state, office)}</small>
        </button>
      ))}
    </nav>
  )
}
