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
/** A shot the player aimed is this much less wild than one the bot aims. */
export const AIMED_SPREAD = 0.55;
/** A keeper's reach shrinks towards the posts: this much of it at the centre of the goal, and this much less by a post. */
export const REACH_CENTRE = 1.15;
export const REACH_LOSS = 0.45;
/** Per second, the share of its speed a rolling ball keeps. */
export const BALL_FRICTION = 0.5;

export const TACKLE_RANGE = 2;
export const TRAP_RANGE = 2.2;
export const PICKUP_RANGE = 1.7;

/** A moment can come up once the man on the ball is this far up the pitch (0 to 100, own frame), and no more often than the cooldown. */
export const MOMENT_FROM = 62;
export const MOMENT_COOLDOWN = 5;
/** After a pass the player called lands with a teammate, the next call can come this soon. */
export const CHAIN_COOLDOWN = 0.8;

export function speedOf(stats: Stats, role: Role): number {
  return (9 + stats.pace * 0.9) * (role === "GK" ? 0.9 : 1);
}

/**
 * Aiming a shot: a marker sweeps back and forth across the goal mouth and the player taps to lock it. -1 and 1 are
 * the posts, so the ends of the sweep are wide; the keeper can't reach the corners but he does reach the middle.
 */
export const AIM_RANGE = 1.25;
export const AIM_PERIOD = 1.3;
/** Seconds the player has to tap before the bot takes the shot. */
export const AIM_LIMIT = 4;

export function aimAt(seconds: number): number {
  return AIM_RANGE * Math.sin((seconds / AIM_PERIOD) * Math.PI * 2);
}

export type AimTone = "wide" | "covered" | "near" | "open";

/** How much further out than the keeper's sure reach his fingertips still count, in aim units. */
const NEAR_BAND = 0.4;

/**
 * The stretches of the sweep, from one end to the other, for drawing the aim: red where the keeper is, amber
 * where he might get a hand to it, green where he can't, and out past the posts, wide. `centre` and `half` are
 * what `keeperCover` says about the keeper.
 */
export function aimZones(centre: number, half: number): { from: number; to: number; tone: AimTone }[] {
  const marks = [-AIM_RANGE, -1, 1, AIM_RANGE, centre - half, centre + half, centre - half - NEAR_BAND, centre + half + NEAR_BAND]
    .map((mark) => Math.max(-AIM_RANGE, Math.min(AIM_RANGE, mark)))
    .sort((a, b) => a - b);
  const zones: { from: number; to: number; tone: AimTone }[] = [];
  for (let i = 0; i < marks.length - 1; i += 1) {
    const from = marks[i];
    const to = marks[i + 1];
    if (to - from < 1e-6) continue;
    const mid = (from + to) / 2;
    const away = Math.abs(mid - centre);
    const tone: AimTone = Math.abs(mid) > 1 ? "wide" : away <= half ? "covered" : away <= half + NEAR_BAND ? "near" : "open";
    const last = zones.at(-1);
    if (last && last.tone === tone) last.to = to;
    else zones.push({ from, to, tone });
  }
  return zones;
}
