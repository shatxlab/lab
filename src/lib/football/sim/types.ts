export type Role = "GK" | "DF" | "MF" | "FW";
export type StatKey = "pace" | "shooting" | "passing" | "tackling" | "dribbling" | "keeping" | "stamina";
/** Every stat runs 1 to 10. */
export type Stats = Record<StatKey, number>;
export type Team = 0 | 1;

/** One man on a squad sheet; a match turns him into a `Body`. */
export interface Footballer {
  id: number;
  name: string;
  role: Role;
  stats: Stats;
}

/** How a side plays, both 0 to 1: how far up it presses, and how readily it goes forward over keeping the ball. */
export interface Tactics {
  press: number;
  risk: number;
}

export interface Side {
  name: string;
  /** Index into the shirt ramps; the sprites are tinted with it. */
  kit: number;
  /** Eight men, in the order of `SLOTS`. */
  players: Footballer[];
  tactics: Tactics;
}

/** A footballer on the pitch. Positions are world units; team 0 attacks towards x = W. */
export interface Body {
  id: number;
  name: string;
  team: Team;
  slot: number;
  role: Role;
  stats: Stats;
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  stun: number;
  tackleCd: number;
  thinkIn: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Index into `Match.players` of whoever has it, if anyone. */
  owner: number | null;
  /** The man a pass is meant for. */
  target: number | null;
  kick: "pass" | "shot" | null;
  /** The last man to touch it. */
  last: number | null;
  /** Opponents who already had a go at stopping this kick. */
  touched: number[];
  /** The kicker can't take it back until this many seconds have passed. */
  lock: number;
}

export type RestartKind = "kickoff" | "throw" | "goalkick" | "corner";

/** The ball is dead at a spot until `taker` gets there. */
export interface Restart {
  kind: RestartKind;
  team: Team;
  x: number;
  y: number;
  taker: number;
  wait: number;
}

export type MoveKind = "shoot" | "pass" | "dribble";

export interface Choice {
  kind: MoveKind;
  /** The man a pass goes to (index into `Match.players`). */
  to?: number;
  /** Odds it comes off: a pass reaching its man, a shot ending in a goal, a dribble getting through. */
  chance: number;
  /** How much the bot likes it. */
  score: number;
}

/** The game pauses on one of these while the player picks what the man on the ball does. */
export interface Moment {
  carrier: number;
  choices: Choice[];
}

export type EventKind = "goal" | "save" | "miss" | "tackle" | "intercept" | "block" | "half" | "full";

export interface MatchEvent {
  t: number;
  kind: EventKind;
  team: Team;
  /** Index into `Match.players`, when one man is the story. */
  who?: number;
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  /** What the odds shown at each shot add up to: goals the chances were worth. */
  xg: number;
  passes: number;
  passesDone: number;
  tackles: number;
  possession: number;
}

export interface Match {
  rng: number;
  /** Seconds played. */
  t: number;
  half: 0 | 1;
  sides: [Side, Side];
  players: Body[];
  ball: Ball;
  score: [number, number];
  restart: Restart | null;
  moment: Moment | null;
  /** Seconds until the next moment may come up. */
  momentCd: number;
  /** The side the player calls moments for; null when the bot plays both. */
  human: Team | null;
  over: boolean;
  events: MatchEvent[];
  stats: [TeamStats, TeamStats];
}
