import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  CANDIDATE_REFRESH_DAYS,
  ERA_WAGE_GROWTH,
  FOUNDER_PAY_SHARE,
  LEAD_FREE_TEAM,
  LEAD_SPEED,
  MORALE_UNHAPPY,
  MOVE_OUT_COST,
  NO_LEAD_SPEED,
  OFFICE_KINDS,
  OUTING_MORALE,
} from '@/lib/tycoon/sim/balance'
import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { monthlySalaries } from '@/lib/tycoon/sim/economy'
import { getTrait } from '@/lib/tycoon/data/traits'
import { needsLead, promotionBlocker, title } from '@/lib/tycoon/sim/careers'
import { hireCost, hiringOffice, payShare, salaryFor } from '@/lib/tycoon/sim/hiring'
import {
  deskCount,
  freeDesks,
  monthlyRent,
  moveOutBlocker,
  newOfficeCost,
  officeName,
  officeSpec,
  openOfficeBlocker,
  staffOf,
} from '@/lib/tycoon/sim/offices'
import { outingBlocker, outingCost } from '@/lib/tycoon/sim/staff'
import { DISCIPLINES, type Employee, type Result } from '@/lib/tycoon/sim/types'
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '@/lib/tycoon/theme'
import { useGame, useOffice, useStore } from './context'
import { formatMoney } from '@/lib/tycoon/format'
import { Modal } from './Modal'

/** A thin bar: green when content, amber when strained, red when about to be a problem. */
export function MoraleBar({ morale, training = false }: { morale: number; training?: boolean }) {
  const tone = morale < MORALE_UNHAPPY ? 'bad' : morale < 60 ? 'warn' : 'good'
  return (
    <div className="morale" title={`Morale ${Math.round(morale)}`}>
      <span className="morale-label">{training ? `Training · morale ${Math.round(morale)}` : `Morale ${Math.round(morale)}`}</span>
      <div className={`track morale-track ${tone}`}>
        <div className="fill" style={{ width: `${morale}%` }} />
      </div>
    </div>
  )
}

const FOUNDER_NOTE = 'One of the two who started the studio. They never leave, cannot be fired or poached, and draw half the market rate, in every era.'

/** What a missing Lead costs, and what one gives, as whole percentages. */
const SLOWER = Math.round((1 - NO_LEAD_SPEED) * 100)
const FASTER = Math.round((LEAD_SPEED - 1) * 100)

function Skills({ employee }: { employee: Employee }) {
  return (
    <span className="skills">
      {DISCIPLINES.map((d) => (
        <span key={d} title={DISCIPLINE_LABELS[d]} style={{ color: DISCIPLINE_COLORS[d] }}>
          <small>{DISCIPLINE_LABELS[d].slice(0, 3)}</small> {Math.round(employee.skills[d])}
        </span>
      ))}
    </span>
  )
}

function Person({ employee, action, showMorale }: { employee: Employee; action: ReactNode; showMorale?: boolean }) {
  const trait = getTrait(employee.trait)
  return (
    <div className={`person ${showMorale ? '' : 'plain'}`}>
      <div className="person-name">
        <strong>
          {employee.name}
          {employee.founder && (
            <span className="founder" title={FOUNDER_NOTE}>
              {' '}
              ★ Founder
            </span>
          )}
        </strong>
        <span className="muted">
          {title(employee)} · {formatMoney(employee.salary)}/mo{employee.founder && ` (${Math.round(FOUNDER_PAY_SHARE * 100)}% of market)`}
        </span>
        <small className="trait" title={trait.description}>
          {trait.name}
        </small>
      </div>
      <Skills employee={employee} />
      {showMorale && <MoraleBar morale={employee.morale} training={employee.training !== null} />}
      <div className="person-action">{action}</div>
    </div>
  )
}

/** A blocker in words: "not ready yet" points at the stage the studio needs to reach. */
function readiness(blocker: string, stage: string): string {
  return blocker === 'The studio is not ready yet' ? `once the studio is ${stage} (see the Journey)` : blocker
}

export function TeamDialog() {
  const store = useStore()
  const state = useGame()
  const [confirmFire, setConfirmFire] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const selected = useOffice()
  const desks = deskCount(state)
  const hireInto = hiringOffice(state, selected.id)
  const many = state.offices.length > 1
  const garage = state.offices.find((o) => o.kind === 'garage')
  const moveOut = moveOutBlocker(state)
  const openOffice = openOfficeBlocker(state)
  const refreshIn = CANDIDATE_REFRESH_DAYS - (state.day % CANDIDATE_REFRESH_DAYS)

  const report = (result: Result) => setMessage(result.ok ? '' : result.reason)
  const fire = (id: number) => {
    if (confirmFire !== id) {
      setConfirmFire(id)
      return
    }
    setConfirmFire(null)
    report(store.fire(id))
  }

  return (
    <Modal title={many ? 'Team & offices' : 'Team & office'} onClose={() => store.closeDialog()}>
      <section className="section">
        <div className="section-head">
          <h3>{many ? 'Offices' : garage ? 'Garage' : 'Office'}</h3>
          <span className="muted">
            {state.employees.length}/{desks} desks · rent {formatMoney(monthlyRent(state))}/mo · payroll{' '}
            {formatMoney(monthlySalaries(state))}/mo
          </span>
        </div>
        {many &&
          state.offices.map((office) => (
            <div key={office.id} className="office-row">
              <span>
                <strong>{officeName(state, office)}</strong>{' '}
                <span className="muted">
                  {staffOf(state, office).length}/{officeSpec(office).desks} desks · rent {formatMoney(officeSpec(office).rent)}/mo
                </span>
              </span>
              {needsLead(state, office) && <small className="warn">needs a Lead · {SLOWER}% slower without one</small>}
              {office.id !== selected.id && <button onClick={() => store.selectOffice(office.id)}>Show</button>}
            </div>
          ))}
        {garage ? (
          <div className="upgrade">
            <span>
              Move out of the garage: <strong>{OFFICE_KINDS.office.desks} desks</strong>, rent {formatMoney(OFFICE_KINDS.office.rent)}/mo
              {moveOut && moveOut !== 'Not enough money' && <small className="muted"> · {readiness(moveOut, 'an indie studio')}</small>}
            </span>
            <button disabled={moveOut !== null} onClick={() => report(store.moveOut())}>
              Move · {formatMoney(MOVE_OUT_COST)}
            </button>
          </div>
        ) : (
          <div className="upgrade">
            <span>
              Open another office: <strong>{OFFICE_KINDS.office.desks} more desks</strong> and a team on its own project
              {openOffice && openOffice !== 'Not enough money' && <small className="muted"> · {readiness(openOffice, 'an established company')}</small>}
            </span>
            <button disabled={openOffice !== null} onClick={() => report(store.openOffice())}>
              Open · {formatMoney(newOfficeCost(state))}
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Your team</h3>
          <span className="muted">
            Salaries follow skills and update monthly. Market wages also rise {Math.round(ERA_WAGE_GROWTH * 100)}% with every era
            {eraIndexAt(state.day) > 0 && ` (+${Math.round(ERA_WAGE_GROWTH * eraIndexAt(state.day) * 100)}% so far)`}.
          </span>
        </div>
        {state.employees.length === 0 && <p className="muted">Nobody works here. Hire someone to start a project.</p>}
        {!many && needsLead(state, state.offices[0]) && (
          <p className="warn">
            An office of more than {LEAD_FREE_TEAM} people needs a Lead to coordinate it: without one it works {SLOWER}% slower, with one {FASTER}% faster.
            Promote a Senior when they are ready.
          </p>
        )}
        {state.employees.length > 0 && (
          <div className="outing">
            <span>
              <strong>Team outing</strong> <span className="muted">+{OUTING_MORALE} morale for everyone</span>
            </span>
            <button disabled={outingBlocker(state) !== null} onClick={() => report(store.teamOuting())}>
              {outingBlocker(state) ?? `Go · ${formatMoney(outingCost(state))}`}
            </button>
          </div>
        )}
        {state.employees.map((employee) => (
          <Person
            key={employee.id}
            employee={employee}
            showMorale
            action={
              <>
                {promotionBlocker(state, employee) === null && (
                  <button
                    className="primary"
                    title={`Raise to ${formatMoney(salaryFor(employee.skills, employee.trait, employee.level + 1, state.day, payShare(employee)))}/mo`}
                    onClick={() => report(store.promoteEmployee(employee.id))}
                  >
                    Promote
                  </button>
                )}
                {many && (
                  <select
                    aria-label={`Office for ${employee.name}`}
                    value={employee.officeId}
                    onChange={(event) => report(store.transfer(employee.id, Number((event.target as HTMLSelectElement).value)))}
                  >
                    {state.offices.map((office) => (
                      <option key={office.id} value={office.id} disabled={office.id !== employee.officeId && freeDesks(state, office) <= 0}>
                        {officeName(state, office)}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => store.openDialog({ kind: 'employee', id: employee.id })}>Details</button>
                {!employee.founder && (
                  <button
                    className={confirmFire === employee.id ? 'danger' : ''}
                    onClick={() => fire(employee.id)}
                    onBlur={() => setConfirmFire(null)}
                  >
                    {confirmFire === employee.id ? 'Confirm' : 'Fire'}
                  </button>
                )}
              </>
            }
          />
        ))}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Candidates</h3>
          <span className="muted">
            New faces in {refreshIn} days. Signing fee is one month's salary.
            {many && hireInto && ` New hires join ${officeName(state, hireInto)}.`}
          </span>
        </div>
        {state.candidates.length === 0 && <p className="muted">No one is looking right now.</p>}
        {state.candidates.map((candidate) => {
          const cost = hireCost(candidate)
          const blocked = !hireInto ? 'No free desk' : state.money < cost ? 'Too expensive' : ''
          return (
            <Person
              key={candidate.id}
              employee={candidate}
              action={
                <button className="primary" disabled={blocked !== ''} onClick={() => report(store.hire(candidate.id))}>
                  {blocked || `Hire · ${formatMoney(cost)}`}
                </button>
              }
            />
          )
        })}
      </section>

      {message && <p className="bad">{message}</p>}
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
