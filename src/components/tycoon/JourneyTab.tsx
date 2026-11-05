import { skippedStageGoals, stageProgress } from '@/lib/tycoon/sim/stages'
import { STAGES } from '@/lib/tycoon/data/stages'
import { useGame } from './context'

/** From the garage to the top: the stages behind, the goals for the current one, and what is still ahead. */
export function JourneyTab() {
  const state = useGame()
  const signature = state.products.find((p) => p.id === state.signatureId) ?? state.retired.find((p) => p.id === state.signatureId)

  return (
    <div className="journey">
      {signature && (
        <p>
          Known for <strong>{signature.name}</strong> 🚀
        </p>
      )}
      {state.founding && <p className="muted">New paid company: professional-product traffic goals use fixed base-price equivalence to Web App users. Current cash, monetisation upgrades and deals cannot lower them. Revenue, profitability, paid work and charter conditions still apply.</p>}
      <ol className="stages">
        {STAGES.map((stage, index) => {
          const goals = stageProgress(state, index)
          const skipped = skippedStageGoals(state, index)
          const notApplicable = skipped.length > 0 && goals.length === 0
          const status = index < state.stage ? 'done' : index === state.stage ? 'current' : 'ahead'
          return (
            <li key={stage.id} className={`stage ${notApplicable ? 'not-applicable' : status}`}>
              <div className="stage-head">
                <strong>{stage.name}</strong>
                <span className={!notApplicable && status === 'done' ? 'good' : 'muted'}>
                  {notApplicable ? 'Not applicable to this charter' : status === 'done' ? '✓' : status === 'current' ? 'You are here' : ''}
                </span>
              </div>
              {status !== 'ahead' && !notApplicable && <p className="muted">{stage.blurb}</p>}
              {skipped.length > 0 && <ul className="muted" aria-label="Charter exceptions">{skipped.map((goal) =>
                <li key={goal.id}>{goal.label} · Not applicable to this charter</li>,
              )}</ul>}
              {status === 'ahead' && stage.unlocks.length > 0 && <p className="muted">Opens: {stage.unlocks.join(', ')}</p>}
              {status === 'current' && goals.length > 0 && (
                <ul className="goals">
                  {goals.map((goal) => {
                    const met = goal.met
                    return (
                      <li key={goal.id} className={met ? 'met' : ''}>
                        <span>{met ? '✓' : '○'}</span> {goal.label}
                        {!met && goal.progress && <small className="muted"> · {goal.progress}</small>}
                        {!met && goal.remedy && <small className="muted"> · {goal.remedy}</small>}
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
