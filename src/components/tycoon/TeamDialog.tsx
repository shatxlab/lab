import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  CANDIDATE_REFRESH_DAYS,
  ERA_WAGE_GROWTH,
  FOUNDER_PAY_SHARE,
  LEAD_FREE_TEAM,
  LEAD_SPEED,
  MAX_OFFICES,
  MORALE_UNHAPPY,
  MOVE_OUT_COST,
  NO_LEAD_SPEED,
  OFFICE_KINDS,
  OUTING_MORALE,
  REMOTE_SPEED,
} from '@/lib/tycoon/sim/balance'
import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { REGION_NAME } from '@/lib/tycoon/data/regions'
import { monthlySalaries } from '@/lib/tycoon/sim/economy'
import { getTrait } from '@/lib/tycoon/data/traits'
import { needsLead, pmBlocker, promotionBlocker, title } from '@/lib/tycoon/sim/careers'
import { hasAnalyst, insightRate } from '@/lib/tycoon/sim/insight'
import { pmEffectText } from '@/lib/tycoon/sim/direction'
import { eraWageFactor, hireCost, hiringOffice, payShare, salaryFor } from '@/lib/tycoon/sim/hiring'
import {
  deskCount,
  buildingName,
  canBeSold,
  freeDesks,
  getOffice,
  monthlyRent,
  moveOutBlocker,
  newOfficeCost,
  officeName,
  officeSpec,
  openableRegions,
  openOfficeBlocker,
  regionOf,
  staffOf,
  teamOfficeId,
} from '@/lib/tycoon/sim/offices'
import { outingBlocker, outingCost } from '@/lib/tycoon/sim/staff'
import { DISCIPLINES, isBuilder, REGIONS, type Employee, type Region, type Result } from '@/lib/tycoon/sim/types'
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
  if (!isBuilder(employee)) {
    return (
      <span className="skills">
        <span title="Reading users and markets" style={{ color: DISCIPLINE_COLORS.design }}>
          <small>Analysis</small> {Math.round(employee.analysis ?? 0)}
        </span>
      </span>
    )
  }
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

/** One person's row; with `actionsBelow` their controls get a row of their own (with several offices there are too many for one line). */
function Person({ employee, action, showMorale, actionsBelow }: { employee: Employee; action: ReactNode; showMorale?: boolean; actionsBelow?: boolean }) {
  const trait = getTrait(employee.trait)
  return (
    <div className={`person ${showMorale ? '' : 'plain'} ${actionsBelow ? 'actions-below' : ''}`}>
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
  const [confirmMove, setConfirmMove] = useState(false)
  const [message, setMessage] = useState('')

  const selected = useOffice()
  const desks = deskCount(state)
  const regions = REGIONS.filter((r) => state.offices.some((o) => regionOf(o) === r))
  const freeIn = (r: Region) => state.offices.filter((o) => regionOf(o) === r).reduce((sum, o) => sum + freeDesks(state, o), 0)
  // Hire where there is room: the shown office's region if it has a free desk, else one that does.
  const [hireRegion, setHireRegion] = useState<Region | null>(null)
  const region = hireRegion ?? (freeIn(regionOf(selected)) > 0 ? regionOf(selected) : (regions.find((r) => freeIn(r) > 0) ?? regionOf(selected)))
  const hireInto = hiringOffice(state, selected.id, region)
  const pool = state.candidates.filter((c) => (c.region ?? 'us') === region)
  const many = state.offices.length > 1
  const garage = state.offices.find((o) => o.kind === 'garage')
  const moveOut = moveOutBlocker(state)
  const openRegions = openableRegions(state)
  const [openRegion, setOpenRegion] = useState<Region | ''>('')
  const openWhere: Region = openRegion !== '' && openRegions.includes(openRegion) ? openRegion : (openRegions[0] ?? 'us')
  const openOffice = openOfficeBlocker(state, openWhere)
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
                  {REGION_NAME[regionOf(office)]} · {staffOf(state, office).length}/{officeSpec(office).desks} desks · rent {formatMoney(officeSpec(office).rent)}/mo
                </span>
              </span>
              {needsLead(state, office) && <small className="warn">needs a Lead · {SLOWER}% slower without one</small>}
              {pmEffectText(state, office) && <small className="good" title="Their product manager steers what this office launches and grows">PM: {pmEffectText(state, office)}</small>}
              {office.id !== selected.id && <button onClick={() => store.selectOffice(office.id)}>Show</button>}
            </div>
          ))}
        {garage ? (
          <div className="upgrade">
            <span>
              Move out of the garage: <strong>{OFFICE_KINDS.office.desks} desks</strong>, rent {formatMoney(OFFICE_KINDS.office.rent)}/mo
              {moveOut && moveOut !== 'Not enough money' && <small className="muted"> · {readiness(moveOut, 'an indie studio')}</small>}
            </span>
            <button
              disabled={moveOut !== null}
              className={confirmMove ? 'danger' : ''}
              onClick={() => (confirmMove ? report(store.moveOut()) : setConfirmMove(true))}
              onBlur={() => setConfirmMove(false)}
            >
              {confirmMove ? 'Sure? Leave the garage' : `Move · ${formatMoney(MOVE_OUT_COST)}`}
            </button>
          </div>
        ) : (
          state.offices.length < MAX_OFFICES && (
          <div className="upgrade">
            <span>
              {openWhere === 'eu' && !state.offices.some((o) => regionOf(o) === 'eu') ? (
                <>Open a building in Europe: its first floor, <strong>{OFFICE_KINDS.office.desks} desks</strong> and a team, and the European market for your products</>
              ) : (
                <>Add a floor to {buildingName(openWhere)}: <strong>{OFFICE_KINDS.office.desks} more desks</strong> and a team on its own product</>
              )}
              {canBeSold(state) && state.signatureId !== null && !state.exit.closed && <small className="warn"> · nobody buys a studio with a building: offers stop</small>}
              {openOffice && openOffice !== 'Not enough money' && <small className="muted"> · {readiness(openOffice, 'an established company')}</small>}
            </span>
            {openRegions.length > 1 && (
              <select aria-label="Which building" value={openWhere} onChange={(event) => setOpenRegion((event.target as HTMLSelectElement).value as Region)}>
                {openRegions.map((r) => (
                  <option key={r} value={r}>
                    {buildingName(r)}
                  </option>
                ))}
              </select>
            )}
            <button disabled={openOffice !== null} onClick={() => report(store.openOffice(openWhere))}>
              {state.offices.some((o) => regionOf(o) === openWhere) ? 'Add floor' : 'Open'} · {formatMoney(newOfficeCost(state, openWhere))}
            </button>
          </div>
          )
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Your team</h3>
          <span className="muted">
            Salaries follow skills and update monthly. Market wages also rise {Math.round(ERA_WAGE_GROWTH * 100)}% with each early era, less later
            {eraIndexAt(state.day) > 0 && ` (+${Math.round((eraWageFactor(state.day) - 1) * 100)}% so far)`}.
          </span>
        </div>
        {state.employees.length === 0 && <p className="muted">Nobody works here. Hire someone to start a project.</p>}
        {many && (
          <p className="muted">
            Everyone has a desk in one office (the second list: they can move to another office in the same region). <em>Works on</em> lets
            someone help another office's project from their own desk, {Math.round((1 - REMOTE_SPEED) * 100)}% slower, even across the Atlantic.
          </p>
        )}
        {!many && needsLead(state, state.offices[0]) && (
          <p className="warn">
            An office of more than {LEAD_FREE_TEAM} people needs a Lead to coordinate it: without one it works {SLOWER}% slower, with one {FASTER}% faster.
            Promote a Senior when they are ready.
          </p>
        )}
        {hasAnalyst(state) && (
          <p className="muted">
            Insight <strong>{Math.floor(state.insight)}</strong> · +{insightRate(state).toFixed(1)} a day. Spend it on studying an audience when you plan a product.
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
            actionsBelow={many}
            action={
              <>
                {promotionBlocker(state, employee) === null && (
                  <button
                    className="primary"
                    title={`Raise to ${formatMoney(salaryFor(employee.skills, employee.trait, employee.level + 1, state.day, payShare(employee), employee.analysis ?? 0))}/mo`}
                    onClick={() => report(store.promoteEmployee(employee.id))}
                  >
                    Promote
                  </button>
                )}
                {pmBlocker(state, employee) === null && (
                  <button className="primary" title="They take over the direction of their office's products" onClick={() => report(store.becomePm(employee.id))}>
                    Make product manager
                  </button>
                )}
                {many && isBuilder(employee) && (
                  <select
                    aria-label={`Team for ${employee.name}`}
                    title="Whose project they work on (a little slower away from their own office)"
                    value={teamOfficeId(state, employee)}
                    onChange={(event) => {
                      const id = Number((event.target as HTMLSelectElement).value)
                      report(store.assignTeam(employee.id, id === employee.officeId ? null : id))
                    }}
                  >
                    {state.offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        Works on {officeName(state, office)}
                      </option>
                    ))}
                  </select>
                )}
                {many && (
                  <select
                    aria-label={`Office for ${employee.name}`}
                    value={employee.officeId}
                    onChange={(event) => report(store.transfer(employee.id, Number((event.target as HTMLSelectElement).value)))}
                  >
                    {state.offices.map((office) => {
                      const home = getOffice(state, employee.officeId)
                      const abroad = home !== undefined && regionOf(office) !== regionOf(home)
                      return (
                        <option key={office.id} value={office.id} disabled={office.id !== employee.officeId && (abroad || freeDesks(state, office) <= 0)}>
                          Desk in {officeName(state, office)}
                          {abroad ? ' (other region)' : ''}
                        </option>
                      )
                    })}
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
            {many && hireInto && ` New hires join ${officeName(state, hireInto)}.`}{many && ` People live where they work: these are from ${REGION_NAME[region]}${region === 'eu' ? ', paid a little less' : ''}.`}
          </span>
        </div>
        {regions.length > 1 && (
          <div className="segmented" role="group" aria-label="Hire in">
            {regions.map((r) => (
              <button key={r} className={r === region ? 'active' : ''} aria-pressed={r === region} onClick={() => setHireRegion(r)}>
                {REGION_NAME[r]} <small>· {freeIn(r)} free desk{freeIn(r) === 1 ? '' : 's'}</small>
              </button>
            ))}
          </div>
        )}
        {pool.length === 0 && <p className="muted">No one is looking right now.</p>}
        {pool.map((candidate) => {
          const cost = hireCost(candidate)
          const blocked = !hireInto ? `No free desk in ${REGION_NAME[region]}` : state.money < cost ? 'Too expensive' : ''
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

      <div className="actions">
        {message && <p className="bad action-note">{message}</p>}
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
