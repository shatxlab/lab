import { useState } from 'react'
import {
  IC_GRADES,
  PROFESSIONS,
  PROFESSION_NAMES,
  careerGradeName,
  professionOf,
  type LeadScope,
  type Profession,
} from '@/lib/tycoon/sim/career-profile'
import {
  appointmentBlocker,
  appointmentIssue,
  gradeBlocker,
  professionCoverage,
  reviewerOf,
} from '@/lib/tycoon/sim/people-management'
import { officeName } from '@/lib/tycoon/sim/offices'
import type { Employee, Result } from '@/lib/tycoon/sim/types'
import { formatMoney } from '@/lib/tycoon/format'
import { useGame, useStore } from './context'

/** A company-scale surface: reviews never depend on opening or scrolling the employee roster. */
export function PeopleManagementPanel() {
  const state = useGame(),
    store = useStore()
  const management = state.peopleManagement
  const [profession, setProfession] = useState<Profession>('engineering')
  const [scope, setScope] = useState<LeadScope>('company')
  const [candidateId, setCandidateId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [cap, setCap] = useState(management?.policy.payrollCap?.toString() ?? '')
  if (!management) return null
  const report = (result: Result) => setMessage(result.ok ? '' : result.reason)
  const latest = management.reports.at(-1)
  const coverage = PROFESSIONS.map((p) => professionCoverage(state, p))
  const current = state.employees.find(
    (e) =>
      professionOf(e) === profession && e.career?.appointment?.scope === scope && appointmentIssue(state, e) === null,
  )
  const candidates = state.employees
    .filter(
      (e) =>
        professionOf(e) === profession && (e.career?.grade ?? 0) >= 2 && (scope === 'company' || e.officeId === scope),
    )
    .sort((a, b) => b.career!.management - a.career!.management || a.id - b.id)
  const candidate = candidates.find((e) => e.id === candidateId) ?? candidates[0]
  const blocked = candidate ? appointmentBlocker(state, candidate, scope) : 'No Senior specialist available'
  const concerns = state.employees.filter((e) => e.career?.concern)
  const conflicts = coverage.flatMap((c) => c.conflicts)

  return (
    <section className="section people-management" aria-label="Company people management">
      <div className="section-head">
        <h3>People · company policy</h3>
        <span className="muted">{state.employees.length} people · no individual promotion approvals</span>
      </div>
      <p role="status">
        {latest
          ? `Day ${latest.day}: ${latest.reviewed} reviewed · ${latest.promoted} promoted · ${latest.deferred} deferred.`
          : `Automatic review in ${Math.max(0, 30 - (state.day - management.lastReviewDay))} days.`}
      </p>
      {latest && (
        <p className="muted">
          Payroll {formatMoney(latest.payrollBefore)} → {formatMoney(latest.payrollAfter)}/mo. {latest.uncovered} use
          company-policy review without a profession coach.
        </p>
      )}
      {latest && latest.reasons.length > 0 && (
        <p className="warn">{latest.reasons.join(' · ')}. Adjust company policy or income, not individual approvals.</p>
      )}
      <details>
        <summary>Review policy & payroll safeguards</summary>
        <p className="muted">
          Reviews every 30 days, including analysts and PMs. Promotions need sustainable revenue or the chosen cash
          reserve. No random missed promotions. The cap limits discretionary raises; it does not cut existing pay or
          freeze market repricing.
        </p>
        <label>
          <input
            type="checkbox"
            checked={management.policy.automatic}
            onChange={(e) =>
              report(
                store.setReviewPolicy({
                  ...management.policy,
                  automatic: e.target.checked,
                }),
              )
            }
          />{' '}
          Automatic promotions
        </label>
        <label>
          Operating reserve{' '}
          <select
            aria-label="Operating reserve"
            value={management.policy.reserveMonths}
            onChange={(e) =>
              report(
                store.setReviewPolicy({
                  ...management.policy,
                  reserveMonths: Number(e.target.value),
                }),
              )
            }
          >
            {[1, 2, 3, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n} months
              </option>
            ))}
          </select>
        </label>
        <label>
          Monthly payroll cap{' '}
          <input
            aria-label="Monthly payroll cap"
            inputMode="numeric"
            type="number"
            min="0"
            placeholder="No additional cap"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            report(
              store.setReviewPolicy({
                ...management.policy,
                payrollCap: cap.trim() ? Number(cap) : null,
              }),
            )
          }
        >
          Apply payroll cap
        </button>
      </details>
      <details>
        <summary>Profession coverage & lead appointments</summary>
        <p className="muted">
          Local leads coach their own profession; otherwise a company lead covers it. Policy still reviews everyone.
          Management skill improves coaching, never decides whether an earned review happens.
        </p>
        {coverage
          .filter((c) => c.total > 0)
          .map((c) => (
            <p key={c.profession}>
              <strong>{PROFESSION_NAMES[c.profession]}</strong>: {c.covered}/{c.total} coached · {c.leads.length}{' '}
              appointments
            </p>
          ))}
        <label>
          Profession{' '}
          <select
            aria-label="Lead profession"
            value={profession}
            onChange={(e) => {
              setProfession(e.target.value as Profession)
              setCandidateId(null)
            }}
          >
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {PROFESSION_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scope{' '}
          <select
            aria-label="Lead scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value === 'company' ? 'company' : Number(e.target.value))
              setCandidateId(null)
            }}
          >
            <option value="company">Company-wide</option>
            {state.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {officeName(state, o)}
              </option>
            ))}
          </select>
        </label>
        {current ? (
          <p>
            {current.name} holds this post.{' '}
            <button onClick={() => report(store.appointProfessionLead(current.id, null))}>Release appointment</button>
          </p>
        ) : (
          <>
            <label>
              Candidate{' '}
              <select
                aria-label="Lead candidate"
                value={candidate?.id ?? ''}
                onChange={(e) => setCandidateId(Number(e.target.value))}
              >
                {!candidates.length && <option value="">No qualified specialist</option>}
                {candidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {careerGradeName(e)} · management {Math.round(e.career!.management)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              {blocked ??
                'Genuine opening. Appointing keeps the specialist grade and adds a payroll-guarded leadership premium.'}
            </p>
            <button
              disabled={blocked !== null}
              onClick={() => candidate && report(store.appointProfessionLead(candidate.id, scope))}
            >
              Appoint profession lead
            </button>
          </>
        )}
        {conflicts.map((e) => (
          <p key={e.id} className="warn">
            {e.name}: {appointmentIssue(state, e)}.{' '}
            <button onClick={() => report(store.appointProfessionLead(e.id, null))}>
              Release conflicting appointment
            </button>
          </p>
        ))}
      </details>
      {concerns.length > 0 && (
        <details open>
          <summary>{concerns.length} career conversations need a response</summary>
          {concerns.map((e) => (
            <CareerConversation key={e.id} employee={e} report={report} />
          ))}
        </details>
      )}
      {message && (
        <p className="warn" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}

function CareerConversation({ employee: e, report }: { employee: Employee; report: (result: Result) => void }) {
  const state = useGame(),
    store = useStore(),
    concern = e.career!.concern!
  return (
    <div className="career-conversation">
      <p>
        <strong>{e.name}</strong> · {concern.kind} · {Math.max(0, concern.deadlineDay - state.day)} days to respond.
      </p>
      <p className="muted">
        {concern.kind === 'leadership'
          ? 'Wants a real leadership opening, not an empty title. Appoint them to a genuine post above, or agree a specialist path.'
          : concern.kind === 'promotion'
            ? 'An earned promotion is blocked by company policy or budget. Resolve the aggregate constraint above.'
            : 'Morale is too low. Improve working conditions, release quality or arrange a team outing.'}
      </p>
      <button disabled={concern.discussed} onClick={() => report(store.respondCareerConcern(e.id, 'discuss'))}>
        Discuss · +90 days
      </button>
      {concern.kind === 'leadership' && (
        <button onClick={() => report(store.respondCareerConcern(e.id, 'specialist'))}>Agree specialist path</button>
      )}
    </div>
  )
}

export function ManagedCareer({ employee: e }: { employee: Employee }) {
  const state = useGame(),
    store = useStore(),
    c = e.career!
  const reviewer = reviewerOf(state, e),
    next = IC_GRADES[c.grade + 1]
  return (
    <>
      <p>
        {careerGradeName(e)} specialist · management skill {Math.round(c.management)}/100 · ambition: {c.ambition}.
      </p>
      <p className="muted">
        {next
          ? `Next: ${next.name}. ${gradeBlocker(state, e) ?? (state.peopleManagement ? 'Earned; handled by the next automatic company review' : 'Earned; ready for a specialist promotion')}.`
          : 'Principal: contributes specialist expertise without needing a lead vacancy.'}
      </p>
      {!state.peopleManagement && next && gradeBlocker(state, e) === null && (
        <button onClick={() => store.promoteEmployee(e.id)}>Promote specialist</button>
      )}
      <p className="muted">
        Reviewer: {reviewer?.name ?? 'company policy'}.{' '}
        {c.appointment
          ? `Lead scope: ${c.appointment.scope === 'company' ? 'company-wide' : `floor ${c.appointment.scope}`}. ${appointmentIssue(state, e) ?? ''}`
          : 'No leadership appointment required for specialist advancement.'}
      </p>
      {c.concern && (
        <p className="warn">
          Career conversation: {c.concern.kind}. Respond in People; {Math.max(0, c.concern.deadlineDay - state.day)}{' '}
          days remain.
        </p>
      )}
    </>
  )
}
