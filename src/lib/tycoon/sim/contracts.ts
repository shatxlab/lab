import { CLIENTS, JOBS } from '@/lib/tycoon/data/clients'
import { formatMoney } from '@/lib/tycoon/format'
import {
  CONTRACT_ABANDON_REPUTATION,
  CONTRACT_LATE_PAY,
  CONTRACT_MAX_DAYS,
  CONTRACT_MIN_DAYS,
  CONTRACT_OFFERS,
  CONTRACT_PAY_PER_POINT,
  CONTRACT_REPUTATION,
  CONTRACT_REPUTATION_PAY,
  CONTRACT_SLACK,
  CONTRACT_SLACK_DAYS,
  REPUTATION_MAX,
} from './balance'
import { resolveOffice, staffOf } from './offices'
import { pick, randRange } from './rng'
import { isReady } from './scoring'
import { DISCIPLINES, emptySkills, fail, OK, type ContractOffer, type GameState, type Office, type Result } from './types'
import { teamRate } from './work'

const addReputation = (state: GameState, amount: number) => {
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation + amount))
}

/** What a client pays per point of work: more for a studio with a name. */
export function payPerPoint(state: GameState): number {
  return CONTRACT_PAY_PER_POINT * (1 + CONTRACT_REPUTATION_PAY * state.reputation)
}

/** Points per day the studio's biggest team manages, for sizing jobs; a floor keeps an empty studio's offers sensible. */
function referenceRate(state: GameState): number {
  const rates = state.offices.map((o) => DISCIPLINES.reduce((sum, d) => sum + teamRate(state, o)[d], 0))
  return Math.max(8, ...rates)
}

/** One job, sized for the studio as it is now. */
function makeOffer(state: GameState): ContractOffer {
  const job = pick(state, JOBS)
  const client = pick(state, CLIENTS)
  const days = randRange(state, CONTRACT_MIN_DAYS, CONTRACT_MAX_DAYS)
  const points = referenceRate(state) * days * 0.8
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.round(points * job.split[d])
  const pay = Math.round((points * payPerPoint(state) * randRange(state, 0.85, 1.15)) / 50) * 50
  return { id: state.nextId++, client, title: job.title, target, pay, days: Math.ceil(days * CONTRACT_SLACK + CONTRACT_SLACK_DAYS) }
}

/** Replaces the jobs on offer. */
export function refreshContracts(state: GameState): void {
  state.contracts = Array.from({ length: CONTRACT_OFFERS }, () => makeOffer(state))
}

/** Why `office` can't take this job now, or null when it can. */
export function contractBlocker(state: GameState, office: Office): string | null {
  if (office.project) return 'A project is in progress'
  return staffOf(state, office).length === 0 ? 'Hire someone first' : null
}

/** Takes a job on in an office (the first by default). It pays when every bar is full. */
export function acceptContract(state: GameState, offerId: number, officeId?: number): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const offer = state.contracts.find((c) => c.id === offerId)
  if (!offer) return fail('That job is gone')
  const blocker = contractBlocker(state, office)
  if (blocker) return fail(blocker)

  state.contracts = state.contracts.filter((c) => c.id !== offerId)
  office.project = {
    id: state.nextId++,
    name: `${offer.title[0].toUpperCase()}${offer.title.slice(1)} for ${offer.client}`,
    kind: 'contract',
    parentId: null,
    productTypeId: 'web_app',
    size: 'small',
    featureIds: [],
    target: { ...offer.target },
    progress: emptySkills(),
    startDay: state.day,
    readyNotified: false,
    hype: 1,
    alphaOffered: true,
    bugRisk: 1,
    bugs: 0,
    bugsFixed: 0,
    contract: { client: offer.client, pay: offer.pay, dueDay: state.day + offer.days },
  }
  return OK
}

/** Walks away from an office's job: no pay, and the client tells people. */
export function abandonContract(state: GameState, officeId?: number): Result {
  const office = resolveOffice(state, officeId)
  const project = office?.project
  if (!office || !project?.contract) return fail('No client work in progress')
  office.project = null
  addReputation(state, -CONTRACT_ABANDON_REPUTATION)
  state.events.push({ type: 'notice', text: `You dropped the job for ${project.contract.client}: -${CONTRACT_ABANDON_REPUTATION} reputation.` })
  return OK
}

/** What the job pays if delivered today: full price on time, less after the deadline. */
export function contractPay(state: GameState, terms: { pay: number; dueDay: number }): number {
  return state.day > terms.dueDay ? Math.round(terms.pay * CONTRACT_LATE_PAY) : terms.pay
}

/** After the day's work on a job: warn once when it goes past its deadline, and deliver it when every bar is full. */
export function contractDay(state: GameState, office: Office): void {
  const project = office.project
  const terms = project?.contract
  if (!project || !terms) return
  if (state.day === terms.dueDay + 1 && !isReady(project)) {
    state.events.push({ type: 'notice', text: `${terms.client}'s job is late. They will only pay ${Math.round(CONTRACT_LATE_PAY * 100)}%.` })
  }
  if (!isReady(project)) return

  const pay = contractPay(state, terms)
  state.money += pay
  state.contractsDone += 1
  if (state.day <= terms.dueDay) addReputation(state, CONTRACT_REPUTATION)
  office.project = null
  state.events.push({
    type: 'notice',
    text: `Delivered to ${terms.client}${state.day > terms.dueDay ? ', late' : ''}: +${formatMoney(pay)}.`,
    sound: 'ship',
  })
}
