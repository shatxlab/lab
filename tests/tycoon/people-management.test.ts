import { monthlySalaries } from '@/lib/tycoon/sim/economy'
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_HANDOVER } from '@/lib/tycoon/sim/balance'
import { initialCareer, IC_GRADES } from '@/lib/tycoon/sim/career-profile'
import {
  appointProfessionLead,
  appointmentBlocker,
  initialisePeopleManagement,
  peopleDay,
  payrollGuard,
  professionWorkMultiplier,
  respondCareerConcern,
  reviewerOf,
  setReviewPolicy,
} from '@/lib/tycoon/sim/people-management'
import { becomePm, careerDay, primarySkill, promote, title } from '@/lib/tycoon/sim/careers'
import { salaryOf } from '@/lib/tycoon/sim/hiring'
import { moraleDay, employeeSpeed } from '@/lib/tycoon/sim/staff'
import { insightOf } from '@/lib/tycoon/sim/insight'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { makeEmployee, makeState } from './helpers'
import type { Employee, Role } from '@/lib/tycoon/sim/types'

function person(id: number, role: Role = 'developer', level = 1): Employee {
  const e = makeEmployee(id, { design: 95, engineering: 95, qa: 95 }, 5000, role)
  e.analysis = 95
  e.level = level
  return e
}
function company(employees = [person(100), person(101), person(102)]) {
  const s = makeState(employees)
  s.offices[0].kind = 'office'
  s.offices[0].assignment = { kind: 'idle' }
  s.offices.push({ ...s.offices[0], id: 2, region: 'eu' })
  s.day = 1000
  s.money = 100_000_000
  initialisePeopleManagement(s, true)
  for (const e of s.employees) e.salary = salaryOf(e, s.day)
  return s
}
function review(s: ReturnType<typeof company>) {
  s.day += 30
  peopleDay(s)
}

describe('profession management and reliable company reviews', () => {
  it('reviews and promotes 120 people, including analysts/PMs, with one aggregate report and no approvals', () => {
    const roles: Role[] = ['developer', 'designer', 'tester', 'analyst', 'pm']
    const s = company(Array.from({ length: 120 }, (_, i) => person(100 + i, roles[i % roles.length])))
    const rng = s.rng
    review(s)
    expect(s.peopleManagement!.reports.at(-1)).toMatchObject({
      reviewed: 120,
      promoted: 120,
      deferred: 0,
      uncovered: 120,
    })
    expect(s.employees.every((e) => e.career!.grade === 2)).toBe(true)
    expect(s.events.filter((e) => e.type === 'notice')).toHaveLength(1)
    expect(s.rng).toBe(rng)
    peopleDay(s)
    expect(s.peopleManagement!.reports).toHaveLength(1)
  })
  it('even a zero-management lead never randomly misses an earned review', () => {
    const s = company([person(100, 'developer', 2), person(101), person(102)])
    expect(appointProfessionLead(s, 100, 'company').ok).toBe(true)
    s.employees[0].career!.management = 0
    review(s)
    expect(s.employees[1].career!.grade).toBe(2)
    expect(s.employees[2].career!.grade).toBe(2)
    expect(s.peopleManagement!.reports.at(-1)?.promoted).toBe(3)
  })
  it('company coverage spans floors; local coverage overrides it without duplicate reviewers', () => {
    const s = company(Array.from({ length: 8 }, (_, i) => person(100 + i, 'developer', 2)))
    for (const e of s.employees.slice(4)) e.officeId = 2
    expect(appointProfessionLead(s, 100, 'company').ok).toBe(true)
    expect(reviewerOf(s, s.employees[5])?.id).toBe(100)
    expect(appointProfessionLead(s, 104, 2).ok).toBe(true)
    expect(reviewerOf(s, s.employees[5])?.id).toBe(104)
    expect(reviewerOf(s, s.employees[1])?.id).toBe(100)
    expect(appointmentBlocker(s, s.employees[1], 1)).toContain('no genuine scope')
    s.employees[4].officeId = 1 // local post does not jump to the new floor
    expect(reviewerOf(s, s.employees[5])?.id).toBe(100)
    s.employees = s.employees.filter((e) => e.id !== 100)
    expect(
      reviewerOf(
        s,
        s.employees.find((e) => e.id === 105)!,
      ),
    ).toBeUndefined()
  })
  it('one profession cannot review or coordinate another', () => {
    const s = company([
      person(100, 'developer', 2),
      person(101, 'developer', 2),
      person(102, 'developer', 2),
      person(103, 'tester'),
    ])
    appointProfessionLead(s, 100, 'company')
    expect(reviewerOf(s, s.employees[3])).toBeUndefined()
    expect(professionWorkMultiplier(s, s.employees[3])).toBe(1)
    expect(professionWorkMultiplier(s, s.employees[1])).toBeGreaterThan(1)
  })
  it('groups analysts and PMs under product profession coverage', () => {
    const s = company([person(100, 'pm', 2), person(101, 'analyst'), person(102, 'analyst')])
    expect(appointProfessionLead(s, 100, 'company').ok).toBe(true)
    expect(reviewerOf(s, s.employees[1])?.id).toBe(100)
    review(s)
    expect(s.employees[1].career!.grade).toBe(2)
  })
  it('does not invent empty lead posts or replace an occupied post', () => {
    const s = company([person(100, 'developer', 2), person(101, 'developer', 2)])
    expect(appointmentBlocker(s, s.employees[0], 'company')).toContain('genuine scope')
    const e = person(102, 'developer', 2)
    e.career = initialCareer(e)
    s.employees.push(e)
    expect(appointProfessionLead(s, 100, 'company').ok).toBe(true)
    expect(appointProfessionLead(s, 101, 'company')).toMatchObject({
      ok: false,
    })
    expect(appointProfessionLead(s, 101, 2)).toMatchObject({ ok: false })
  })
  it('uses management skill for coaching quality, not promotion reliability', () => {
    const a = company([person(100, 'developer', 2), person(101), person(102)])
    appointProfessionLead(a, 100, 'company')
    a.employees[1].skills.engineering = 20
    const b = structuredClone(a)
    a.employees[0].career!.management = 0
    b.employees[0].career!.management = 100
    review(a)
    review(b)
    expect(primarySkill(b.employees[1])).toBeGreaterThan(primarySkill(a.employees[1]))
    expect(a.peopleManagement!.reports.at(-1)!.reviewed).toBe(b.peopleManagement!.reports.at(-1)!.reviewed)
  })
  it('promotes specialists to Staff and Principal without granting lead posts or indexing legacy levels out of bounds', () => {
    const s = company([person(101, 'developer', 2), person(102, 'analyst', 2)])
    review(s)
    expect(s.employees[0].career!.grade).toBe(3)
    expect(title(s.employees[0])).toBe('Staff developer')
    expect(s.employees[0].career!.appointment).toBeUndefined()
    s.day += 720
    peopleDay(s)
    for (const e of s.employees) {
      expect(e.career!.grade).toBe(4)
      expect(e.level).toBe(3)
      expect(Number.isFinite(salaryOf(e, s.day))).toBe(true)
      expect(Number.isFinite(employeeSpeed(e, 'engineering'))).toBe(true)
    }
    expect(insightOf(s.employees[1])).toBeGreaterThan(0)
    const principal = employeeSpeed(s.employees[0], 'engineering')
    s.employees[0].career!.grade = 2
    expect(principal).toBeGreaterThan(employeeSpeed(s.employees[0], 'engineering'))
  })
  it('defers raises at the aggregate payroll cap rather than asking for individual approvals', () => {
    const s = company()
    const old = s.employees.map((e) => e.salary)
    setReviewPolicy(s, { automatic: true, reserveMonths: 2, payrollCap: 0 })
    review(s)
    expect(s.peopleManagement!.reports.at(-1)).toMatchObject({
      reviewed: 3,
      promoted: 0,
      deferred: 3,
      reasons: ['Company payroll cap'],
    })
    expect(s.employees.map((e) => e.salary)).toEqual(old)
    expect(promote(s, 100).ok).toBe(false)
    setReviewPolicy(s, { automatic: true, reserveMonths: 2, payrollCap: null })
    review(s)
    expect(s.peopleManagement!.reports.at(-1)?.promoted).toBe(3)
  })
  it('protects operating reserves and applies the same guard to appointments', () => {
    const s = company([person(100, 'developer', 2), person(101), person(102)])
    s.money = 0
    expect(appointProfessionLead(s, 100, 'company')).toMatchObject({
      ok: false,
    })
    review(s)
    expect(s.peopleManagement!.reports.at(-1)!.deferred).toBeGreaterThan(0)
    expect(s.peopleManagement!.reports.at(-1)!.reasons[0]).toContain('reserves')
  })
  it('uses charged payroll after wage discounts/surcharges in both treasury guards and reports', () => {
    const s = company()
    s.modifiers.push({ id: s.nextId++, source: 'Wage pressure', stat: 'wage', mult: 2, expiresDay: s.day + 1000 })
    s.peopleManagement!.policy.payrollCap = monthlySalaries(s) + 1500
    expect(payrollGuard(s, 1000)).toBe('Company payroll cap') // Charged raise is 2000, not 1000.
    s.modifiers[0].mult = 0.5
    s.peopleManagement!.policy.payrollCap = monthlySalaries(s) + 600
    expect(payrollGuard(s, 1000)).toBeNull() // Charged raise is only 500.
    s.peopleManagement!.policy.payrollCap = null
    const before = monthlySalaries(s)
    review(s)
    expect(s.peopleManagement!.reports.at(-1)!.payrollBefore).toBe(before)
    expect(s.peopleManagement!.reports.at(-1)!.payrollAfter).toBe(monthlySalaries(s))
  })
  it('supports explicit hold policy and rejects invalid policy values', () => {
    const s = company()
    expect(
      setReviewPolicy(s, {
        automatic: false,
        reserveMonths: 3,
        payrollCap: null,
      }).ok,
    ).toBe(true)
    review(s)
    expect(s.peopleManagement!.reports.at(-1)?.deferred).toBe(3)
    expect(setReviewPolicy(s, { automatic: true, reserveMonths: 0, payrollCap: NaN }).ok).toBe(false)
    expect(
      setReviewPolicy(s, {
        automatic: true,
        reserveMonths: 2,
        payrollCap: Infinity,
      }).ok,
    ).toBe(false)
  })
  it('preserves specialist experience when an analyst becomes PM', () => {
    const s = company([person(100, 'analyst', 2)])
    s.research.done.push('product_management')
    s.employees[0].founder = true
    const before = structuredClone(s.employees[0].career)
    expect(becomePm(s, 100).ok).toBe(true)
    expect(s.employees[0].role).toBe('pm')
    expect(s.employees[0].career).toEqual(before)
    expect(s.employees[0].level).toBe(2)
  })
})

describe('warned retention and durable migration', () => {
  it('warns on blocked leadership, offers a specialist path, and never invents an empty appointment', () => {
    const s = company([person(100, 'developer', 2), person(104, 'developer', 2), person(105, 'developer', 2)])
    appointProfessionLead(s, 100, 'company')
    const e = s.employees[1]
    e.career!.ambition = 'leadership'
    e.career!.gradeDay = s.day
    peopleDay(s)
    s.day += 180
    peopleDay(s)
    expect(e.career!.concern?.kind).toBe('leadership')
    expect(e.career!.appointment).toBeUndefined()
    expect(respondCareerConcern(s, e.id, 'specialist').ok).toBe(true)
    expect(e.career!.ambition).toBe('specialist')
    expect(e.career!.concern).toBeUndefined()
  })
  it('gives a response window, allows one extension and performs one knowledge-handover departure', () => {
    const s = company([person(101)])
    s.peopleManagement!.policy.automatic = false
    const e = s.employees[0]
    e.knowledge = { types: { web_app: 100 }, products: {} }
    peopleDay(s)
    s.day += 60
    peopleDay(s)
    expect(e.career!.concern?.kind).toBe('promotion')
    const deadline = e.career!.concern!.deadlineDay
    expect(respondCareerConcern(s, e.id, 'discuss').ok).toBe(true)
    expect(e.career!.concern!.deadlineDay).toBe(deadline + 90)
    expect(respondCareerConcern(s, e.id, 'discuss').ok).toBe(false)
    s.day = deadline + 89
    peopleDay(s)
    expect(s.employees).toHaveLength(1)
    s.day++
    peopleDay(s)
    peopleDay(s)
    expect(s.employees).toHaveLength(0)
    expect(s.events.filter((event) => event.type === 'notice' && event.text.includes('left after'))).toHaveLength(1)
  })
  it('clears promotion concerns after budget is resolved; founders never enter departure conversations', () => {
    const s = company([person(101), person(102)])
    s.employees[1].founder = true
    s.peopleManagement!.policy.automatic = false
    peopleDay(s)
    s.day += 60
    peopleDay(s)
    expect(s.employees[0].career!.concern).toBeDefined()
    expect(s.employees[1].career!.concern).toBeUndefined()
    s.peopleManagement!.policy.automatic = true
    review(s)
    expect(s.employees[0].career!.concern).toBeUndefined()
  })
  it('does not run legacy random morale/long-tenure departure rolls for a managed company', () => {
    const s = company([person(101)])
    s.employees[0].morale = 0
    s.day = 20_000
    const rng = s.rng
    moraleDay(s)
    careerDay(s)
    expect(s.rng).toBe(rng)
    expect(s.employees).toHaveLength(1)
    expect(s.employees[0].career!.concern).toBeDefined()
  })
  it('keeps managed CEO/CTO founders valid without forcing executive-to-specialist promotions or departure warnings', () => {
    const s = company([person(100, 'analyst', 2), person(101, 'developer', 3)])
    s.employees[0].title = 'CEO'
    s.employees[1].title = 'CTO'
    for (const e of s.employees) {
      e.founder = true
      e.morale = 0
    }
    const grades = s.employees.map((e) => e.career!.grade)
    review(s)
    expect(s.peopleManagement!.reports.at(-1)).toMatchObject({
      reviewed: 2,
      promoted: 0,
    })
    expect(s.employees.map((e) => e.career!.grade)).toEqual(grades)
    expect(s.employees.every((e) => !e.career!.concern)).toBe(true)
    expect(deserialize(serialize(s))!.employees.map((e) => e.title)).toEqual(['CEO', 'CTO'])
  })
  it('hands knowledge over exactly once after a warned departure', () => {
    const s = company([person(101), person(102)])
    const [leaver, heir] = s.employees
    heir.founder = true
    s.peopleManagement!.policy.automatic = false
    s.research.done.push('knowledge_base')
    leaver.knowledge = { types: { web_app: 100 }, products: { '900': 50 } }
    peopleDay(s)
    s.day += 60
    peopleDay(s)
    s.day = leaver.career!.concern!.deadlineDay
    peopleDay(s)
    peopleDay(s)
    expect(s.employees).toEqual([heir])
    expect(heir.knowledge).toEqual({
      types: { web_app: 100 * KNOWLEDGE_HANDOVER },
      products: { '900': 50 * KNOWLEDGE_HANDOVER },
    })
  })
  it('rejects dangling or duplicate active appointments on load', () => {
    const s = company([person(100, 'developer', 2), person(101, 'developer', 2), person(102, 'developer', 2)])
    appointProfessionLead(s, 100, 'company')
    const duplicate = structuredClone(s)
    duplicate.employees[1].career!.appointment = { scope: 'company' }
    expect(deserialize(serialize(duplicate))).toBeNull()
    const dangling = structuredClone(s)
    dangling.employees[0].career!.appointment = { scope: 999 }
    expect(deserialize(serialize(dangling))).toBeNull()
  })
  it('upgrades v8 Leads deterministically, preserves pay and dates, and flags surplus appointments', () => {
    const s = company([person(100, 'developer', 3), person(101, 'developer', 3), person(102, 'developer', 3)])
    delete s.peopleManagement
    for (const e of s.employees) {
      delete e.career
      e.salary = salaryOf(e, s.day)
    }
    s.version = 8
    const old = s.employees.map((e) => ({
      salary: e.salary,
      levelDay: e.levelDay,
    }))
    const upgraded = deserialize(serialize(s))!
    expect(upgraded).not.toBeNull()
    expect(upgraded.version).toBe(9)
    expect(upgraded.employees[0].career!.appointment?.scope).toBe('company')
    expect(upgraded.employees.slice(1).every((e) => e.career!.appointment?.scope === 1)).toBe(true)
    expect(upgraded.employees[2].career!.appointment?.conflict).toBe(true)
    expect(
      upgraded.employees.map((e) => ({
        salary: salaryOf(e, s.day),
        levelDay: e.levelDay,
      })),
    ).toEqual(old)
    expect(deserialize(serialize(upgraded))!.employees).toEqual(upgraded.employees)
    expect(deserialize(serialize(upgraded))!.peopleManagement).toEqual(upgraded.peopleManagement)
  })
  it('round-trips policy/reports/ambitions/response windows without rerunning reviews', () => {
    const s = company()
    review(s)
    s.employees[0].career!.concern = {
      kind: 'leadership',
      openedDay: s.day,
      deadlineDay: s.day + 90,
      discussed: true,
    }
    const saved = serialize(s),
      restored = deserialize(saved)!
    expect(restored.peopleManagement).toEqual(s.peopleManagement)
    expect(restored.employees).toEqual(s.employees)
    peopleDay(restored)
    expect(restored.peopleManagement!.reports).toHaveLength(1)
  })
  it('rejects malformed career/management state and keeps pre-company café saves untouched', () => {
    const s = company(),
      valid = serialize(s)
    for (const mutate of [
      (v: typeof s) => {
        v.employees[0].career!.grade = IC_GRADES.length
      },
      (v: typeof s) => {
        v.employees[0].career!.management = 101
      },
      (v: typeof s) => {
        v.peopleManagement!.policy.reserveMonths = -1
      },
      (v: typeof s) => {
        delete v.employees[0].career
      },
    ]) {
      const raw = JSON.parse(valid)
      mutate(raw)
      expect(deserialize(JSON.stringify(raw))).toBeNull()
    }
    const cafe = makeState()
    cafe.version = 8
    cafe.offices[0].kind = 'cafe'
    expect(deserialize(serialize(cafe))!.peopleManagement).toBeUndefined()
  })
  it('carries founder specialist skills, not old-company appointments or retention problems, into a new venture', () => {
    const s = company([person(100, 'analyst', 2), person(101, 'analyst'), person(102, 'analyst')])
    const e = s.employees[0]
    e.founder = true
    appointProfessionLead(s, e.id, 'company')
    e.career!.concern = {
      kind: 'morale',
      openedDay: s.day,
      deadlineDay: s.day + 90,
    }
    s.gameOver = true
    s.ending = { kind: 'bankrupt', day: s.day, worth: 0 }
    const next = nextChapter(s)!
    expect(next).not.toBeNull()
    expect(next.employees[0].career!.grade).toBe(e.career!.grade)
    expect(next.employees[0].career!.appointment).toBeUndefined()
    expect(next.employees[0].career!.concern).toBeUndefined()
    expect(next.peopleManagement).toBeUndefined()
    expect(e.career!.appointment).toBeDefined() // old chapter not mutated
    expect(deserialize(serialize(next))).not.toBeNull()
  })
})
