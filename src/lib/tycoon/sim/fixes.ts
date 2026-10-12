import { FIX_SPLIT, POINTS_PER_BUG } from './balance'
import { productWorkBlocker } from './lifecycle'
import { resolveOffice, staffOf } from './offices'
import { isReady, overallProgress } from './scoring'
import { DISCIPLINES, emptySkills, fail, OK, type DayWork, type GameState, type Office, type Product, type Result, type Skills } from './types'

/** Points a sprint needs to fix `bugs` bugs, mostly engineering and QA. */
export function fixTarget(bugs: number): Skills {
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.round(bugs * POINTS_PER_BUG * FIX_SPLIT[d])
  return target
}

/** Why `office` can't start a bug-fixing sprint on this product now, or null when it can. */
export function fixBlocker(state: GameState, office: Office, product: Product): string | null {
  if (product.bugs < 1) return 'No bugs to fix'
  return productWorkBlocker(state, office, product)
}

/** Starts a sprint that fixes every bug the product has right now; the ones users find meanwhile wait for the next. */
export function startFix(state: GameState, productId: number, officeId?: number): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = fixBlocker(state, office, product)
  if (blocker) return fail(blocker)

  const bugs = Math.floor(product.bugs)
  office.project = {
    id: state.nextId++,
    name: product.name,
    kind: 'fix',
    parentId: product.id,
    productTypeId: product.productTypeId,
    size: product.size,
    featureIds: [],
    target: fixTarget(bugs),
    progress: emptySkills(),
    startDay: state.day,
    readyNotified: false,
    hype: 1,
    alphaOffered: true,
    bugRisk: 1,
    bugs,
    bugsFixed: 0,
    contract: null,
  }
  return OK
}

/** Stops an office's sprint early. The bugs fixed so far stay fixed. */
export function stopFix(state: GameState, officeId?: number): Result {
  const office = resolveOffice(state, officeId)
  const project = office?.project
  if (!office || !project || project.kind !== 'fix') return fail('No bug fixing in progress')
  office.project = null
  state.events.push({ type: 'notice', text: `Stopped fixing ${project.name}: ${project.bugsFixed} of ${project.bugs} bugs fixed.` })
  return OK
}

const pointsOf = (work: DayWork) => DISCIPLINES.reduce((sum, d) => sum + work.points[d], 0)

/** Hands today's squashed bugs to the office's people who did the most work, one each in turn, for the popups. */
function creditSquashes(state: GameState, office: Office, count: number): void {
  const staff = new Set(staffOf(state, office).map((e) => e.id))
  const workers = state.dayWork.filter((w) => staff.has(w.employeeId) && pointsOf(w) > 0).sort((a, b) => pointsOf(b) - pointsOf(a))
  for (let i = 0; i < count && workers.length > 0; i++) workers[i % workers.length].bugs += 1
}

/**
 * After the day's work on a fix sprint: bugs go away as the bars fill, so the product gets better
 * while the sprint runs. When every bar is full the sprint ends on its own.
 */
export function fixDay(state: GameState, office: Office): void {
  const project = office.project
  if (!project || project.kind !== 'fix') return
  const product = state.products.find((p) => p.id === project.parentId)
  if (!product) {
    office.project = null
    return
  }

  const done = isReady(project)
  const fixed = done ? project.bugs : Math.floor(project.bugs * overallProgress(project))
  const squashed = fixed - project.bugsFixed
  if (squashed > 0) {
    product.bugs = Math.max(0, product.bugs - squashed)
    project.bugsFixed = fixed
    state.bugsFixed += squashed
    creditSquashes(state, office, squashed)
  }
  if (done) {
    office.project = null
    state.events.push({
      type: 'notice',
      text: `${product.name}: ${project.bugs} bug${project.bugs === 1 ? '' : 's'} fixed.`,
      sound: 'ship',
    })
  }
}
