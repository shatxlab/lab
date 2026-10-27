import type { Role, Stats } from "./types";

/** The pitch, in world units: team 0 attacks towards x = W. */
export const W = 100;
export const H = 64;
export const MID = H / 2;
/** Half the width of a goal mouth. */
export const GOAL_HALF = 6;

export const STEP = 0.05;
export const HALF_SECONDS = 60;
export const MATCH_SECONDS = HALF_SECONDS * 2;

/** The eight places in a 1-2-3-2, in the team's own frame (x counted from its own goal line). */
export const SLOTS: readonly { role: Role; x: number; y: number }[] = [
  { role: "GK", x: 3, y: MID },
  { role: "DF", x: 22, y: 18 },
  { role: "DF", x: 22, y: 46 },
  { role: "MF", x: 45, y: 12 },
  { role: "MF", x: 45, y: 32 },
  { role: "MF", x: 45, y: 52 },
  { role: "FW", x: 70, y: 22 },
  { role: "FW", x: 70, y: 42 },
];
export const KICKOFF_SLOT = 6;

/** How far each role follows the ball up and down the pitch, and how far it pushes up when its side has it. */
export const FOLLOW: Record<Role, number> = { GK: 0.1, DF: 0.5, MF: 0.6, FW: 0.5 };
export const PUSH: Record<Role, number> = { GK: 0, DF: 6, MF: 10, FW: 14 };

export const PASS_SPEED_MAX = 50;
export const SHOT_SPEED = 52;
/** Per second, the share of its speed a rolling ball keeps. */
export const BALL_FRICTION = 0.5;

export const TACKLE_RANGE = 2;
export const TRAP_RANGE = 2.2;
export const PICKUP_RANGE = 1.7;

/** A moment can come up once the man on the ball is this far up the pitch (0 to 100, own frame), and no more often than the cooldown. */
export const MOMENT_FROM = 62;
export const MOMENT_COOLDOWN = 7;

export function speedOf(stats: Stats, role: Role): number {
  return (9 + stats.pace * 0.9) * (role === "GK" ? 0.9 : 1);
}
