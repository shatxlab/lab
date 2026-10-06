import type { AliasSettings, Lang, Team, TurnWord } from "./types";

/** Palette cycled through when teams are created. */
export const TEAM_COLORS = [
  "#667eea",
  "#f85032",
  "#11998e",
  "#f7971e",
  "#8e2de2",
  "#2193b0",
  "#ee0979",
  "#2f855a",
] as const;

export const ROUND_SECONDS_OPTIONS = [30, 45, 60, 90, 120] as const;
export const TARGET_SCORE_OPTIONS = [10, 20, 30, 50, 70] as const;
export const SKIP_PENALTY_OPTIONS = [0, 1, 2] as const;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;
export const MAX_ROUND_SECONDS = 300;
export const MAX_TARGET_SCORE = 200;

let teamCounter = 0;

export function createTeamId(): string {
  teamCounter += 1;
  return `team-${Date.now().toString(36)}-${teamCounter.toString(36)}`;
}

export function makeTeam(
  id: string,
  name: string,
  color: string,
  score = 0,
): Team {
  return { id, name, color, score };
}

export function defaultTeamName(lang: Lang, index: number): string {
  const names: Record<Lang, string[]> = {
    en: ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6", "Team 7", "Team 8"],
    ru: [
      "Команда 1",
      "Команда 2",
      "Команда 3",
      "Команда 4",
      "Команда 5",
      "Команда 6",
      "Команда 7",
      "Команда 8",
    ],
  };
  const list = names[lang] ?? names.en;
  return list[index] ?? list[list.length - 1];
}

/** Two ready-to-play teams. */
export function defaultTeams(lang: Lang): Team[] {
  return [0, 1].map((index) =>
    makeTeam(createTeamId(), defaultTeamName(lang, index), TEAM_COLORS[index % TEAM_COLORS.length]),
  );
}

/** Build a fresh team, cycling through the palette by position. */
export function nextTeam(lang: Lang, existing: readonly Team[]): Team {
  const index = existing.length;
  return makeTeam(
    createTeamId(),
    defaultTeamName(lang, index),
    TEAM_COLORS[index % TEAM_COLORS.length],
  );
}

export function clampTeamCount(count: number): number {
  return Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(count)));
}

export function clampRoundSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60;
  return Math.min(MAX_ROUND_SECONDS, Math.max(10, Math.round(seconds)));
}

export function clampTargetScore(score: number): number {
  if (!Number.isFinite(score)) return 30;
  return Math.min(MAX_TARGET_SCORE, Math.max(5, Math.round(score)));
}

/** Points for a turn: +1 per guessed word, minus the skip penalty per skip. */
export function turnPoints(words: readonly TurnWord[], skipPenalty: number): number {
  return words.reduce((sum, entry) => sum + (entry.correct ? 1 : -skipPenalty), 0);
}

export function applyPoints(team: Team, points: number): Team {
  return { ...team, score: team.score + points };
}

/**
 * True when the turn that just ended was the last of a round, i.e. every team
 * has played the same number of turns. Turns run in fixed order starting at
 * index 0, so the last team's turn completes the round.
 */
export function isRoundComplete(activeIndex: number, teamCount: number): boolean {
  return teamCount > 0 && activeIndex === teamCount - 1;
}

/**
 * Highest-scoring team among those that reached the target; ties keep the
 * earlier team. Used once a full round has been played so that turn order no
 * longer decides the winner.
 */
export function resolveWinner(teams: readonly Team[], targetScore: number): Team | null {
  const reached = teams.filter((team) => team.score >= targetScore);
  if (reached.length === 0) return null;
  return reached.reduce((best, team) => (team.score > best.score ? team : best), reached[0]);
}

export function rankTeams(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) => b.score - a.score);
}

export function teamById(teams: readonly Team[], id: string): Team | null {
  return teams.find((team) => team.id === id) ?? null;
}

export function defaultSettings(): AliasSettings {
  return {
    lang: "en",
    themeId: "everyday",
    roundSeconds: 60,
    targetScore: 30,
    skipPenalty: 1,
    sound: true,
  };
}
