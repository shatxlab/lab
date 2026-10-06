import { describe, expect, it } from "vitest";

import {
  applyPoints,
  clampRoundSeconds,
  clampTargetScore,
  clampTeamCount,
  defaultSettings,
  defaultTeamName,
  defaultTeams,
  makeTeam,
  nextTeam,
  rankTeams,
  resolveWinner,
  turnPoints,
} from "@/lib/alias/game";
import type { TurnWord } from "@/lib/alias/types";

const words: TurnWord[] = [
  { word: "apple", correct: true },
  { word: "pear", correct: true },
  { word: "plum", correct: false },
];

describe("alias scoring", () => {
  it("scores +1 per guess and subtracts the skip penalty", () => {
    expect(turnPoints(words, 1)).toBe(1);
    expect(turnPoints(words, 0)).toBe(2);
    expect(turnPoints(words, 2)).toBe(0);
  });

  it("applies points to a team without mutating it", () => {
    const team = makeTeam("t1", "Sharks", "#fff", 4);
    const next = applyPoints(team, 3);
    expect(next.score).toBe(7);
    expect(team.score).toBe(4);
  });

  it("finds the first team to reach the target and ranks the rest", () => {
    const teams = [
      makeTeam("a", "A", "#111", 9),
      makeTeam("b", "B", "#222", 12),
      makeTeam("c", "C", "#333", 12),
    ];
    expect(resolveWinner(teams, 10)?.score).toBe(12);
    expect(resolveWinner(teams, 20)).toBeNull();
    expect(rankTeams(teams).map((team) => team.id)).toEqual(["b", "c", "a"]);
  });
});

describe("alias setup helpers", () => {
  it("creates two named teams per language", () => {
    expect(defaultTeams("en").map((team) => team.name)).toEqual(["Team 1", "Team 2"]);
    expect(defaultTeams("ru").map((team) => team.name)).toEqual(["Команда 1", "Команда 2"]);
  });

  it("cycles the palette as teams are added", () => {
    const existing = defaultTeams("en");
    const third = nextTeam("en", existing);
    expect(third.name).toBe("Team 3");
    expect(existing).toHaveLength(2);
  });

  it("falls back to a numbered default name", () => {
    expect(defaultTeamName("en", 0)).toBe("Team 1");
    expect(defaultTeamName("ru", 1)).toBe("Команда 2");
  });

  it("clamps numeric settings into a safe range", () => {
    expect(clampRoundSeconds(-10)).toBe(10);
    expect(clampRoundSeconds(9999)).toBe(300);
    expect(clampRoundSeconds(Number.NaN)).toBe(60);
    expect(clampTargetScore(1)).toBe(5);
    expect(clampTargetScore(9999)).toBe(200);
    expect(clampTeamCount(0)).toBe(2);
    expect(clampTeamCount(99)).toBe(8);
  });

  it("starts on English with a 60 second round", () => {
    expect(defaultSettings()).toMatchObject({ lang: "en", roundSeconds: 60, skipPenalty: 1 });
  });
});
