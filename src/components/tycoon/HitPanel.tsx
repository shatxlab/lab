import { getDeepWork } from '@/lib/tycoon/data/deepwork'
import { formatCount } from '@/lib/tycoon/format'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { buildDaysLeft, canResearch, cardText, cycleProduct, researchPlanBlocker } from '@/lib/tycoon/sim/cycle'
import { deepWorkChance } from '@/lib/tycoon/sim/deepwork'
import { nemesisRival } from '@/lib/tycoon/sim/nemesis'
import { helpersOf } from '@/lib/tycoon/sim/offices'
import { loadOf } from '@/lib/tycoon/sim/scale'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import { PLAN_RESEARCH_DAYS } from '@/lib/tycoon/sim/balance'
import type { Plan, Product } from '@/lib/tycoon/sim/types'
import { useGame, useStore } from './context'

/** The hit in one line; a tap opens the numbers behind it. */
function HitStrip({ hit }: { hit: Product }) {
  const store = useStore()
  const state = useGame()
  const load = loadOf(hit)
  const rival = nemesisRival(state)
  return (
    <button className="hit-strip" onClick={() => store.openDialog({ kind: 'studio', tab: 'company' })} aria-label={`${hit.name}: open the company's numbers`}>
      <strong>{hit.name}</strong>
      <span>
        {formatCount(hit.users)} {getProductType(hit.productTypeId).userNoun}
      </span>
      <span>fit {Math.round(hit.fit ?? 0)}</span>
      <span className={load >= 0.92 ? 'bad' : load >= 0.8 ? 'warn' : ''}>servers {Math.round(load * 100)}%</span>
      {rival && (rival.ratio ?? 0) >= 1 && <span className="bad">{rival.name} is ahead</span>}
    </button>
  )
}

/** The cards on the table: the clock waits until one is played. */
function PlanCards({ hit, plan }: { hit: Product; plan: Plan }) {
  const store = useStore()
  const state = useGame()
  if (plan.researchUntil !== undefined) {
    return (
      <section className="plan">
        <strong>The analysts are in the numbers</strong>
        <small className="muted"> · {Math.max(0, plan.researchUntil - state.day)} days left, then new cards</small>
      </section>
    )
  }
  const blocker = researchPlanBlocker(state)
  return (
    <section className="plan" aria-label="What next?">
      <div className="plan-head">
        <strong>What next?</strong>
        <small className="muted">Time waits for you</small>
      </div>
      <div className="plan-cards">
        {plan.cards.map((card, index) => {
          const text = cardText(state, hit, card, plan.clarity)
          return (
            <button key={`${card.kind}:${card.id}`} className="plan-card" disabled={text.blocker !== null} onClick={() => store.chooseCard(index)}>
              <strong>
                {text.title}
                {text.version && <small className="muted"> {text.version}</small>}
              </strong>
              <span className="good">{text.effect}</span>
              <small className="muted">
                {card.why} · {text.blocker ?? text.cost}
              </small>
            </button>
          )
        })}
      </div>
      <div className="plan-foot">
        <small className="muted">
          {canResearch(state) ? `Clarity ${plan.clarity}%: a vague plan takes longer and ships more bugs.` : 'Nobody reads the numbers: plans are vague. Hire an analyst.'}
        </small>
        {canResearch(state) && (
          <button disabled={blocker !== null} title={blocker ?? undefined} onClick={() => store.researchPlan()}>
            Research more · {PLAN_RESEARCH_DAYS} days
          </button>
        )}
      </div>
    </section>
  )
}

/** The hit's part of the screen: one line about it, then the one thing the company is doing. */
export function HitPanel() {
  const state = useGame()
  const hit = cycleProduct(state)
  if (!hit) return null
  const lead = state.offices.find((o) => o.project?.byTeam && o.project.parentId === hit.id)
  const project = lead?.project
  const deep = state.deepWork
  const helpers = lead ? helpersOf(state, lead).length : 0

  return (
    <div className="hit-panel">
      <HitStrip hit={hit} />
      {state.plan && <PlanCards hit={hit} plan={state.plan} />}
      {lead && project && (
        <section className="plan build">
          <div className="plan-head">
            <strong>{project.name}</strong>
            <small className="muted">
              about {buildDaysLeft(state, lead, hit)} days left{helpers > 0 ? ` · ${helpers + 1} floors on it` : ''}
            </small>
          </div>
          {project.spec?.promise && <small className="good">{project.spec.promise}</small>}
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(1, overallProgress(project)) * 100}%` }} />
          </div>
        </section>
      )}
      {deep && !project && (
        <section className="plan build">
          <div className="plan-head">
            <strong>{getDeepWork(deep.kind)?.name}</strong>
            <small className="muted">
              {Math.max(0, deep.startDay + deep.days - state.day)} days left · about {Math.round(deepWorkChance(state) * 100)}% to work out
            </small>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(1, (state.day - deep.startDay) / deep.days) * 100}%` }} />
          </div>
        </section>
      )}
    </div>
  )
}
