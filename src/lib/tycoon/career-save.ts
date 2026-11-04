import { deserialize, STATE_VERSION } from './sim/state'
import {
  createFounderFinance, declineLegacySettlement, financeSummary, settleFounderExit,
  type Ambition, type ExitFacts, type FounderFinance, type FinanceResult,
} from './sim/founder-finance'
import type { GameState } from './sim/types'

/** Prepared v12 codec. Live save.ts remains v11 until paid founding replaces seed-money grants. */
export const CAREER_SAVE_VERSION = 12
export interface CompanyCharter {
  companyId: string
  ambition: Ambition
  /** Sticky recognition only; IPO must also recheck live company readiness. */
  fulfilledDay: number | null
}
export interface CareerSave {
  version: typeof CAREER_SAVE_VERSION
  game: GameState
  finance: FounderFinance
  charter: CompanyCharter
}
export interface CareerIdentity {
  careerId: string
  companyId: string
}
const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/** Never reads live RNG, world ids or wall-clock time. Identity is allocated externally once per career. */
export function createCareerSave(game: GameState, identity: CareerIdentity): FinanceResult<CareerSave> {
  // This API is only for a genuinely new first company, not retroactive adoption.
  if (game.day !== 0 || (game.chapter ?? 1) !== 1 || game.gameOver || game.ending) return fail('A new career must begin with its first active company on day zero')
  const finance = createFounderFinance(identity.careerId, identity.companyId)
  if (!finance.ok) return finance
  const value: CareerSave = { version: CAREER_SAVE_VERSION, game: structuredClone(game), finance: finance.value,
    charter: { companyId: identity.companyId, ambition: 'standard', fulfilledDay: null } }
  return validateCareerSave(value)
}

export function currentExitFacts(game: GameState): ExitFacts | null {
  if (!game.gameOver || !game.ending) return null
  return { kind: game.ending.kind, day: game.ending.day, worth: game.ending.worth, closingCash: game.money }
}

/** Cross-validates the ledger with the actual current company, not just its own replay. */
export function validateCareerSave(raw: unknown): FinanceResult<CareerSave> {
  try { return validateEnvelope(raw) } catch { return fail('Malformed career save') }
}

function validateEnvelope(raw: unknown): FinanceResult<CareerSave> {
  if (!obj(raw) || raw.version !== CAREER_SAVE_VERSION || !obj(raw.game) || raw.game.version !== STATE_VERSION || !obj(raw.charter)) return fail('Invalid career save envelope')
  const game = deserialize(JSON.stringify(raw.game))
  if (!game || !whole(game.day) || !whole(game.rng) || game.rng > 0xffffffff) return fail('Invalid career game state')
  const summary = financeSummary(raw.finance)
  if (!summary.ok) return summary
  const companies = summary.value.companies
  const current = companies[companies.length - 1]
  const charter = raw.charter
  if (current.source === 'personal'
    ? !game.founding || game.founding.ambition !== current.ambition
    : game.founding !== undefined) return fail('Paid founding provenance does not match the ledger')
  if (charter.companyId !== current.companyId || charter.ambition !== current.ambition ||
    (charter.fulfilledDay !== null && (!whole(charter.fulfilledDay) || charter.fulfilledDay > game.day))) return fail('Charter does not match the current company')
  const finance = raw.finance as FounderFinance
  const last = finance.records[finance.records.length - 1]
  if (last.day > game.day) return fail('Finance records are ahead of world time')
  if (game.gameOver !== (game.ending !== null)) return fail('Ending and game-over state disagree')
  if (game.ending) {
    const ending = game.ending
    if (!whole(ending.day) || ending.day > game.day || !Number.isSafeInteger(ending.worth)) return fail('Invalid ending facts')
    const facts = currentExitFacts(game)!
    if (current.closed) {
      if (last.kind !== 'settlement' && last.kind !== 'legacy-close') return fail('Closed company has no recorded ending')
      const booked = last.facts
      if (booked.kind !== facts.kind || booked.day !== facts.day || booked.worth !== facts.worth || booked.closingCash !== facts.closingCash) return fail('Current ending conflicts with its immutable settlement')
    } else {
      // Open ended companies are recoverable pending settlement. Validate the facts without crediting them.
      const preview = settleFounderExit(finance, current.companyId, facts, current.source === 'legacy-ended')
      if (!preview.ok) return preview
    }
  } else if (current.closed || current.source === 'legacy-ended') return fail('An active company cannot have a closed or already-ended charter')
  const companyStart = finance.records.find((r) => r.companyId === current.companyId && (r.kind === 'origin' || r.kind === 'investment'))
  if (!companyStart || (charter.fulfilledDay !== null && (charter.fulfilledDay as number) < companyStart.day)) return fail('Charter recognition predates this company')
  const origin = finance.records[0]
  if (origin.kind !== 'origin') return fail('Missing career origin')
  // A migrated career starts at its current chapter; older legacy valuations are not ledger companies.
  if (origin.source === 'initial' && (game.chapter ?? 1) !== companies.length) return fail('Company count does not match the career chapter')
  return { ok: true, value: { version: CAREER_SAVE_VERSION, game, finance: structuredClone(finance), charter: structuredClone(charter) as unknown as CompanyCharter } }
}

/** Validated v11 (or supported older) save adoption. No history is cashed out, no ending is settled. */
export function adoptCareerSave(text: string, identity: CareerIdentity): FinanceResult<CareerSave> {
  const game = deserialize(text)
  if (!game) return fail('That file is not a supported legacy save')
  const finance = createFounderFinance(identity.careerId, identity.companyId, game.day, game.gameOver ? 'legacy-ended' : 'legacy-active')
  if (!finance.ok) return finance
  return validateCareerSave({ version: CAREER_SAVE_VERSION, game, finance: finance.value,
    charter: { companyId: identity.companyId, ambition: 'standard', fulfilledDay: null } })
}

/** v12 never silently falls back to migration, re-creates identity, or repairs invalid finance. */
export function deserializeCareerSave(text: string): FinanceResult<CareerSave> {
  try { return validateCareerSave(JSON.parse(text)) } catch { return fail('Malformed career save') }
}

export function serializeCareerSave(save: CareerSave): FinanceResult<string> {
  const checked = validateCareerSave(save)
  return checked.ok ? { ok: true, value: JSON.stringify(checked.value) } : checked
}

/** Pure proposal: no live state or storage mutation, including on validation failure. */
export function settleCareerSave(save: CareerSave, legacyDecision?: 'apply' | 'decline'): FinanceResult<CareerSave> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  const value = checked.value
  const facts = currentExitFacts(value.game)
  if (!facts) return fail('Only an ended company can be settled')
  const summary = financeSummary(value.finance)
  if (!summary.ok) return summary
  const current = summary.value.companies[summary.value.companies.length - 1]
  const last = value.finance.records[value.finance.records.length - 1]
  if (current.source === 'legacy-ended') {
    if (!legacyDecision) return fail('Choose whether to apply the prototype 50% legacy settlement')
    if (current.closed) {
      if ((legacyDecision === 'apply' && last.kind === 'settlement') || (legacyDecision === 'decline' && last.kind === 'legacy-close')) return { ok: true, value }
      return fail('Legacy adoption conflicts with the recorded decision')
    }
  } else if (legacyDecision) return fail('Only an already-ended legacy company requires an adoption decision')
  const finance = legacyDecision === 'decline'
    ? declineLegacySettlement(value.finance, current.companyId, facts)
    : settleFounderExit(value.finance, current.companyId, facts, legacyDecision === 'apply')
  if (!finance.ok) return finance
  value.finance = finance.value
  return validateCareerSave(value)
}

