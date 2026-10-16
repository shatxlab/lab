import { formatMoney as $ } from '@/lib/tycoon/format'
import { getProductType } from './productTypes'
import { DAYS_PER_MONTH, HIRE_MAX_LEVEL, INVESTOR_MONTHS_OF_BURN, OVERSHOOT_CAP, POACH_IMMUNITY_DAYS, PROJECT_SIZES, REPUTATION_MAX } from '@/lib/tycoon/sim/balance'
import { dailyIncome, monthlyBurn, monthlySalaries } from '@/lib/tycoon/sim/economy'
import { levelForSkill, primarySkill } from '@/lib/tycoon/sim/careers'
import { fire, generateEmployee, hireCost, hiringOffice, ROLES, salaryOf } from '@/lib/tycoon/sim/hiring'
import { getOffice } from '@/lib/tycoon/sim/offices'
import { rivalFor } from '@/lib/tycoon/sim/rivals'
import { estimateReach } from '@/lib/tycoon/sim/lifecycle'
import { bugDensity, revenueForUsers } from '@/lib/tycoon/sim/products'
import { projectQuality } from '@/lib/tycoon/sim/project'
import { isReady } from '@/lib/tycoon/sim/scoring'
import { adjustMorale } from '@/lib/tycoon/sim/morale'
import { addModifier } from '@/lib/tycoon/sim/modifiers'
import { pick, rand } from '@/lib/tycoon/sim/rng'
import { DISCIPLINES, type Discipline, type GameState, type Office, type Project } from '@/lib/tycoon/sim/types'

export interface EventChoice {
  label: string
  /** Cost and consequences in a few words, shown under the label. */
  detail?: string
  /** Why this can't be picked right now (e.g. not enough money). */
  disabled?: string
  /** Applies the choice (including any cost) and returns a sentence for the news toast. */
  apply(): string
}

export interface EventContext {
  state: GameState
  /** What `prepare` stored when the event was rolled (e.g. which employee it is about). */
  data: Record<string, number>
}

export interface RandomEvent {
  id: string
  title: string
  /** Relative chance among the events that can happen right now. */
  weight: number
  when(state: GameState): boolean
  /** Picks targets at roll time; the result is saved with the pending event. */
  prepare?(state: GameState): Record<string, number>
  text(ctx: EventContext): string
  /** Called to render and again to resolve, so it must not change anything. */
  choices(ctx: EventContext): EventChoice[]
}

/** Merging patches unread ships this many times the bugs. */
const OSS_QUICK_BUG_RISK = 1.3

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step)
const burnPerDay = (s: GameState) => monthlyBurn(s) / DAYS_PER_MONTH
const newestProduct = (s: GameState) => s.products[s.products.length - 1]
const poachable = (s: GameState) => s.employees.filter((e) => !e.founder && (e.keptDay === undefined || s.day - e.keptDay > POACH_IMMUNITY_DAYS))
const nameOf = (s: GameState, id: number | undefined) => s.employees.find((e) => e.id === id)?.name ?? 'Someone'
const investorAmount = (s: GameState) => roundTo(monthlyBurn(s) * INVESTOR_MONTHS_OF_BURN, 500)
const addReputation = (s: GameState, amount: number) => {
  s.reputation = Math.min(REPUTATION_MAX, Math.max(0, s.reputation + amount))
}

/** Builds a choice that charges `cost` (if any) before running `apply`. */
function choice(
  state: GameState,
  c: { label: string; cost?: number; note?: string; blocked?: string; apply: () => string },
): EventChoice {
  const price = c.cost ?? 0
  const detail = [price > 0 ? `-${$(price)}` : '', c.note ?? ''].filter(Boolean).join(' · ')
  return {
    label: c.label,
    detail: detail || undefined,
    // Free choices are always affordable, even when the studio is in debt.
    disabled: c.blocked ?? (price > 0 && price > state.money ? 'Not enough money' : undefined),
    apply: () => {
      state.money -= price
      return c.apply()
    },
  }
}

type Data = Record<string, number>

/** The office an event is about: the one `prepare` picked, or failing that the first with a project. */
function eventOffice(state: GameState, data: Data): Office | undefined {
  return getOffice(state, data.officeId) ?? state.offices.find((o) => o.project !== null)
}
const eventProject = (state: GameState, data: Data): Project | null => eventOffice(state, data)?.project ?? null
const projectName = (state: GameState, data: Data) => eventProject(state, data)?.name ?? 'the project'

function addProgress(project: Project | null, fraction: number): void {
  if (!project) return
  const cap = project.kind === 'new' || project.kind === 'update' ? OVERSHOOT_CAP : 1
  for (const d of DISCIPLINES) {
    project.progress[d] = Math.min(project.progress[d] + project.target[d] * fraction, project.target[d] * cap)
  }
}

/** Grows a project's targets: more work in those disciplines. */
function addWork(project: Project | null, disciplines: readonly Discipline[], fraction: number): void {
  if (!project) return
  for (const d of disciplines) project.target[d] = Math.round(project.target[d] * (1 + fraction))
}

/** Scales the reach of a project's release. */
function addHype(project: Project | null, mult: number): void {
  if (project) project.hype *= mult
}

/** Scales the bugs a project's release will ship with. */
function addBugRisk(project: Project | null, mult: number): void {
  if (project) project.bugRisk *= mult
}

/** Offices whose project still has work left, bug fixing and client work included. */
const workingOffices = (s: GameState) => s.offices.filter((o) => o.project !== null && !isReady(o.project))
/** Offices building a product or an update, which is when the development events below make sense. */
const buildingOffices = (s: GameState) => workingOffices(s).filter((o) => o.project!.kind === 'new' || o.project!.kind === 'update')
const launchingOffices = (s: GameState) => buildingOffices(s).filter((o) => o.project!.kind === 'new')
const working = (s: GameState) => workingOffices(s).length > 0
const building = (s: GameState) => buildingOffices(s).length > 0
/** Picks one of these offices for the event to be about. */
const about = (s: GameState, offices: Office[]): Data => ({ officeId: offices.length > 0 ? pick(s, offices).id : 0 })

/** The rival studio an event is about: the one `prepare` picked, or one that builds what the event's project is. */
function rivalName(state: GameState, data: Data): string {
  const rival = state.rivals.find((r) => r.id === data.rivalId) ?? rivalFor(state, eventProject(state, data)?.productTypeId ?? 'web_app')
  return rival?.name ?? 'a competitor'
}

/** Moves the morale of the event office's team only. */
function adjustTeamMorale(state: GameState, data: Data, delta: number): void {
  const office = eventOffice(state, data)
  for (const employee of state.employees) if (!office || employee.officeId === office.id) adjustMorale(state, delta, employee.id)
}

/** The live product with the most bugs for its size. */
const buggiest = (s: GameState) => s.products.reduce<GameState['products'][number] | undefined>((a, b) => (!a || bugDensity(b) > bugDensity(a) ? b : a), undefined)

/** What a project's launch would earn per day once its users arrive if finished on target, times how long they stay. */
function finishedLaunchValue(state: GameState, project: Project | null): number {
  if (!project) return 0
  const plan = { ...project, progress: { ...project.target } }
  const reach = estimateReach(state, plan, projectQuality(state, plan))
  return revenueForUsers(project.productTypeId, reach) * PROJECT_SIZES[project.size].life
}

export const RANDOM_EVENTS: readonly RandomEvent[] = [
  {
    id: 'server_outage',
    title: 'Servers down',
    weight: 3,
    // Buggy products fall over; a well-kept catalogue doesn't.
    when: (s) => dailyIncome(s) > 20 && bugDensity(buggiest(s)!) >= 10,
    text: ({ state }) => `${buggiest(state)?.name ?? 'Your product'} went down at peak traffic, and customers are loud about it.`,
    choices: ({ state }) => [
      choice(state, {
        label: 'Pay for an emergency fix',
        cost: Math.max(400, roundTo(dailyIncome(state) * 6, 50)),
        apply: () => 'Fixed within the hour. Customers barely noticed.',
      }),
      choice(state, {
        label: 'Ride it out',
        note: 'income -40% for 10 days, -2 reputation',
        apply: () => {
          addModifier(state, { source: 'outage', stat: 'revenue', mult: 0.6, days: 10 })
          addReputation(state, -2)
          adjustMorale(state, -4)
          return 'Revenue takes a hit for ten days.'
        },
      }),
    ],
  },

  {
    id: 'poach',
    title: 'Job offer',
    weight: 2,
    when: (s) => s.employees.length >= 3 && s.day >= 60 && poachable(s).length > 0,
    prepare: (s) => {
      // Better paid and unhappier people are likelier targets; someone just kept by a counter-offer is left alone.
      const candidates = poachable(s)
      const weight = (e: GameState['employees'][number]) => e.salary * (1.5 - e.morale / 100)
      let roll = rand(s) * candidates.reduce((sum, e) => sum + weight(e), 0)
      const target = candidates.find((e) => (roll -= weight(e)) < 0) ?? candidates[candidates.length - 1]
      return { employeeId: target.id, rivalId: s.rivals.length > 0 ? pick(s, s.rivals).id : 0 }
    },
    text: ({ state, data }) => `${nameOf(state, data.employeeId)} has an offer from ${rivalName(state, data)} and is thinking about leaving.`,
    choices: ({ state, data }) => {
      const employee = state.employees.find((e) => e.id === data.employeeId)
      const name = nameOf(state, data.employeeId)
      return [
        choice(state, {
          label: 'Make a counter-offer',
          cost: roundTo((employee?.salary ?? 0) * 3, 50),
          note: 'a retention bonus',
          apply: () => {
            adjustMorale(state, 8, employee?.id)
            if (employee) employee.keptDay = state.day
            return `${name} decided to stay.`
          },
        }),
        choice(state, {
          label: 'Let them go',
          apply: () => {
            if (employee) fire(state, employee.id)
            adjustMorale(state, -6)
            return `${name} left for ${rivalName(state, data)}.`
          },
        }),
      ]
    },
  },

  {
    id: 'viral',
    title: 'Going viral',
    weight: 2,
    when: (s) => s.products.length > 0 && s.day - newestProduct(s).releaseDay < 90,
    text: ({ state }) => `A post about ${newestProduct(state).name} is going viral.`,
    choices: ({ state }) => [
      choice(state, {
        label: 'Ride the wave',
        note: 'income +35% for 25 days',
        apply: () => {
          addModifier(state, { source: 'viral', stat: 'revenue', mult: 1.35, days: 25 })
          adjustMorale(state, 3)
          return 'Sign-ups are climbing.'
        },
      }),
      choice(state, {
        label: 'Boost it with ads',
        cost: Math.max(300, roundTo(revenueForUsers(newestProduct(state).productTypeId, newestProduct(state).reach) * 6, 50)),
        note: 'income +70% for 25 days',
        apply: () => {
          addModifier(state, { source: 'viral', stat: 'revenue', mult: 1.7, days: 25 })
          adjustMorale(state, 3)
          return 'The ad spend paid off: sign-ups are through the roof.'
        },
      }),
    ],
  },

  {
    id: 'conference',
    title: 'Conference invite',
    weight: 2,
    when: (s) => s.money >= 3000 && s.reputation < REPUTATION_MAX - 5,
    text: () => 'A big developer conference has a speaking slot and a booth available.',
    choices: ({ state }) => [
      choice(state, {
        label: 'Send the team',
        cost: Math.max(1200, roundTo(monthlySalaries(state) * 0.35, 50)),
        note: '+4 reputation',
        apply: () => {
          addReputation(state, 4)
          adjustMorale(state, 6)
          return 'The talk went down well. People know your name now.'
        },
      }),
      choice(state, { label: 'Skip it', apply: () => 'You stayed home and shipped.' }),
    ],
  },

  {
    id: 'freelancer',
    title: 'Senior freelancer',
    weight: 2,
    when: (s) => hiringOffice(s) !== undefined && s.day >= 30,
    prepare: (s) => {
      const freelancer = generateEmployee(s, pick(s, ROLES))
      for (const d of DISCIPLINES) freelancer.skills[d] = Math.min(100, Math.round(freelancer.skills[d] + 12))
      freelancer.level = Math.max(freelancer.level, levelForSkill(primarySkill(freelancer), HIRE_MAX_LEVEL))
      freelancer.salary = salaryOf(freelancer, s.day)
      s.candidates.unshift(freelancer)
      return { employeeId: freelancer.id }
    },
    text: ({ state, data }) => {
      const person = state.candidates.find((c) => c.id === data.employeeId)
      return `${person?.name ?? 'A senior freelancer'} is strong across the board and free this week only, at half the usual signing fee.`
    },
    choices: ({ state, data }) => {
      const person = state.candidates.find((c) => c.id === data.employeeId)
      const office = hiringOffice(state)
      return [
        choice(state, {
          label: 'Hire them',
          cost: person ? Math.round(hireCost(person) / 2) : 0,
          note: person ? `${$(person.salary)}/mo` : undefined,
          blocked: !person ? 'No longer available' : !office ? 'No free desk' : undefined,
          apply: () => {
            if (!person || !office) return ''
            state.candidates = state.candidates.filter((c) => c.id !== person.id)
            person.officeId = office.id
            person.hiredDay = state.day
            person.levelDay = state.day
            state.employees.push(person)
            return `${person.name} joined the team.`
          },
        }),
        choice(state, {
          label: 'Pass',
          apply: () => {
            state.candidates = state.candidates.filter((c) => c.id !== data.employeeId)
            return 'They took another job.'
          },
        }),
      ]
    },
  },

  {
    id: 'investor',
    title: 'Investor offer',
    weight: 3,
    when: (s) => s.day >= 40 && s.money < monthlyBurn(s) * 1.5 && s.investorDeals === 0,
    text: ({ state }) =>
      `An investor offers ${$(investorAmount(state))} now, in exchange for 15% of your revenue for the next year.`,
    choices: ({ state }) => {
      const amount = investorAmount(state)
      return [
        choice(state, {
          label: 'Take the money',
          note: `+${$(amount)}, income -15% for a year`,
          apply: () => {
            state.money += amount
            state.investorDeals += 1
            addModifier(state, { source: 'investor', stat: 'revenue', mult: 0.85, days: 360 })
            return `${$(amount)} in the bank. The investor takes a share of revenue.`
          },
        }),
        choice(state, { label: 'No thanks', apply: () => 'You turned the investor down.' }),
      ]
    },
  },

  {
    id: 'oss_help',
    title: 'Open-source help',
    weight: 2,
    when: working,
    prepare: (s) => about(s, workingOffices(s)),
    text: ({ state, data }) => `Open-source contributors have sent patches for ${projectName(state, data)}.`,
    choices: ({ state, data }) => [
      choice(state, {
        label: 'Merge them quickly',
        note: '+8% progress on every bar, 30% more bugs at release',
        apply: () => {
          addProgress(eventProject(state, data), 0.08)
          const project = eventProject(state, data)
          if (project) project.bugRisk *= OSS_QUICK_BUG_RISK
          return 'The patches landed. Progress jumped, though nobody read them closely.'
        },
      }),
      choice(state, {
        label: 'Review them properly',
        cost: Math.max(300, roundTo(burnPerDay(state) * 2, 50)),
        note: '+16% progress on every bar',
        apply: () => {
          addProgress(eventProject(state, data), 0.16)
          return 'A careful review turned the patches into real progress.'
        },
      }),
    ],
  },

  {
    id: 'scope_creep',
    title: 'Scope creep',
    weight: 2,
    when: building,
    prepare: (s) => about(s, buildingOffices(s)),
    text: ({ state, data }) => `Someone has a great idea for ${projectName(state, data)}, and it isn't in the plan.`,
    choices: ({ state, data }) => [
      choice(state, {
        label: 'Add it',
        note: '+10% work on every bar, +12% users',
        apply: () => {
          addWork(eventProject(state, data), DISCIPLINES, 0.1)
          addHype(eventProject(state, data), 1.12)
          return 'The idea is in. More to build, and more to sell.'
        },
      }),
      choice(state, {
        label: 'Stick to the plan',
        note: 'morale dips a little',
        apply: () => {
          adjustTeamMorale(state, data, -3)
          return 'The idea goes in the backlog. A few people sulk.'
        },
      }),
    ],
  },

  {
    id: 'crunch_offer',
    title: 'Crunch time',
    weight: 1.5,
    when: working,
    prepare: (s) => about(s, workingOffices(s)),
    text: ({ state, data }) =>
      state.offices.length > 1
        ? 'Everyone offers to put in long hours to get things done sooner.'
        : `The team offers to put in long hours to get ${projectName(state, data)} done sooner.`,
    choices: ({ state }) => [
      choice(state, {
        label: 'Crunch for two weeks',
        note: 'work speed +30% for 14 days, morale -8',
        apply: () => {
          addModifier(state, { source: 'crunch', stat: 'workSpeed', mult: 1.3, days: 14 })
          adjustMorale(state, -8)
          return 'The lights stay on late. Progress speeds up; smiles fade.'
        },
      }),
      choice(state, {
        label: 'Keep a sane pace',
        note: 'a small morale boost',
        apply: () => {
          adjustMorale(state, 3)
          return 'Everyone goes home on time, and appreciates it.'
        },
      }),
    ],
  },

  {
    id: 'rival_announcement',
    title: 'Rival announcement',
    weight: 1.5,
    when: (s) => launchingOffices(s).length > 0,
    prepare: (s) => {
      const data = about(s, launchingOffices(s))
      const type = getOffice(s, data.officeId)?.project?.productTypeId ?? 'web_app'
      const builders = s.rivals.filter((r) => r.focus.includes(type))
      return { ...data, rivalId: builders.length > 0 ? pick(s, builders).id : (s.rivals[0]?.id ?? 0) }
    },
    text: ({ state, data }) =>
      `${rivalName(state, data)} just announced a ${getProductType(eventProject(state, data)?.productTypeId ?? 'web_app').name.toLowerCase()} a lot like ${projectName(state, data)}.`,
    choices: ({ state, data }) => [
      choice(state, {
        label: 'Make ours stand out',
        note: '+20% design work',
        apply: () => {
          addWork(eventProject(state, data), ['design'], 0.2)
          return 'Back to the drawing board for a few distinctive touches.'
        },
      }),
      choice(state, {
        label: 'Ignore them',
        note: '-12% users',
        apply: () => {
          addHype(eventProject(state, data), 0.88)
          return 'You carry on as planned. Some customers will wait for theirs.'
        },
      }),
    ],
  },

  {
    id: 'tech_debt',
    title: 'Tech debt',
    weight: 1.5,
    when: building,
    prepare: (s) => about(s, buildingOffices(s)),
    text: ({ state, data }) => `Shortcuts taken early in ${projectName(state, data)} are starting to slow everyone down.`,
    choices: ({ state, data }) => [
      choice(state, {
        label: 'Refactor now',
        note: '+8% engineering work',
        apply: () => {
          addWork(eventProject(state, data), ['engineering'], 0.08)
          return 'A week of cleanup. The code is better for it.'
        },
      }),
      choice(state, {
        label: 'Push through',
        note: 'it ships with 30% more bugs',
        apply: () => {
          addBugRisk(eventProject(state, data), 1.3)
          return 'You push on. The bugs will ship with it.'
        },
      }),
    ],
  },

  {
    id: 'tax_audit',
    title: 'Tax audit',
    weight: 1.5,
    when: (s) => s.money > 15000,
    text: () => 'The tax office wants to take a closer look at your books.',
    choices: ({ state }) => {
      const fine = Math.max(1000, roundTo(state.money * 0.03, 50))
      return [
        choice(state, { label: 'Pay the fine', cost: fine, apply: () => 'Settled. Back to work.' }),
        choice(state, {
          label: 'Contest it',
          note: `50%: nothing. 50%: -${$(fine * 2)}`,
          apply: () => {
            if (rand(state) < 0.5) return 'The audit found nothing.'
            state.money -= fine * 2
            return `You lost the dispute and paid ${$(fine * 2)}.`
          },
        }),
      ]
    },
  },

  {
    id: 'security',
    title: 'Vulnerability report',
    weight: 2,
    when: (s) => s.products.length > 0,
    text: () => 'A security researcher reports a vulnerability in one of your products.',
    choices: ({ state }) => [
      choice(state, {
        label: 'Patch it now',
        cost: Math.max(500, roundTo(burnPerDay(state) * 3, 50)),
        note: '+2 reputation',
        apply: () => {
          addReputation(state, 2)
          return 'Patched, and the researcher praised your response.'
        },
      }),
      choice(state, {
        label: 'Ignore it',
        note: '40% chance it gets exploited',
        apply: () => {
          if (rand(state) >= 0.4) return 'Nothing happened. This time.'
          addReputation(state, -8)
          addModifier(state, { source: 'breach', stat: 'revenue', mult: 0.7, days: 15 })
          return 'It was exploited. Customers are furious: -8 reputation and weaker income for 15 days.'
        },
      }),
    ],
  },

  {
    id: 'hardware',
    title: 'Equipment trouble',
    weight: 1.5,
    // The garage has a couple of laptops, not an office full of them.
    when: (s) => s.employees.length >= 4 && s.offices.some((o) => o.kind === 'office'),
    text: () => 'Half the office laptops are dying, and the air conditioning has given up too.',
    choices: ({ state }) => [
      choice(state, {
        label: 'Buy replacements',
        cost: roundTo(state.employees.length * 350, 50),
        apply: () => {
          adjustMorale(state, 3)
          return 'New gear all round. Everyone is happy.'
        },
      }),
      choice(state, {
        label: 'Make do',
        note: 'work speed -25% for 8 days, morale drops',
        apply: () => {
          addModifier(state, { source: 'hardware', stat: 'workSpeed', mult: 0.75, days: 8 })
          adjustMorale(state, -8)
          return 'The team limps along on old hardware, and grumbles.'
        },
      }),
    ],
  },

  {
    id: 'press',
    title: 'In the press',
    weight: 1.5,
    when: (s) => s.reputation >= 5 && s.products.length > 0,
    text: () => 'A tech blog wrote a glowing piece about your studio.',
    choices: ({ state }) => [
      choice(state, {
        label: 'Nice!',
        note: '+3 reputation, a morale boost',
        apply: () => {
          addReputation(state, 3)
          adjustMorale(state, 5)
          return 'Your inbox is full of congratulations.'
        },
      }),
    ],
  },
]

/**
 * Events offered at a point in a project rather than at random; `rollRandomEvent` decides when.
 * Their weight is unused.
 */
export const CHECKPOINT_EVENTS: readonly RandomEvent[] = [
  {
    id: 'alpha_preview',
    title: 'Alpha build',
    weight: 0,
    when: (s) => s.offices.some((o) => o.project !== null),
    text: ({ state, data }) => `${projectName(state, data)} is halfway done, and the alpha build runs. What do you do with it?`,
    choices: ({ state, data }) => [
      choice(state, {
        label: 'Preview it to the press',
        cost: Math.max(500, roundTo(finishedLaunchValue(state, eventProject(state, data)) * 5, 50)),
        note: '+15% users',
        apply: () => {
          addHype(eventProject(state, data), 1.15)
          return 'The preview got people talking: +15% users at launch.'
        },
      }),
      choice(state, {
        label: 'Run a closed alpha',
        note: '+10% design and QA work, +8% users, 20% fewer bugs',
        apply: () => {
          addWork(eventProject(state, data), ['design', 'qa'], 0.1)
          addHype(eventProject(state, data), 1.08)
          addBugRisk(eventProject(state, data), 0.8)
          return 'Alpha testers sent a pile of ideas and bug reports. More work, but a better launch.'
        },
      }),
      choice(state, { label: 'Keep it under wraps', apply: () => 'Heads down. The alpha stays in-house.' }),
    ],
  },
]

const BY_ID = new Map([...RANDOM_EVENTS, ...CHECKPOINT_EVENTS].map((e) => [e.id, e]))

export function getRandomEvent(id: string): RandomEvent | undefined {
  return BY_ID.get(id)
}
