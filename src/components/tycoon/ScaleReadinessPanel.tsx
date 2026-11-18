import { useState } from 'react'
import { getStage, STAGES } from '@/lib/tycoon/data/stages'
import { stageProgress } from '@/lib/tycoon/sim/stages'
import { strikeBackPreview } from '@/lib/tycoon/sim/nemesis'
import { formatMoney } from '@/lib/tycoon/format'
import { useGame, useStore } from './context'

/** Informational live requirements and deliberate cash decisions; never pauses or chooses for the player. */
export function ScaleReadinessPanel() {
  const state = useGame()
  const store = useStore()
  const [error, setError] = useState('')
  const stage = getStage(state.stage)
  const goals = stageProgress(state)
  const next = state.stage < STAGES.length - 1 ? getStage(state.stage + 1).name : 'IPO eligibility'
  const rivalry = strikeBackPreview(state)
  return <details className="plan scale-readiness" aria-label="Company scale readiness">
    <summary>Next scale step · {next} · {goals.filter((g) => g.met).length}/{goals.length} ready</summary>
    <p>Current chapter: {stage.name}. Requirements use today's effective capacity and product health, not a headcount target. Other teams and the business keep running while you plan. Earned chapters are not revoked.</p>
    <ul className="scale-requirements">{goals.map((goal) => <li key={goal.id} className={goal.met ? 'good' : ''}>
      <strong>{goal.met ? '✓' : '○'} {goal.label}</strong>
      {goal.progress && <p>{goal.progress}</p>}
      {!goal.met && goal.remedy && <small className="muted">{goal.remedy}</small>}
    </li>)}</ul>
    {state.stage < STAGES.length - 1 && <p>Next chapter opens: {getStage(state.stage + 1).unlocks.join('; ')}. Reaching it does not create free workers, waive research costs or guarantee user growth.</p>}
    {rivalry && <section className="rivalry-preview" aria-label="Rivalry decision">
      <strong>{rivalry.name}: rivalry ratio {rivalry.ratio.toFixed(2)}</strong>
      <p>To win by income, build {rivalry.requiredDays} lead days with their relative income ratio at or below {rivalry.threshold.toFixed(2)}. Losing the lead erodes progress. Current lead progress: {rivalry.leadDays}/{rivalry.requiredDays}. A large cash balance alone does not lower this ratio.</p>
      <p>Shipping new capabilities and healthy releases can improve your standing. A deliberate paid campaign costs {formatMoney(rivalry.cost)} now, changes the current ratio to {rivalry.after.toFixed(2)}, and has a {rivalry.cooldown}-day cooldown. This is an immediate cash decision, not a floor build. It does not instantly win the rivalry; rivals can still respond.</p>
      <button disabled={!!rivalry.blocker} onClick={() => { const result = store.strikeBack(); setError(result.ok ? '' : result.reason) }}>Strike back · {formatMoney(rivalry.cost)}</button>
      {rivalry.blocker && <p className="warn">{rivalry.blocker}</p>}
      {error && <p role="alert" className="warn">{error}</p>}
    </section>}
  </details>
}
