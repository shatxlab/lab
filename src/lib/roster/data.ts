import type { DepartmentId, Effect, QuirkId, Rarity, Stat, WeaponId } from "./types";

export interface Department {
  /** Name of the Tycoon shirt ramp the department wears, so it reads at a glance. */
  shirt: string;
  weapon: WeaponId;
  /** The stat the department is good at. */
  favours: Stat;
}

/** Seven departments for Tycoon's seven shirt ramps; a new one needs a new ramp. */
export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = {
  engineering: { shirt: "blue", weapon: "rubberDuck", favours: "focus" },
  finance: { shirt: "green", weapon: "spreadsheet", favours: "output" },
  legal: { shirt: "purple", weapon: "contract", favours: "grit" },
  sales: { shirt: "red", weapon: "businessCard", favours: "luck" },
  it: { shirt: "teal", weapon: "serverRack", favours: "output" },
  hr: { shirt: "pink", weapon: "policyBinder", favours: "grit" },
  interns: { shirt: "orange", weapon: "stickyNotes", favours: "hustle" },
};

/** Every stat starts here; the department's favourite gets `FAVOURED_BONUS` on top. */
export const BASE_STAT = 10;
export const FAVOURED_BONUS = 3;
/** Each stat is nudged by up to this much either way, so two commons of a department differ. */
export const STAT_JITTER = 1;
export const MAX_STAT = 99;

export interface RarityRule {
  /** Relative chance of a candidate rolling this rarity. */
  weight: number;
  /** Stat points spread at random on top of the base. */
  bonus: number;
  quirks: number;
}

export const RARITY: Readonly<Record<Rarity, RarityRule>> = {
  common: { weight: 60, bonus: 2, quirks: 1 },
  uncommon: { weight: 27, bonus: 5, quirks: 1 },
  rare: { weight: 10, bonus: 9, quirks: 2 },
  legend: { weight: 3, bonus: 14, quirks: 2 },
};

export const MAX_QUIRKS = 2;

/** An upside and often a downside, in percent (see `Effect`). Names and lines live in the game's i18n. */
export const QUIRKS: Readonly<Record<QuirkId, Partial<Record<Effect, number>>>> = {
  caffeinated: { hustle: 20, damageTaken: 15 },
  stealsLunches: { gold: 20, teamQuitChance: 5 },
  overachiever: { xp: 25, quitChance: 10 },
  loyal: { quitChance: -50, hustle: -10 },
  networker: { luck: 20, output: -10 },
  nightOwl: { focus: 20, grit: -10 },
  gymRegular: { grit: 25, focus: -10 },
  perfectionist: { output: 25, focus: -15 },
  clockWatcher: { salary: -15, xp: -15 },
  officeGossip: { luck: 10, teamQuitChance: 5 },
  unionRep: { teamQuitChance: -10, salary: 15 },
  coffeeSnob: { focus: 10, salary: 10 },
  standingDesk: { hustle: 10 },
};
