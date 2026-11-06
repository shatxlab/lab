import { describe, expect, it } from "vitest";

import {
  applyPoints,
  clampRoundSeconds,
  clampTargetScore,
  clampTeamCount,
  defaultSettings,
  defaultTeamName,
  defaultTeams,
  isRoundComplete,
  makeTeam,
  nextTeam,
  rankTeams,
  resolveWinner,
  roundLeaders,
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

  it("picks the highest score at or above the target and ranks the rest", () => {
    const teams = [
      makeTeam("a", "A", "#111", 9),
      makeTeam("b", "B", "#222", 12),
      makeTeam("c", "C", "#333", 12),
    ];
    expect(resolveWinner(teams, 10)).toBeNull();
    expect(roundLeaders(teams, 10).map((team) => team.id)).toEqual(["b", "c"]);
    expect(resolveWinner(teams, 20)).toBeNull();
    expect(rankTeams(teams).map((team) => team.id)).toEqual(["b", "c", "a"]);
  });


  it.each([29, 30, 31, 32, 33])("compares 32 with %i only at the end of a full round", (secondScore) => {
    const teams = [makeTeam("a", "A", "#111", 32), makeTeam("b", "B", "#222", secondScore)];
    const expected = secondScore === 32 ? null : secondScore > 32 ? "b" : "a";
    expect(resolveWinner(teams, 30)?.id ?? null).toBe(expected);
    expect(resolveWinner([...teams].reverse(), 30)?.id ?? null).toBe(expected);
  });

  it("requires a unique eligible leader, including multi-way ties and empty games", () => {
    const teams = ["a", "b", "c"].map((id) => makeTeam(id, id, "#111", 32));
    expect(resolveWinner(teams, 30)).toBeNull();
    expect(resolveWinner(teams, 40)).toBeNull();
    expect(resolveWinner([], 30)).toBeNull();
    expect(resolveWinner(teams.map((team) => team.id === "c" ? applyPoints(team, 1) : team), 30)?.id).toBe("c");
  });

  it("only completes a round after the last team has played", () => {
    expect(isRoundComplete(0, 3)).toBe(false);
    expect(isRoundComplete(1, 3)).toBe(false);
    expect(isRoundComplete(2, 3)).toBe(true);
    expect(isRoundComplete(0, 2)).toBe(false);
    expect(isRoundComplete(1, 2)).toBe(true);
    expect(isRoundComplete(0, 0)).toBe(false);
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
