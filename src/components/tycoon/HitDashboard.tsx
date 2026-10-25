import { getProductType } from '@/lib/tycoon/data/productTypes'
import { formatCount, formatMoney } from '@/lib/tycoon/format'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { fitPressure, retention, totalPressure } from '@/lib/tycoon/sim/fit'
import { WORKSTREAM_INFO } from '@/lib/tycoon/data/workstreams'
import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { DEFAULT_WORKSTREAM } from '@/lib/tycoon/sim/teams'
import { WORKSTREAMS, type Workstream } from '@/lib/tycoon/sim/types'
import { productIncome } from '@/lib/tycoon/sim/economy'
import { companionsOf, freeSlots } from '@/lib/tycoon/sim/companions'
import { usersIn } from '@/lib/tycoon/sim/products'
import { capacityOf, hostingCost, loadOf } from '@/lib/tycoon/sim/scale'
import { releaseKey } from '@/lib/tycoon/sim/fit'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { nemesisRival, nemesisStanding, strikeBackBlocker, strikeBackCost } from '@/lib/tycoon/sim/nemesis'
import { NEMESIS_BEAT_DAYS } from '@/lib/tycoon/sim/balance'
import { useGame, useStore } from './context'
import { FitMeter } from './FitMeter'

const CAUSES = { stale: 'it has gone stale', bugs: 'open bugs', rivals: 'rivals in its market', missing: 'features users now expect', companions: 'a companion nobody looks after' } as const

/** The hit, once the studio is out of the garage: its users, fit, servers, income and what presses on it. */
export function HitDashboard() {
  const store = useStore()
  const state = useGame()
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit || inGarage(state)) return null

  const income = productIncome(state, hit) * statMultiplier(state, 'revenue')
  const load = loadOf(hit)
  const pressure = fitPressure(state, hit)
  const worst = (Object.keys(CAUSES) as (keyof typeof CAUSES)[]).reduce((a, b) => (pressure[b] > pressure[a] ? b : a))
  const kept = Math.round(retention(hit) * 100)
  const eu = usersIn(hit, 'eu')
  const loadTone = load >= 1 ? 'bad' : load >= 0.8 ? 'warn' : 'good'

  return (
    <section className="hit-dash" aria-label={`${hit.name} at a glance`}>
      <div className="hit-dash-head">
        <strong>{hit.name}</strong>
        <span className="muted">
          {getProductType(hit.productTypeId).name} · {formatCount(hit.users)} {getProductType(hit.productTypeId).userNoun}
          {eu > 0 && ` (${formatCount(eu)} in Europe)`}
        </span>
        <button onClick={() => store.openDialog({ kind: 'roadmap', productId: hit.id })}>Roadmap…</button>
      </div>
      <div className="hit-dash-grid">
        <div>
          <small className="muted">Income</small>
          <strong>{formatMoney(income)}/day</strong>
          <small className="muted">
            ${((income * DAYS_PER_MONTH) / Math.max(1, hit.users)).toFixed(2)} a user a month · servers {formatMoney(hostingCost(state))}/day
          </small>
        </div>
        <div>
          <small className="muted">Servers</small>
          <strong className={loadTone}>{Math.round(load * 100)}% full</strong>
          <small className="muted">holds {formatCount(capacityOf(hit))}{load >= 0.92 ? ' · outages likely: build Scale' : ''}</small>
        </div>
        <div>
          <FitMeter fit={hit.fit ?? 0} rangeKey={releaseKey(hit)} taken />
          <small className="muted">
            {totalPressure(pressure) > 0.02 ? `Sagging: ${CAUSES[worst]}` : 'Holding'} · keeps {kept}% of users
          </small>
        </div>
      </div>
      {state.nemesis && nemesisRival(state) && nemesisStanding(state) && (
        <div className="hit-dash-rival">
          <strong>{nemesisRival(state)!.name}</strong>{' '}
          <span className="muted">
            {state.nemesis.founder} earns {formatMoney(nemesisStanding(state)!.theirs)}/day against your {formatMoney(nemesisStanding(state)!.yours)}.{' '}
            {state.nemesis.leadDays > 0 ? `You have been ahead ${state.nemesis.leadDays} of ${NEMESIS_BEAT_DAYS} days.` : 'Finish roadmap items and keep fit high to pull ahead.'}
          </span>
          <small className="muted"> {state.nemesis.story}</small>{' '}
          <button disabled={strikeBackBlocker(state) !== null} title={strikeBackBlocker(state) ?? 'A campaign aimed at their customers: sets them back'} onClick={() => store.strikeBack()}>
            Strike back · {formatMoney(strikeBackCost(state))}
          </button>
        </div>
      )}
      <div className="hit-dash-floors">
        {state.offices
          .filter((o) => o.kind === 'office' && o.productId === hit.id)
          .map((office) => (
            <label key={office.id} title={WORKSTREAM_INFO[office.workstream ?? DEFAULT_WORKSTREAM].blurb}>
              <span className="muted">{officeName(state, office)} focus</span>{' '}
              <select value={office.workstream ?? DEFAULT_WORKSTREAM} onChange={(e) => store.setWorkstream(office.id, e.target.value as Workstream)}>
                {WORKSTREAMS.map((w) => (
                  <option key={w} value={w}>
                    {WORKSTREAM_INFO[w].name}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
      <small className="muted">
        {companionsOf(state).length === 0
          ? `No companion products yet (${freeSlots(state)} slot${freeSlots(state) === 1 ? '' : 's'} free).`
          : `Companions: ${companionsOf(state).map((p) => `${p.name} (${p.role})`).join(', ')}.`}
      </small>
    </section>
  )
}
