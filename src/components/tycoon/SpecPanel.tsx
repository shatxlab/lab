import { effectText, getWorkItem } from '@/lib/tycoon/data/workstreams'
import { SPEC_DECIDE_DAYS } from '@/lib/tycoon/sim/balance'
import { describeProposal } from '@/lib/tycoon/sim/cycle'
import { nextVersion } from '@/lib/tycoon/sim/releases'
import type { Office, Product } from '@/lib/tycoon/sim/types'
import { useGame, useStore } from './context'

const BUMP_NAMES = { major: 'big release', minor: 'feature release', patch: 'upkeep' } as const

/** The spec a floor is writing, and when it is done, the requirements to choose from. */
export function SpecPanel({ office, product }: { office: Office; product: Product }) {
  const store = useStore()
  const state = useGame()
  const spec = office.spec
  if (!spec) return null

  if (spec.phase === 'writing') {
    const done = Math.min(1, (state.day - spec.startDay) / spec.days)
    return (
      <section className="project spec">
        <div className="project-head">
          <div>
            <strong>📝 {product.name}: writing the spec</strong>
            <span className="muted"> · analysts read the numbers, the product manager writes · clarity {spec.clarity}%</span>
          </div>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${done * 100}%` }} />
        </div>
      </section>
    )
  }

  const left = Math.max(0, SPEC_DECIDE_DAYS - (state.day - (spec.askedDay ?? state.day)))
  return (
    <section className="project spec">
      <div className="project-head">
        <div>
          <strong>📝 {product.name}: what should the next release be?</strong>
          <span className="muted"> · clarity {spec.clarity}%{spec.clarity < 50 ? ' (a vague spec: more rework, more bugs)' : ''} · the product manager picks in {left} day{left === 1 ? '' : 's'}</span>
        </div>
        <button onClick={() => store.discardSpec(office.id)} title="The analysts read the product again, which takes a few more days">
          Send back
        </button>
      </div>
      <div className="spec-cards">
        {spec.proposals.map((proposal, index) => {
          const { title, bump, blurb } = describeProposal(proposal)
          const item = proposal.kind === 'item' ? getWorkItem(proposal.id) : undefined
          return (
            <div key={`${proposal.kind}:${proposal.id}`} className="spec-card">
              <strong>
                {product.name} {nextVersion(product, bump)}: {title}
              </strong>
              <small className="muted">{BUMP_NAMES[bump]}</small>
              <span>{proposal.why}.</span>
              <small className="muted">{item ? effectText(item.effect) || blurb : blurb}</small>
              <button className="primary" onClick={() => store.chooseRequirement(office.id, index)}>
                Build this
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
