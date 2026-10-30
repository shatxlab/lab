import { ENEMIES as LONE_TOWER_ENEMIES } from "@/lib/tower/sim/balance";
import { random } from "@/lib/tower/sim/random";
import {
  ARCHER_BRANCHES,
  ARENA,
  BOSS_SUMMON,
  BURN,
  EARLY_GOLD_PER_SECOND,
  FOES,
  FROST_SECONDS,
  GATE,
  MARK,
  MAX_LEVEL,
  SELL_REFUND,
  START_LIVES,
  STONE_FLIGHT,
  TOWERS,
  VOLLEY,
  WAVE_GAP,
  hpScale,
  volleyDamage,
  type TowerLevel,
} from "./balance";
import { mapById, type MapDef } from "./maps";
import { poseAt, type PathPose } from "./path";
import { buildSpawns } from "./waves";
import type { ArcherBranch, Effect, EnemyKind, Foe, Game, MapId, Shot, Tower, TowerKind } from "./types";

/** The fixed tick the page steps the sim with, so every device plays the same game. */
export const STEP = 1 / 60;

/** Where bats set off from, just above the treeline. */
const AIR_START_Y = -10;
/** How far either side of the road's middle a walker may keep to. */
const LANE_WIDTH = 7;
/** Extra reach a homing shot gets on top of its target's radius. */
const SHOT_REACH = 3;
const DUST = "#d9c8a0";
const FROST_MIST = "#cfeeff";

export function createGame(mapId: MapId, seed: number): Game {
  const map = mapById(mapId);
  return {
    map: mapId,
    seed,
    rng: seed,
    status: "ready",
    wave: 0,
    waveTime: 0,
    spawns: [],
    nextWaveIn: null,
    lives: START_LIVES,
    gold: map.startGold,
    towers: [],
    foes: [],
    shots: [],
    volleys: [],
    effects: [],
    volleyLeft: 0,
    nextId: 1,
    kills: 0,
  };
}

/** Advance the game by `dt` seconds. Before the first wave and after the end only the effects fade. */
export function step(game: Game, dt: number): void {
  fadeEffects(game, dt);
  if (game.status !== "playing") return;
  const map = mapById(game.map);
  game.waveTime += dt;
  while (game.spawns.length > 0 && game.spawns[0].at <= game.waveTime) {
    const spawn = game.spawns.shift()!;
    spawnFoe(game, map, spawn.kind, spawn.road, 0);
  }
  if (game.spawns.length === 0 && game.nextWaveIn === null && game.wave < map.waves) game.nextWaveIn = WAVE_GAP;
  if (game.nextWaveIn !== null) {
    game.nextWaveIn -= dt;
    if (game.nextWaveIn <= 0) startNextWave(game, map);
  }
  game.volleyLeft = Math.max(0, game.volleyLeft - dt);

  moveFoes(game, map, dt);
  for (const tower of game.towers) actTower(game, map, tower, dt);
  moveShots(game, dt);
  landVolleys(game, dt);
  reapFoes(game);

  if (game.lives <= 0) {
    game.lives = 0;
    game.status = "lost";
  } else if (game.wave >= map.waves && game.spawns.length === 0 && game.foes.length === 0) {
    game.status = "won";
  }
}

/**
 * Send the next wave now. Before the first wave this starts the game; after
 * that it only works once the last wave is out of the woods, and pays a
 * little gold for every second it skips.
 */
export function callWave(game: Game): boolean {
  const map = mapById(game.map);
  if (game.status === "ready") {
    game.status = "playing";
    startNextWave(game, map);
    return true;
  }
  if (game.status !== "playing" || game.nextWaveIn === null) return false;
  game.gold += earlyBonus(game);
  startNextWave(game, map);
  return true;
}

/** Walk away from the gate: the game ends as a loss. */
export function giveUp(game: Game): void {
  if (game.status === "ready" || game.status === "playing") game.status = "lost";
}

/** Gold that calling the next wave right now would pay. */
export function earlyBonus(game: Game): number {
  return game.nextWaveIn === null ? 0 : Math.floor(Math.max(0, game.nextWaveIn) * EARLY_GOLD_PER_SECOND);
}

export function towerOn(game: Game, plot: number): Tower | undefined {
  return game.towers.find((tower) => tower.plot === plot);
}

export function levelOf(tower: Pick<Tower, "kind" | "level" | "branch">): TowerLevel & { burn: number; mark: number } {
  if (tower.kind === "archer" && tower.level === MAX_LEVEL && tower.branch) return ARCHER_BRANCHES[tower.branch];
  return { ...TOWERS[tower.kind].levels[tower.level - 1], burn: 0, mark: 0 };
}

/** Whether the tower's next level is the archer's fork: fire or lune arrows. */
export function atFork(game: Game, tower: Tower): boolean {
  return tower.kind === "archer" && tower.level === MAX_LEVEL - 1 && mapById(game.map).archerBranches;
}

export function buildCost(kind: TowerKind): number {
  return TOWERS[kind].levels[0].cost;
}

/** Gold for the tower's next level, or null at the top. */
export function upgradeCost(tower: Tower): number | null {
  return tower.level >= MAX_LEVEL ? null : TOWERS[tower.kind].levels[tower.level].cost;
}

/** What selling a tower gives back: everything before the first wave, part of it after. */
export function refundFor(game: Game, tower: Tower): number {
  return game.status === "ready" ? tower.spent : Math.floor(tower.spent * SELL_REFUND);
}

function canBuild(game: Game): boolean {
  return game.status === "ready" || game.status === "playing";
}

export function build(game: Game, plot: number, kind: TowerKind): boolean {
  const map = mapById(game.map);
  const cost = buildCost(kind);
  if (!canBuild(game) || !map.plots[plot] || towerOn(game, plot) || game.gold < cost) return false;
  game.gold -= cost;
  game.towers.push({ id: game.nextId++, plot, kind, level: 1, aim: -Math.PI / 2, reloadLeft: 0, sinceShot: 99, spent: cost });
  const { x, y } = map.plots[plot];
  addEffect(game, "puff", x, y, 20, 0.4, DUST);
  return true;
}

/** Raise a tower a level. At the archer's fork on a map with branches, `branch` says which arrows it takes. */
export function upgrade(game: Game, plot: number, branch?: ArcherBranch): boolean {
  const tower = towerOn(game, plot);
  const cost = tower ? upgradeCost(tower) : null;
  if (!canBuild(game) || !tower || cost === null || game.gold < cost) return false;
  if (atFork(game, tower) !== (branch !== undefined)) return false;
  game.gold -= cost;
  tower.level += 1;
  if (branch) tower.branch = branch;
  tower.spent += cost;
  const { x, y } = mapById(game.map).plots[plot];
  addEffect(game, "pop", x, y, 18, 0.4, "#ffd27a");
  return true;
}

export function sell(game: Game, plot: number): boolean {
  const tower = towerOn(game, plot);
  if (!canBuild(game) || !tower) return false;
  game.gold += refundFor(game, tower);
  game.towers = game.towers.filter((entry) => entry !== tower);
  const { x, y } = mapById(game.map).plots[plot];
  addEffect(game, "puff", x, y, 20, 0.4, DUST);
  return true;
}

/** Rain the volley on a spot from the gatehouse. False while it reloads or no wave is on. */
export function castVolley(game: Game, x: number, y: number): boolean {
  if (game.status !== "playing" || game.volleyLeft > 0) return false;
  const centerX = clamp(x, 0, ARENA.width);
  const centerY = clamp(y, 0, ARENA.height);
  const damage = volleyDamage(game.wave);
  for (let index = 0; index < VOLLEY.arrows; index += 1) {
    const angle = random(game) * Math.PI * 2;
    const reach = Math.sqrt(random(game)) * VOLLEY.radius;
    const toX = clamp(centerX + Math.cos(angle) * reach, 0, ARENA.width);
    const toY = clamp(centerY + Math.sin(angle) * reach, 0, ARENA.height);
    game.volleys.push({
      id: game.nextId++,
      fromX: GATE.x,
      fromY: GATE.y,
      toX,
      toY,
      t: 0,
      duration: 0.4 + random(game) * 0.25 + Math.hypot(toX - GATE.x, toY - GATE.y) / 900,
      damage,
    });
  }
  addEffect(game, "mark", centerX, centerY, VOLLEY.radius, 0.9, "#ffffff");
  game.volleyLeft = VOLLEY.cooldown;
  return true;
}

/** The enemy closest to getting through, for aiming the volley from the keyboard. */
export function leadFoe(game: Game): Foe | undefined {
  const map = mapById(game.map);
  let best: Foe | undefined;
  for (const foe of game.foes) {
    if (!best || remaining(map, foe) < remaining(map, best)) best = foe;
  }
  return best;
}

/** How long the foe's whole route is, road or sky. */
export function routeLength(map: MapDef, foe: Pick<Foe, "route">): number {
  if ("road" in foe.route) return map.roads[foe.route.road].length;
  return Math.hypot(GATE.x - foe.route.air.fromX, GATE.y - AIR_START_Y);
}

function remaining(map: MapDef, foe: Foe): number {
  return routeLength(map, foe) - foe.distance;
}

function startNextWave(game: Game, map: MapDef): void {
  game.wave += 1;
  game.waveTime = 0;
  game.spawns = buildSpawns(game.wave, map, game);
  game.nextWaveIn = null;
}

function spawnFoe(game: Game, map: MapDef, kind: EnemyKind, road: number, distance: number, lane?: number): Foe {
  const def = FOES[kind];
  const hp = def.hp * hpScale(game.wave) * map.toughness;
  const foe: Foe = {
    id: game.nextId++,
    kind,
    route: def.flying ? { air: { fromX: 30 + random(game) * (ARENA.width - 60) } } : { road },
    distance,
    lane: lane ?? (random(game) * 2 - 1) * LANE_WIDTH,
    facing: Math.PI / 2,
    x: 0,
    y: 0,
    radius: def.radius,
    speed: def.speed,
    flying: def.flying,
    hp,
    maxHp: hp,
    slowLeft: 0,
    slow: 0,
    burnLeft: 0,
    flash: 0,
    phase: random(game) * Math.PI * 2,
    summonTimer: BOSS_SUMMON.every,
    markLeft: 0,
  };
  place(map, foe);
  game.foes.push(foe);
  return foe;
}

/** Put the foe where its distance along the route says. */
function place(map: MapDef, foe: Foe): void {
  const pose = poseAtDistance(map, foe, foe.distance);
  foe.x = pose.x;
  foe.y = pose.y;
  foe.facing = pose.angle;
}

/** Where a foe on its route is at `distance`: offset into its lane on a road, weaving through the sky. */
function poseAtDistance(map: MapDef, foe: Pick<Foe, "route" | "lane" | "phase">, distance: number): PathPose {
  if ("road" in foe.route) {
    const pose = poseAt(map.roads[foe.route.road], distance);
    return { x: pose.x - Math.sin(pose.angle) * foe.lane, y: pose.y + Math.cos(pose.angle) * foe.lane, angle: pose.angle };
  }
  const { fromX } = foe.route.air;
  const length = routeLength(map, foe);
  const t = Math.min(1, distance / length);
  const angle = Math.atan2(GATE.y - AIR_START_Y, GATE.x - fromX);
  // Bats weave side to side on their way in, settling as they reach the gate.
  const weave = Math.sin(distance / 18 + foe.phase) * 10 * Math.min(1, (length - distance) / 60);
  return {
    x: fromX + (GATE.x - fromX) * t - Math.sin(angle) * weave,
    y: AIR_START_Y + (GATE.y - AIR_START_Y) * t + Math.cos(angle) * weave,
    angle,
  };
}

function moveFoes(game: Game, map: MapDef, dt: number): void {
  const through = new Set<Foe>();
  // A snapshot: footmen a warlord calls in join the list but start walking next tick.
  for (const foe of [...game.foes]) {
    foe.flash = Math.max(0, foe.flash - dt);
    foe.markLeft = Math.max(0, foe.markLeft - dt);
    if (foe.burnLeft > 0) {
      foe.hp -= BURN.dps * (1 + (foe.markLeft > 0 ? MARK.bonus : 0)) * Math.min(dt, foe.burnLeft);
      foe.burnLeft -= dt;
    }
    if (foe.slowLeft > 0) {
      foe.slowLeft -= dt;
      if (foe.slowLeft <= 0) foe.slow = 0;
    }
    if (foe.hp <= 0) continue;
    foe.distance += foe.speed * (1 - foe.slow) * dt;
    if (foe.distance >= routeLength(map, foe)) {
      // Through the gate: it costs lives and pays nothing.
      game.lives -= FOES[foe.kind].leak;
      through.add(foe);
      addEffect(game, "puff", GATE.x, GATE.y, 14, 0.4, "#e0483f");
      continue;
    }
    place(map, foe);
    if (foe.kind === "boss") summon(game, map, foe, dt);
  }
  if (through.size > 0) game.foes = game.foes.filter((foe) => !through.has(foe));
}

function summon(game: Game, map: MapDef, boss: Foe, dt: number): void {
  boss.summonTimer -= dt;
  if (boss.summonTimer > 0 || !("road" in boss.route)) return;
  boss.summonTimer += BOSS_SUMMON.every;
  for (let index = 0; index < BOSS_SUMMON.count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const footman = spawnFoe(game, map, "grunt", boss.route.road, Math.max(0, boss.distance - 6), side * LANE_WIDTH);
    addEffect(game, "puff", footman.x, footman.y, 10, 0.35, "#ffffff");
  }
}

function actTower(game: Game, map: MapDef, tower: Tower, dt: number): void {
  tower.sinceShot += dt;
  tower.reloadLeft = Math.max(0, tower.reloadLeft - dt);
  const plot = map.plots[tower.plot];
  const level = levelOf(tower);
  const target = pickTarget(game, map, tower, plot.x, plot.y, level.range);
  if (!target) return;
  tower.aim = Math.atan2(target.y - plot.y, target.x - plot.x);
  if (tower.reloadLeft > 0) return;
  fire(game, map, tower, level, plot.x, plot.y, target);
  tower.reloadLeft = level.reload;
  tower.sinceShot = 0;
}

/** The foe in range furthest along; frost prefers one it hasn't slowed yet. */
function pickTarget(game: Game, map: MapDef, tower: Tower, x: number, y: number, range: number): Foe | undefined {
  const air = TOWERS[tower.kind].air;
  let best: Foe | undefined;
  let bestLeft = Infinity;
  let fresh: Foe | undefined;
  let freshLeft = Infinity;
  for (const foe of game.foes) {
    if (foe.hp <= 0 || (foe.flying && !air)) continue;
    if (Math.hypot(foe.x - x, foe.y - y) > range + foe.radius * 0.5) continue;
    const left = remaining(map, foe);
    if (left < bestLeft) {
      best = foe;
      bestLeft = left;
    }
    if (foe.slowLeft < 0.5 && left < freshLeft) {
      fresh = foe;
      freshLeft = left;
    }
  }
  return tower.kind === "frost" ? (fresh ?? best) : best;
}

/** Where the foe will be in `seconds` if it keeps walking as it is. */
function ahead(map: MapDef, foe: Foe, seconds: number): { x: number; y: number } {
  const distance = Math.min(routeLength(map, foe), foe.distance + foe.speed * (1 - foe.slow) * seconds);
  return poseAtDistance(map, foe, distance);
}

function fire(game: Game, map: MapDef, tower: Tower, level: ReturnType<typeof levelOf>, x: number, y: number, target: Foe): void {
  const def = TOWERS[tower.kind];
  const shot: Shot = {
    id: game.nextId++,
    kind: tower.kind,
    x,
    y,
    fromX: x,
    fromY: y,
    toX: target.x,
    toY: target.y,
    targetId: target.id,
    t: 0,
    duration: 0,
    life: 0,
    damage: level.damage,
    splash: level.splash,
    slow: level.slow,
    burn: level.burn,
    mark: level.mark,
    air: def.air,
    hitIds: [],
  };
  if (tower.kind === "catapult") {
    // A stone can't steer: it's thrown at where the target is going to be.
    shot.duration = STONE_FLIGHT.base + Math.hypot(target.x - x, target.y - y) * STONE_FLIGHT.perUnit;
    const landing = ahead(map, target, shot.duration);
    shot.toX = landing.x;
    shot.toY = landing.y;
    shot.targetId = 0;
  } else if (tower.kind === "ballista") {
    const lead = ahead(map, target, Math.hypot(target.x - x, target.y - y) / def.shotSpeed);
    const angle = Math.atan2(lead.y - y, lead.x - x);
    shot.toX = x + Math.cos(angle) * def.shotSpeed;
    shot.toY = y + Math.sin(angle) * def.shotSpeed;
    shot.life = (level.range * 1.15) / def.shotSpeed;
    shot.targetId = 0;
  }
  game.shots.push(shot);
}

function moveShots(game: Game, dt: number): void {
  const flying: Shot[] = [];
  for (const shot of game.shots) {
    const keep =
      shot.kind === "catapult" ? flyStone(game, shot, dt) : shot.kind === "ballista" ? flyBolt(game, shot, dt) : flyHoming(game, shot, dt);
    if (keep) flying.push(shot);
  }
  game.shots = flying;
}

/** An arrow or frost bolt chasing its target. False once it has hit or lost it. */
function flyHoming(game: Game, shot: Shot, dt: number): boolean {
  const target = shot.targetId ? game.foes.find((foe) => foe.id === shot.targetId && foe.hp > 0) : undefined;
  if (target) {
    shot.toX = target.x;
    shot.toY = target.y;
  } else {
    shot.targetId = 0;
  }
  const gap = Math.hypot(shot.toX - shot.x, shot.toY - shot.y);
  const travel = TOWERS[shot.kind].shotSpeed * dt;
  if (gap > travel + (target ? target.radius * 0.5 + SHOT_REACH : 0)) {
    shot.x += ((shot.toX - shot.x) / gap) * travel;
    shot.y += ((shot.toY - shot.y) / gap) * travel;
    return true;
  }
  // Arrived. A shot whose target fell on the way just drops.
  if (!target) return false;
  hitFoe(target, shot.damage, shot.slow);
  if (shot.burn > 0) target.burnLeft = shot.burn;
  if (shot.mark > 0) target.markLeft = shot.mark;
  if (shot.splash > 0) {
    for (const foe of game.foes) {
      if (foe === target || foe.hp <= 0 || Math.hypot(foe.x - target.x, foe.y - target.y) > shot.splash + foe.radius * 0.5) continue;
      hitFoe(foe, shot.damage, shot.slow);
    }
    addEffect(game, "puff", target.x, target.y, shot.splash * 0.7, 0.35, FROST_MIST);
  }
  return false;
}

/** A stone on its arc. False once it has landed. */
function flyStone(game: Game, shot: Shot, dt: number): boolean {
  shot.t += dt / shot.duration;
  shot.x = shot.fromX + (shot.toX - shot.fromX) * Math.min(1, shot.t);
  shot.y = shot.fromY + (shot.toY - shot.fromY) * Math.min(1, shot.t);
  if (shot.t < 1) return true;
  for (const foe of game.foes) {
    if (foe.hp <= 0 || foe.flying) continue;
    if (Math.hypot(foe.x - shot.toX, foe.y - shot.toY) <= shot.splash + foe.radius * 0.5) hitFoe(foe, shot.damage, 0);
  }
  addEffect(game, "puff", shot.toX, shot.toY, shot.splash * 0.8, 0.45, DUST);
  return false;
}

/** A ballista bolt flying straight, through everything in its way. False once it drops or leaves the field. */
function flyBolt(game: Game, shot: Shot, dt: number): boolean {
  const speed = TOWERS.ballista.shotSpeed;
  const angle = Math.atan2(shot.toY - shot.fromY, shot.toX - shot.fromX);
  shot.x += Math.cos(angle) * speed * dt;
  shot.y += Math.sin(angle) * speed * dt;
  shot.life -= dt;
  for (const foe of game.foes) {
    if (foe.hp <= 0 || shot.hitIds.includes(foe.id)) continue;
    if (Math.hypot(foe.x - shot.x, foe.y - shot.y) > foe.radius + SHOT_REACH) continue;
    hitFoe(foe, shot.damage, 0);
    shot.hitIds.push(foe.id);
  }
  const inside = shot.x >= -20 && shot.x <= ARENA.width + 20 && shot.y >= -20 && shot.y <= ARENA.height + 20;
  return shot.life > 0 && inside;
}

function landVolleys(game: Game, dt: number): void {
  const airborne = [];
  for (const volley of game.volleys) {
    volley.t += dt / volley.duration;
    if (volley.t < 1) {
      airborne.push(volley);
      continue;
    }
    for (const foe of game.foes) {
      if (foe.hp <= 0) continue;
      if (Math.hypot(foe.x - volley.toX, foe.y - volley.toY) <= VOLLEY.splash + foe.radius / 2) hitFoe(foe, volley.damage, 0);
    }
    addEffect(game, "puff", volley.toX, volley.toY, 7, 0.35, DUST);
  }
  game.volleys = airborne;
}

function hitFoe(foe: Foe, damage: number, slow: number): void {
  foe.hp -= damage * (foe.markLeft > 0 ? 1 + MARK.bonus : 1);
  foe.flash = 0.08;
  if (slow > 0) {
    foe.slowLeft = FROST_SECONDS;
    foe.slow = Math.max(foe.slow, slow);
  }
}

function reapFoes(game: Game): void {
  const alive: Foe[] = [];
  for (const foe of game.foes) {
    if (foe.hp > 0) {
      alive.push(foe);
      continue;
    }
    game.kills += 1;
    game.gold += FOES[foe.kind].gold;
    addEffect(game, "pop", foe.x, foe.y, foe.radius, 0.35, LONE_TOWER_ENEMIES[foe.kind].color);
  }
  game.foes = alive;
}

function fadeEffects(game: Game, dt: number): void {
  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter((effect) => effect.life > 0);
}

function addEffect(game: Game, kind: Effect["kind"], x: number, y: number, radius: number, duration: number, color: string): void {
  game.effects.push({ kind, x, y, radius, life: duration, duration, color });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
