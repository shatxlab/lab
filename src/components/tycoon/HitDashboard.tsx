import { getProductType } from '@/lib/tycoon/data/productTypes'
import { formatCount, formatMoney } from '@/lib/tycoon/format'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { fitPressure, retention, totalPressure } from '@/lib/tycoon/sim/fit'
import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { floorCycle } from '@/lib/tycoon/sim/cycle'
import { formatVersion, versionOf } from '@/lib/tycoon/sim/releases'
import { productIncome } from '@/lib/tycoon/sim/economy'
import { agentEffects } from '@/lib/tycoon/sim/agents'
import { companionEffects, companionsOf, freeSlots } from '@/lib/tycoon/sim/companions'
import { usersIn } from '@/lib/tycoon/sim/products'
import { capacityOf, hostingCost, loadOf } from '@/lib/tycoon/sim/scale'
import { releaseKey } from '@/lib/tycoon/sim/fit'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { nemesisRival, nemesisStanding, strikeBackBlocker, strikeBackCost } from '@/lib/tycoon/sim/nemesis'
import { NEMESIS_BEAT_DAYS } from '@/lib/tycoon/sim/balance'
import { DEEP_WORK, getDeepWork } from '@/lib/tycoon/data/deepwork'
import { deepWorkBlocker, deepWorkChance } from '@/lib/tycoon/sim/deepwork'
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
  const kept = Math.round(retention(hit, companionEffects(state).retention + agentEffects(state).churn) * 100)
  const eu = usersIn(hit, 'eu')
  const latest = hit.releases?.at(-1)
  const loadTone = load >= 1 ? 'bad' : load >= 0.8 ? 'warn' : 'good'

  return (
    <section className="hit-dash" aria-label={`${hit.name} at a glance`}>
      <div className="hit-dash-head">
        <strong>{hit.name}</strong>
        <span className="muted">
          {getProductType(hit.productTypeId).name} · {formatCount(hit.users)} {getProductType(hit.productTypeId).userNoun}
          {eu > 0 && ` (${formatCount(eu)} in Europe)`}
        </span>
        <button onClick={() => store.openDialog({ kind: 'releases', productId: hit.id })}>{formatVersion(versionOf(hit))} · Releases…</button>
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
      <div className="hit-dash-deep">
        {state.deepWork ? (
          <small>
            <strong>Deep work:</strong> {getDeepWork(state.deepWork.kind)?.name}, day {Math.min(state.deepWork.days, state.day - state.deepWork.startDay)} of {state.deepWork.days}. About{' '}
            {Math.round(deepWorkChance(state) * 100)}% to work out. You gather no insight meanwhile.
          </small>
        ) : (
          <>
            <small className="muted">Deep work, by your own hands:</small>{' '}
            {DEEP_WORK.map((kind) => {
              const blocker = deepWorkBlocker(state, kind.id)
              return (
                <button key={kind.id} disabled={blocker !== null} title={`${kind.blurb} ${kind.days} days. Works: ${kind.reward}. Does not: ${kind.failure}.${blocker ? ` (${blocker})` : ''}`} onClick={() => store.startDeepWork(kind.id)}>
                  {kind.name} · {kind.days}d
                </button>
              )
            })}
          </>
        )}
      </div>
      {state.friendArc && (
        <small className="muted">
          {state.friendArc.stage === 'gone'
            ? `${state.friendArc.left?.name ?? 'Your friend'} left to join your rival. They might write one day.`
            : `${state.employees.find((e) => e.founder && e.title === 'CTO')?.name ?? 'Your friend'}: ${state.friendArc.bond >= 70 ? 'closer than ever' : state.friendArc.bond >= 40 ? 'still with you' : 'drifting'}.`}
        </small>
      )}
      <div className="hit-dash-floors">
        {latest && (
          <small>
            <span className="muted">Last release:</span> <strong>{latest.version}{latest.title && ` ${latest.title}`}</strong>{' '}
            <span className={latest.reachAfter >= latest.reachBefore ? 'good' : 'bad'}>
              reach {Math.round((latest.reachAfter / Math.max(1, latest.reachBefore) - 1) * 100) >= 0 ? '+' : ''}
              {Math.round((latest.reachAfter / Math.max(1, latest.reachBefore) - 1) * 100)}%
            </span>
          </small>
        )}
        {state.offices
          .filter((o) => o.kind === 'office' && o.productId === hit.id)
          .map((office) => (
            <small key={office.id} className="muted">
              {officeName(state, office)}: {floorCycle(state, office)}
            </small>
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
