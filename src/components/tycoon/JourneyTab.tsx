import { STAGES } from '@/lib/tycoon/data/stages'
import { useGame } from './context'

/** From the garage to the top: the stages behind, the goals for the current one, and what is still ahead. */
export function JourneyTab() {
  const state = useGame()
  const signature = state.products.find((p) => p.id === state.signatureId)

  return (
    <div className="journey">
      {signature && (
        <p>
          Known for <strong>{signature.name}</strong> 🚀
        </p>
      )}
      <ol className="stages">
        {STAGES.map((stage, index) => {
          const status = index < state.stage ? 'done' : index === state.stage ? 'current' : 'ahead'
          return (
            <li key={stage.id} className={`stage ${status}`}>
              <div className="stage-head">
                <strong>{stage.name}</strong>
                <span className={status === 'done' ? 'good' : 'muted'}>
                  {status === 'done' ? '✓' : status === 'current' ? 'You are here' : ''}
                </span>
              </div>
              {status !== 'ahead' && <p className="muted">{stage.blurb}</p>}
              {status === 'ahead' && stage.unlocks.length > 0 && <p className="muted">Opens: {stage.unlocks.join(', ')}</p>}
              {status === 'current' && stage.goals.length > 0 && (
                <ul className="goals">
                  {stage.goals.map((goal) => {
                    const met = goal.check(state)
                    return (
                      <li key={goal.id} className={met ? 'met' : ''}>
                        <span>{met ? '✓' : '○'}</span> {goal.label}
                        {!met && goal.progress && <small className="muted"> · {goal.progress(state)}</small>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
