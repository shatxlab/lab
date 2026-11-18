import { LEVELS } from './balance'
import type { Employee } from './types'

export const PROFESSIONS = ['design', 'engineering', 'qa', 'product'] as const
export type Profession = (typeof PROFESSIONS)[number]
export type LeadScope = 'company' | number
export const PROFESSION_NAMES: Record<Profession, string> = {
  design: 'Design',
  engineering: 'Engineering',
  qa: 'QA',
  product: 'Product & analysis',
}

/** IC grades are independent of profession-lead appointments. Never append these to legacy LEVELS. */
export const IC_GRADES = [
  { name: 'Junior', skill: 0, days: 0, salary: 0.9, speed: 0.95 },
  { name: 'Mid', skill: 45, days: 150, salary: 1, speed: 1 },
  { name: 'Senior', skill: 65, days: 300, salary: 1.2, speed: 1.1 },
  { name: 'Staff', skill: 80, days: 360, salary: 1.5, speed: 1.17 },
  { name: 'Principal', skill: 90, days: 720, salary: 1.8, speed: 1.25 },
] as const

export interface CareerProfile {
  grade: number
  gradeDay: number
  management: number
  ambition: 'specialist' | 'leadership'
  /** Retains the old level's compensation floor, including grandfathered Lead premiums. */
  payFloor: number
  appointment?: {
    scope: LeadScope
    grandfathered?: boolean
    conflict?: boolean
  }
  blockedSince?: number
  concern?: {
    kind: 'leadership' | 'promotion' | 'morale'
    openedDay: number
    deadlineDay: number
    discussed?: boolean
  }
}

export function professionOf(employee: Pick<Employee, 'role'>): Profession {
  return employee.role === 'designer'
    ? 'design'
    : employee.role === 'developer'
      ? 'engineering'
      : employee.role === 'tester'
        ? 'qa'
        : 'product'
}

export function initialCareer(employee: Employee): CareerProfile {
  return {
    grade: Math.min(2, employee.level),
    gradeDay: employee.levelDay,
    management: 25 + ((Math.imul(employee.id, 31) >>> 0) % 51),
    ambition: employee.level >= 3 || employee.id % 4 === 0 ? 'leadership' : 'specialist',
    payFloor: LEVELS[employee.level].salary,
  }
}

export function careerSpeed(employee: Employee): number {
  return employee.career ? IC_GRADES[employee.career.grade].speed : LEVELS[employee.level].speed
}

/** A real appointment earns a premium; an unresolved legacy duplicate does not lose its pay floor. */
export function careerPay(employee: Employee): number {
  const c = employee.career
  return c
    ? Math.max(c.payFloor, IC_GRADES[c.grade].salary + (c.appointment && !c.appointment.conflict ? 0.2 : 0))
    : LEVELS[employee.level].salary
}

export function careerGradeName(employee: Employee): string {
  return employee.career ? IC_GRADES[employee.career.grade].name : LEVELS[employee.level].name
}

/** Strict, bounded shape validation; office/reference checks are performed by the state boundary. */
export function isCareerProfile(value: unknown): value is CareerProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const c = value as Record<string, unknown>
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const day = (v: unknown) => number(v) && Number.isSafeInteger(v)
  if (
    !Object.keys(c).every((k) =>
      ['grade', 'gradeDay', 'management', 'ambition', 'payFloor', 'appointment', 'blockedSince', 'concern'].includes(k),
    )
  )
    return false
  if (
    !Number.isInteger(c.grade) ||
    (c.grade as number) < 0 ||
    (c.grade as number) >= IC_GRADES.length ||
    !day(c.gradeDay) ||
    !number(c.management) ||
    (c.management as number) > 100 ||
    !['specialist', 'leadership'].includes(String(c.ambition)) ||
    !number(c.payFloor) ||
    (c.payFloor as number) > 5
  )
    return false
  if (c.blockedSince !== undefined && !day(c.blockedSince)) return false
  if (c.appointment !== undefined) {
    if (!c.appointment || typeof c.appointment !== 'object' || Array.isArray(c.appointment)) return false
    const a = c.appointment as Record<string, unknown>
    if (
      !Object.keys(a).every((k) => ['scope', 'grandfathered', 'conflict'].includes(k)) ||
      !(a.scope === 'company' || day(a.scope)) ||
      (a.grandfathered !== undefined && typeof a.grandfathered !== 'boolean') ||
      (a.conflict !== undefined && typeof a.conflict !== 'boolean')
    )
      return false
  }
  if (c.concern !== undefined) {
    if (!c.concern || typeof c.concern !== 'object' || Array.isArray(c.concern)) return false
    const r = c.concern as Record<string, unknown>
    if (
      !Object.keys(r).every((k) => ['kind', 'openedDay', 'deadlineDay', 'discussed'].includes(k)) ||
      !['leadership', 'promotion', 'morale'].includes(String(r.kind)) ||
      !day(r.openedDay) ||
      !day(r.deadlineDay) ||
      (r.deadlineDay as number) < (r.openedDay as number) ||
      (r.discussed !== undefined && typeof r.discussed !== 'boolean')
    )
      return false
  }
  return true
}
