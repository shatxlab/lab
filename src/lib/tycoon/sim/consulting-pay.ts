import { isKnownTrait } from '@/lib/tycoon/data/traits'
import { IC_GRADES } from './career-profile'
import { LEVELS } from './balance'
import { salaryFor } from './hiring'
import { DISCIPLINES, type Employee, type Region, type Skills } from './types'

/** Frozen personal market inputs, with no founder discount, corporate appointment or temporary deal. */
export interface ConsultingPayBasis {
  skills: Skills
  analysis: number
  trait: string
  level: number
  region: Region
  grade: number | null
  payFloor: number | null
}
export function consultingPayBasis(person: Employee): ConsultingPayBasis {
  return { skills: { ...person.skills }, analysis: person.analysis ?? 0, trait: person.trait,
    level: person.level, region: person.region ?? 'us', grade: person.career?.grade ?? null, payFloor: person.career?.payFloor ?? null }
}
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const skill = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
export function isConsultingPayBasis(raw: unknown): raw is ConsultingPayBasis {
  return obj(raw) && obj(raw.skills) && DISCIPLINES.every((d) => skill((raw.skills as Record<string, unknown>)[d])) &&
    skill(raw.analysis) && typeof raw.trait === 'string' && isKnownTrait(raw.trait) && Number.isInteger(raw.level) &&
    (raw.level as number) >= 0 && (raw.level as number) < LEVELS.length && (raw.region === 'us' || raw.region === 'eu') &&
    ((raw.grade === null && raw.payFloor === null) || (Number.isInteger(raw.grade) && (raw.grade as number) >= 0 &&
      (raw.grade as number) < IC_GRADES.length && typeof raw.payFloor === 'number' && Number.isFinite(raw.payFloor) && raw.payFloor >= 0 && raw.payFloor <= 5))
}
/** Shared by preview, ledger replay and completion; the start day fixes pay even across an era boundary. */
export function consultingPay(basis: ConsultingPayBasis, day: number): { marketSalary: number; payout: number } | null {
  if (!isConsultingPayBasis(basis) || !Number.isSafeInteger(day) || day < 0) return null
  const pay = basis.grade === null ? LEVELS[basis.level].salary : Math.max(basis.payFloor!, IC_GRADES[basis.grade].salary)
  const marketSalary = salaryFor(basis.skills, basis.trait, basis.level, day, pay / LEVELS[basis.level].salary, basis.analysis, basis.region)
  const payout = Math.floor(marketSalary / 2)
  return Number.isSafeInteger(marketSalary) && marketSalary > 0 && Number.isSafeInteger(payout) && payout > 0 ? { marketSalary, payout } : null
}

export function sameConsultingPayBasis(a: ConsultingPayBasis, b: ConsultingPayBasis): boolean {
  return isConsultingPayBasis(a) && isConsultingPayBasis(b) && DISCIPLINES.every((d) => a.skills[d] === b.skills[d]) &&
    a.analysis === b.analysis && a.trait === b.trait && a.level === b.level && a.region === b.region && a.grade === b.grade && a.payFloor === b.payFloor
}
