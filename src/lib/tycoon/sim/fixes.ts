import { AUTO_FIX_DENSITY, FIX_SPLIT, POINTS_PER_BUG, SKILL_GAIN } from './balance'
import { fixingIds } from './offices'
import { dailyContribution, expectedContribution } from './work'
import { statMultiplier } from './modifiers'
import { bugDensity } from './products'
import { isReady, overallProgress } from './scoring'
import { employeeSkillGain } from './staff'
import { DISCIPLINES, emptySkills, fail, OK, type Employee, type Fix, type GameState, type Product, type Result, type Skills } from './types'

/** The research that lets a standing pair fix bugs on its own. */
export const INCIDENT_RESEARCH = 'incident_management'

/** Points a fixing job needs to fix `bugs` bugs: engineering from the developer, QA from the tester. */
export function fixTarget(bugs: number): Skills {
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.round(bugs * POINTS_PER_BUG * FIX_SPLIT[d])
  return target
}

export function fixOf(state: GameState, productId: number): Fix | undefined {
  return state.fixes.find((f) => f.productId === productId)
}

/** True once Incident management is researched. */
export function onCallUnlocked(state: GameState): boolean {
  return state.research.done.includes(INCIDENT_RESEARCH)
}

/** People picked as the on-call pair; they are kept free of manual jobs. */
function onCallIds(state: GameState): number[] {
  return state.onCall ? [state.onCall.developerId, state.onCall.testerId] : []
}

/** Why this person can't be sent to fix bugs now, or null when they can. `onCall` lets the on-call pair through. */
function personBlocker(state: GameState, employee: Employee | undefined, role: 'developer' | 'tester', onCall: boolean): string | null {
  if (!employee || employee.role !== role) return role === 'developer' ? 'Pick a developer' : 'Pick a tester'
  if (employee.training) return `${employee.name} is in training`
  if (fixingIds(state).has(employee.id)) return `${employee.name} is already fixing bugs`
  if (!onCall && onCallIds(state).includes(employee.id)) return `${employee.name} is on call`
  return null
}

/** Who could be sent to fix bugs right now in this role: not training, not already fixing, not on call. */
export function availableFixers(state: GameState, role: 'developer' | 'tester'): Employee[] {
  return state.employees.filter((e) => personBlocker(state, e, role, false) === null)
}

/** Why a product can't be sent a fixing pair now, or null when it can (a pair is still to be chosen). */
export function fixBlocker(state: GameState, product: Product): string | null {
  if (product.bugs < 1) return 'No bugs to fix'
  if (fixOf(state, product.id)) return 'Already being fixed'
  if (availableFixers(state, 'developer').length === 0) return 'Needs a free developer'
  if (availableFixers(state, 'tester').length === 0) return 'Needs a free tester'
  return null
}

/** Days a developer and a tester would need to fix `bugs` bugs together; Infinity if either has no output. */
export function estimateFixDays(state: GameState, bugs: number, developer: Employee, tester: Employee): number {
  const target = fixTarget(bugs)
  const engineering = expectedContribution(developer, state).engineering
  const qa = expectedContribution(tester, state).qa
  if ((target.engineering > 0 && engineering <= 0) || (target.qa > 0 && qa <= 0)) return Infinity
  return Math.max(Math.ceil(target.engineering / (engineering || 1)), Math.ceil(target.qa / (qa || 1)))
}

function begin(state: GameState, product: Product, developerId: number, testerId: number, auto: boolean): void {
  const bugs = Math.floor(product.bugs)
  state.fixes.push({
    id: state.nextId++,
    productId: product.id,
    developerId,
    testerId,
    target: fixTarget(bugs),
    progress: emptySkills(),
    bugs,
    bugsFixed: 0,
    startDay: state.day,
    auto,
  })
}

/** Sends a developer and a tester to fix every bug the product has right now; the ones users find meanwhile wait for the next job. */
export function startFix(state: GameState, productId: number, developerId: number, testerId: number): Result {
  if (state.gameOver) return fail('Game over')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  if (product.bugs < 1) return fail('No bugs to fix')
  if (fixOf(state, productId)) return fail('Already being fixed')
  const blocker =
    personBlocker(state, state.employees.find((e) => e.id === developerId), 'developer', false) ??
    personBlocker(state, state.employees.find((e) => e.id === testerId), 'tester', false)
  if (blocker) return fail(blocker)
  begin(state, product, developerId, testerId, false)
  return OK
}

/** Ends a fixing job early. The bugs fixed so far stay fixed. */
export function stopFix(state: GameState, fixId: number): Result {
  const fix = state.fixes.find((f) => f.id === fixId)
  if (!fix) return fail('No bug fixing in progress')
  state.fixes = state.fixes.filter((f) => f.id !== fixId)
  const product = state.products.find((p) => p.id === fix.productId)
  state.events.push({ type: 'notice', text: `Stopped fixing ${product?.name ?? 'the product'}: ${fix.bugsFixed} of ${fix.bugs} bugs fixed.` })
  return OK
}

/** Why this pair can't be put on call, or null when they can. */
export function onCallBlocker(state: GameState, developerId: number, testerId: number): string | null {
  if (!onCallUnlocked(state)) return 'Research Incident management first'
  const current = onCallIds(state)
  const free = (id: number) => current.includes(id)
  return (
    personBlocker(state, state.employees.find((e) => e.id === developerId), 'developer', free(developerId)) ??
    personBlocker(state, state.employees.find((e) => e.id === testerId), 'tester', free(testerId))
  )
}

/** Puts a developer and a tester on call: they start fixing the buggiest product on their own, and work on their office's project otherwise. */
export function setOnCall(state: GameState, developerId: number, testerId: number): Result {
  const blocker = onCallBlocker(state, developerId, testerId)
  if (blocker) return fail(blocker)
  state.onCall = { developerId, testerId }
  return OK
}

export function clearOnCall(state: GameState): Result {
  if (!state.onCall) return fail('Nobody is on call')
  state.onCall = null
  return OK
}

/** The product that most needs a fixing job, if any is buggy enough and not already being fixed. */
function needsFixing(state: GameState): Product | undefined {
  return state.products
    .filter((p) => p.bugs >= 1 && !fixOf(state, p.id) && bugDensity(p) >= AUTO_FIX_DENSITY)
    .sort((a, b) => bugDensity(b) - bugDensity(a))[0]
}

/** The on-call pair, when both are still here, picks up the buggiest product; if one has left, the arrangement ends. */
function autoFix(state: GameState): void {
  const onCall = state.onCall
  if (!onCall) return
  const developer = state.employees.find((e) => e.id === onCall.developerId)
  const tester = state.employees.find((e) => e.id === onCall.testerId)
  if (!developer || !tester) {
    state.onCall = null
    state.events.push({ type: 'notice', text: 'The on-call pair is broken up: pick two people again.' })
    return
  }
  const away = fixingIds(state)
  if (away.has(developer.id) || away.has(tester.id) || developer.training || tester.training) return
  const product = needsFixing(state)
  if (product) begin(state, product, developer.id, tester.id, true)
}

/** One person's day on a fixing job: only their own discipline counts, and it adds to their skill. */
function work(state: GameState, fix: Fix, person: Employee, discipline: 'engineering' | 'qa'): void {
  const room = Math.max(fix.target[discipline] - fix.progress[discipline], 0)
  const applied = Math.min(dailyContribution(person, state)[discipline], room)
  fix.progress[discipline] += applied
  const gain = SKILL_GAIN * statMultiplier(state, 'skillGain') * employeeSkillGain(state, person)
  person.skills[discipline] = Math.min(100, person.skills[discipline] + applied * gain * (1 - person.skills[discipline] / 100))
  const points = emptySkills()
  points[discipline] = applied
  state.dayWork.push({ employeeId: person.id, points, fixing: true })
}

/**
 * A day for the fixing jobs: the on-call pair may start one, then each pair works. Bugs go away as the
 * bars fill, so the product gets better while the job runs; when both bars are full the job ends itself.
 */
export function fixesDay(state: GameState): void {
  autoFix(state)
  for (const fix of [...state.fixes]) {
    const product = state.products.find((p) => p.id === fix.productId)
    const developer = state.employees.find((e) => e.id === fix.developerId)
    const tester = state.employees.find((e) => e.id === fix.testerId)
    if (!product || !developer || !tester) {
      state.fixes = state.fixes.filter((f) => f !== fix)
      continue
    }
    work(state, fix, developer, 'engineering')
    work(state, fix, tester, 'qa')

    const done = isReady(fix)
    const fixed = done ? fix.bugs : Math.floor(fix.bugs * overallProgress(fix))
    const squashed = fixed - fix.bugsFixed
    if (squashed > 0) {
      product.bugs = Math.max(0, product.bugs - squashed)
      fix.bugsFixed = fixed
      state.bugsFixed += squashed
    }
    if (done) {
      state.fixes = state.fixes.filter((f) => f !== fix)
      state.events.push({
        type: 'notice',
        text: `${product.name}: ${fix.bugs} bug${fix.bugs === 1 ? '' : 's'} fixed.`,
        sound: 'ship',
      })
    }
  }
}
