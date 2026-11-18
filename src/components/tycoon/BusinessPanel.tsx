import { formatCount, formatDelta, formatMoney } from '@/lib/tycoon/format'
import { businessDelta } from '@/lib/tycoon/sim/business-history'
import { businessOverview } from '@/lib/tycoon/sim/business'
import { useGame } from './context'

/** Informational only: inspecting the business never opens a clock-blocking dialog. */
export function BusinessPanel() {
  const state = useGame()
  if (!state.products.some((product) => product.hit)) return null
  const view = businessOverview(state)
  const last = [...(state.businessDecisions ?? [])].reverse().find((entry) => entry.after)
  const delta = last?.after ? businessDelta(last.before, last.after) : null
  return (
    <details className="business-panel">
      <summary>Business today · {formatMoney(view.revenue)}/day revenue · {formatDelta(view.net)}/day net</summary>
      <p>Daily costs: salaries {formatMoney(view.costs.salaries)} · rent {formatMoney(view.costs.rent)} · hosting {formatMoney(view.costs.hosting)} · tools {formatMoney(view.costs.tools)}.</p>
      <p>{view.runway === null ? 'Current income covers operating costs.' : `Cash runway at today's rates: ${Math.floor(view.runway)} days.`} One-off purchases are not included.</p>
      {view.products.map((product) => (
        <div key={product.id}>
          <strong>{product.name}</strong> · fit {Math.round(product.fit)} · {formatCount(product.users)} / {formatCount(product.capacity)} server capacity
          <p>Organic demand pull: {(product.growth.rate * 100).toFixed(3)}%/day. {product.growth.health > 0 ? 'Healthy fit supports organic demand; market saturation slows it.' : 'Improve product fit to restore organic momentum.'} This is not a forecast of user growth or revenue.</p>
          {product.limits.map((limit) => <p className="warn" key={limit}>{limit}</p>)}
        </div>
      ))}
      {last && delta && <div className="business-change">
        <strong>What changed: {last.title}</strong>
        <p>From decision to completion ({delta.day} days): cash {formatDelta(delta.cash)}, daily revenue {formatDelta(delta.revenue)}, users {delta.users >= 0 ? '+' : '−'}{formatCount(Math.abs(delta.users))}, fit {delta.fit >= 0 ? '+' : ''}{delta.fit.toFixed(1)}.</p>
        <p>Observed over this interval, not all caused by this initiative. Other work, daily costs, demand and market events also contribute. Completion measurements precede the rest of that day’s user and income updates.</p>
      </div>}
      <p>Available build capacity: {view.workers} builders · {Object.entries(view.capacity).map(([discipline, rate]) => `${discipline} ${rate.toFixed(1)}`).join(' · ')} points/day before project knowledge, daily variation and progress caps. Analysts, product managers and staff fixing bugs are excluded. This is potential output, not a staffed assignment.</p>
    </details>
  )
}
