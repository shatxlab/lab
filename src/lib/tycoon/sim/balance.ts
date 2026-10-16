// All tunable numbers live here so the balance pass touches one file.

import type { Skills } from './types'

export const START_MONEY = 25000
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
  flagship: { name: 'Flagship', work: 8, reach: 4.8, life: 2, reputation: 6.4, office: true, stage: 2 },
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
export const FRESH_DAYS = 90
/** ...after which the reach fades with this time constant (times the size's life) until the next update. */
export const STALE_DAYS = 90

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
/** Journey stage (index into STAGES) from which rivals can be bought: an industry leader. */
export const ACQUISITION_STAGE = 4

/** Reputation a rival needs before taking on each size. */
export const RIVAL_SIZE_REPUTATION: Record<'small' | 'medium' | 'large' | 'flagship', number> = { small: 0, medium: 35, large: 55, flagship: 80 }

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
/** Incident management starts a fix once a product has this many bugs per unit of its size's work. */
export const AUTO_FIX_DENSITY = 10

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

// Random events
export const EVENT_MIN_DAY = 25
export const EVENT_COOLDOWN_DAYS = 15
export const EVENT_CHANCE_PER_DAY = 0.05
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

/** Paid promotion of a live product. Roughly 1.3-1.6x its cost back. */
export const PROMOTIONS: Record<'small' | 'medium' | 'large', MarketingOffer> = {
  small: { costDays: 2.6, costFloor: 300, users: 0.08, days: 20 },
  medium: { costDays: 6, costFloor: 700, users: 0.18, days: 30 },
  large: { costDays: 11, costFloor: 1500, users: 0.35, days: 40 },
}

/** The same at launch, where the new users also get word of mouth going sooner. */
export const CAMPAIGNS: Record<'small' | 'medium' | 'large', MarketingOffer> = {
  small: { costDays: 4, costFloor: 300, users: 0.08, days: 20 },
  medium: { costDays: 7.5, costFloor: 700, users: 0.18, days: 30 },
  large: { costDays: 12, costFloor: 1500, users: 0.35, days: 40 },
}

// Reputation
export const REPUTATION_MAX = 100
/** Shipping at this quality leaves reputation unchanged. */
export const REPUTATION_NEUTRAL_QUALITY = 50
export const REPUTATION_DIVISOR = 15

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

// Breakout hits: now and then a launch takes off far beyond its reach.
/** Launches below this quality never break out. */
export const HIT_MIN_QUALITY = 70
/** Chance for a good launch... */
export const HIT_BASE_CHANCE = 0.01
/** ...plus this for every good launch since the last hit, so persistence pays... */
export const HIT_CHANCE_PER_MISS = 0.012
/** ...but never more than this. */
export const HIT_MAX_CHANCE = 0.35
/** A launch campaign gets people talking: the chance is multiplied by this per tier. */
export const HIT_CAMPAIGN_BOOST: Record<'small' | 'medium' | 'large', number> = { small: 1.2, medium: 1.4, large: 1.7 }
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
export const CONTRACT_OFFERS = 3
/** What a client pays per point of work, before reputation... */
export const CONTRACT_PAY_PER_POINT = 15
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

// Bankruptcy
export const BANKRUPT_AFTER_DEBT_DAYS = 14

export interface OfficeSpec {
  name: string
  desks: number
  /** Monthly rent. */
  rent: number
}

export const OFFICE_KINDS: Record<'garage' | 'office', OfficeSpec> = {
  garage: { name: 'Garage', desks: 4, rent: 150 },
  office: { name: 'Office', desks: 12, rent: 2400 },
}

/** Moving out of the garage into a real office. */
export const MOVE_OUT_COST = 40000
/** Opening another office: the first extra one costs this, each after that this much more again. */
export const NEW_OFFICE_COST = 150000
/** One office per colour scheme the renderer has. */
export const MAX_OFFICES = 4

// Selling and retiring products
/** A product with at least this many users is sold to a rival; with fewer it is only switched off. */
export const SALE_MIN_USERS = 100_000
/** A sale pays this many months of what the product earns now. */
export const SALE_MONTHS = 12
/** A hit sells for this much more. */
export const SALE_HIT_BONUS = 1.25
/** Morale lost by everyone, and reputation lost, when a product is sold (a hit costs more reputation). */
export const SALE_MORALE_PENALTY = 5
export const SALE_REPUTATION_PENALTY = 3
export const SALE_HIT_REPUTATION_PENALTY = 6
