// All tunable numbers live here so the balance pass touches one file.

import type { Skills } from './types'

export const DAYS_PER_MONTH = 30

// Work
export const POINTS_PER_SKILL = 0.1
/** Every project needs this many times the points listed on its product type and features: shipping takes a while. */
export const WORK_SCALE = 2.5
/** Daily output varies by ±this fraction. */
export const WORK_VARIANCE = 0.2
/** Skill gained per project point, scaled down as skill approaches 100. */
export const SKILL_GAIN = 0.004
/** A discipline can overshoot its target up to this multiple (extra polish). */
export const OVERSHOOT_CAP = 1.5

// Projects
export const MAX_FEATURES = 5
/**
 * Starting a new product (or growing one into a bigger size) costs cash on top of the wages: licences, servers,
 * assets, freelancers. It is this much per point of work, so a small product with a few features costs more than
 * the garage starts with and client work is how the studio pays for its first real product. Updates are free.
 */
export const BUDGET_PER_POINT = 15
/** A budget may not leave the bank with less than this many days of what the studio burns, so a project never starts the countdown to bankruptcy. */
export const BUDGET_RESERVE_DAYS = 30

export interface SizeSpec {
  name: string
  /** Multiplier on all the work: the product type's base and every feature. Also on the bugs it can carry. */
  work: number
  /** Multiplier on how many users it can reach... */
  reach: number
  /** ...and on how long they stay interested between updates. Together they make bigger pay about the same per day of work. */
  life: number
  /** Multiplier on the reputation a release gains (or loses). */
  reputation: number
  /** Too big for the garage: needs a real office... */
  office: boolean
  /** ...and a studio at least this far along its journey (an index into STAGES). */
  stage: number
}

/**
 * Bigger projects take longer, reach more users and keep them longer, so a studio that grows into them
 * ships fewer, longer projects instead of a stream of small ones, for about the same income per day of work.
 */
export const PROJECT_SIZES: Record<'small' | 'medium' | 'large' | 'flagship', SizeSpec> = {
  small: { name: 'Small', work: 1, reach: 1, life: 1, reputation: 1, office: false, stage: 0 },
  medium: { name: 'Medium', work: 2, reach: 1.7, life: 1.25, reputation: 1.8, office: false, stage: 0 },
  large: { name: 'Large', work: 4, reach: 2.8, life: 1.6, reputation: 3.4, office: true, stage: 0 },
  flagship: { name: 'Flagship', work: 8, reach: 4.8, life: 2, reputation: 6.4, office: true, stage: 3 },
}

/** The halfway checkpoint of a Medium or bigger project comes up once overall progress passes this share. */
export const ALPHA_PROGRESS = 0.5

// Quality
export const COVERAGE_EXPONENT = 1.5
export const QUALITY_BASE = 80
export const QUALITY_POLISH = 20
/** Fit multiplier floor: a product made entirely of off-type features. */
export const FIT_FLOOR = 0.6
export const OFF_TYPE_FEATURE_FIT = 0.5

// Users: every product has users who pay monthly. They drift toward its reach; see `products.ts`.
/** Reach multiplier per point of (feature value × fit). */
export const FEATURE_REACH_BONUS = 0.1
/** Per-product luck on top of the market, as +/- this fraction. */
export const DEMAND_NOISE = 0.05
/** Reach multiplier per point of reputation. */
export const REPUTATION_REACH_BONUS = 0.002
/** Early adopters: this share of its reach signs up on launch day. */
export const LAUNCH_ADOPTERS = 0.05
/** Below its target, a product finds this share of the target in new users each day on its own (search, stores, ads)... */
export const USER_DISCOVERY = 0.005
/** ...and each user brings along this many more per day by word of mouth, both slowing as the target fills up. */
export const USER_WORD_OF_MOUTH = 0.04
/** Above its target, this share of the surplus leaves each day. */
export const USER_DECLINE = 0.02
/** A release or update keeps users interested this many days (times the size's life)... */
export const FRESH_DAYS = 120
/** ...after which the reach fades with this time constant (times the size's life) until the next update. */
export const STALE_DAYS = 180
/** Every update a product has had makes it fade this much slower (an established product holds its people)... */
export const MATURITY_PER_UPDATE = 0.25
/** ...counting at most this many updates. */
export const MATURITY_MAX_UPDATES = 4
/** A maintenance release (an update with no new features) needs this share of an update's base work. */
export const MAINTENANCE_TARGET_SHARE = 0.6
/** A promotion wears the audience out: right after one ends the next brings only this share of its users... */
export const PROMO_MIN_EFFECT = 0.25
/** ...recovering to its full effect over this many days. */
export const PROMO_RECOVERY_DAYS = 180
/**
 * A promotion speaks to the product's reach, but never to more than this many times the users its market holds
 * for it now: past what a crowded or saturated market can take, more advertising finds nobody new.
 */
export const PROMO_AUDIENCE = 3
/** What a promotion's estimated return keeps after what the estimate leaves out: the bugs the extra users find, and a market that moves on. */
export const PROMO_FRICTION = 0.75
/** Of the users a promotion brings, this share stays on as regulars (`Product.loyalUsers`)... */
export const PROMO_KEEP = 0.1
/** ...who drift away again over about this many days, faster when the product goes stale. */
export const PROMO_LOYAL_DAYS = 360
/** Automatic promotion waits until the next one would bring at least this share of its users: below it, it would not pay. */
export const AUTO_PROMOTE_MIN_EFFECT = 0.8
/** Automatic promotion never spends the bank below this many days of what the studio burns. */
export const AUTO_PROMOTE_RESERVE_DAYS = 60

// Competition
/**
 * How much room a market has: the products of one type (yours and the rivals') crowd each other once
 * their reach adds up to about this many times the type's audience.
 */
export const MARKET_ROOM = 6
/** No product holds more than about this many times its type's audience, however big its reach: the market runs out of people. */
export const MARKET_CAP = 5
/** Each feature users expect in this era but a product lacks costs it this share of its reach... */
export const EXPECTED_FEATURE_PENALTY = 0.15
/** ...down to this much at worst. */
export const EXPECTED_FEATURE_FLOOR = 0.55

// Rivals
/** Days between a rival's launches, for a Small project; bigger ones take longer. */
export const RIVAL_LAUNCH_MIN_DAYS = 70
export const RIVAL_LAUNCH_MAX_DAYS = 160
/** How far a rival's launches stray from its skill, either way. */
export const RIVAL_QUALITY_SPREAD = 10
/** The reach rivals get from their features, like a launch with a couple of good ones. */
export const RIVAL_FEATURE_REACH = 1.4
/** Skill a rival gains a year, up to the cap. */
export const RIVAL_SKILL_GROWTH = 2
export const RIVAL_SKILL_MAX = 92
/** Chance a good rival launch breaks out. */
export const RIVAL_HIT_CHANCE = 0.06
/** A rival keeps a product fresh while it still has this share of its reach in users. */
export const RIVAL_KEEP_SHARE = 0.2
/** Rivals grow with the industry: each year they launch this much more often... */
export const RIVAL_PACE_GROWTH = 0.15
/** ...and each era their products reach this much further, with the features of the day. */
export const RIVAL_ERA_REACH = 0.12
/** A rival's business outside the markets stops growing at this many times where it started. */
export const RIVAL_BUSINESS_CAP = 30

/** Buying a rival studio costs this many days of what its products earn, and never less than the floor. */
export const ACQUISITION_DAYS = 600
export const ACQUISITION_FLOOR = 250000
export const ACQUISITION_REPUTATION = 3
/** Journey stage (index into STAGES) from which rivals can be absorbed: an established company, the same as for more offices. */
export const ACQUISITION_STAGE = 4
/** Journey stage from which days at the top of the ranking count: an industry leader. */
export const LEADER_STAGE = 5
/** A day off the top costs this many of the days counted there, instead of starting the count again. */
export const TOP_SLIP_DAYS = 3
/**
 * The ranking, the income goals and what the studio is worth go by income averaged over about this many days,
 * so a promotion's few weeks of extra users do not swing them.
 */
export const INCOME_AVERAGE_DAYS = 60
/** An absorbed rival brings this many people, plus one for every this much reputation, up to the cap; each knows its kind of product and its products. */
/** The share of the users of a rival's competing products that move to the hit when it is absorbed. */
/** Going public needs the hit at this many users, this much earned over the company's life, and this many days in profit in a row. */
export const IPO_USERS = 10_000_000
export const IPO_REVENUE = 1_000_000_000
export const IPO_PROFIT_DAYS = 360
/** Years of income the market pays for a public company (a buyer pays `EXIT_BASE_MULTIPLE`). */
export const IPO_MULTIPLE = 9
export const ABSORB_USERS_SHARE = 0.5
export const ABSORB_STAFF_BASE = 5
export const ABSORB_STAFF_PER_REPUTATION = 25
export const ABSORB_STAFF_MAX = 8
export const ABSORB_TYPE_DAYS = 360
export const ABSORB_PRODUCT_DAYS = 240
/** Their skill is the rival's, give or take this much. */
export const ABSORB_SKILL_SPREAD = 8

/** Reputation a rival needs before taking on each size. */
export const RIVAL_SIZE_REPUTATION: Record<'small' | 'medium' | 'large' | 'flagship', number> = { small: 0, medium: 35, large: 55, flagship: 80 }

// Regions: the US and Europe are separate markets with room of their own
/** A rival's products weigh this much in the market abroad (in its home market they weigh in full). */
export const RIVAL_ABROAD = 0.35
/** Wages in Europe next to the US, and what the first floor in Europe costs (floors after that cost as in the US). */
export const EU_WAGE = 0.88
export const EU_OFFICE_COST = 450000
/**
 * The studio has one building in each region, headquarters in the US and one in Europe, of at most this many
 * floors. Each floor is an office of its own (a team, its desks and its project), so the sim calls them offices.
 */
export const REGION_OFFICE_LIMIT = 5

// Teams and their floors (`sim/teams.ts`)
/** A team out of work gets this many days before its next release starts by itself, so the player can give it something else. */
export const TEAM_IDLE_DAYS = 5
/** Keeping a product running: the next maintenance release starts once this share of its fresh time has passed. */
export const KEEP_FRESH_SHARE = 0.8
/** A polishing release fixes this share of the product's open bugs, and ships this share of the new ones a release would. */
export const POLISH_FIX_SHARE = 0.7
export const POLISH_BUG_RISK = 0.5

// Bugs
/** Bugs a release ships with per point of work when QA has just reached its target. */
export const BUGS_PER_POINT = 0.02
/** With no QA at all a release ships this many times as many bugs... */
export const BUG_LEAK_NO_QA = 2.5
/** ...and polishing QA can cut them down to this share, but never to zero. */
export const BUG_LEAK_FLOOR = 0.25
/** Bugs users find per day in a Small product at its nominal audience; scales with size and sqrt(usage). */
export const BUG_DISCOVERY = 0.12
/** Bugs (per unit of the size's work) at which a product keeps only half the users it could have. */
export const BUG_TOLERANCE = 50
/** Bugs (per unit of work) at which users start complaining in public, which costs reputation. */
export const BUG_COMPLAINTS = 30
export const BUG_COMPLAINT_REPUTATION = 2
/** Points a bug-fixing sprint needs per bug, shared between the disciplines like this. */
export const POINTS_PER_BUG = 6
/** A fixing job is done by a developer (engineering) and a tester (QA) only. */
export const FIX_SPLIT: Skills = { design: 0, engineering: 0.6, qa: 0.4 }
/** Bugs an update ships come to light over time: this share of the hidden ones each day. */
export const BUG_SURFACE_RATE = 1 / 20
/** Bug-proneness is (100 - quality) / this, so 1 at quality 60, within these limits. */
export const BUG_PRONE_SPREAD = 40
export const BUG_PRONE_MIN = 0.25
export const BUG_PRONE_MAX = 1.5
// Market: demand per product type drifts around 1.0 and is applied when a product ships.
export const MARKET_MIN = 0.6
export const MARKET_MAX = 1.5
/** Share of the gap to 1.0 closed each month. */
export const MARKET_PULL = 0.25
export const MARKET_NOISE = 0.1
export const MARKET_SHOCK_CHANCE = 0.06
export const MARKET_SHOCK = 0.3
export const MARKET_HOT = 1.2
export const MARKET_COLD = 0.85
/** A product type's demand makes the news at most once in this many days. */
export const MARKET_NEWS_GAP_DAYS = 360

// Random events
// Events are an interruption, so there are few: after the warm-up and the cooldown, one turns up about every 80 days.
export const EVENT_MIN_DAY = 60
export const EVENT_COOLDOWN_DAYS = 45
export const EVENT_CHANCE_PER_DAY = 0.03
/** An event is not offered again until this many others have come up. */
export const EVENT_REPEAT_GAP = 4
/** The (one-time) investor lifeline appears this many days into a debt spell. */
export const INVESTOR_LIFELINE_DEBT_DAYS = 3
/** The investor wires this many months of the studio's running costs. */
export const INVESTOR_MONTHS_OF_BURN = 3

// Product lifecycle
/** A product can be updated again this many days after its last release or update. */
export const UPDATE_MIN_AGE_DAYS = 14
/** An update needs this share of the product type's base points, plus its features. */
export const UPDATE_TARGET_SHARE = 0.35
export const UPDATE_MAX_FEATURES = 2
/** Reputation from an update, as a share of a launch's. */
export const UPDATE_REPUTATION_SHARE = 0.5

export interface MarketingOffer {
  /** Cost in days of what the product earns at its full reach, with a floor. */
  costDays: number
  costFloor: number
  /** New users it brings in, as a share of the product's reach... */
  users: number
  /** ...spread over this many days. Those above what the product would have anyway drift away again after. */
  days: number
}

/** Paid promotion of a live product. About 1.5x its cost back at full effect (`promotionReturn`), less soon after the last one. */
export const PROMOTIONS: Record<'small' | 'medium' | 'large', MarketingOffer> = {
  small: { costDays: 3.3, costFloor: 300, users: 0.08, days: 20 },
  medium: { costDays: 7.5, costFloor: 700, users: 0.18, days: 30 },
  large: { costDays: 14.5, costFloor: 1500, users: 0.35, days: 40 },
}

/** The same at launch, where the new users also get word of mouth going sooner. */
export const CAMPAIGNS: Record<'small' | 'medium' | 'large', MarketingOffer> = {
  small: { costDays: 4, costFloor: 300, users: 0.08, days: 20 },
  medium: { costDays: 8.5, costFloor: 700, users: 0.18, days: 30 },
  large: { costDays: 16, costFloor: 1500, users: 0.35, days: 40 },
}

// Reputation
export const REPUTATION_MAX = 100
/** Shipping at this quality leaves reputation unchanged. */
export const REPUTATION_NEUTRAL_QUALITY = 50
export const REPUTATION_DIVISOR = 15

// Portfolio: once out of the garage a studio keeps a few products, not a pile
/** Live products plus new ones in the making; to start another, retire one. */
export const PORTFOLIO_LIMIT = 5
/** Days between starting two new products, once the studio has a few (updates and growing a product are not limited). */
export const NEW_PRODUCT_GAP_DAYS = 360
/** Below this many live products the studio may start new ones freely. */
export const NEW_PRODUCT_FREE_COUNT = 3
/** A product has to be this old, and not new or fading, before it can grow into the next size. */
export const GROW_MIN_AGE_DAYS = 240
export const GROW_MAX_FEATURES = 3

// Selling the studio: only possible from the garage
/** The studio has to earn at least this much a day before anyone makes an offer. */
export const EXIT_MIN_INCOME = 400
/** Buyers wait this long after the garage's first hit, to see that it lasts, before the first offer. */
export const EXIT_FIRST_OFFER_DAYS = 120
/** Days before the next offer once one is turned down. */
export const EXIT_GAP_DAYS = 90
/** An offer is this many years of the studio's income, plus... */
export const EXIT_BASE_MULTIPLE = 2
/** ...this much more for every offer turned down, up to... */
export const EXIT_RAISE_PER_DECLINE = 0.2
/** ...this many times. */
export const EXIT_MAX_RAISES = 6
/** Buyers lose interest this many days after the first offer: the garage has an end date. */
export const EXIT_WINDOW_DAYS = 540

// Hiring
export const CANDIDATE_REFRESH_DAYS = 30
export const CANDIDATE_COUNT = 4
export const PRIMARY_SKILL_MIN = 25
export const PRIMARY_SKILL_RANGE = 35
export const SECONDARY_SKILL_MIN = 5
export const SECONDARY_SKILL_RANGE = 20
/** Reputation (capped at 50) lifts candidates' primary skill by this factor. */
export const REPUTATION_SKILL_BONUS = 0.3
export const SALARY_BASE = 600
export const SALARY_PER_SKILL_POINT = 18
/** Wages rise this share with every era, as the industry grows and fights over people. */
export const ERA_WAGE_GROWTH = 0.12
/** The first eras raise wages that much each; later eras only this much (the industry has matured), so a twenty-year run is not priced out. */
export const ERA_WAGE_FULL_ERAS = 4
export const ERA_WAGE_LATE_GROWTH = 0.04

// Knowledge: people get better at the products and kinds of product they have worked on
/** Days of knowledge a working day adds, to the product's type and to the product itself. */
export const KNOWLEDGE_PER_DAY = 1
/** The most speed knowledge of a type adds, reached by degrees (half of it after `KNOWLEDGE_TYPE_HALF` days)... */
export const KNOWLEDGE_TYPE_MAX = 0.12
export const KNOWLEDGE_TYPE_HALF = 360
/** ...and knowledge of the very product, which counts for a little more. */
export const KNOWLEDGE_PRODUCT_MAX = 0.15
export const KNOWLEDGE_PRODUCT_HALF = 200
/** With a knowledge base, this share of what a leaver knew stays with their team. */
export const KNOWLEDGE_HANDOVER = 0.4

// Teams: people can work on another office's project, a little less well
/** Output of someone working on a project run from an office other than their own. */
export const REMOTE_SPEED = 0.9

// Analysts and product managers
/** Insight an analyst gathers a day, per point of analysis skill (a product manager gathers a share of that). */
export const INSIGHT_PER_SKILL = 0.04
export const PM_INSIGHT_SHARE = 0.5
/** Insight a survey of one audience costs: afterwards its tastes show in the feature list. */
export const SURVEY_COST = 40
/** Analysis gained a day by working, scaled down toward 100. */
export const ANALYSIS_GAIN = 0.012
/** A Senior analyst can become a product manager with this much analysis, after this many days as a Senior. */
export const PM_MIN_ANALYSIS = 70
export const PM_AFTER_DAYS = 150
/** The highest level an analyst reaches before becoming a product manager (Senior). */
export const ANALYST_MAX_LEVEL = 2
/** A product manager steers their office's products by level (Junior..Lead): the fit of a release and reach are multiplied by 1 plus these. */
export const PM_FIT_BONUS: readonly number[] = [0, 0.04, 0.08, 0.12]
export const PM_REACH_BONUS: readonly number[] = [0, 0.03, 0.06, 0.1]
/** Feedback on a launch arrives over time, unless there is an analyst to read it: what they loved, shrugged at, wished for. */
export const FEEDBACK_LOVED_DAYS = 20
export const FEEDBACK_SHRUGGED_DAYS = 60
export const FEEDBACK_MISSED_DAYS = 120

// Staff: morale, training, outings
/** Where morale settles for a content team that isn't shipping anything special. */
export const MORALE_BASE = 68
/** Morale at which output is exactly normal. Shipping good products lifts a team from the base up to about here. */
export const MORALE_NEUTRAL = 75
/** Share of the gap to the target morale closed each day. */
export const MORALE_PULL = 0.06
/** A Small project that runs longer than this wears the team down; a bigger one gets this x sqrt(its work)... */
export const MORALE_CRUNCH_DAYS = 110
/** ...by this much, and by this much more for every further step, up to the cap. */
export const MORALE_CRUNCH_PENALTY = 8
export const MORALE_CRUNCH_STEP_DAYS = 30
export const MORALE_CRUNCH_MAX_STEPS = 3
/** Worrying about the next pay cheque. */
export const MORALE_DEBT_PENALTY = 15
/** Teammates with a morale trait can lift the target by at most this much. */
export const TEAM_MORALE_CAP = 9
export const MORALE_UNHAPPY = 40
export const MORALE_QUIT = 30
export const QUIT_CHANCE_PER_DAY = 0.03
export const RELEASE_GOOD_QUALITY = 75
export const RELEASE_BAD_QUALITY = 40
export const RELEASE_MORALE_BONUS = 6
export const RELEASE_MORALE_PENALTY = 8
export const OFFICE_UPGRADE_MORALE = 10

export const OUTING_MORALE = 15
export const OUTING_COOLDOWN_DAYS = 30
/** An outing costs this share of a month's payroll, with a floor. */
export const OUTING_COST_SHARE = 0.2
export const OUTING_COST_FLOOR = 400

export const TRAINING_DAYS = 10
/** Skill points gained at skill 0; less as skill approaches 110. */
export const TRAINING_GAIN = 8
export const TRAINING_COST_BASE = 400
export const TRAINING_COST_PER_SKILL = 30
export const TRAINING_MORALE = 5
/** Training stops being offered above this skill. */
export const TRAINING_MAX_SKILL = 92
export const CANDIDATE_MORALE_MIN = 70
export const CANDIDATE_MORALE_MAX = 85

/** Monthly samples kept for the stats charts (20 years). */
export const HISTORY_LIMIT = 240

// Product–market fit, and the hits it makes (see sim/fit.ts).
/** A product whose fit reaches this, in a market that is neither cold nor too crowded, takes off. */
export const FIT_TAKEOFF = 75
/** Fit with nothing the audience loves, as a share of what loving all of it would give. */
export const FIT_BASE = 0.1
/** Each feature the audience shrugs at takes this much off the share of what they love that a product gives them. */
export const FIT_SHRUG_PENALTY = 0.06
/** Quality allows all of the fit from this quality, falling to this share of it at quality 40 and below. */
export const FIT_QUALITY_FULL = 90
export const FIT_QUALITY_FLOOR = 0.4
/** How wide the studio's reading of a fit is: this wide with nobody who knows users, this narrow with a perfect eye. */
export const FIT_BAND_MAX = 40
export const FIT_BAND_MIN = 4
/** Before it takes off a product reaches only this share of the people it could, a little more the better it fits. */
export const UNDISCOVERED_REACH = 0.7
export const UNDISCOVERED_FIT_FLOOR = 0.4
/** A market at least this crowded by others (see the Industry tab) leaves no room for a product to take off. */
export const TAKEOFF_MAX_CROWDING = 1.2
/** A pivot keeps this share of the product's users: the rest came for what it was. */
export const PIVOT_KEEP = 0.2
/** The garage (and the café) can look after this many live products at once. */
export const GARAGE_PRODUCT_LIMIT = 3
/**
 * A hit makes its own market: it can hold this many times the users a market holds for anything else. In practice what
 * stops a hit is its servers (`BASE_CAPACITY`, `sim/scale.ts`) and its reach, not the market.
 */
export const HIT_MARKET_SCALE = 300
/**
 * A healthy hit keeps finding people: its pull on the world (`Product.world`) grows by this share a day, scaled by how
 * well it fits (`hitHealth`) and by its Growth work, until its servers are full.
 */
export const HIT_GROWTH_RATE = 0.003
/**
 * Pressure on a hit's fit, in points a day: a stale product, open bugs, rivals in its market and features the era now
 * expects. A release puts the fit back to what its features earn; between releases the fit only sags, and it
 * recovers (`FIT_RECOVERY` a day) when nothing presses on it.
 */
export const FIT_STALE_PRESSURE = 0.25
export const FIT_BUG_PRESSURE = 0.3
export const FIT_RIVAL_PRESSURE = 0.08
export const FIT_MISSING_PRESSURE = 0.06
export const FIT_RECOVERY = 0.15
/** Below the takeoff fit a hit keeps this share of its users at a fit of zero, rising to all of them at the takeoff fit: churn follows fit. */
export const HIT_RETENTION_FLOOR = 0.4
/** Second products: the slots they and side products share, the slice of the hit's users they start with, and what they do. */
export const COMPANION_SLOTS = 2
export const COMPANION_SHARE = 0.12
/** A healthy Reach companion speeds the hit's growth by this share; a Keep one wins back this share of lost users and adds this much to what users pay. */
export const COMPANION_REACH_BOOST = 0.4
export const COMPANION_KEEP_RETENTION = 0.1
export const COMPANION_KEEP_PAY = 0.15
/** An unhealthy companion presses on the hit's fit by this many points a day. */
export const COMPANION_CARE_FIT = 0.1
/** The users a hit's servers hold before any Scale work; roadmap items add to it (`data/workstreams.ts`). */
export const BASE_CAPACITY = 300_000
/** From this share of its capacity, a hit risks an outage each day... */
export const OUTAGE_LOAD = 0.92
export const OUTAGE_CHANCE = 0.02
/** ...which costs this share of its users for good, this much reputation, and a burst of bugs. */
export const OUTAGE_USER_LOSS = 0.03
export const OUTAGE_REPUTATION = 1
export const OUTAGE_BUGS = 8
/** What a hit's servers cost per user per day, on top of salaries. */
export const HOSTING_PER_USER_DAY = 0.002
/** Rivals' launches still roll for a hit, from this quality up. */
export const HIT_MIN_QUALITY = 70
/** A hit reaches this many times as many users, most for small products: a big launch was already aimed at most of its market... */
export const HIT_REACH: Record<'small' | 'medium' | 'large' | 'flagship', number> = { small: 6, medium: 4, large: 3, flagship: 2 }
/** ...and makes the studio's name. */
export const HIT_REPUTATION = 5

// Careers
export interface LevelSpec {
  name: string
  /** Multiplier on the market salary for their skills. */
  salary: number
  /** Multiplier on their output: experience counts. */
  speed: number
  /** Skill in their own discipline needed to be promoted into this level... */
  skill: number
  /** ...after this many days at the level below. */
  days: number
}

/** Junior, Mid, Senior, Lead. A Lead also runs their office's team. */
export const LEVELS: readonly LevelSpec[] = [
  { name: 'Junior', salary: 0.9, speed: 0.95, skill: 0, days: 0 },
  { name: 'Mid', salary: 1, speed: 1, skill: 45, days: 150 },
  { name: 'Senior', salary: 1.2, speed: 1.1, skill: 65, days: 300 },
  { name: 'Lead', salary: 1.4, speed: 1.1, skill: 80, days: 300 },
]
export const LEAD_LEVEL = 3
/** Days after a paid counter-offer during which a rival does not try to poach the same person again. */
export const POACH_IMMUNITY_DAYS = 540
/** The highest level a new hire can start at. */
export const HIRE_MAX_LEVEL = 2
/** People wait this long for a promotion they have earned before they start to resent it... */
export const PROMOTION_PATIENCE_DAYS = 60
/** ...and then feel this much worse until they get it. */
export const OVERLOOKED_MORALE = 10
export const PROMOTION_MORALE = 10
/** An office with more people than this needs a Lead, or it works this much slower... */
export const LEAD_FREE_TEAM = 4
export const NO_LEAD_SPEED = 0.9
/** ...while a team with a Lead works this much faster and is this much happier. */
export const LEAD_SPEED = 1.05
export const LEAD_MORALE = 3
/** After this many years at the studio, people start to think about moving on, and each day one does with this chance. */
export const MOVE_ON_YEARS = 6
export const MOVE_ON_CHANCE = 0.0008

// Client contracts
/** How many jobs are on the board when a game starts. */
export const CONTRACT_OFFERS = 3
/** The board holds at most this many jobs; a new one turns up every few days while there is room. */
export const CONTRACT_BOARD = 4
export const CONTRACT_NEW_MIN_DAYS = 7
export const CONTRACT_NEW_MAX_DAYS = 13
/** A job stays on the board this long before the client goes elsewhere. */
export const CONTRACT_LIFETIME_DAYS = 35
/** Share of the pay the client advances when you take the job; refunded if you walk away. */
export const CONTRACT_DEPOSIT = 0.5
/** A job is sized so that the team's slowest discipline needs this share of the days it is due in. */
export const CONTRACT_LOAD = 0.8
/** The least a discipline is counted at when sizing a job, so a team without one still gets offers. */
export const CONTRACT_MIN_RATE = 0.5
/** Jobs that fit the team at least this well (compared with the best-fitting job) can be offered. */
export const CONTRACT_FIT = 0.6
/** What a client pays per point of work, before reputation... */
export const CONTRACT_PAY_PER_POINT = 18
/** ...which adds this share per point of reputation. */
export const CONTRACT_REPUTATION_PAY = 0.01
/** A job is sized to take a team this many days... */
export const CONTRACT_MIN_DAYS = 12
export const CONTRACT_MAX_DAYS = 40
/** ...and is due this many times as long, plus a few days. */
export const CONTRACT_SLACK = 1.4
export const CONTRACT_SLACK_DAYS = 5
/** A late delivery is paid at this share. */
export const CONTRACT_LATE_PAY = 0.5
export const CONTRACT_REPUTATION = 0.5
/** Walking away from a job costs this much reputation. */
export const CONTRACT_ABANDON_REPUTATION = 2

// Enterprise contracts and licensing (Act 2): big clients want the studio's big products
/** Products at least this big attract enterprise clients. */
export const ENTERPRISE_MIN_SIZE = 'large' as const
/** Enterprise offers on the board at once, and the days between new ones... */
export const ENTERPRISE_BOARD = 2
export const ENTERPRISE_GAP_MIN_DAYS = 50
export const ENTERPRISE_GAP_MAX_DAYS = 90
/** ...how long one stays on the board, how long the team has once it takes it, and how large it is, in days of the best office's work. */
export const ENTERPRISE_LIFETIME_DAYS = 100
export const ENTERPRISE_DUE_SLACK = 1.5
export const ENTERPRISE_MIN_DAYS = 35
export const ENTERPRISE_MAX_DAYS = 70
/** It pays at least this many days of what the product earns, and this much more per point of work than ordinary jobs. */
export const ENTERPRISE_PAY_DAYS = 40
export const ENTERPRISE_PAY_MULT = 2.5
export const ENTERPRISE_REPUTATION = 1.5
/** Delivering it keeps the product fresh, as a maintenance release would. */
export const ENTERPRISE_REFRESH = true
/** A licensed Flagship pays this share of its own income on top, scaled by how well it is kept (interest and bugs)... */
export const LICENSE_SHARE = 0.35
/** ...and a studio can license this many. */
export const LICENSE_LIMIT = 2

// Bankruptcy
export const BANKRUPT_AFTER_DEBT_DAYS = 14

export interface OfficeSpec {
  name: string
  desks: number
  /** Monthly rent. */
  rent: number
}

export const OFFICE_KINDS: Record<'cafe' | 'garage' | 'office', OfficeSpec> = {
  /** A corner table: no rent, but the coffee. */
  cafe: { name: 'Café', desks: 2, rent: 300 },
  garage: { name: 'Garage', desks: 4, rent: 150 },
  office: { name: 'Office', desks: 12, rent: 2400 },
}

// The café, where the two founders start
/** What the two of you have saved when you start. */
export const CAFE_START_MONEY = 2500
/** The garage asks a deposit, and the money in the bank has to reach this first: the deposit and a month or so for two new people. */
export const GARAGE_DEPOSIT = 1000
export const GARAGE_READY_MONEY = 8000
/** Client jobs the two of you deliver from the café before a garage is worth it: they are how the café pays. */
export const CAFE_JOBS = 3
/** Something happens at the café more often than at the studio later: from this day, this many days apart at least, with this chance a day. */
export const CAFE_EVENT_MIN_DAY = 6
export const CAFE_EVENT_COOLDOWN_DAYS = 15
export const CAFE_EVENT_CHANCE_PER_DAY = 0.12

/** Moving out of the garage into a real office. */
export const MOVE_OUT_COST = 40000
/** How many garage products besides the hit can come along when the studio moves out; the rest are sold. */
export const SIDE_PRODUCT_LIMIT = 2 // fills the second-product slots (COMPANION_SLOTS) until retired
/** Adding a floor: the first extra one costs this, each after that this much more again. */
export const NEW_OFFICE_COST = 150000
/** Floors in both buildings together. */
export const MAX_OFFICES = 2 * REGION_OFFICE_LIMIT

// Selling and retiring products
/** A product earning at least this much a day is sold to a rival; one that earns less is only switched off. (What it earns, not its users: a cloud platform with a thousand users out-earns a game with a hundred thousand.) */
export const SALE_MIN_INCOME = 500
/** A sale pays this many months of what the product earns now. */
export const SALE_MONTHS = 12
/** A hit sells for this much more. */
export const SALE_HIT_BONUS = 1.25
/** Morale lost by everyone, and reputation lost, when a product is sold (a hit costs more reputation). */
export const SALE_MORALE_PENALTY = 5
export const SALE_REPUTATION_PENALTY = 3
export const SALE_HIT_REPUTATION_PENALTY = 6

// Founders
/** The two people who start the studio draw this share of the market rate for their skills, in every era: nothing in the café, where they live on savings. */
export const FOUNDER_PAY_SHARE = 0.5

// The nemesis: a rival with a name, a funded newcomer who comes for the hit
/** Days after the hit breaks out before its rival shows up, and after one is beaten before the next does. */
export const NEMESIS_FIRST_DAYS = 60
export const NEMESIS_NEXT_DAYS = 240
/** What they earn against you when they arrive (1 is level), the least and most it can drift to. */
export const NEMESIS_START_RATIO = 1.15
export const NEMESIS_MIN_RATIO = 0.3
export const NEMESIS_MAX_RATIO = 2.2
/** Each month they gain this much on you just by being hungry. */
export const NEMESIS_AMBITION = 0.03
/** Each month they gain this much for every point your hit's fit is under 90, up to the cap. */
export const NEMESIS_WEAKNESS = 1 / 400
export const NEMESIS_WEAKNESS_CAP = 0.1
/** Each month you lose this much on them for every roadmap item you finished that month, up to the cap. */
export const NEMESIS_PER_ITEM = 0.04
export const NEMESIS_ITEM_CAP = 0.12
/** A lookalike product they launch lifts them by this. */
export const NEMESIS_CLONE_GAIN = 0.1
/** Their reach for it, as a share of the hit's, and how far under the hit's quality it ships. */
export const NEMESIS_CLONE_REACH = 0.4
export const NEMESIS_CLONE_QUALITY_GAP = 3
/** Days between their moves. */
export const NEMESIS_MOVE_MIN_DAYS = 100
export const NEMESIS_MOVE_MAX_DAYS = 160
/** Their ad blitz cuts your revenue to this share for this many days. */
export const NEMESIS_BLITZ_MULT = 0.92
export const NEMESIS_BLITZ_DAYS = 40
/** A rival's income is never counted under this for the ratio, so a small studio still has one to beat. */
export const NEMESIS_MIN_INCOME = 2000
/** You have beaten them when you earn this much more than they do, for this many days in a row. */
export const NEMESIS_BEAT_RATIO = 0.8
export const NEMESIS_BEAT_DAYS = 90
/** Reputation you win for beating them. */
export const NEMESIS_BEAT_REPUTATION = 8
/** Each release you ship in a month holds them back a little, up to the cap; a hit at or over this fit holds them back more. */
export const NEMESIS_PER_RELEASE = 0.015
export const NEMESIS_RELEASE_CAP = 0.06
export const NEMESIS_STRONG_FIT = 95
export const NEMESIS_STRONG_FIT_GAIN = 0.02
/** Striking back: costs this many days of what you earn, sets them back this much, and can be done again after this many days. */
export const NEMESIS_STRIKE_DAYS = 25
export const NEMESIS_STRIKE_SETBACK = 0.2
export const NEMESIS_STRIKE_COOLDOWN = 60

// The friend
/** The friend starts at this, 0 to 100: how much they would give up for you. It moves with the team's mood and with what you choose. */
export const FRIEND_START_BOND = 60
/** The month they sketch their own idea: days after the hit, and the least stage. */
export const FRIEND_IDEA_DAYS = 120
/** Backing their idea costs this many months of their pay, and gives this much bond; the weekend version is free and gives less. */
export const FRIEND_BACK_MONTHS = 6
export const FRIEND_BACK_BOND = 15
export const FRIEND_WEEKEND_BOND = 8
export const FRIEND_REFUSE_BOND = -10
/** Each month the bond moves by this when the team is happy (morale over the first number) or unhappy (under the second). */
export const FRIEND_MOOD_GAIN = 2
export const FRIEND_HAPPY_MORALE = 75
export const FRIEND_UNHAPPY_MORALE = 55
/** The chance they stay when you talk, match the offer or leave it to them: bond over 100, plus this. */
export const FRIEND_STAY_TALK = 0.1
export const FRIEND_STAY_MATCH = 0.5
export const FRIEND_STAY_LEAVE = -0.1
/** Matching their offer costs this many months of their pay. */
export const FRIEND_MATCH_MONTHS = 12
/** When they go, the rival gains this and everyone loses this much morale. */
export const FRIEND_LEAVE_RIVAL_GAIN = 0.25
export const FRIEND_LEAVE_MORALE = 10

// Losing the company
/** The team is this unhappy (average morale under it) while the rival earns this much more than you (ratio over it), this many months running, and the company loses confidence in you. */
export const CRISIS_MORALE = 45
export const CRISIS_RATIO = 1.4
export const CRISIS_MONTHS = 3
/** Rallying the company costs this share of the cash, lifts morale by this and sets the rival back by this. */
export const RALLY_CASH_SHARE = 0.25
export const RALLY_MORALE = 20
export const RALLY_SETBACK = 0.2

// AI agents
/** An agent's bill grows with the team it serves: one plus a share of this many people. */
export const AGENT_COST_PEOPLE = 8
/** Safeguards that cut the chance of an incident: finished roadmap items on the hit, and the most they can cut. */
export const AGENT_OVERSIGHT: Record<string, number> = { observability: 0.3, test_automation: 0.2, chaos_testing: 0.15 }
export const AGENT_OVERSIGHT_CAP = 0.6
/** Rolling back an incident costs this many days of everything the agents cost. */
export const AGENT_ROLLBACK_DAYS = 12
/** What an incident does if you let it ride. */
export const AGENT_BUGS = 10
export const AGENT_QUALITY_LOSS = 3
export const AGENT_INSIGHT_LOSS = 20
export const AGENT_FIT_LOSS = 4
/** Of the incidents, this share also run up the bill (a loop that never stops): the bill multiplies for these days. */
export const AGENT_RUNAWAY_SHARE = 0.25
export const AGENT_RUNAWAY_MULT = 3
export const AGENT_RUNAWAY_DAYS = 20

// Deep work: the founder builds the hit's flagship pieces by hand
/** The chance of success is this, plus your skill over the divisor, plus help, minus the bold penalty; never outside the limits. */
export const DEEP_BASE_CHANCE = 0.5
export const DEEP_SKILL_DIVISOR = 250
export const DEEP_BOLD_PENALTY = 0.2
export const DEEP_HELP_BONUS = 0.15
export const DEEP_MIN_CHANCE = 0.15
export const DEEP_MAX_CHANCE = 0.95
/** Your skill grows by this much from a piece of deep work that works out, and by half of it from one that does not. */
export const DEEP_SKILL_GAIN = 3
/** A contractor costs this many days of what you earn. */
export const DEEP_CONTRACTOR_DAYS = 8
/** Asking your friend to pair needs at least this bond, and strengthens it by this much. */
export const DEEP_FRIEND_BOND_MIN = 50
export const DEEP_FRIEND_BOND_GAIN = 4

/* The release cycle (`sim/cycle.ts`): analysts and the product manager write a spec, then the team builds it. */
/** Days a spec takes to write at no clarity; clearer teams are faster, down to the minimum. */
export const SPEC_BASE_DAYS = 12
export const SPEC_MIN_DAYS = 4
/** Days the player has to choose before the product manager picks for them. */
export const SPEC_DECIDE_DAYS = 10
/** How many requirements a spec proposes. */
export const SPEC_PROPOSALS = 3
/** A vague spec makes the build this share bigger and its bugs this share likelier, at clarity 0; none at clarity 100. */
export const SPEC_REWORK = 0.6
export const SPEC_BUGS = 0.8
/** A release's reach moves by up to this share from the spec: more for a clear one, less for a vague one (clarity 50 is neutral). */
export const SPEC_REACH = 0.15
/** Clarity: a base, plus this share of the sharpest analyst's skill, of the product manager's, and a bonus for a second pair of eyes. */
export const CLARITY_BASE = 25
export const CLARITY_ANALYST = 0.4
export const CLARITY_PM = 0.2
export const CLARITY_PM_PRESENT = 10
export const CLARITY_EXTRA_ANALYST = 6
/** Without a product manager a floor's specs are never clearer than this. */
export const CLARITY_NO_PM_CAP = 70
/** How many release notes a product keeps. */
export const RELEASE_NOTES_KEPT = 30
