/** The two markets: where an office sits, where a rival is at home, and where a product's users live. */
export type Region = 'us' | 'eu'
export const REGIONS: readonly Region[] = ['us', 'eu']

export type Discipline = 'design' | 'engineering' | 'qa'
export const DISCIPLINES: readonly Discipline[] = ['design', 'engineering', 'qa']

export type Skills = Record<Discipline, number>

/** The three who build things; analysts and product managers study the market and steer the products instead. */
export type BuilderRole = 'designer' | 'developer' | 'tester'
export type Role = BuilderRole | 'analyst' | 'pm'

/** True for the people who add points to projects. */
export const isBuilder = (employee: { role: Role }): boolean => employee.role !== 'analyst' && employee.role !== 'pm'

export interface Employee {
  id: number
  name: string
  role: Role
  skills: Skills
  /** Monthly salary; paid daily as salary / DAYS_PER_MONTH. */
  salary: number
  /** Id of the person's quirk; see `data/traits.ts`. */
  trait: string
  /** 0-100. Around 75 is a normal day's work; see `moraleSpeed`. */
  morale: number
  /** While training, the person does no project work. */
  training: { discipline: Discipline; finishDay: number } | null
  /** Where they work; 0 for a candidate who hasn't been hired yet. */
  officeId: number
  /** Index into LEVELS: Junior, Mid, Senior, Lead. */
  level: number
  /** The day they reached their level (or were hired at it). */
  levelDay: number
  /** The day they joined; for candidates, the day they were found. */
  hiredDay: number
  /** The day they became ready for their next promotion, or null if they aren't. */
  readySince: number | null
  /** One of the two people who started the studio: they never leave and draw less than market pay. */
  founder?: boolean
  /** The founders' titles once the company is big: you are CEO and your friend CTO (`changeOfGuard`). */
  title?: 'CEO' | 'CTO'
  /** The day a counter-offer last kept them; a rival leaves them alone for a while after. */
  keptDay?: number
  /** The region they were hired in: sets the wages they draw. Absent means the US. */
  region?: Region
  /** Skill at reading users and markets: analysts and product managers have it, and do no project work. */
  analysis?: number
  /** The office whose project they work on, when it is not the one they sit in. Absent means their own. */
  teamId?: number
  /** What they have learned by doing the work: days spent on each product type and on each product. Absent until they have worked. */
  knowledge?: Knowledge
}

/** Days of hands-on work, by product type id and by product id (as a string): what a person brings to the next job. */
export interface Knowledge {
  types: Record<string, number>
  products: Record<string, number>
}

export interface ProductType {
  id: string
  name: string
  /** Reputation needed before this type can be started. */
  unlockReputation: number
  /** Research id that must be finished before this type can be started. */
  requiresResearch?: string
  /** The era (index into ERAS) from which there is a market for it at all; 0 when there always is. */
  era: number
  /** How much each discipline matters for quality; sums to 1. */
  weights: Skills
  /** Points required before any features are added (times WORK_SCALE). */
  baseTarget: Skills
  /** Users a perfect (quality 100) Small product with no features reaches in a normal market. */
  audience: number
  /** What each user pays per month. */
  revenuePerUser: number
  /** What its users are called: players, subscribers... */
  userNoun: string
}

export interface Feature {
  id: string
  name: string
  /** Extra points required to build this feature. */
  cost: Skills
  /** Research id that must be finished before this feature can be chosen. */
  requiresResearch?: string
  /** Revenue weight; also weights this feature's fit in the quality score. */
  value: number
  /** Product type ids this feature belongs in. Others get a fit penalty. */
  suits: string[]
}

/** Who a product is for. Picked when it is started; what they value is hidden until feedback shows it. */
export interface Audience {
  id: string
  productTypeId: string
  name: string
  /** A hint about what they care about, without naming features. */
  blurb: string
  /** Multiplies the users the type can reach: wide audiences are big... */
  reach: number
  /** ...and multiplies what each pays: ...and niche ones pay more. */
  pay: number
  /** How much this audience values a feature, by feature id; unlisted features count 1. */
  likes: Record<string, number>
}

/** How big a product (or an update to it) is; see PROJECT_SIZES in balance.ts. */
export type ProjectSize = 'small' | 'medium' | 'large' | 'flagship'
export const PROJECT_SIZE_IDS: readonly ProjectSize[] = ['small', 'medium', 'large', 'flagship']

/** Campaign and promotion sizes. */
export type Tier = 'small' | 'medium' | 'large'
export const TIERS: readonly Tier[] = ['small', 'medium', 'large']

export interface Project {
  id: number
  name: string
  /** A new product, an update to the live product `parentId`, or work for a client. */
  kind: 'new' | 'update' | 'contract'
  parentId: number | null
  productTypeId: string
  /** Who it is for (an update has its product's); absent means the type's first audience. */
  audienceId?: string
  /** An update is always the size of the product it updates. */
  size: ProjectSize
  featureIds: string[]
  target: Skills
  progress: Skills
  startDay: number
  /** True once the `projectReady` event has fired, so it fires only once. */
  readyNotified: boolean
  /** Reach multiplier from choices made during development; 1 when nothing happened. */
  hype: number
  /** True once the halfway alpha checkpoint has been offered, so it comes up once per project. */
  alphaOffered: boolean
  /** Multiplier on the bugs a release ships with, from choices made during development; 1 when nothing happened. */
  bugRisk: number
  /** Growing a product: the bigger size it becomes when this update ships. */
  grows?: ProjectSize
  /** Localising a product: opens the European market when this update ships. */
  localises?: boolean
  /** A roadmap item (`data/workstreams.ts`) this release builds; it counts as built for the product when it ships. */
  itemId?: string
  /** A pivot: the product is for this audience once the release ships. */
  pivotsTo?: string
  /** A polishing release: it fixes most of the open bugs and ships fewer new ones. */
  polishes?: boolean
  /** A release the product's own team started (`sim/teams.ts`): it ships by itself when every bar is full. */
  byTeam?: boolean
  /** Client work: who it is for, what it pays on delivery, and when it is due. Null for everything else. */
  contract: ContractTerms | null
}

export interface ContractTerms {
  client: string
  pay: number
  dueDay: number
  /** What the client advanced when the job was taken; it comes off the final payment. Absent in older saves. */
  deposit?: number
  /** An enterprise contract: the live product the client wants customised. Delivering it counts as a release of that product. */
  productId?: number
}

/** A job a client is offering: build this for that much, in about that long. */
export interface ContractOffer {
  id: number
  client: string
  /** What they want, e.g. "a booking site". */
  title: string
  target: Skills
  pay: number
  /** Days from accepting to the deadline. */
  days: number
  /** The last day it is on the board; absent in older saves, where it does not run out. */
  expiresDay?: number
  /** An enterprise contract: the live product the client wants customised. */
  productId?: number
}

export interface ProductUpdate {
  day: number
}

export interface Product {
  id: number
  name: string
  productTypeId: string
  /** Who it is for; absent means the type's first audience. */
  audienceId?: string
  /** Sets how long users stay interested, how many bugs it can carry, and the size of its updates. */
  size: ProjectSize
  /** Every feature shipped so far, including through updates. */
  featureIds: string[]
  quality: number
  releaseDay: number
  /** Users it would have while fresh and bug-free. Set at launch, raised by updates. */
  reach: number
  /** Users right now; they drift toward the reach that interest, bugs and promotions allow. */
  users: number
  /** The share of its reach that is in Europe, 0 until it is localised. Its users there are `euUsers`, part of `users`. */
  euShare?: number
  euUsers?: number
  /** Open bugs. Fractional while users are still finding the next one. */
  bugs: number
  /** Bugs an update shipped that users have not found yet; they come to light over the next weeks. */
  pendingBugs: number
  /** True once it has taken off (see `sim/fit.ts`): it reaches far more people than it otherwise would. */
  hit: boolean
  /** Its product–market fit as of its last release, 0..100; absent in older saves, where it is worked out when needed. */
  fit?: number
  /** The fit its last release earned: what a hit's fit sags from and recovers towards (`sim/fit.ts`). Absent means `fit`. */
  peakFit?: number
  /** True once it has pivoted to another audience: a product does that once. */
  pivoted?: boolean
  /** A hit's pull on the world, a multiplier on its reach that grows while it is healthy and its servers have room (`sim/scale.ts`). Absent means 1. */
  world?: number
  /** The roadmap: ranked ids of the workstream items still to build (`data/workstreams.ts`); the floors take from the top. */
  roadmap?: string[]
  /** The workstream items built so far; their effects stack (`itemEffects`). */
  built?: string[]
  /** A side product (kept from the garage at move-out) earns what it earns; a Reach or Keep companion makes the hit bigger. Each takes one of the second-product slots. */
  role?: 'side' | 'reach' | 'keep'
  /** Which companion this is (`data/companions.ts`), for a product launched as one. */
  companionId?: string
  totalRevenue: number
  updates: ProductUpdate[]
  /** A promotion (or launch campaign) runs while `day < boostUntil`, bringing in `boostUsers` new users a day. */
  boostUntil: number
  boostUsers: number
  /** Features queued for the next release by the team that looks after it. Absent when none are. */
  nextFeatures?: string[]
  /** Users earlier promotions won over for good, slowly drifting away; part of what the product heads toward. Absent in older saves. */
  loyalUsers?: number
  /** Once Marketing automation is researched: promote this product by itself at this tier whenever the bank allows. */
  autoPromote?: Tier | null
  /** A Flagship licensed to other companies (needs the Licensing programme): it pays a fee on top, for as long as it is kept in shape. */
  licensed?: boolean
}

/** A bug-fixing job: a developer and a tester, from any office, working through a product's bugs together. */
export interface Fix {
  id: number
  productId: number
  developerId: number
  testerId: number
  /** Points the job needs: engineering from the developer, QA from the tester. */
  target: Skills
  progress: Skills
  /** How many bugs the job set out to fix, and how many are fixed so far. */
  bugs: number
  bugsFixed: number
  startDay: number
  /** True when Incident management started it on its own. */
  auto: boolean
}

/** The standing pair that Incident management sends to the buggiest product on its own. */
export interface OnCall {
  developerId: number
  testerId: number
}

/** A product that left the portfolio: switched off, or sold to a rival. */
export interface RetiredProduct {
  id: number
  name: string
  productTypeId: string
  size: ProjectSize
  hit: boolean
  releaseDay: number
  endDay: number
  /** Users it had when it left. */
  users: number
  totalRevenue: number
  outcome: 'retired' | 'sold'
  /** What a sale paid; 0 for a plain retirement. */
  price: number
  /** The rival that bought it, or null for a retirement (or a sale with no rival left to buy it). */
  buyer: string | null
}

/** One monthly sample for the stats charts. Money is the balance; income and burn are per day. */
export interface HistoryPoint {
  day: number
  money: number
  income: number
  burn: number
}

export interface DayWork {
  employeeId: number
  /** Points actually added to the project this day. */
  points: Skills
  /** True when the work went into a bug-fixing sprint. */
  fixing: boolean
}

/** Things a modifier or a research effect can scale. */
export const STATS = [
  'workSpeed',
  'designSpeed',
  'engineeringSpeed',
  'qaSpeed',
  'revenue',
  'quality',
  'wage',
  'candidateSkill',
  'skillGain',
] as const
export type Stat = (typeof STATS)[number]

/** A temporary multiplier, e.g. "revenue x0.6 for 10 days". Active while `day < expiresDay`. */
export interface Modifier {
  id: number
  /** Who added it, so the same source can be detected (e.g. an active investor deal). */
  source: string
  stat: Stat
  mult: number
  expiresDay: number
}

export interface ResearchState {
  /** Finished research ids. */
  done: string[]
  /** What is being researched now; one thing at a time. */
  /** `target` is what a repeatable study is about (an audience id). */
  active: { id: string; finishDay: number; target?: string } | null
}

/** A random event waiting for the player's choice. `data` is whatever the event picked at roll time. */
export interface PendingEvent {
  id: string
  data: Record<string, number>
}

/** Sounds the simulation may ask for; the UI maps them onto its own. */
export type NoticeSound = 'milestone' | 'research' | 'ship' | 'deal'

export type SimEvent =
  | { type: 'projectReady'; officeId: number }
  /** `reach` is the users the product can now reach; `bugs` how many this release shipped with. */
  | { type: 'shipped'; productId: number; update: boolean; reach: number; bugs: number; quality: number }
  | { type: 'bankrupt' }
  /** A launch broke out: it reaches far more people than planned. */
  | { type: 'breakout'; productId: number }
  /** The studio reached a new stage of its journey (an index into STAGES). */
  | { type: 'stage'; stage: number }
  /** A new era began (an index into ERAS). */
  | { type: 'era'; era: number }
  | { type: 'randomEvent' }
  /** A bigger company offered to buy the studio (see `GameState.exit`). */
  | { type: 'offer' }
  /** Passive news for a toast; `sound` asks the UI to play a jingle with it. */
  | { type: 'notice'; text: string; sound?: NoticeSound }

/** A garage at first; a real office after the move. More offices can open later. */
/** Where the studio works: a café table at first, then the garage, then rented floors. */
export type OfficeKind = 'cafe' | 'garage' | 'office'

/** One place of work: its own team (the employees with its id) and its own project. */
export interface Office {
  id: number
  kind: OfficeKind
  /** Colour scheme of the room, so offices tell apart at a glance. */
  theme: number
  /** Where it is: the café, the garage and the first office are in the US. Absent in older saves, which are all US. */
  region?: Region
  project: Project | null
  /** The product this floor's team looks after, releasing it as its `workstream` says (`sim/teams.ts`). */
  productId?: number
  workstream?: Workstream
  /** The day the team ran out of work, to give the player a few days before the next release starts by itself. */
  idleSince?: number
}

/**
 * What a floor works on for the product it looks after: its queued features, quality (bugs and speed), scale
 * (the users the servers hold), growth, monetisation, or Europe; or on the studio's internal tools, or the companion
 * products that make the hit bigger. Items for all but features come from the product's roadmap.
 */
export type Workstream = 'features' | 'quality' | 'scale' | 'growth' | 'monetisation' | 'europe' | 'tools' | 'companions'
export const WORKSTREAMS: readonly Workstream[] = ['features', 'quality', 'scale', 'growth', 'monetisation', 'europe', 'tools', 'companions']

/** A competing studio. Its products live in `GameState.rivalProducts`. */
export interface Rival {
  id: number
  name: string
  /** The quality it ships at, roughly; it creeps up over the years. */
  skill: number
  reputation: number
  /** Product types it likes to build. */
  focus: string[]
  /** Where it is at home: its products compete there in full and abroad only a little. Absent means the US. */
  region?: Region
  /** The biggest projects it takes on now; it grows into bigger ones as its name does. */
  size: ProjectSize
  nextLaunchDay: number
  /** Income per day from business outside the shared markets; it grows every month. */
  business: number
  /** Yearly growth of that business, up to its cap. */
  growth: number
  businessCap: number
}

/** A rival's product: the same user model as yours, kept simpler (no bugs, no promotions). */
export interface RivalProduct {
  id: number
  rivalId: number
  name: string
  productTypeId: string
  size: ProjectSize
  quality: number
  releaseDay: number
  /** Its last update; rivals keep their best products fresh, the rest fade. */
  updatedDay: number
  reach: number
  users: number
  hit: boolean
}

export interface GameState {
  version: number
  /** Seeded RNG state (mulberry32); mutated by `rand`. */
  rng: number
  /** Days elapsed since the start; day 0 is the first day. */
  day: number
  money: number
  reputation: number
  nextId: number
  employees: Employee[]
  /** Never empty: the studio starts with its garage. */
  offices: Office[]
  /** How far along its journey the studio is: an index into STAGES. */
  stage: number
  products: Product[]
  /** Hire pool, regenerated every CANDIDATE_REFRESH_DAYS. */
  candidates: Employee[]
  /** Client work on offer: new jobs turn up every few days and old ones expire. */
  contracts: ContractOffer[]
  /** The day the next job may join the board; absent in older saves. */
  nextOfferDay?: number
  /** The day the next enterprise contract may be offered; absent until Enterprise sales is researched. */
  nextEnterpriseDay?: number
  /** Contracts delivered, ever. */
  contractsDone: number
  rivals: Rival[]
  rivalProducts: RivalProduct[]
  /** Days counted at the top of the industry ranking as a leader; a day below costs a few of them. */
  daysAtTop: number
  /** Studios the company has absorbed: they do not move into the market again when their year comes. Absent means none. */
  absorbedNames?: string[]
  /** Days in a row the company has made a profit; goes public with the Global stage (`sim/exit.ts`). Absent means 0. */
  profitDays?: number
  /** The day each product type's demand last made the news; absent in older saves. */
  marketNews?: Record<string, number>
  /** Every product name ever given out, yours and the rivals', lower case, so none comes back; absent in older saves. */
  usedNames?: string[]
  /** Income per day, averaged over the last couple of months (`trailingIncome`); absent in older saves. */
  incomeAverage?: number
  /** Income per day from the businesses of rivals you bought, beyond their products. */
  acquiredIncome: number
  lifetimeRevenue: number
  shippedCount: number
  /** Bug-fixing jobs in progress, each with its two people. */
  fixes: Fix[]
  /** The Incident management pair, once that research is done and the player has picked them. */
  onCall: OnCall | null
  /** Products that were retired or sold, oldest first. */
  retired: RetiredProduct[]
  /** Insight analysts have gathered and not spent yet; see `sim/insight.ts`. */
  insight: number
  /** Audiences the studio has studied: what they like is shown in full. */
  surveyed: string[]
  /** Bugs fixed by fixing jobs, ever. */
  bugsFixed: number
  /** The studio's first hit, which it becomes known for; null until it has one. */
  signatureId: number | null
  /** What the studio is called, chosen at the start; absent in older saves. */
  studioName?: string
  /** Consecutive days with negative money. */
  debtDays: number
  /** Demand multiplier per product type id, around 1.0; applied when a product ships. */
  market: Record<string, number>
  modifiers: Modifier[]
  pendingEvent: PendingEvent | null
  research: ResearchState
  /** Day the last random event was offered or resolved, for the cooldown. */
  lastEventDay: number
  /** Ids of the latest random events, newest last, so the same one does not come round again at once. Absent in older saves. */
  recentEvents?: string[]
  /** Investor deals taken so far. The investor is a one-time last chance, not a recurring bailout. */
  investorDeals: number
  /** Day of the last team outing, for its cooldown. */
  lastOutingDay: number
  /** Ids of the milestones reached so far. */
  milestones: string[]
  /** Monthly samples for the stats charts, oldest first, capped. */
  history: HistoryPoint[]
  /** The day the last new product was started (client work doesn't count), for the pace limit. */
  lastNewProductDay: number
  gameOver: boolean
  /** How the run ended, once `gameOver`; null while it goes on. */
  ending: Ending | null
  /** Offers to buy the studio: only made in the garage, and gone for good once the studio moves out. */
  exit: ExitState
  /** Everything the player decided and everything that happened, oldest first: exported to review a run. */
  journal: JournalEntry[]
  /** Contributions from the most recent day, for the renderer's popups. */
  dayWork: DayWork[]
  /** Pending events for the UI; drained with `drainEvents`. */
  events: SimEvent[]
}

export interface Ending {
  kind: 'bankrupt' | 'sold' | 'retired' | 'ipo'
  day: number
  /** What a sale paid. */
  price?: number
  bidder?: string
  /** What the studio was worth at the end: cash plus what a buyer would pay for what it earns. */
  worth: number
}

export interface ExitState {
  /** Offers turned down so far; each makes the next one better. */
  declined: number
  /** No offer before this day. */
  nextDay: number
  /** The offer waiting for an answer, if any. */
  pending: { price: number; bidder: string } | null
  /** The day of the first offer; buyers lose interest `EXIT_WINDOW_DAYS` after it. Null before any offer. */
  firstDay: number | null
  /** True once buyers have lost interest for good. */
  closed: boolean
}

/** One line of the run's log: a decision the player made, or something that happened to the studio. */
export interface JournalEntry {
  day: number
  /** Dotted category, e.g. `project.start`, `hire`, `month`. */
  kind: string
  text: string
  /** Money in the bank at the time, so a decision can be read against what the player could afford. */
  cash: number
  data?: Record<string, string | number | boolean | string[]>
}

export type Result = { ok: true } | { ok: false; reason: string }

export const OK: Result = { ok: true }

export function fail(reason: string): Result {
  return { ok: false, reason }
}

export function emptySkills(): Skills {
  return { design: 0, engineering: 0, qa: 0 }
}
