import { MAX_STAT, RARITY } from "@/lib/roster/data";
import { PERK_IDS, type Coworker, type PerkId, type Rarity, type RosterSave, type Stat, type WeaponId } from "@/lib/roster/types";
import type { PassiveId } from "./sim/types";
import { random } from "@/lib/tower/sim/random";
import { MAX_PASSIVE_LEVEL, MAX_WEAPON_LEVEL, PASSIVE_IDS, PERK_DIFFICULTY, REVIEW, WEAPON_IDS } from "./sim/balance";
import { normalizeKit, type ItemState } from "./kit";
import { isClassId, type ClassId } from "./sim/classes";

/**
 * The journey between runs: the one coworker the player is growing and the gold saved up. Level, XP and the day live
 * with the coworker and the day counter in the shared roster save; this is the part only the hero game cares about.
 */
export const CAREER_STORAGE_KEY = "lab:hr:v1";

export interface Career {
  /** The desk kit, carried across days; empty until a boss's loot lands on it. */
  kit: ItemState[];
  /** The one coworker being grown; null until onboarding establishes the Intern. */
  focusId: number | null;
  /** Ids the career has owned (the focus, and legacy saves' extra cards, which are no longer dealt). */
  owned: number[];
  /** Gold banked from runs. */
  gold: number;
  /** The build the hero carried out of their last day: weapons and passives, at their levels. */
  build: Build;
  /** Null until the player commits to a track on their next new day. */
  classId: ClassId | null;
  /** Lost days in a row; each one eases the next day's difficulty (the slump mercy), a win resets it. */
  slump: number;
}

export interface CareerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOrUndefined(): CareerStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function defaultCareer(): Career {
  return { focusId: null, owned: [], gold: 0, kit: [], build: EMPTY_BUILD, classId: null, slump: 0 };
}

/** Keep valid careers intact; old unselected saves and new players start with the Intern.
 * A legacy suspended run or owned card takes precedence over creating a new focus.
 */
export function withCareerFocus(roster: RosterSave, career: Career, suspendedCoworkerId?: number): Career {
  const active = roster.coworkers.filter((coworker) => coworker.status.kind !== "quit");
  if (active.some((coworker) => coworker.id === career.focusId)) return career;
  const focus = active.find((coworker) => career.owned.includes(coworker.id))
    ?? active.find((coworker) => coworker.id === suspendedCoworkerId)
    ?? active.find((coworker) => coworker.id === 1 && coworker.department === "interns")
    ?? active[0];
  if (!focus) return { ...career, focusId: null };
  return { ...career, focusId: focus.id, owned: [...new Set([...career.owned, focus.id])] };
}

export function normalizeCareer(raw: unknown): Career {
  if (!raw || typeof raw !== "object") return defaultCareer();
  const { focusId, owned, gold, classId } = raw as Partial<Record<keyof Career, unknown>>;
  const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  const focus = whole(focusId) || null;
  const ids = (list: unknown) => (Array.isArray(list) ? list.map(whole).filter((id) => id > 0) : []);
  // The focus is always owned; legacy saves keep their extra cards so nothing is lost, but no new ones are dealt.
  const own = [...new Set(focus ? [focus, ...ids(owned)] : ids(owned))];
  const kit = normalizeKit((raw as { kit?: unknown }).kit) ?? [];
  const build = normalizeBuild((raw as { build?: unknown }).build);
  const rawSlump = (raw as { slump?: unknown }).slump;
  const slump = typeof rawSlump === "number" && Number.isFinite(rawSlump) ? Math.max(0, Math.floor(rawSlump)) : 0;
  return { focusId: focus, owned: own, gold: whole(gold), kit, build, classId: isClassId(classId) ? classId : null, slump };
}

export function readCareer(storage: CareerStorage | undefined = storageOrUndefined()): Career {
  try {
    const raw = storage?.getItem(CAREER_STORAGE_KEY);
    return raw ? normalizeCareer(JSON.parse(raw)) : defaultCareer();
  } catch {
    return defaultCareer();
  }
}

export function writeCareer(career: Career, storage: CareerStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(CAREER_STORAGE_KEY, JSON.stringify(career));
  } catch {
    // Private mode or a full quota: progress just isn't kept.
  }
}

export function clearCareer(storage: CareerStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.removeItem(CAREER_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/** 0 is the first rank; the next starts every `levelsPerRank` levels. */
export function rankOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / REVIEW.levelsPerRank);
}

/** How much tougher the office is for a coworker of this level, rarity and perks (see `RARITY`). A hero in a
 * slump — lost days in a row on the career — gets a little mercy, so one bad day never becomes a doom loop. */
export function difficultyFor(level: number, rarity: Rarity = "common", perks: readonly PerkId[] = [], slump = 0): number {
  const extra = Math.max(0, RARITY[rarity].bonus - RARITY.common.bonus);
  const relief = Math.min(Math.max(0, Math.floor(slump)), REVIEW.slumpDays) * REVIEW.slumpRelief;
  return Math.max(0.7, 1 + REVIEW.difficultyPerLevel * (Math.max(1, level) - 1 + extra) + perks.reduce((sum, perk) => sum + PERK_DIFFICULTY[perk], 0) - relief);
}

/**
 * Interviews are short, so a coworker has less time to grow into the fight than in a day: they scale at half the
 * day's pace.
 */
export function interviewDifficultyFor(level: number, rarity: Rarity = "common", perks: readonly PerkId[] = []): number {
  return 1 + (difficultyFor(level, rarity, perks) - 1) / 2;
}

export interface EncounterTradeoff {
  /** Relative increase from this coworker's current enemy health / spawn rate, in percent. */
  health: number;
  spawns: number;
}

/** Disclosure only: uses the unchanged normal/interview difficulty calculations. */
export function promotionTradeoff(coworker: Coworker, perk: PerkId): { day: EncounterTradeoff; interview: EncounterTradeoff } {
  const after = [...coworker.perks, perk];
  const change = (before: number, next: number): EncounterTradeoff => ({
    health: (next / before - 1) * 100,
    spawns: ((1 + (next - 1) / 2) / (1 + (before - 1) / 2) - 1) * 100,
  });
  return {
    day: change(difficultyFor(coworker.level, coworker.rarity, coworker.perks), difficultyFor(coworker.level, coworker.rarity, after)),
    interview: change(interviewDifficultyFor(coworker.level, coworker.rarity, coworker.perks), interviewDifficultyFor(coworker.level, coworker.rarity, after)),
  };
}

const GROWTH_ORDER: readonly Stat[] = ["output", "grit", "focus", "hustle", "luck"];
/** The stats a promotion lifts, by `REVIEW.promotionBonus` each. */
const PROMOTION_STATS: readonly Stat[] = ["grit", "output", "focus"];

/** Promotions that have not had their perk chosen yet. */
export function perksPending(coworker: Coworker): number {
  return Math.max(0, rankOf(coworker.level) - coworker.perks.length);
}

/**
 * The perks on offer for the next promotion: a few of those the coworker doesn't have, fixed by who they are and how
 * many they already have, so leaving the screen and coming back shows the same three.
 */
export function perkOffer(coworker: Coworker): PerkId[] {
  const pool = PERK_IDS.filter((perk) => !coworker.perks.includes(perk));
  const seed = { rng: (coworker.id * 7919 + coworker.perks.length * 104729) >>> 0 };
  const offer: PerkId[] = [];
  while (offer.length < REVIEW.perksOffered && pool.length > 0) offer.push(pool.splice(Math.floor(random(seed) * pool.length), 1)[0]);
  return offer;
}

/** The coworker with the perk, if a promotion is waiting for one and the perk is on offer; null otherwise. */
export function choosePerk(coworker: Coworker, perk: PerkId): Coworker | null {
  if (perksPending(coworker) === 0 || !perkOffer(coworker).includes(perk)) return null;
  return { ...coworker, perks: [...coworker.perks, perk] };
}

/**
 * The stat every coworker grows on reaching `level`, the same cycle for all departments: growth that followed the
 * favourite stat made a hustle coworker (the intern) fall behind a damage one over the weeks.
 */
function grownStat(level: number): Stat {
  return GROWTH_ORDER[(level - 2) % GROWTH_ORDER.length];
}

/** The stat bumps a level grants: a point in the cycle, and the promotion's bonus at a rank boundary. */
function levelUpStats(stats: Record<Stat, number>, level: number): boolean {
  stats[grownStat(level)] = Math.min(MAX_STAT, stats[grownStat(level)] + 1);
  if (rankOf(level) > rankOf(level - 1)) {
    for (const stat of PROMOTION_STATS) stats[stat] = Math.min(MAX_STAT, stats[stat] + REVIEW.promotionBonus);
    return true;
  }
  return false;
}

export interface Review {
  coworker: Coworker;
  levelsGained: number;
  promoted: boolean;
}

/**
 * The day is the hero's: the run's final level and XP are theirs to keep. Every level they earned grants a stat point
 * (the same cycle for everyone), a promotion the rank bonus — the perks wait on the starting screen.
 */
export function settle(coworker: Coworker, level: number, xp: number): Review {
  const stats = { ...coworker.stats };
  const target = Math.max(coworker.level, Math.floor(level));
  let promoted = false;
  for (let next = coworker.level + 1; next <= target; next += 1) promoted = levelUpStats(stats, next) || promoted;
  return { coworker: { ...coworker, level: target, xp: Math.max(0, Math.floor(xp)), stats }, levelsGained: target - coworker.level, promoted };
}

/** Grows a coworker straight to `level` (the bot's shortcut for the career curve), stat bumps included. */
export function growTo(coworker: Coworker, level: number): Coworker {
  const stats = { ...coworker.stats };
  const target = Math.max(coworker.level, Math.floor(level));
  for (let next = coworker.level + 1; next <= target; next += 1) levelUpStats(stats, next);
  return { ...coworker, level: target, xp: 0, stats };
}

/**
 * The build the hero carries from day to day: the weapons and passives they picked up in the office, kept so the
 * next morning starts where the evening ended.
 */
export interface Build {
  weapons: Partial<Record<WeaponId, number>>;
  passives: Partial<Record<PassiveId, number>>;
}

export const EMPTY_BUILD: Build = { weapons: {}, passives: {} };

/** The build a finished run leaves behind: every weapon and passive, at its level. */
export function careerBuild(run: { weapons: { id: WeaponId; level: number }[]; passives: Partial<Record<PassiveId, number>> }, previous = EMPTY_BUILD): Build {
  // Off-class equipment stays in the career archive when only active equipment is settled.
  const weapons: Build["weapons"] = { ...previous.weapons };
  for (const weapon of run.weapons) weapons[weapon.id] = Math.max(1, Math.min(MAX_WEAPON_LEVEL, weapon.level));
  const passives: Build["passives"] = { ...previous.passives };
  for (const [id, level] of Object.entries(run.passives) as [PassiveId, number][]) passives[id] = Math.max(1, Math.min(MAX_PASSIVE_LEVEL, level));
  return { weapons, passives };
}

/** A build from storage, repaired field by field: unknown ids and wild levels are dropped. */
export function normalizeBuild(raw: unknown): Build {
  if (!raw || typeof raw !== "object") return EMPTY_BUILD;
  const weapons: Build["weapons"] = {};
  const rawWeapons = (raw as Build).weapons;
  if (rawWeapons && typeof rawWeapons === "object") {
    for (const [id, level] of Object.entries(rawWeapons) as [WeaponId, unknown][]) {
      if (WEAPON_IDS.includes(id) && typeof level === "number" && Number.isFinite(level)) {
        weapons[id] = Math.max(1, Math.min(MAX_WEAPON_LEVEL, Math.floor(level)));
      }
    }
  }
  const passives: Build["passives"] = {};
  const rawPassives = (raw as Build).passives;
  if (rawPassives && typeof rawPassives === "object") {
    for (const [id, level] of Object.entries(rawPassives) as [PassiveId, unknown][]) {
      if (PASSIVE_IDS.includes(id) && typeof level === "number" && Number.isFinite(level)) {
        passives[id] = Math.max(1, Math.min(MAX_PASSIVE_LEVEL, Math.floor(level)));
      }
    }
  }
  return { weapons, passives };
}