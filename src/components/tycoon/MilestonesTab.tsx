import { MILESTONES, rewardLabel } from '@/lib/tycoon/data/milestones'
import { useGame } from './context'

/** Goals with rewards: the ones still to reach come first, so the list reads as "what next". */
export function MilestonesTab() {
  const state = useGame()
  const done = new Set(state.milestones)
  const ordered = [...MILESTONES.filter((m) => !done.has(m.id)), ...MILESTONES.filter((m) => done.has(m.id))]

  return (
    <div className="milestones">
      <p className="muted">
        {done.size} of {MILESTONES.length} reached. Each one pays a reward when you reach it.
      </p>
      {ordered.map((m) => {
        const reached = done.has(m.id)
        return (
          <div key={m.id} className={`milestone ${reached ? 'done' : ''}`}>
            <div>
              <strong>{m.name}</strong>
              <p className="muted">{m.description}</p>
            </div>
            <span className={reached ? 'good' : 'muted'}>{reached ? '✓ Reached' : rewardLabel(m.reward)}</span>
          </div>
        )
      })}
    </div>
  )
}
