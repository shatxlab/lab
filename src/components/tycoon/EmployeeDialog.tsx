import { useState } from 'react'
import { getTrait } from '@/lib/tycoon/data/traits'
import { LEVELS, MORALE_UNHAPPY, PROMOTION_PATIENCE_DAYS, TRAINING_DAYS } from '@/lib/tycoon/sim/balance'
import { promotionBlocker, title } from '@/lib/tycoon/sim/careers'
import { salaryFor } from '@/lib/tycoon/sim/hiring'
import { moraleSpeed } from '@/lib/tycoon/sim/morale'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { KNOWLEDGE_PRODUCT_MAX, KNOWLEDGE_TYPE_MAX } from '@/lib/tycoon/sim/balance'
import { knowledgeSpeed, topExpertise } from '@/lib/tycoon/sim/knowledge'
import { moraleTarget, trainingBlocker, trainingCost, trainingGain } from '@/lib/tycoon/sim/staff'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '@/lib/tycoon/theme'
import { useGame, useStore } from './context'
import { formatAge, formatMoney } from '@/lib/tycoon/format'
import { Modal } from './Modal'
import { cssVars } from './style'
import { MoraleBar } from './TeamDialog'

/** One person: skills (with training), their trait, and how they are feeling. */
export function EmployeeDialog({ id }: { id: number }) {
  const store = useStore()
  const state = useGame()
  const [confirmFire, setConfirmFire] = useState(false)
  const [message, setMessage] = useState('')
  const person = state.employees.find((e) => e.id === id)

  if (!person) {
    return (
      <Modal title="Gone" onClose={() => store.closeDialog()}>
        <p className="muted">This person no longer works here.</p>
        <div className="actions">
          <button onClick={() => store.closeDialog()}>Close</button>
        </div>
      </Modal>
    )
  }

  const trait = getTrait(person.trait)
  const target = Math.round(moraleTarget(state, person))
  const daysLeft = person.training ? Math.max(0, person.training.finishDay - state.day) : null
  const next = LEVELS[person.level + 1]
  const promotion = promotionBlocker(state, person)
  const waiting = person.readySince === null ? 0 : state.day - person.readySince

  const fire = () => {
    if (!confirmFire) {
      setConfirmFire(true)
      return
    }
    store.fire(person.id)
    store.openDialog({ kind: 'team' })
  }

  return (
    <Modal title={person.name} onClose={() => store.closeDialog()}>
      <p className="muted">
        {title(person)} · {formatMoney(person.salary)}/mo · with you {formatAge(state.day - person.hiredDay)}
      </p>
      {person.founder && (
        <p>
          <strong>★ Founder.</strong> <span className="muted">They started this studio with you: they never leave, cannot be fired or poached, and draw half the market rate, in every era.</span>
        </p>
      )}

      <section className="section">
        <div className="section-head">
          <h3>Career</h3>
          <span className="muted">
            {LEVELS[person.level].name} for {formatAge(state.day - person.levelDay)}
          </span>
        </div>
        {next ? (
          promotion === null ? (
            <div className="upgrade">
              <span className={waiting > PROMOTION_PATIENCE_DAYS ? 'bad' : ''}>
                Ready to be a {next.name.toLowerCase()}
                {waiting > PROMOTION_PATIENCE_DAYS ? ', and unhappy to be kept waiting' : ''}. New salary{' '}
                {formatMoney(salaryFor(person.skills, person.trait, person.level + 1, state.day))}/mo.
              </span>
              <button className="primary" onClick={() => setMessage(store.promoteEmployee(person.id).ok ? '' : 'Could not promote them.')}>
                Promote
              </button>
            </div>
          ) : (
            <p className="muted">
              Next: {next.name.toLowerCase()}. {promotion}.
            </p>
          )
        ) : (
          <p className="muted">A Lead: their office works faster and happier for having them.</p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>{trait.name}</h3>
        </div>
        {trait.description && <p className="muted">{trait.description}</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Mood</h3>
          <span className="muted">
            works at {Math.round(moraleSpeed(person.morale) * 100)}% pace · settling around {target}
          </span>
        </div>
        <MoraleBar morale={person.morale} />
        {person.morale < MORALE_UNHAPPY && <p className="bad">Unhappy: a team outing or a good release would help. Left too long, they may quit.</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Experience</h3>
          <span className="muted">Days of hands-on work. It makes them faster on that kind of product (up to +{Math.round(KNOWLEDGE_TYPE_MAX * 100)}%) and on that very product (up to +{Math.round(KNOWLEDGE_PRODUCT_MAX * 100)}%).</span>
        </div>
        {topExpertise(state, person).length === 0 ? (
          <p className="muted">Nothing yet: it builds up as they work on products.</p>
        ) : (
          topExpertise(state, person).map((e) => (
            <div key={`${e.kind}-${e.id}`} className="skill-row">
              <span className="skill-name">{e.kind === 'type' ? getProductType(e.id).name : e.name}</span>
              <strong className="skill-value">{e.days} days</strong>
              <span className="muted">{e.kind === 'type' ? 'this kind of product' : `+${Math.round((knowledgeSpeed(person, { typeId: '', productId: Number(e.id) }) - 1) * 100)}% on it`}</span>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Skills</h3>
          <span className="muted">Training takes {TRAINING_DAYS} days away from the project.</span>
        </div>
        {daysLeft !== null && person.training && (
          <p className="good">
            Training {DISCIPLINE_LABELS[person.training.discipline]}: {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </p>
        )}
        {DISCIPLINES.map((d) => {
          const blocker = trainingBlocker(state, person, d)
          return (
            <div key={d} className="skill-row" style={cssVars({ '--c': DISCIPLINE_COLORS[d] })}>
              <span className="skill-name">{DISCIPLINE_LABELS[d]}</span>
              <div className="track">
                <div className="fill" style={{ width: `${person.skills[d]}%` }} />
              </div>
              <strong className="skill-value">{Math.round(person.skills[d])}</strong>
              <button disabled={blocker !== null} onClick={() => setMessage(store.train(person.id, d).ok ? '' : 'Could not start that course.')}>
                {blocker ?? `Train · ${formatMoney(trainingCost(person, d))} · +${trainingGain(person, d).toFixed(1)}`}
              </button>
            </div>
          )
        })}
      </section>

      {message && <p className="bad">{message}</p>}
      <div className="actions">
        <button onClick={() => store.openDialog({ kind: 'team' })}>Back to team</button>
        {!person.founder && (
          <button className={confirmFire ? 'danger' : ''} onClick={fire} onBlur={() => setConfirmFire(false)}>
            {confirmFire ? 'Confirm' : 'Fire'}
          </button>
        )}
      </div>
    </Modal>
  )
}
