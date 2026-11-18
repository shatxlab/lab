import {
  IC_GRADES,
  initialCareer,
  professionOf,
  PROFESSIONS,
  PROFESSION_NAMES,
  type LeadScope,
  type Profession,
} from './career-profile'
import { DAYS_PER_MONTH, PROMOTION_MORALE } from './balance'
import { primarySkill, primarySkillName } from './careers'
import { businessOverview } from './business'
import { salaryOf } from './hiring'
import { monthlySalaries } from './economy'
import { statMultiplier } from './modifiers'
import { depart } from './knowledge'
import { adjustMorale } from './morale'
import { logEntry } from './journal'
import { fail, OK, type Employee, type GameState, type Result } from './types'

export interface ReviewPolicy {
  automatic: boolean
  reserveMonths: number
  payrollCap: number | null
}
export interface ReviewReport {
  day: number
  reviewed: number
  promoted: number
  deferred: number
  uncovered: number
  payrollBefore: number
  payrollAfter: number
  reasons: string[]
}
export interface PeopleManagement {
  policy: ReviewPolicy
  lastReviewDay: number
  reports: ReviewReport[]
}

/** Activation is company-local; old numeric levels retain their pay/experience, not implicit leadership forever. */
export function initialisePeopleManagement(state: GameState, grandfather = false): void {
  if (!state.offices.some((o) => o.assignment) && !(state.founding && state.offices.some((o) => o.kind === 'office'))) return
  state.peopleManagement ??= {
    policy: { automatic: true, reserveMonths: 2, payrollCap: null },
    lastReviewDay: state.day,
    reports: [],
  }
  const legacyLeads = state.employees.filter((e) => !e.career && e.level >= 3)
  for (const e of state.employees) e.career ??= initialCareer(e)
  if (!grandfather) return
  for (const profession of PROFESSIONS) {
    const leads = legacyLeads
      .filter((e) => professionOf(e) === profession)
      .sort((a, b) => a.levelDay - b.levelDay || a.id - b.id)
    for (const [index, e] of leads.entries()) {
      const scope: LeadScope = index === 0 ? 'company' : e.officeId
      const occupied = state.employees.some(
        (other) =>
          other !== e &&
          professionOf(other) === profession &&
          other.career?.appointment?.scope === scope &&
          !other.career.appointment.conflict,
      )
      const genuine =
        scope === 'company' ||
        (state.offices.length > 1 &&
          state.employees.filter((other) => other.officeId === scope && professionOf(other) === profession).length >=
            3 &&
          state.employees.filter((other) => other.officeId !== scope && professionOf(other) === profession).length >= 3)
      e.career!.appointment = {
        scope,
        grandfathered: true,
        ...(occupied || !genuine ? { conflict: true } : {}),
      }
    }
  }
}

/** A moved local lead is not silently reappointed on a different floor. Company leads can cover either region. */
export function appointmentIssue(state: GameState, employee: Employee): string | null {
  const a = employee.career?.appointment
  if (!a) return 'Not appointed'
  if (a.conflict)
    return 'Legacy appointment conflict — choose a genuine scope or release the appointment; pay is preserved'
  if (a.scope !== 'company' && (!state.offices.some((o) => o.id === a.scope) || employee.officeId !== a.scope))
    return 'Local lead is no longer on the appointed floor'
  return null
}

/** Exactly one reviewer, same profession: local takes precedence, then company, then reliable policy review. */
export function reviewerOf(state: GameState, employee: Employee): Employee | undefined {
  const leads = state.employees
    .filter(
      (e) =>
        e.id !== employee.id &&
        professionOf(e) === professionOf(employee) &&
        e.career?.appointment &&
        appointmentIssue(state, e) === null,
    )
    .sort((a, b) => a.id - b.id)
  return (
    leads.find((e) => e.career!.appointment!.scope === employee.officeId) ??
    leads.find((e) => e.career!.appointment!.scope === 'company')
  )
}

export function appointmentBlocker(state: GameState, employee: Employee, scope: LeadScope): string | null {
  if (!state.peopleManagement || !employee.career) return 'Management starts in the operating company'
  if (employee.career.grade < 2) return 'Needs Senior specialist experience first'
  if (
    scope !== 'company' &&
    (!state.offices.some((o) => o.id === scope && o.kind === 'office') || employee.officeId !== scope)
  )
    return 'A local lead must work on that floor'
  const profession = professionOf(employee)
  const occupied = state.employees.find(
    (e) =>
      e.id !== employee.id &&
      professionOf(e) === profession &&
      e.career?.appointment?.scope === scope &&
      appointmentIssue(state, e) === null,
  )
  if (occupied) return `${occupied.name} already holds this ${PROFESSION_NAMES[profession]} lead post`
  const colleagues = state.employees.filter(
    (e) => professionOf(e) === profession && (scope === 'company' || e.officeId === scope),
  )
  if (colleagues.length < 3 || (scope !== 'company' && state.offices.length < 2))
    return 'Needs genuine scope: at least three people of this profession; local posts also need multiple floors'
  if (scope !== 'company') {
    const elsewhere = state.employees.filter((e) => professionOf(e) === profession && e.officeId !== scope)
    if (elsewhere.length < 3)
      return 'Needs genuine local scope: this profession also needs a staffed team on another floor'
    const companyLead = state.employees.some(
      (e) =>
        e.id !== employee.id &&
        professionOf(e) === profession &&
        e.career?.appointment?.scope === 'company' &&
        appointmentIssue(state, e) === null,
    )
    const uncoveredElsewhere = elsewhere.filter(
      (e) =>
        !state.employees.some(
          (lead) =>
            lead.id !== employee.id &&
            professionOf(lead) === profession &&
            lead.career?.appointment?.scope === e.officeId &&
            appointmentIssue(state, lead) === null,
        ),
    )
    if (companyLead && uncoveredElsewhere.length < 3)
      return 'This would leave the existing company lead with no genuine scope'
  }
  if (scope === 'company') {
    const residual = colleagues.filter(
      (e) =>
        !state.employees.some(
          (lead) =>
            lead.id !== employee.id &&
            lead.career?.appointment?.scope === e.officeId &&
            professionOf(lead) === profession &&
            appointmentIssue(state, lead) === null,
        ),
    )
    if (residual.length < 3) return 'Local leads already cover this profession; no additional company scope'
  }
  return null
}

export function payrollGuard(state: GameState, extraMonthly: number): string | null {
  const management = state.peopleManagement
  if (!management || extraMonthly <= 0) return null
  const view = businessOverview(state)
  const chargedRaise = extraMonthly * statMultiplier(state, 'wage')
  const payroll = view.costs.salaries * DAYS_PER_MONTH + chargedRaise
  if (management.policy.payrollCap !== null && payroll > management.policy.payrollCap) return 'Company payroll cap'
  const cost = view.totalCosts + chargedRaise / DAYS_PER_MONTH
  if (view.revenue >= cost || state.money >= cost * DAYS_PER_MONTH * management.policy.reserveMonths) return null
  return `Needs sustainable income or ${management.policy.reserveMonths} months of operating reserves`
}

export function appointProfessionLead(state: GameState, employeeId: number, scope: LeadScope | null): Result {
  if (state.gameOver) return fail('Game over')
  const e = state.employees.find((person) => person.id === employeeId)
  if (!e?.career || !state.peopleManagement) return fail('No managed employee found')
  if (scope === null) {
    if (!e.career.appointment) return fail('No lead appointment to release')
    delete e.career.appointment
    logEntry(state, 'people.lead.release', `${e.name} leaves their lead appointment; specialist grade is unchanged`)
    return OK
  }
  if (e.career.appointment?.scope === scope && appointmentIssue(state, e) === null)
    return fail('Already appointed to this post')
  const blocker = appointmentBlocker(state, e, scope)
  if (blocker) return fail(blocker)
  const proposed = structuredClone(e)
  proposed.career!.appointment = { scope }
  const salary = Math.max(e.salary, salaryOf(proposed, state.day))
  const budget = payrollGuard(state, salary - e.salary)
  if (budget) return fail(budget)
  e.career.appointment = { scope }
  e.salary = salary
  e.career.ambition = 'leadership'
  delete e.career.blockedSince
  if (e.career.concern?.kind === 'leadership') delete e.career.concern
  logEntry(
    state,
    'people.lead.appoint',
    `${e.name}: ${PROFESSION_NAMES[professionOf(e)]} lead (${scope === 'company' ? 'company' : `floor ${scope}`})`,
  )
  return OK
}

export function gradeBlocker(state: GameState, employee: Employee): string | null {
  const c = employee.career
  if (!c) return 'No career profile'
  const next = IC_GRADES[c.grade + 1]
  if (!next) return 'Principal specialist'
  if (employee.title) return 'Executive role: existing specialist experience is retained'
  if (primarySkill(employee) < next.skill) return `Needs ${next.skill} ${primarySkillName(employee)} skill`
  const wait = next.days - (state.day - c.gradeDay)
  return wait > 0 ? `Ready in ${wait} days` : null
}

/** Used by automatic reviews and optional individual inspection; both obey the same treasury guard. */
export function promoteCareer(state: GameState, employee: Employee): Result {
  const blocker = gradeBlocker(state, employee)
  if (blocker) return fail(blocker)
  const proposed = structuredClone(employee)
  proposed.career!.grade++
  proposed.level = Math.min(3, proposed.career!.grade)
  const salary = Math.max(employee.salary, salaryOf(proposed, state.day))
  const budget = payrollGuard(state, salary - employee.salary)
  if (budget) return fail(budget)
  employee.career!.grade++
  employee.career!.gradeDay = state.day
  employee.level = proposed.level // Compatibility for old PM bonus tables, not leadership eligibility.
  employee.levelDay = state.day
  employee.salary = salary
  employee.readySince = null
  if (employee.career!.concern?.kind === 'promotion') delete employee.career!.concern
  adjustMorale(state, PROMOTION_MORALE, employee.id)
  return OK
}

export function setReviewPolicy(state: GameState, policy: ReviewPolicy): Result {
  if (state.gameOver) return fail('Game over')
  if (!state.peopleManagement || !validPolicy(policy)) return fail('Invalid review policy')
  state.peopleManagement.policy = { ...policy }
  logEntry(
    state,
    'people.policy',
    `Reviews ${policy.automatic ? 'automatic' : 'on hold'}; ${policy.reserveMonths} reserve months; payroll cap ${policy.payrollCap ?? 'none'}`,
  )
  return OK
}

export function respondCareerConcern(state: GameState, employeeId: number, response: 'discuss' | 'specialist'): Result {
  if (state.gameOver) return fail('Game over')
  const e = state.employees.find((person) => person.id === employeeId)
  const concern = e?.career?.concern
  if (!e?.career || !concern) return fail('No active career conversation')
  if (state.day >= concern.deadlineDay) return fail('The response window has ended')
  if (response === 'specialist' && concern.kind === 'leadership') {
    e.career.ambition = 'specialist'
    delete e.career.blockedSince
    delete e.career.concern
  } else if (response === 'discuss' && !concern.discussed) {
    concern.discussed = true
    concern.deadlineDay += 90
    adjustMorale(state, 8, e.id)
  } else return fail('Choose an available response')
  logEntry(
    state,
    'people.conversation',
    `${e.name}: ${response === 'specialist' ? 'agreed a specialist career' : 'discussed concerns; 90 more days to respond'}`,
  )
  return OK
}

/** Primary work can be coached by its own profession lead, never by an unrelated floor's strongest builder. */
export function professionWorkMultiplier(state: GameState, employee: Employee): number {
  if (!state.peopleManagement) return 1
  const reviewer = reviewerOf(state, employee)
  if (reviewer) return 1 + (reviewer.career!.management / 100) * 0.08
  const peers = state.employees.filter(
    (e) => e.officeId === employee.officeId && professionOf(e) === professionOf(employee),
  ).length
  return peers > 4 ? 0.9 : 1
}

export function professionCoverage(state: GameState, profession: Profession) {
  const members = state.employees.filter((e) => professionOf(e) === profession)
  return {
    profession,
    total: members.length,
    covered: members.filter((e) => reviewerOf(state, e)).length,
    leads: members.filter((e) => e.career?.appointment),
    conflicts: members.filter((e) => e.career?.appointment && appointmentIssue(state, e) !== null),
  }
}

function reviewCompany(state: GameState): void {
  const m = state.peopleManagement!
  const payrollBefore = monthlySalaries(state)
  const report: ReviewReport = {
    day: state.day,
    reviewed: state.employees.length,
    promoted: 0,
    deferred: 0,
    uncovered: 0,
    payrollBefore,
    payrollAfter: payrollBefore,
    reasons: [],
  }
  const reasons = new Set<string>()
  // Oldest earned review first; no RNG and no roll for a weaker manager to miss it.
  const people = [...state.employees].sort(
    (a, b) => (a.readySince ?? a.career!.gradeDay) - (b.readySince ?? b.career!.gradeDay) || a.id - b.id,
  )
  for (const e of people) {
    const lead = reviewerOf(state, e)
    if (!lead) report.uncovered++
    if (lead && !e.training) {
      const gain = 0.2 + lead.career!.management / 250
      const profession = professionOf(e)
      if (profession === 'product') e.analysis = Math.min(100, (e.analysis ?? 0) + gain)
      else e.skills[profession] = Math.min(100, e.skills[profession] + gain)
    }
    if (gradeBlocker(state, e) !== null) continue
    if (!m.policy.automatic) {
      report.deferred++
      reasons.add('Reviews are on hold')
      continue
    }
    const result = promoteCareer(state, e)
    if (result.ok) report.promoted++
    else {
      report.deferred++
      reasons.add(result.reason)
    }
  }
  report.payrollAfter = monthlySalaries(state)
  report.reasons = [...reasons]
  m.lastReviewDay = state.day
  m.reports = [...m.reports, report].slice(-12)
  state.events.push({
    type: 'notice',
    text: `People review: ${report.reviewed} reviewed, ${report.promoted} promoted, ${report.deferred} deferred${report.reasons.length ? ` (${report.reasons.join('; ')})` : ''}. No individual approvals needed.`,
  })
  logEntry(
    state,
    'people.review',
    `Reviewed ${report.reviewed}; promoted ${report.promoted}; deferred ${report.deferred}`,
    { payrollBefore, payrollAfter: report.payrollAfter },
  )
  for (const e of state.employees)
    if (e.career?.appointment && appointmentIssue(state, e) === null)
      e.career.management = Math.min(100, e.career.management + 0.5)
}

/** Managed companies use one warned departure path, replacing both legacy morale and long-tenure quit rolls. */
export function peopleDay(state: GameState): void {
  initialisePeopleManagement(state)
  const m = state.peopleManagement
  if (!m) return
  if (state.day - m.lastReviewDay >= DAYS_PER_MONTH) reviewCompany(state)
  let opened = 0
  for (const e of [...state.employees]) {
    const c = e.career!
    const ready = gradeBlocker(state, e) === null
    e.readySince = ready ? (e.readySince ?? state.day) : null
    if (e.founder) {
      delete c.concern
      continue
    }
    const scopeBlocked =
      c.ambition === 'leadership' &&
      c.grade >= 2 &&
      !c.appointment &&
      appointmentBlocker(state, e, 'company') !== null &&
      !state.offices.some((o) => appointmentBlocker(state, e, o.id) === null)
    if (scopeBlocked) c.blockedSince ??= state.day
    else delete c.blockedSince
    const kind =
      e.morale < 20
        ? 'morale'
        : ready && e.readySince !== null && state.day - e.readySince >= 60
          ? 'promotion'
          : scopeBlocked && state.day - c.blockedSince! >= 180
            ? 'leadership'
            : null
    if (c.concern && c.concern.kind !== kind) delete c.concern
    if (!c.concern && kind) {
      c.concern = { kind, openedDay: state.day, deadlineDay: state.day + 90 }
      opened++
    }
    if (c.concern && state.day >= c.concern.deadlineDay) {
      const reason = c.concern.kind
      depart(state, e)
      state.events.push({
        type: 'notice',
        text: `${e.name} left after an unresolved ${reason} conversation and its response window. Their knowledge handover follows company research.`,
      })
      logEntry(state, 'people.departure', `${e.name} left: ${reason}`)
    }
  }
  if (opened)
    state.events.push({
      type: 'notice',
      text: `${opened} career conversation${opened === 1 ? '' : 's'} need attention in People; response window 90 days.`,
    })
}

function validPolicy(value: unknown): value is ReviewPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return (
    Object.keys(p).every((k) => ['automatic', 'reserveMonths', 'payrollCap'].includes(k)) &&
    typeof p.automatic === 'boolean' &&
    typeof p.reserveMonths === 'number' &&
    Number.isInteger(p.reserveMonths) &&
    p.reserveMonths >= 1 &&
    p.reserveMonths <= 12 &&
    (p.payrollCap === null || (typeof p.payrollCap === 'number' && Number.isFinite(p.payrollCap) && p.payrollCap >= 0))
  )
}

export function isPeopleManagement(value: unknown): value is PeopleManagement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const m = value as Record<string, unknown>
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  return (
    Object.keys(m).every((k) => ['policy', 'lastReviewDay', 'reports'].includes(k)) &&
    validPolicy(m.policy) &&
    number(m.lastReviewDay) &&
    Number.isSafeInteger(m.lastReviewDay) &&
    Array.isArray(m.reports) &&
    m.reports.length <= 12 &&
    m.reports.every((r: unknown) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return false
      const report = r as Record<string, unknown>
      return (
        ['day', 'reviewed', 'promoted', 'deferred', 'uncovered', 'payrollBefore', 'payrollAfter'].every((key) =>
          number(report[key]),
        ) &&
        Array.isArray(report.reasons) &&
        report.reasons.length <= 10 &&
        report.reasons.every((s) => typeof s === 'string' && s.length <= 200)
      )
    })
  )
}
