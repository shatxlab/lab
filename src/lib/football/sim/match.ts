import { random } from "@/lib/tower/sim/random";
import {
  AIMED_SPREAD,
  BALL_FRICTION,
  CHAIN_COOLDOWN,
  FOLLOW,
  GOAL_HALF,
  H,
  HALF_SECONDS,
  KICKOFF_SLOT,
  MATCH_SECONDS,
  MID,
  MOMENT_COOLDOWN,
  MOMENT_FROM,
  PASS_SPEED_MAX,
  PICKUP_RANGE,
  PUSH,
  REACH_CENTRE,
  REACH_LOSS,
  SHOT_SPEED,
  SLOTS,
  speedOf,
  STEP,
  TACKLE_RANGE,
  TRAP_RANGE,
  W,
} from "./balance";
import type { Body, Choice, EventKind, Match, Restart, RestartKind, Side, Team, TeamStats } from "./types";

export { STEP };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
const emptyStats = (): TeamStats => ({ shots: 0, onTarget: 0, xg: 0, passes: 0, passesDone: 0, tackles: 0, possession: 0 });

/** x in the team's own frame: 0 at its own goal line, 100 at the one it attacks. */
const frame = (team: Team, x: number): number => (team === 0 ? x : W - x);
const goalLine = (team: Team): number => (team === 0 ? W : 0);
const dirOf = (team: Team): number => (team === 0 ? 1 : -1);
const other = (team: Team): Team => (team === 0 ? 1 : 0);

/** Roughly normal with a standard deviation of 1. */
function gauss(m: Match): number {
  return (random(m) + random(m) + random(m) - 1.5) * 2;
}

function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}
const cdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

export function createMatch(sides: [Side, Side], seed: number, human: Team | null = 0): Match {
  const players: Body[] = [];
  for (const team of [0, 1] as const) {
    sides[team].players.forEach((footballer, slot) => {
      players.push({
        id: footballer.id,
        name: footballer.name,
        team,
        slot,
        role: footballer.role,
        stats: footballer.stats,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        energy: 1,
        stun: 0,
        tackleCd: 0,
        thinkIn: 0,
      });
    });
  }
  const m: Match = {
    rng: seed,
    t: 0,
    half: 0,
    sides,
    players,
    ball: { x: W / 2, y: MID, vx: 0, vy: 0, owner: null, target: null, kick: null, last: null, touched: [], lock: 0 },
    score: [0, 0],
    restart: null,
    moment: null,
    chain: false,
    momentCd: MOMENT_COOLDOWN / 2,
    human,
    over: false,
    events: [],
    stats: [emptyStats(), emptyStats()],
  };
  kickoff(m, 0);
  return m;
}

const indexOf = (team: Team, slot: number): number => team * SLOTS.length + slot;

function log(m: Match, kind: EventKind, team: Team, who?: number): void {
  m.events.push({ t: m.t, kind, team, who });
}

/** The side with the ball, or the one that kicked it if it's in the air. */
function possessor(m: Match): Team | null {
  if (m.ball.owner !== null) return m.players[m.ball.owner].team;
  if (m.ball.kick && m.ball.last !== null) return m.players[m.ball.last].team;
  return null;
}

// ---- Where everyone wants to be ----

/** A man's spot with no ball to chase: his place in the formation, shifted with the ball and with who has it. */
function anchor(m: Match, p: Body): [number, number] {
  const slot = SLOTS[p.slot];
  const tactics = m.sides[p.team].tactics;
  const ballFrame = frame(p.team, m.ball.x);
  const attacking = possessor(m) === p.team;
  let fx = slot.x + (ballFrame - 50) * FOLLOW[p.role];
  if (attacking) fx += PUSH[p.role] * (0.5 + tactics.risk);
  else if (p.role !== "GK") fx += (tactics.press - 0.5) * 10;
  fx = p.role === "GK" ? clamp(fx, 3, 12) : clamp(fx, 5, 95);
  if (m.restart?.kind === "kickoff" && m.restart.team !== p.team) fx = Math.min(fx, 47);
  const fy = slot.y + (m.ball.y - MID) * 0.3;
  return [frame(p.team, fx), clamp(fy, 3, H - 3)];
}

/** Who goes for a loose ball for this team: whoever would get there first. */
function chaserFor(m: Match, team: Team): number {
  let best = -1;
  let bestTime = Infinity;
  for (let i = 0; i < m.players.length; i += 1) {
    const p = m.players[i];
    if (p.team !== team || p.stun > 0) continue;
    if (p.role === "GK" && !(frame(team, m.ball.x) < 18 && Math.abs(m.ball.y - MID) < 16)) continue;
    const time = dist(p.x, p.y, m.ball.x, m.ball.y) / speedOf(p.stats, p.role);
    if (time < bestTime) {
      bestTime = time;
      best = i;
    }
  }
  return best;
}

function nearestOpponent(m: Match, p: Body, ahead = false): { body: Body; d: number } | null {
  let best: { body: Body; d: number } | null = null;
  for (const o of m.players) {
    if (o.team === p.team) continue;
    if (ahead && (o.x - p.x) * dirOf(p.team) < 0) continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (!best || d < best.d) best = { body: o, d };
  }
  return best;
}

function aimOf(m: Match, i: number, chaser: Record<Team, number>): [number, number, number] {
  const p = m.players[i];
  const ball = m.ball;
  const [ax, ay] = anchor(m, p);
  if (m.restart) {
    if (i === m.restart.taker) return [m.restart.x, m.restart.y, 1];
    return [ax, ay, 0.85];
  }
  if (ball.owner === i) {
    if (p.role === "GK") return [p.x, p.y, 0];
    const goal = goalLine(p.team);
    let ty = p.y + (MID - p.y) * 0.15;
    const foe = nearestOpponent(m, p, true);
    if (foe && foe.d < 9) ty += (p.y >= foe.body.y ? 1 : -1) * 7;
    return [goal, clamp(ty, 2, H - 2), 0.88];
  }
  if (p.role === "GK") {
    const incoming = ball.kick === "shot" && possessor(m) !== p.team;
    const near = frame(p.team, ball.x) < 40;
    const ty = incoming || near ? clamp(ball.y, MID - GOAL_HALF - 2, MID + GOAL_HALF + 2) : ay;
    if (chaser[p.team] === i) return [ball.x, ball.y, 1];
    return [ax, ty, incoming ? 1.35 : 1];
  }
  if (ball.target === i) return [ball.x + ball.vx * 0.3, ball.y + ball.vy * 0.3, 1];
  if (chaser[p.team] === i && ball.owner === null) return [ball.x + ball.vx * 0.4, ball.y + ball.vy * 0.4, 1];
  if (ball.owner !== null && m.players[ball.owner].team !== p.team) {
    const carrier = m.players[ball.owner];
    const tactics = m.sides[p.team].tactics;
    const reach = 14 + 20 * tactics.press;
    const ranked = m.players
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => q.team === p.team && q.role !== "GK")
      .sort((a, b) => dist(a.q.x, a.q.y, carrier.x, carrier.y) - dist(b.q.x, b.q.y, carrier.x, carrier.y));
    const pressers = tactics.press > 0.6 ? 2 : 1;
    const rank = ranked.findIndex(({ index }) => index === i);
    if (rank >= 0 && rank < pressers && dist(p.x, p.y, carrier.x, carrier.y) < reach) return [carrier.x, carrier.y, 1];
  }
  return [ax, ay, 0.85];
}

// ---- Passing and shooting ----

function passChance(m: Match, from: Body, to: Body): number {
  const d = dist(from.x, from.y, to.x, to.y);
  let chance = 0.97 - d * 0.004 - (10 - from.stats.passing) * 0.025;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy || 1;
  for (const o of m.players) {
    if (o.team === from.team) continue;
    const along = clamp(((o.x - from.x) * dx + (o.y - from.y) * dy) / len2, 0, 1);
    const gap = dist(o.x, o.y, from.x + dx * along, from.y + dy * along);
    if (gap < 3 && along > 0.08) chance -= ((3 - gap) / 3) * 0.3;
    if (dist(o.x, o.y, to.x, to.y) < 3) chance -= 0.08;
  }
  return clamp(chance, 0.05, 0.97);
}

/** How far from his line of the ball a keeper gets to it. */
const keeperReach = (keeping: number): number => 2.2 + keeping * 0.5;

/** The keeper's reach for a ball crossing the line this far from the middle of the goal: less towards the posts. */
const reachAt = (keeping: number, offset: number): number => keeperReach(keeping) * (REACH_CENTRE - REACH_LOSS * Math.min(1, Math.abs(offset) / GOAL_HALF));

/**
 * Where the keeper stands, in the units of the aim (-1 and 1 are the posts), and how far either side of that he
 * all but certainly stops it. He follows the ball's height, so he tends to stand towards the side the shot comes
 * from and the far side is the open one; measured on whole matches, shots score about a tenth of the time aimed
 * at him and about a third of the time aimed a goal-width away.
 */
export function keeperCover(m: Match, from: number): { centre: number; half: number } {
  const keeper = m.players[indexOf(other(m.players[from].team), 0)];
  return { centre: (keeper.y - MID) / GOAL_HALF, half: Math.max(0.3, Math.min(0.6, 0.28 + keeper.stats.keeping * 0.03)) };
}

/** Spread of a shot's aim, in units across the goal mouth. */
function shotSpread(p: Body, d: number): number {
  return (12 - p.stats.shooting) * 0.7 + d * 0.12;
}

/** The odds a shot from where this man stands ends in a goal. */
export function shotChance(m: Match, p: Body): number {
  const goalX = goalLine(p.team);
  const d = dist(p.x, p.y, goalX, MID);
  const keeper = m.players[indexOf(other(p.team), 0)];
  const spread = shotSpread(p, d);
  const aim = 3.5;
  const onTarget = cdf((GOAL_HALF - aim) / spread) - cdf((-GOAL_HALF - aim) / spread);
  const flight = d / SHOT_SPEED;
  const reach = reachAt(keeper.stats.keeping, aim) + speedOf(keeper.stats, "GK") * flight * 0.6;
  const saved = clamp(reach / 10.5, 0.08, 0.9);
  let blocked = 0;
  for (const o of m.players) {
    if (o.team === p.team || o.role === "GK") continue;
    const along = (o.x - p.x) * dirOf(p.team);
    if (along > 0 && along < d && Math.abs(o.y - p.y) < 2.5) blocked += 0.2;
  }
  return clamp(onTarget * (1 - saved) * (1 - Math.min(blocked, 0.6)), 0, 1);
}

function options(m: Match, i: number): Choice[] {
  const p = m.players[i];
  const tactics = m.sides[p.team].tactics;
  const choices: Choice[] = [];
  const d = dist(p.x, p.y, goalLine(p.team), MID);
  if (d <= 32) {
    const chance = shotChance(m, p);
    choices.push({ kind: "shoot", chance, score: chance * 2.1 + (d < 12 ? 0.2 : 0) });
  }
  for (let j = 0; j < m.players.length; j += 1) {
    const mate = m.players[j];
    if (mate.team !== p.team || j === i || dist(p.x, p.y, mate.x, mate.y) > 48) continue;
    const chance = passChance(m, p, mate);
    const gain = (mate.x - p.x) * dirOf(p.team);
    const gainNorm = clamp(gain / 30, -0.3, 1);
    choices.push({ kind: "pass", to: j, chance, score: chance * (0.35 + gainNorm * (0.45 + 0.4 * tactics.risk)) });
  }
  if (p.role !== "GK") {
    const ahead = nearestOpponent(m, p, true);
    let pressure = 0;
    for (const o of m.players) if (o.team !== p.team && dist(p.x, p.y, o.x, o.y) < 5) pressure += 1;
    const space = clamp(((ahead?.d ?? 20) - 6) / 10, 0, 1);
    const chance = clamp(0.8 - pressure * 0.2 + (p.stats.dribbling - 5) * 0.03, 0.1, 0.95);
    choices.push({ kind: "dribble", chance, score: 0.38 - Math.min(pressure, 3) * 0.1 + space * 0.12 });
  }
  return choices;
}

function best(choices: Choice[]): Choice {
  return choices.reduce((a, b) => (b.score > a.score ? b : a));
}

function release(m: Match, from: number, vx: number, vy: number, kick: "pass" | "shot", target: number | null): void {
  const ball = m.ball;
  const p = m.players[from];
  ball.owner = null;
  ball.x = p.x;
  ball.y = p.y;
  ball.vx = vx;
  ball.vy = vy;
  ball.kick = kick;
  ball.target = target;
  ball.last = from;
  ball.touched = [];
  ball.lock = 0.35;
}

function kickPass(m: Match, from: number, to: number): void {
  const p = m.players[from];
  const mate = m.players[to];
  const d = dist(p.x, p.y, mate.x, mate.y);
  const speed = clamp(d * 0.9 + 10, 24, PASS_SPEED_MAX);
  const lead = d / speed;
  const spread = (11 - p.stats.passing) * 0.12 + d * 0.02;
  const tx = mate.x + mate.vx * lead * 0.7 + gauss(m) * spread;
  const ty = mate.y + mate.vy * lead * 0.7 + gauss(m) * spread;
  const len = dist(p.x, p.y, tx, ty) || 1;
  m.stats[p.team].passes += 1;
  release(m, from, ((tx - p.x) / len) * speed, ((ty - p.y) / len) * speed, "pass", to);
}

/** `aim` is where across the goal mouth the player put it: -1 is one post, 1 the other, beyond that is wide. */
function kickShot(m: Match, from: number, aim?: number): void {
  const p = m.players[from];
  const goalX = goalLine(p.team);
  const d = dist(p.x, p.y, goalX, MID);
  const ty =
    aim === undefined
      ? MID + (random(m) < 0.5 ? -1 : 1) * 3.5 + gauss(m) * shotSpread(p, d)
      : MID + clamp(aim, -1.5, 1.5) * GOAL_HALF + gauss(m) * shotSpread(p, d) * AIMED_SPREAD;
  const len = dist(p.x, p.y, goalX, ty) || 1;
  m.stats[p.team].shots += 1;
  m.stats[p.team].xg += shotChance(m, p);
  if (Math.abs(ty - MID) < GOAL_HALF) m.stats[p.team].onTarget += 1;
  release(m, from, ((goalX - p.x) / len) * SHOT_SPEED, ((ty - p.y) / len) * SHOT_SPEED, "shot", null);
}

function apply(m: Match, i: number, choice: Choice, aim?: number): void {
  const p = m.players[i];
  if (choice.kind === "shoot") kickShot(m, i, aim);
  else if (choice.kind === "pass" && choice.to !== undefined) kickPass(m, i, choice.to);
  else p.thinkIn = 0.4 + random(m) * 0.15;
}

/** A copy of the match to play forward without touching the real one. Everything the sim changes is copied. */
function cloneMatch(m: Match, seed: number): Match {
  return {
    ...m,
    rng: seed,
    human: null,
    moment: null,
    chain: false,
    events: [],
    players: m.players.map((p) => ({ ...p })),
    ball: { ...m.ball, touched: [...m.ball.touched] },
    score: [m.score[0], m.score[1]],
    restart: m.restart ? { ...m.restart } : null,
    stats: [{ ...m.stats[0] }, { ...m.stats[1] }],
  };
}

const FORECAST_RUNS = 12;

/**
 * The odds of a choice, found by playing it out on copies of the match: a pass that ends with the ball still
 * ours, a shot that ends in a goal, a run that doesn't lose the ball in the next second and a half. It's the sim
 * itself answering, defenders chasing and all, so the numbers on the buttons are what happens.
 */
function forecast(m: Match, i: number, choice: Choice): number {
  const team = m.players[i].team;
  let kept = 0;
  for (let run = 0; run < FORECAST_RUNS; run += 1) {
    const c = cloneMatch(m, m.rng + 7919 * (run + 1));
    const goals = c.score[team];
    apply(c, i, choice);
    if (choice.kind === "dribble") c.players[i].thinkIn = 1.5;
    const steps = choice.kind === "dribble" ? 30 : 60;
    let ok = false;
    for (let n = 0; n < steps; n += 1) {
      step(c);
      if (c.score[team] > goals) {
        ok = choice.kind === "shoot";
        break;
      }
      if (choice.kind !== "dribble" && c.ball.kick === null) {
        ok = choice.kind === "pass" && !c.restart && c.ball.owner !== null && c.players[c.ball.owner].team === team;
        break;
      }
      if (choice.kind === "dribble" && n === steps - 1) ok = c.ball.owner !== null && c.players[c.ball.owner].team === team;
    }
    if (ok) kept += 1;
  }
  return kept / FORECAST_RUNS;
}

/**
 * What a moment offers the player. Every candidate is forecast, then the offer is a real trade-off rather than
 * three versions of the same pass: the safest ball, the one that leads to the best chance if it lands, and the
 * best of the two together; plus the shot, if there is one, and running with it.
 */
function offerFor(m: Match, i: number, choices: Choice[]): Choice[] {
  const p = m.players[i];
  const candidates = [
    ...choices.filter((choice) => choice.kind === "shoot"),
    ...choices.filter((choice) => choice.kind === "dribble"),
    ...choices
      .filter((choice) => choice.kind === "pass")
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
  ];
  for (const choice of candidates) {
    const guess = Math.max(0.05, choice.chance);
    choice.chance = forecast(m, i, choice);
    choice.score *= choice.chance / guess;
    choice.reward = choice.kind === "pass" && choice.to !== undefined ? shotChance(m, m.players[choice.to]) : choice.kind === "shoot" ? choice.chance : 0;
  }
  const passes = candidates.filter((choice) => choice.kind === "pass");
  const gain = (choice: Choice): number => (m.players[choice.to ?? i].x - p.x) * dirOf(p.team);
  const top = (rank: (choice: Choice) => number): Choice | undefined => passes.reduce<Choice | undefined>((a, b) => (!a || rank(b) > rank(a) ? b : a), undefined);
  const picked: Choice[] = [];
  const add = (choice: Choice | undefined) => {
    if (choice && !picked.includes(choice)) picked.push(choice);
  };
  add(top((choice) => choice.chance + gain(choice) * 0.002));
  add(top((choice) => (choice.reward ?? 0) + choice.chance * 0.01));
  add(top((choice) => choice.chance * (choice.reward ?? 0) + (picked.includes(choice) ? -1 : 0)));
  for (const choice of [...passes].sort((a, b) => b.score - a.score)) if (picked.length < 3) add(choice);
  picked.sort((a, b) => b.chance - a.chance);
  // A run with no hope isn't worth a button; the shot stays, because aiming it changes its odds.
  const run = candidates.filter((choice) => choice.kind === "dribble" && (choice.chance >= 0.1 || picked.length === 0));
  return [...candidates.filter((choice) => choice.kind === "shoot"), ...picked, ...run];
}

function decide(m: Match, i: number): void {
  const p = m.players[i];
  const choices = options(m, i);
  if (m.human === p.team && m.momentCd <= 0 && p.role !== "GK" && frame(p.team, p.x) >= MOMENT_FROM) {
    m.moment = { carrier: i, choices: offerFor(m, i, choices) };
    m.momentCd = MOMENT_COOLDOWN;
    return;
  }
  for (const choice of choices) choice.score += (random(m) - 0.5) * 0.1;
  apply(m, i, best(choices));
}

/**
 * Settle the moment the game is paused on. `index` is the choice the player made; null lets the bot pick (when
 * the player's time runs out, say). A shot takes the `aim` the player set, or the bot's if there is none.
 */
export function choose(m: Match, index: number | null, aim?: number): void {
  const moment = m.moment;
  if (!moment) return;
  m.moment = null;
  const choice = (index !== null ? moment.choices[index] : undefined) ?? best(moment.choices);
  if (m.ball.owner === moment.carrier) {
    apply(m, moment.carrier, choice, aim);
    m.chain = choice.kind === "pass";
  }
}

// ---- Possession, restarts, goals ----

function takeBall(m: Match, i: number): void {
  const ball = m.ball;
  const p = m.players[i];
  if (m.chain) {
    m.chain = false;
    if (m.human === p.team) m.momentCd = Math.min(m.momentCd, CHAIN_COOLDOWN);
  }
  if (ball.kick === "pass" && ball.last !== null && m.players[ball.last].team === p.team) m.stats[p.team].passesDone += 1;
  ball.owner = i;
  ball.target = null;
  ball.kick = null;
  ball.last = i;
  ball.vx = 0;
  ball.vy = 0;
  p.thinkIn = 0.3 + (11 - p.stats.dribbling) * 0.03;
}

function setRestart(m: Match, kind: RestartKind, team: Team, x: number, y: number): void {
  const ball = m.ball;
  ball.owner = null;
  ball.kick = null;
  ball.target = null;
  ball.vx = 0;
  ball.vy = 0;
  ball.x = x;
  ball.y = y;
  let taker = -1;
  let bestD = Infinity;
  for (let i = 0; i < m.players.length; i += 1) {
    const p = m.players[i];
    if (p.team !== team) continue;
    if ((kind === "goalkick") !== (p.role === "GK")) continue;
    const d = dist(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      taker = i;
    }
  }
  const restart: Restart = { kind, team, x, y, taker, wait: 0 };
  m.restart = restart;
}

function resetPositions(m: Match): void {
  for (const p of m.players) {
    [p.x, p.y] = anchor(m, p);
    p.vx = 0;
    p.vy = 0;
    p.stun = 0;
  }
}

function kickoff(m: Match, team: Team): void {
  m.ball.x = W / 2;
  m.ball.y = MID;
  m.ball.last = null;
  m.restart = { kind: "kickoff", team, x: W / 2, y: MID, taker: indexOf(team, KICKOFF_SLOT), wait: 0 };
  m.ball.owner = null;
  m.ball.kick = null;
  m.ball.target = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  resetPositions(m);
  const taker = m.players[m.restart.taker];
  taker.x = W / 2 - dirOf(team) * 1.2;
  taker.y = MID;
}

function runRestart(m: Match, dt: number): void {
  const r = m.restart;
  if (!r) return;
  r.wait += dt;
  const taker = m.players[r.taker];
  const ready = dist(taker.x, taker.y, r.x, r.y) < 1.2 && r.wait > (r.kind === "kickoff" ? 1.2 : 0.6);
  if (!ready && r.wait < 5) return;
  taker.x = r.x;
  taker.y = r.y;
  m.restart = null;
  takeBall(m, r.taker);
  taker.thinkIn = 0.5;
}

function scored(m: Match, team: Team): void {
  m.score[team] += 1;
  log(m, "goal", team, m.ball.last ?? undefined);
  kickoff(m, other(team));
}

/** The ball crossed a goal line or touchline while loose. */
function outOfPlay(m: Match): void {
  const ball = m.ball;
  const last = ball.last !== null ? m.players[ball.last].team : 0;
  if (ball.x <= 0 || ball.x >= W) {
    const defending: Team = ball.x >= W ? 1 : 0;
    const crossed = Math.abs(ball.y - MID) < GOAL_HALF;
    if (crossed) {
      const keeper = m.players[indexOf(defending, 0)];
      const flight = ball.kick === "shot";
      const reach = reachAt(keeper.stats.keeping, ball.y - MID);
      if (Math.abs(keeper.y - ball.y) < reach) {
        if (flight) log(m, "save", defending, indexOf(defending, 0));
        takeBall(m, indexOf(defending, 0));
        keeper.thinkIn = 0.9;
        ball.x = keeper.x;
        ball.y = keeper.y;
        return;
      }
      scored(m, other(defending));
      return;
    }
    if (ball.kick === "shot") log(m, "miss", other(defending), ball.last ?? undefined);
    if (last === defending) {
      setRestart(m, "corner", other(defending), ball.x >= W ? W - 1 : 1, ball.y < MID ? 1 : H - 1);
    } else {
      setRestart(m, "goalkick", defending, ball.x >= W ? W - 5 : 5, MID);
    }
    return;
  }
  setRestart(m, "throw", other(last), clamp(ball.x, 2, W - 2), ball.y < 0 ? 0.5 : H - 0.5);
}

// ---- One tick ----

function movePlayers(m: Match, dt: number): void {
  const chaser: Record<Team, number> = { 0: chaserFor(m, 0), 1: chaserFor(m, 1) };
  // Everyone reads where the others already are, so alternate who goes first and neither side always reacts to the other.
  const flip = Math.round(m.t / STEP) % 2 === 1;
  for (let n = 0; n < m.players.length; n += 1) {
    const i = flip ? m.players.length - 1 - n : n;
    const p = m.players[i];
    if (p.stun > 0) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    const [tx, ty, sprint] = aimOf(m, i, chaser);
    const d = dist(p.x, p.y, tx, ty);
    const speed = speedOf(p.stats, p.role) * (0.65 + 0.35 * p.energy) * sprint;
    const step = Math.min(d, speed * dt);
    const ux = d > 0.05 ? (tx - p.x) / d : 0;
    const uy = d > 0.05 ? (ty - p.y) / d : 0;
    p.x = clamp(p.x + ux * step, 0.5, W - 0.5);
    p.y = clamp(p.y + uy * step, 0.5, H - 0.5);
    p.vx = ux * speed * (d > 0.3 ? 1 : 0);
    p.vy = uy * speed * (d > 0.3 ? 1 : 0);
    if (d > 0.3) p.energy = Math.max(0.25, p.energy - dt * (0.0035 + (10 - p.stats.stamina) * 0.0007) * sprint);
  }
  // Keep them from standing inside each other.
  for (let a = 0; a < m.players.length; a += 1) {
    for (let b = a + 1; b < m.players.length; b += 1) {
      const pa = m.players[a];
      const pb = m.players[b];
      const d = dist(pa.x, pa.y, pb.x, pb.y);
      if (d < 1.2 && d > 0.001) {
        const push = (1.2 - d) * 0.5;
        const nx = (pa.x - pb.x) / d;
        const ny = (pa.y - pb.y) / d;
        pa.x = clamp(pa.x + nx * push, 0.5, W - 0.5);
        pa.y = clamp(pa.y + ny * push, 0.5, H - 0.5);
        pb.x = clamp(pb.x - nx * push, 0.5, W - 0.5);
        pb.y = clamp(pb.y - ny * push, 0.5, H - 0.5);
      }
    }
  }
}

function playBall(m: Match, dt: number): void {
  const ball = m.ball;
  if (ball.owner !== null) {
    const p = m.players[ball.owner];
    ball.x = p.x + dirOf(p.team) * 0.9;
    ball.y = p.y;
    // Tackles on whoever has it.
    for (let i = 0; i < m.players.length; i += 1) {
      const t = m.players[i];
      if (t.team === p.team || t.tackleCd > 0 || t.stun > 0) continue;
      if (dist(t.x, t.y, p.x, p.y) > TACKLE_RANGE) continue;
      t.tackleCd = 0.8;
      const chance = clamp(0.28 + 0.05 * (t.stats.tackling - p.stats.dribbling), 0.08, 0.6);
      if (random(m) < chance) {
        p.stun = 0.7;
        m.stats[t.team].tackles += 1;
        log(m, "tackle", t.team, i);
        takeBall(m, i);
        return;
      }
    }
    return;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const keep = Math.pow(BALL_FRICTION, dt);
  ball.vx *= keep;
  ball.vy *= keep;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (ball.x <= 0 || ball.x >= W || ball.y <= 0 || ball.y >= H) {
    outOfPlay(m);
    return;
  }
  if (ball.kick && speed < 6) {
    ball.kick = null;
    ball.target = null;
  }
  // Opponents get a go at stopping a kick in flight.
  if (ball.kick && ball.last !== null) {
    const kicker = m.players[ball.last];
    for (let i = 0; i < m.players.length; i += 1) {
      const o = m.players[i];
      if (o.team === kicker.team || ball.touched.includes(i) || o.stun > 0) continue;
      if (dist(o.x, o.y, ball.x, ball.y) > 1.6) continue;
      ball.touched.push(i);
      if (ball.kick === "pass" && random(m) < 0.12 + o.stats.tackling * 0.03) {
        log(m, "intercept", o.team, i);
        takeBall(m, i);
        return;
      }
      if (ball.kick === "shot" && o.role !== "GK" && random(m) < 0.12 + o.stats.tackling * 0.02) {
        log(m, "block", o.team, i);
        const angle = random(m) * Math.PI * 2;
        ball.vx = Math.cos(angle) * 14;
        ball.vy = Math.sin(angle) * 14;
        ball.kick = null;
        ball.target = null;
        ball.last = i;
        return;
      }
    }
  }
  // Picking it up.
  const lockedOut = ball.last !== null && ball.lock > 0 ? ball.last : -1;
  let taker = -1;
  let takerD = Infinity;
  for (let i = 0; i < m.players.length; i += 1) {
    const p = m.players[i];
    if (i === lockedOut || p.stun > 0) continue;
    const d = dist(p.x, p.y, ball.x, ball.y);
    const range = ball.target === i ? TRAP_RANGE : speed < 28 ? PICKUP_RANGE : 0;
    if (d <= range && d < takerD) {
      takerD = d;
      taker = i;
    }
  }
  if (taker >= 0) takeBall(m, taker);
}

export function step(m: Match, dt = STEP): void {
  if (m.over || m.moment) return;
  m.t += dt;
  m.momentCd = Math.max(0, m.momentCd - dt);
  m.ball.lock = Math.max(0, m.ball.lock - dt);
  for (const p of m.players) {
    p.stun = Math.max(0, p.stun - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.thinkIn = Math.max(0, p.thinkIn - dt);
  }
  const carrier = m.ball.owner === null ? null : m.players[m.ball.owner];
  if (carrier && !m.restart && carrier.thinkIn <= 0 && carrier.stun <= 0) {
    decide(m, m.ball.owner!);
    if (m.moment) {
      // Paused before anything moved: this tick didn't happen.
      m.t -= dt;
      return;
    }
  }
  movePlayers(m, dt);
  if (m.restart) runRestart(m, dt);
  else playBall(m, dt);
  const poss = possessor(m);
  if (poss !== null) m.stats[poss].possession += dt;
  if (m.half === 0 && m.t >= HALF_SECONDS) {
    m.half = 1;
    log(m, "half", 0);
    for (const p of m.players) p.energy = Math.min(1, p.energy + 0.35);
    kickoff(m, 1);
  } else if (m.t >= MATCH_SECONDS) {
    m.over = true;
    log(m, "full", 0);
  }
}

/** Plays the rest of the match with the bot making every choice. */
export function autoplay(m: Match): void {
  let guard = 0;
  while (!m.over && guard < 100000) {
    if (m.moment) choose(m, null);
    step(m);
    guard += 1;
  }
}

export function winner(m: Match): Team | null {
  return m.score[0] === m.score[1] ? null : m.score[0] > m.score[1] ? 0 : 1;
}
