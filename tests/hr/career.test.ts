import { describe, expect, it } from "vitest";

import { promotionTradeoff, withCareerFocus, careerBuild, choosePerk, defaultCareer, difficultyFor, growTo, interviewDifficultyFor, normalizeCareer, perkOffer, perksPending, rankOf, settle } from "@/lib/hr/career";
import { createRun } from "@/lib/hr/sim/run";
import { interviewBossFor, INTERVIEW_BOSSES, PERK_DIFFICULTY, REVIEW, xpToNext } from "@/lib/hr/sim/balance";
import { starters } from "@/lib/roster/generate";
import { defaultSave } from "@/lib/roster/save";
import { PERK_IDS, STATS } from "@/lib/roster/types";

const total = (stats: Record<string, number>) => Object.values(stats).reduce((sum, value) => sum + value, 0);

describe("settle", () => {
  const [coworker] = starters();

  it("keeps the day's level and XP: every level grants a stat point, in the same cycle for every department", () => {
    const result = settle(coworker, 3, xpToNext(3) - 5);
    expect(result.coworker).toMatchObject({ level: 3, xp: xpToNext(3) - 5 });
    expect(result.levelsGained).toBe(2);
    expect(result.coworker.stats.output).toBe(coworker.stats.output + 1);
    expect(result.coworker.stats.grit).toBe(coworker.stats.grit + 1);
    const other = starters()[1];
    expect(settle(other, 3, 0).coworker.stats.output).toBe(other.stats.output + 1);
    expect(settle(other, 3, 0).coworker.stats.grit).toBe(other.stats.grit + 1);
  });

  it("never lowers a level, and promotes at the rank boundary with a bonus", () => {
    let need = 0;
    for (let level = 1; level < REVIEW.levelsPerRank + 1; level += 1) need += xpToNext(level);
    const result = settle(coworker, REVIEW.levelsPerRank + 1, 0);
    expect(result.coworker.level).toBe(REVIEW.levelsPerRank + 1);
    expect(result.promoted).toBe(true);
    expect(result.coworker.stats.output).toBe(coworker.stats.output + 2);
    expect(settle(result.coworker, 1, 9999).coworker.level).toBe(REVIEW.levelsPerRank + 1);
  });

  it("leaves the original coworker alone and keeps stats under the cap", () => {
    const capped = { ...coworker, stats: Object.fromEntries(STATS.map((stat) => [stat, 99])) as typeof coworker.stats };
    const result = settle(capped, coworker.level + 50, 0);
    expect(Object.values(result.coworker.stats).every((value) => value === 99)).toBe(true);
    expect(coworker.level).toBe(1);
  });

  it("growTo reaches a level with the same bumps, and the perks wait", () => {
    const grown = growTo(coworker, 11);
    expect(grown.level).toBe(11);
    expect(grown.stats.output).toBe(coworker.stats.output + 4);
    expect(perksPending(grown)).toBe(2);
  });
});

describe("difficulty", () => {
  it("starts at 1 and toughens foes in a run", () => {
    expect(difficultyFor(1)).toBe(1);
    expect(difficultyFor(11)).toBeGreaterThan(difficultyFor(6));
    expect(difficultyFor(1, "legend")).toBeGreaterThan(difficultyFor(1, "rare"));
    expect(difficultyFor(1, "rare")).toBeGreaterThan(difficultyFor(1, "uncommon"));
    expect(difficultyFor(1, "uncommon")).toBeGreaterThan(difficultyFor(1, "common"));
    expect(difficultyFor(1, "common")).toBe(1);
    expect(createRun(starters()[0], 1, 1.5).difficulty).toBe(1.5);
    expect(createRun(starters()[0], 1).difficulty).toBe(1);
  });

  it("carries the hero's level, XP and build into the run", () => {
    const [starter] = starters();
    const veteran = { ...starter, level: 12, xp: xpToNext(12) - 3 };
    const run = createRun(veteran, 1, 1, null, [], { weapons: { spreadsheet: 4 }, passives: { coffee: 2 } });
    expect(run.level).toBe(12);
    expect(run.xp).toBe(xpToNext(12) - 3);
    expect(run.careerLevel).toBe(12);
    expect(run.weapons.map((weapon) => `${weapon.id}${weapon.level}`).sort()).toEqual(["spreadsheet4", "stickyNotes1"]);
    expect(run.passives).toEqual({ coffee: 2 });
    // The signature weapon is always in the build, and overtime raises it.
    expect(createRun({ ...starter, perks: ["overtime"] }, 1, 1, null, [], { weapons: { spreadsheet: 3 }, passives: {} }).weapons.find((weapon) => weapon.id === "spreadsheet")?.level).toBe(3);
    // A build without the signature gets it back; a fresh hero carries just the signature at level 1.
    expect(createRun({ ...starter, department: "engineering" }, 1).weapons.map((weapon) => `${weapon.id}${weapon.level}`)).toEqual(["rubberDuck1"]);
  });

  it("leaves a build behind for the next day", () => {
    const run = createRun(starters()[0], 1);
    run.weapons.push({ id: "contract", level: 3, cooldownLeft: 0, spin: 0 });
    run.passives = { gym: 2 };
    expect(careerBuild(run)).toEqual({ weapons: { stickyNotes: 1, contract: 3 }, passives: { gym: 2 } });
  });
});

describe("normalizeCareer", () => {
  it("repairs what it can and defaults the rest", () => {
    expect(normalizeCareer(null)).toEqual(defaultCareer());
    expect(normalizeCareer({ focusId: 2.7, gold: -5 })).toEqual({ ...defaultCareer(), focusId: 2, owned: [2] });
    expect(normalizeCareer({ focusId: "x", gold: 12 })).toEqual({ ...defaultCareer(), gold: 12 });
  });

  it("keeps only known fields: legacy packs' seals and stage choices are dropped, and the build is repaired", () => {
    expect(normalizeCareer({ focusId: 1, owned: [1, 4], sealed: [4, 5], stage: "kitchen", gold: 3 })).toEqual({ ...defaultCareer(), focusId: 1, owned: [1, 4], gold: 3 });
    expect(normalizeCareer({ focusId: 1, build: { weapons: { stickyNotes: 9, nope: 2 }, passives: { coffee: 0.5, gym: 3 } } }).build).toEqual({ weapons: { stickyNotes: 6 }, passives: { coffee: 1, gym: 3 } });
  });

  it("always owns the focus, once, and drops bad ids", () => {
    expect(normalizeCareer({ focusId: 3, owned: [5, 3, "x", 5, -1], gold: 0 }).owned).toEqual([3, 5]);
  });
});

describe("interviews", () => {
  it("give each card the same boss every time, spread over all three", () => {
    expect(interviewBossFor(7)).toBe(interviewBossFor(7));
    expect(new Set([4, 5, 6].map(interviewBossFor)).size).toBe(INTERVIEW_BOSSES.length);
  });

  it("scale at half the day's pace", () => {
    expect(interviewDifficultyFor(1)).toBe(1);
    expect(interviewDifficultyFor(11) - 1).toBeCloseTo((difficultyFor(11) - 1) / 2);
  });
});

describe("perks", () => {
  const [coworker] = starters();
  const promoted = { ...coworker, level: REVIEW.levelsPerRank + 1 };

  it("wait for a promotion: none at the first rank, one per rank after", () => {
    expect(perksPending(coworker)).toBe(0);
    expect(perksPending(promoted)).toBe(1);
    expect(perksPending({ ...promoted, level: 2 * REVIEW.levelsPerRank + 1 })).toBe(2);
    expect(perksPending({ ...promoted, perks: ["secondWind"] })).toBe(0);
  });

  it("are offered three at a time, the same three until one is taken, and never one already owned", () => {
    const offer = perkOffer(promoted);
    expect(offer).toHaveLength(REVIEW.perksOffered);
    expect(new Set(offer).size).toBe(offer.length);
    expect(perkOffer(promoted)).toEqual(offer);
    const next = perkOffer({ ...promoted, perks: [offer[0]], level: 2 * REVIEW.levelsPerRank + 1 });
    expect(next).not.toContain(offer[0]);
  });

  it("are taken from the offer only, and only when a promotion is waiting", () => {
    const [first] = perkOffer(promoted);
    expect(choosePerk(promoted, first)?.perks).toEqual([first]);
    expect(choosePerk(coworker, first)).toBeNull();
    const other = (["coffeeRun", "gymPass", "freshSneakers", "mentorship", "overtime", "cornerOffice", "secondWind"] as const).find((perk) => !perkOffer(promoted).includes(perk))!;
    expect(choosePerk(promoted, other)).toBeNull();
    expect(choosePerk({ ...promoted, perks: [first] }, perkOffer(promoted)[1])).toBeNull();
  });

  it("make the office tougher, each by its own cost", () => {
    expect(difficultyFor(6, "common", ["overtime"])).toBeCloseTo(difficultyFor(6) + PERK_DIFFICULTY.overtime);
    expect(difficultyFor(6, "common", ["overtime", "gymPass"])).toBeCloseTo(difficultyFor(6) + PERK_DIFFICULTY.overtime + PERK_DIFFICULTY.gymPass);
    expect(interviewDifficultyFor(6, "common", ["overtime"])).toBeGreaterThan(interviewDifficultyFor(6));
  });
});

describe("Intern onboarding", () => {
  it("starts an unselected save without resetting its gold or cards", () => {
    const roster = defaultSave();
    const career = { ...defaultCareer(), gold: 42 };
    expect(withCareerFocus(roster, career)).toEqual({ ...career, focusId: 1, owned: [1] });
    expect(career.focusId).toBeNull();
  });

  it("preserves a valid existing focus and recovers missing focus from owned active cards", () => {
    const roster = defaultSave();
    const career = { ...defaultCareer(), focusId: 2, owned: [2, 3], gold: 42 };
    expect(withCareerFocus(roster, career, 1)).toBe(career);
    roster.coworkers[1].status = { kind: "quit", day: 1 };
    expect(withCareerFocus(roster, career).focusId).toBe(3);
  });
});

describe("promotion tradeoff disclosure", () => {
  it.each(PERK_IDS)("matches unchanged day and interview health/spawn calculations for %s", (perk) => {
    const worker = { ...starters()[0], level: 16, rarity: "rare" as const, perks: PERK_IDS.filter((id) => id !== perk).slice(0, 2) };
    const before = difficultyFor(worker.level, worker.rarity, worker.perks);
    const next = difficultyFor(worker.level, worker.rarity, [...worker.perks, perk]);
    const interviewBefore = interviewDifficultyFor(worker.level, worker.rarity, worker.perks);
    const interviewNext = interviewDifficultyFor(worker.level, worker.rarity, [...worker.perks, perk]);
    const actual = promotionTradeoff(worker, perk);
    expect(next - before).toBeCloseTo(PERK_DIFFICULTY[perk]);
    expect(actual.day.health).toBeCloseTo((next / before - 1) * 100);
    expect(actual.day.spawns).toBeCloseTo(((next + 1) / (before + 1) - 1) * 100);
    expect(actual.interview.health).toBeCloseTo((interviewNext / interviewBefore - 1) * 100);
    expect(actual.interview.spawns).toBeCloseTo(((interviewNext + 1) / (interviewBefore + 1) - 1) * 100);
    expect(worker.perks).not.toContain(perk);
  });
});
