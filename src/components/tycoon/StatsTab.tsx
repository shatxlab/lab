import { useState } from 'react'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { historyWithNow } from '@/lib/tycoon/sim/history'
import { netPerDay } from '@/lib/tycoon/sim/economy'
import { useGame } from './context'
import { monthLabel } from '@/lib/tycoon/chartMath'
import { formatCount, formatDelta, formatMoney } from '@/lib/tycoon/format'
import { LineChart } from './LineChart'

/** Months of history to show; 0 means everything. */
type Range = 12 | 24 | 0

const RANGES: readonly { id: Range; label: string }[] = [
  { id: 12, label: '1 year' },
  { id: 24, label: '2 years' },
  { id: 0, label: 'All time' },
]

export function StatsTab() {
  const state = useGame()
  const [range, setRange] = useState<Range>(0)
  const [asTable, setAsTable] = useState(false)

  const all = historyWithNow(state)
  const latest = all[all.length - 1].day
  const points = range === 0 ? all : all.filter((p) => p.day >= latest - range * DAYS_PER_MONTH)
  const days = points.map((p) => p.day)

  const net = netPerDay(state)
  const best = [...state.products].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]
  const updates = state.products.reduce((sum, p) => sum + p.updates.length, 0)
  const users = state.products.reduce((sum, p) => sum + p.users, 0)

  return (
    <div className="stats">
      <div className="tiles">
        <div className="stat">
          <span className="label">Money</span>
          <span className={`value ${state.money < 0 ? 'bad' : ''}`}>{formatMoney(state.money)}</span>
          <span className={`sub ${net < 0 ? 'bad' : 'good'}`}>{formatDelta(net)} / day</span>
        </div>
        <div className="stat">
          <span className="label">Lifetime revenue</span>
          <span className="value">{formatMoney(state.lifetimeRevenue)}</span>
        </div>
        <div className="stat">
          <span className="label">Products shipped</span>
          <span className="value">{state.shippedCount}</span>
          <span className="sub">{updates} update{updates === 1 ? '' : 's'}</span>
        </div>
        <div className="stat">
          <span className="label">Users</span>
          <span className="value">{formatCount(users)}</span>
          <span className="sub">{formatCount(state.bugsFixed)} bugs fixed</span>
        </div>
        <div className="stat">
          <span className="label">Best seller</span>
          <span className="value">{best ? best.name : '—'}</span>
          {best && <span className="sub">{formatMoney(best.totalRevenue)} so far</span>}
        </div>
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} className={r.id === range ? 'active' : ''} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button className={!asTable ? 'active' : ''} aria-pressed={!asTable} onClick={() => setAsTable(false)}>
            Chart
          </button>
          <button className={asTable ? 'active' : ''} aria-pressed={asTable} onClick={() => setAsTable(true)}>
            Table
          </button>
        </div>
      </div>

      {state.retired.length > 0 && (
        <section className="past-products">
          <h3>Past products</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Left</th>
                  <th className="num">Users</th>
                  <th className="num">Earned</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {[...state.retired].reverse().map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      {p.hit && ' 🚀'}
                    </td>
                    <td>{monthLabel(p.endDay)}</td>
                    <td className="num">{formatCount(p.users)}</td>
                    <td className="num">{formatMoney(p.totalRevenue)}</td>
                    <td>{p.outcome === 'sold' ? `Sold${p.buyer ? ` to ${p.buyer}` : ''} for ${formatMoney(p.price)}` : 'Retired'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {points.length < 2 ? (
        <p className="muted">The charts fill in as months pass. Check back after the first month.</p>
      ) : asTable ? (
        <div className="table-wrap history-table">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Money</th>
                <th className="num">Income / day</th>
                <th className="num">Costs / day</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day}>
                  <td>{monthLabel(p.day)}</td>
                  <td className="num">{formatMoney(p.money)}</td>
                  <td className="num">{formatMoney(p.income)}</td>
                  <td className="num">{formatMoney(p.burn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <LineChart
            title="Money"
            description="Your balance at the start of each month."
            days={days}
            area
            series={[{ id: 'money', name: 'Money', color: '--series-1', values: points.map((p) => p.money) }]}
          />
          <LineChart
            title="Income and costs"
            description="What your products earn per day, against wages and rent per day."
            days={days}
            series={[
              { id: 'income', name: 'Income', color: '--series-1', values: points.map((p) => p.income) },
              { id: 'costs', name: 'Costs', color: '--series-2', values: points.map((p) => p.burn) },
            ]}
          />
        </>
      )}
    </div>
  )
}
