import { ERAS } from '@/lib/tycoon/data/eras'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { startProject } from '@/lib/tycoon/sim/project'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { Employee, GameState, Product, Role, Skills } from '@/lib/tycoon/sim/types'

export function makeEmployee(
  id: number,
  skills: Partial<Skills> = {},
  salary = 0,
  role: Role = 'developer',
): Employee {
  return {
    id,
    name: `Test ${id}`,
    role,
    skills: { design: 0, engineering: 0, qa: 0, ...skills },
    salary,
    // Neutral by default: tests that care about traits or morale set them.
    trait: 'none',
    morale: 75,
    training: null,
    // The first office of every state from createInitialState.
    officeId: 1,
    level: 1,
    levelDay: 0,
    hiredDay: 0,
    readySince: null,
  }
}

/** A released product; override only what the test cares about. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Test',
    productTypeId: 'web_app',
    size: 'small',
    featureIds: [],
    quality: 80,
    releaseDay: 0,
    reach: 10_000,
    users: 10_000,
    bugs: 0,
    pendingBugs: 0,
    hit: false,
    totalRevenue: 0,
    updates: [],
    boostUntil: 0,
    boostUsers: 0,
    ...overrides,
  }
}

/**
 * A seeded state with the random starting staff replaced by `employees`, money to start projects, and no rivals, so a product's
 * users depend on nothing but itself. Tests about competition add rivals back.
 */
export function makeState(employees: Employee[] = [], seed = 1): GameState {
  const state = createInitialState(seed)
  state.employees = employees
  // Starting a product costs a budget; tests about projects shouldn't have to find the money first.
  state.money = 100_000
  state.rivals = []
  state.rivalProducts = []
  return state
}

/** The first day of the era with this index (see ERAS), for tests about later technology. */
export function dayOfEra(index: number): number {
  return (ERAS[index].startYear - 1) * 12 * DAYS_PER_MONTH
}

/**
 * A mid-game studio in which every random event can be offered: four people, a free desk,
 * recent products that earn money, a project in progress, and plenty of cash.
 */
export function richState(seed = 11): GameState {
  const state = makeState(
    [
      makeEmployee(100, { design: 20, engineering: 60, qa: 20 }, 2500),
      makeEmployee(101, { design: 60, engineering: 20, qa: 20 }, 2400),
      makeEmployee(102, { design: 20, engineering: 20, qa: 50 }, 2000),
      makeEmployee(103, { design: 30, engineering: 30, qa: 30 }, 1800),
    ],
    seed,
  )
  state.offices[0].kind = 'office'
  state.day = 100
  state.lastEventDay = 0
  state.money = 50_000
  state.reputation = 20
  state.products.push(
    makeProduct({ id: 900, name: 'Old', releaseDay: 20, reach: 10_000, users: 10_000, bugs: 12, totalRevenue: 1000 }),
    makeProduct({ id: 901, name: 'Fresh', quality: 85, releaseDay: 95, reach: 15_000, users: 2000, bugs: 3, totalRevenue: 500 }),
  )
  startProject(state, 'web_app', ['accounts'])
  return state
}
