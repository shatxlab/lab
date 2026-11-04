import type { Proposal, SimEvent } from './types'

/** Version-8 floor reservation, executed by operations/work/teams.
 * Keep exactly one value per floor: no queue, implicit helpers or simultaneous standing/build work.
 * Legacy v7 work is migrated at the persistence boundary.
 */
export type OperationInitiative = Exclude<Proposal['kind'], 'deep' | 'strike'> | 'grow' | 'pivot'
export type OperationProposal = { kind: OperationInitiative; id: string; why: string }

export type FloorAssignment =
  | { kind: 'idle' }
  | { kind: 'initiative'; productId: number; projectId: number; proposal: { kind: OperationInitiative; id: string }; startedDay: number }
  | { kind: 'standing'; productId: number; service: 'reliability' | 'growth' | 'research'; startedDay: number }

/** Strict shape gate for the future saved value. Referential/content checks belong to migration. */
export function isFloorAssignment(value: unknown): value is FloorAssignment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  const id = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0
  const keys = (allowed: string[]) => Object.keys(data).every((key) => allowed.includes(key))
  if (data.kind === 'idle') return keys(['kind'])
  if (!id(data.productId) || !id(data.startedDay)) return false
  if (data.kind === 'standing') return keys(['kind', 'productId', 'startedDay', 'service']) &&
    ['reliability', 'growth', 'research'].includes(String(data.service))
  if (data.kind !== 'initiative' || !keys(['kind', 'productId', 'projectId', 'startedDay', 'proposal']) || !id(data.projectId)) return false
  const proposal = data.proposal as Record<string, unknown> | null
  return !!proposal && typeof proposal === 'object' && !Array.isArray(proposal) &&
    Object.keys(proposal).every((key) => ['kind', 'id'].includes(key)) &&
    ['feature', 'item', 'polish', 'compliance', 'localise', 'grow', 'pivot'].includes(String(proposal.kind)) &&
    typeof proposal.id === 'string' && proposal.id.length > 0 && proposal.id.length <= 200
}

/** Units must match: a capacity figure cannot be compared with skill points or floor counts. */
export interface StandingService {
  service: 'reliability' | 'growth' | 'research'
  provided: number
  demand: number
  unit: string
  headroom: number
  risk: string | null
}

/** The generic service contract does not set balance numbers; its provider must use actual simulation demand. */
export function standingService(service: StandingService['service'], provided: number, demand: number, unit: string): StandingService {
  if (!Number.isFinite(provided) || !Number.isFinite(demand) || provided < 0 || demand < 0 || !unit.trim()) throw new Error('Invalid service measurement')
  return { service, provided, demand, unit, headroom: provided - demand,
    risk: demand > provided ? 'Demand exceeds provided service; more coverage is needed.' : null }
}

/** Routine operations are informational; explicit choices/endings remain blocking. */
export function operationEventMode(event: SimEvent): 'blocking' | 'informational' {
  switch (event.type) {
    case 'randomEvent':
    case 'offer':
    case 'bankrupt':
      return 'blocking'
    default:
      return 'informational'
  }
}
