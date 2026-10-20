import {
  KNOWLEDGE_HANDOVER,
  KNOWLEDGE_PER_DAY,
  KNOWLEDGE_PRODUCT_HALF,
  KNOWLEDGE_PRODUCT_MAX,
  KNOWLEDGE_TYPE_HALF,
  KNOWLEDGE_TYPE_MAX,
} from './balance'
import { teamOfficeId } from './offices'
import { isBuilder, type Employee, type GameState } from './types'
import { isResearched } from './unlocks'

/** The research that makes a team keep some of what a leaver knew. */
export const KNOWLEDGE_BASE_RESEARCH = 'knowledge_base'

/** What a piece of work is about: the kind of product, and the product itself once it has an id (null for client work). */
export interface Subject {
  typeId: string
  productId: number | null
}

const share = (days: number, half: number) => days / (days + half)

/** Days this person has worked on this kind of product. */
export function typeDays(employee: Employee, typeId: string): number {
  return employee.knowledge?.types[typeId] ?? 0
}

/** Days this person has worked on this very product. */
export function productDays(employee: Employee, productId: number): number {
  return employee.knowledge?.products[String(productId)] ?? 0
}

/** Multiplier on how fast this person works on `subject`: 1 for someone new to it, up by degrees with what they have learned. */
export function knowledgeSpeed(employee: Employee, subject?: Subject | null): number {
  if (!subject || !employee.knowledge) return 1
  const forType = KNOWLEDGE_TYPE_MAX * share(typeDays(employee, subject.typeId), KNOWLEDGE_TYPE_HALF)
  const forProduct = subject.productId === null ? 0 : KNOWLEDGE_PRODUCT_MAX * share(productDays(employee, subject.productId), KNOWLEDGE_PRODUCT_HALF)
  return 1 + forType + forProduct
}

/** A day of real work on `subject`: it goes into what the person knows. */
export function learn(employee: Employee, subject: Subject | null): void {
  if (!subject) return
  const knowledge = (employee.knowledge ??= { types: {}, products: {} })
  knowledge.types[subject.typeId] = (knowledge.types[subject.typeId] ?? 0) + KNOWLEDGE_PER_DAY
  if (subject.productId !== null) {
    const key = String(subject.productId)
    knowledge.products[key] = (knowledge.products[key] ?? 0) + KNOWLEDGE_PER_DAY
  }
}

export interface Expertise {
  kind: 'type' | 'product'
  /** The product type id, or the product id as a string. */
  id: string
  /** A readable name; for a product that has since gone, "a past product". */
  name: string
  days: number
}

/** What this person knows best, most days first: for the person's page. */
export function topExpertise(state: GameState, employee: Employee, limit = 4): Expertise[] {
  const knowledge = employee.knowledge
  if (!knowledge) return []
  const rows: Expertise[] = []
  for (const [id, days] of Object.entries(knowledge.types)) rows.push({ kind: 'type', id, name: id, days })
  for (const [id, days] of Object.entries(knowledge.products)) {
    const product = state.products.find((p) => String(p.id) === id) ?? state.retired.find((p) => String(p.id) === id)
    rows.push({ kind: 'product', id, name: product?.name ?? 'a past product', days })
  }
  return rows.sort((a, b) => b.days - a.days).slice(0, limit)
}

/**
 * Someone leaves the studio, for whatever reason. With a knowledge base the people on the same team keep a share of
 * what they knew, split between them; without one it goes out of the door with them.
 */
export function depart(state: GameState, employee: Employee): void {
  state.employees = state.employees.filter((e) => e.id !== employee.id)
  const knowledge = employee.knowledge
  if (!knowledge || !isResearched(state, KNOWLEDGE_BASE_RESEARCH)) return
  const team = teamOfficeId(state, employee)
  const heirs = state.employees.filter((e) => isBuilder(e) && teamOfficeId(state, e) === team)
  if (heirs.length === 0) return
  for (const heir of heirs) {
    const mine = (heir.knowledge ??= { types: {}, products: {} })
    for (const [id, days] of Object.entries(knowledge.types)) mine.types[id] = (mine.types[id] ?? 0) + (days * KNOWLEDGE_HANDOVER) / heirs.length
    for (const [id, days] of Object.entries(knowledge.products)) mine.products[id] = (mine.products[id] ?? 0) + (days * KNOWLEDGE_HANDOVER) / heirs.length
  }
}
