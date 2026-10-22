import {
  ARENA,
  BOSS_SUMMON,
  ENEMIES,
  MAX_CALTROPS,
  RICOCHET_RANGE,
  TOWER,
  WALL_HP,
  WAVE_CLEAR_HEAL,
  BASE,
  hpScale,
  speedScale,
} from "./balance";
import { random } from "./random";
import { towerStats, type TowerStats } from "./stats";
import { emptyPerks, emptyUpgrades, rollChoices } from "./upgrades";
import { buildSpawns, edgePoint } from "./waves";
import type { Arrow, Effect, EffectKind, Enemy, EnemyKind, PerkLevels, Run, UpgradeId } from "./types";

/** The fixed tick the page steps the sim with, so every device plays the same game. */
export const STEP = 1 / 60;

/** Extra reach an arrow gets on top of the enemy's radius. */
const ARROW_REACH = 3;
const DUST = "#d9c8a0";

export function createRun(seed: number, perks: PerkLevels = emptyPerks()): Run {
  const upgrades = emptyUpgrades();
  const run: Run = {
    seed,
    rng: seed,
    phase: "choosing",
    wave: 0,
    waveTime: 0,
    spawns: [],
    picksLeft: perks.headStart,
    choices: [],
    upgrades,
    perks: { ...perks },
    hp: towerStats(upgrades, perks).maxHp,
    reloadLeft: 0,
    volleyLeft: 0,
    aim: -Math.PI / 2,
    enemies: [],
    arrows: [],
    volleys: [],
    caltrops: [],
    effects: [],
    nextId: 1,
    kills: 0,
    gold: 0,
  };
  // A head start opens on the upgrade picker; otherwise the first wave starts right away.
  if (run.picksLeft > 0) offerChoices(run);
  else startWave(run);
  return run;
}

export function stats(run: Run): TowerStats {
  return towerStats(run.upgrades, run.perks);
}

/** Advance a running wave by `dt` seconds. Does nothing while choosing or after the run ended. */
export function step(run: Run, dt: number): void {
  if (run.phase !== "playing") return;
  const tower = stats(run);
  run.waveTime += dt;
  while (run.spawns.length > 0 && run.spawns[0].at <= run.waveTime) {
    const spawn = run.spawns.shift()!;
    const point = edgePoint(run);
    spawnEnemy(run, spawn.kind, point.x, point.y);
  }
  run.hp = Math.min(tower.maxHp, run.hp + tower.regen * dt);
  run.volleyLeft = Math.max(0, run.volleyLeft - dt);

  shoot(run, tower, dt);
  moveArrows(run, tower, dt);
  landVolleys(run, tower, dt);
  moveEnemies(run, tower, dt);
  reapEnemies(run);
  fadeGround(run, dt);

  if (run.hp <= 0) {
    run.hp = 0;
    run.phase = "over";
    return;
  }
  if (run.spawns.length === 0 && run.enemies.length === 0) finishWave(run, tower);
}

/** Rain the volley on a spot. False when it is still reloading or no wave is running. */
export function castVolley(run: Run, x: number, y: number): boolean {
  if (run.phase !== "playing" || run.volleyLeft > 0) return false;
  const tower = stats(run);
  const centerX = clamp(x, 0, ARENA.width);
  const centerY = clamp(y, 0, ARENA.height);
  for (let index = 0; index < tower.volleyArrows; index += 1) {
    const angle = random(run) * Math.PI * 2;
    const reach = Math.sqrt(random(run)) * tower.volleyRadius;
    const toX = clamp(centerX + Math.cos(angle) * reach, 0, ARENA.width);
    const toY = clamp(centerY + Math.sin(angle) * reach, 0, ARENA.height);
    run.volleys.push({
      id: run.nextId++,
      fromX: TOWER.x,
      fromY: TOWER.y,
      toX,
      toY,
      t: 0,
      duration: 0.4 + random(run) * 0.25 + Math.hypot(toX - TOWER.x, toY - TOWER.y) / 900,
      damage: tower.volleyDamage,
    });
  }
  addEffect(run, "mark", centerX, centerY, tower.volleyRadius, 0.9, "#ffffff");
  run.volleyLeft = tower.volleyCooldown;
  run.aim = Math.atan2(centerY - TOWER.y, centerX - TOWER.x);
  return true;
}

/** The nearest enemy to the tower, for casting a volley from the keyboard. */
export function nearestEnemy(run: Run): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistance = Infinity;
  for (const enemy of run.enemies) {
    const distance = Math.hypot(enemy.x - TOWER.x, enemy.y - TOWER.y);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/** Take one of the offered upgrades. False when it isn't on offer. */
export function chooseUpgrade(run: Run, id: UpgradeId): boolean {
  if (run.phase !== "choosing" || !run.choices.includes(id)) return false;
  run.upgrades[id] += 1;
  if (id === "wall") run.hp = Math.min(stats(run).maxHp, run.hp + WALL_HP);
  run.picksLeft -= 1;
  if (run.picksLeft > 0) offerChoices(run);
  else startWave(run);
  return true;
}

export function giveUp(run: Run): void {
  run.phase = "over";
}

function offerChoices(run: Run): void {
  run.choices = rollChoices(run.upgrades, run);
  if (run.choices.length > 0) {
    run.phase = "choosing";
    return;
  }
  // Everything is maxed: nothing to pick, straight on to the next wave.
  run.picksLeft = 0;
  startWave(run);
}

function startWave(run: Run): void {
  run.wave += 1;
  run.waveTime = 0;
  run.spawns = buildSpawns(run.wave, run);
  run.arrows = [];
  run.volleys = [];
  run.reloadLeft = 0;
  run.volleyLeft = 0;
  run.choices = [];
  run.phase = "playing";
}

function finishWave(run: Run, tower: TowerStats): void {
  run.gold += 2 * run.wave;
  run.hp = Math.min(tower.maxHp, run.hp + WAVE_CLEAR_HEAL);
  run.arrows = [];
  run.volleys = [];
  run.picksLeft += 1;
  offerChoices(run);
}

function spawnEnemy(run: Run, kind: EnemyKind, x: number, y: number): Enemy {
  const def = ENEMIES[kind];
  const hp = def.hp * hpScale(run.wave);
  const enemy: Enemy = {
    id: run.nextId++,
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    radius: def.radius,
    speed: def.speed * speedScale(run.wave),
    flying: def.flying,
    damage: def.damage * (1 + 0.04 * (run.wave - 1)),
    attackEvery: def.attackEvery,
    attackTimer: def.attackEvery / 2,
    burnLeft: 0,
    burnDps: 0,
    slowLeft: 0,
    slow: 0,
    summonTimer: BOSS_SUMMON.every,
    flash: 0,
    phase: random(run) * Math.PI * 2,
  };
  run.enemies.push(enemy);
  return enemy;
}

function shoot(run: Run, tower: TowerStats, dt: number): void {
  run.reloadLeft -= dt;
  if (run.reloadLeft > 0) return;
  const targets = run.enemies
    .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - TOWER.x, enemy.y - TOWER.y) }))
    .filter(({ enemy, distance }) => distance - enemy.radius <= tower.range)
    .sort((a, b) => a.distance - b.distance)
    .map(({ enemy }) => enemy);
  if (targets.length === 0) {
    // Ready and waiting: fire the moment something walks into range.
    run.reloadLeft = 0;
    return;
  }
  for (let index = 0; index < tower.multishot; index += 1) {
    const target = targets[index % targets.length];
    // Spare arrows fan out either side of their target.
    const extra = index - targets.length + 1;
    const spread = extra > 0 ? Math.ceil(extra / 2) * 0.12 * (extra % 2 === 0 ? 1 : -1) : 0;
    fireArrow(run, tower, target, spread);
  }
  run.aim = Math.atan2(targets[0].y - TOWER.y, targets[0].x - TOWER.x);
  run.reloadLeft = tower.reload;
}

function fireArrow(run: Run, tower: TowerStats, target: Enemy, spread: number): void {
  // Lead the target by where it will be when the arrow gets there.
  const flight = Math.hypot(target.x - TOWER.x, target.y - TOWER.y) / tower.arrowSpeed;
  const velocity = enemyVelocity(run, target, tower);
  const aimX = target.x + velocity.x * flight;
  const aimY = target.y + velocity.y * flight;
  const angle = Math.atan2(aimY - TOWER.y, aimX - TOWER.x) + spread;
  const crit = random(run) < tower.critChance;
  const arrow: Arrow = {
    id: run.nextId++,
    x: TOWER.x + Math.cos(angle) * TOWER.radius * 0.5,
    y: TOWER.y + Math.sin(angle) * TOWER.radius * 0.5,
    vx: Math.cos(angle) * tower.arrowSpeed,
    vy: Math.sin(angle) * tower.arrowSpeed,
    damage: tower.damage * (crit ? BASE.critMultiplier : 1),
    crit,
    pierceLeft: tower.pierce,
    ricochetLeft: tower.ricochet,
    life: (tower.range + 40) / tower.arrowSpeed,
    hitIds: [],
  };
  run.arrows.push(arrow);
}

function moveArrows(run: Run, tower: TowerStats, dt: number): void {
  const flying: Arrow[] = [];
  for (const arrow of run.arrows) {
    arrow.x += arrow.vx * dt;
    arrow.y += arrow.vy * dt;
    arrow.life -= dt;
    let spent = false;
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0 || arrow.hitIds.includes(enemy.id)) continue;
      if (Math.hypot(enemy.x - arrow.x, enemy.y - arrow.y) > enemy.radius + ARROW_REACH) continue;
      hitEnemy(enemy, tower, arrow.damage);
      arrow.hitIds.push(enemy.id);
      if (arrow.pierceLeft > 0) {
        arrow.pierceLeft -= 1;
        continue;
      }
      spent = arrow.ricochetLeft === 0 || !ricochet(run, arrow, tower);
      break;
    }
    if (spent) continue;
    const inside = arrow.x >= 0 && arrow.x <= ARENA.width && arrow.y >= 0 && arrow.y <= ARENA.height;
    if (arrow.life > 0 && inside) {
      flying.push(arrow);
    } else if (inside) {
      dropCaltrop(run, tower, arrow.x, arrow.y, Math.atan2(arrow.vy, arrow.vx));
    }
  }
  run.arrows = flying;
}

/** Turn the arrow towards the next enemy it hasn't hit yet. False when there is none close enough. */
function ricochet(run: Run, arrow: Arrow, tower: TowerStats): boolean {
  let next: Enemy | undefined;
  let nextDistance = RICOCHET_RANGE;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || arrow.hitIds.includes(enemy.id)) continue;
    const distance = Math.hypot(enemy.x - arrow.x, enemy.y - arrow.y);
    if (distance < nextDistance) {
      next = enemy;
      nextDistance = distance;
    }
  }
  if (!next) return false;
  const angle = Math.atan2(next.y - arrow.y, next.x - arrow.x);
  arrow.vx = Math.cos(angle) * tower.arrowSpeed;
  arrow.vy = Math.sin(angle) * tower.arrowSpeed;
  arrow.life = (RICOCHET_RANGE * 1.4) / tower.arrowSpeed;
  arrow.ricochetLeft -= 1;
  return true;
}

function landVolleys(run: Run, tower: TowerStats, dt: number): void {
  const airborne = [];
  for (const volley of run.volleys) {
    volley.t += dt / volley.duration;
    if (volley.t < 1) {
      airborne.push(volley);
      continue;
    }
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0) continue;
      if (Math.hypot(enemy.x - volley.toX, enemy.y - volley.toY) <= BASE.volleySplash + enemy.radius / 2) {
        hitEnemy(enemy, tower, volley.damage);
      }
    }
    addEffect(run, "puff", volley.toX, volley.toY, 7, 0.35, DUST);
    dropCaltrop(run, tower, volley.toX, volley.toY, Math.atan2(volley.toY - volley.fromY, volley.toX - volley.fromX));
  }
  run.volleys = airborne;
}

function hitEnemy(enemy: Enemy, tower: TowerStats, damage: number): void {
  enemy.hp -= damage;
  enemy.flash = 0.08;
  if (tower.burnDps > 0) {
    enemy.burnLeft = tower.burnSeconds;
    enemy.burnDps = Math.max(enemy.burnDps, tower.burnDps);
  }
  if (tower.frost > 0) {
    enemy.slowLeft = tower.frostSeconds;
    enemy.slow = Math.max(enemy.slow, tower.frost);
  }
}

function moveEnemies(run: Run, tower: TowerStats, dt: number): void {
  for (const enemy of [...run.enemies]) {
    enemy.flash = Math.max(0, enemy.flash - dt);
    if (enemy.burnLeft > 0) {
      enemy.hp -= enemy.burnDps * Math.min(dt, enemy.burnLeft);
      enemy.burnLeft -= dt;
      if (enemy.burnLeft <= 0) enemy.burnDps = 0;
    }
    if (enemy.slowLeft > 0) {
      enemy.slowLeft -= dt;
      if (enemy.slowLeft <= 0) enemy.slow = 0;
    }
    if (enemy.hp <= 0) continue;

    const dx = TOWER.x - enemy.x;
    const dy = TOWER.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const reach = TOWER.radius + enemy.radius;
    if (distance > reach) {
      const move = Math.min(currentSpeed(run, enemy, tower) * dt, distance - reach);
      enemy.x += (dx / distance) * move;
      enemy.y += (dy / distance) * move;
      if (enemy.flying) {
        // Bats weave side to side on their way in.
        enemy.phase += dt * 4;
        const weave = Math.cos(enemy.phase) * 28 * dt * Math.min(1, (distance - reach) / 60);
        enemy.x += (-dy / distance) * weave;
        enemy.y += (dx / distance) * weave;
      }
    } else {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer += enemy.attackEvery;
        run.hp -= enemy.damage;
        addEffect(run, "puff", enemy.x + (dx / distance) * enemy.radius, enemy.y + (dy / distance) * enemy.radius, 6, 0.3, "#ffffff");
      }
    }

    if (enemy.kind === "boss") {
      enemy.summonTimer -= dt;
      if (enemy.summonTimer <= 0) {
        enemy.summonTimer += BOSS_SUMMON.every;
        for (let index = 0; index < BOSS_SUMMON.count; index += 1) {
          const angle = (index / BOSS_SUMMON.count) * Math.PI * 2 + enemy.phase;
          const x = clamp(enemy.x + Math.cos(angle) * (enemy.radius + 12), 0, ARENA.width);
          const y = clamp(enemy.y + Math.sin(angle) * (enemy.radius + 12), 0, ARENA.height);
          spawnEnemy(run, "grunt", x, y);
        }
      }
    }
  }
}

/** Where an enemy is heading and how fast, ignoring a bat's weave. */
function enemyVelocity(run: Run, enemy: Enemy, tower: TowerStats): { x: number; y: number } {
  const dx = TOWER.x - enemy.x;
  const dy = TOWER.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= TOWER.radius + enemy.radius) return { x: 0, y: 0 };
  const speed = currentSpeed(run, enemy, tower);
  return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

function currentSpeed(run: Run, enemy: Enemy, tower: TowerStats): number {
  let slow = enemy.slowLeft > 0 ? enemy.slow : 0;
  if (!enemy.flying && tower.caltropSlow > slow && onCaltrop(run, enemy)) slow = tower.caltropSlow;
  return enemy.speed * (1 - slow);
}

function onCaltrop(run: Run, enemy: Enemy): boolean {
  return run.caltrops.some((caltrop) => Math.hypot(caltrop.x - enemy.x, caltrop.y - enemy.y) <= enemy.radius + 4);
}

function dropCaltrop(run: Run, tower: TowerStats, x: number, y: number, angle: number): void {
  if (tower.caltropSlow <= 0) return;
  if (run.caltrops.length >= MAX_CALTROPS) run.caltrops.shift();
  run.caltrops.push({ id: run.nextId++, x, y, angle, life: tower.caltropLife });
}

function reapEnemies(run: Run): void {
  const alive: Enemy[] = [];
  for (const enemy of run.enemies) {
    if (enemy.hp > 0) {
      alive.push(enemy);
      continue;
    }
    run.kills += 1;
    run.gold += ENEMIES[enemy.kind].gold;
    addEffect(run, "pop", enemy.x, enemy.y, enemy.radius, 0.35, ENEMIES[enemy.kind].color);
  }
  run.enemies = alive;
}

function fadeGround(run: Run, dt: number): void {
  for (const caltrop of run.caltrops) caltrop.life -= dt;
  run.caltrops = run.caltrops.filter((caltrop) => caltrop.life > 0);
  for (const effect of run.effects) effect.life -= dt;
  run.effects = run.effects.filter((effect) => effect.life > 0);
}

function addEffect(run: Run, kind: EffectKind, x: number, y: number, radius: number, duration: number, color: string): void {
  const effect: Effect = { kind, x, y, radius, life: duration, duration, color };
  run.effects.push(effect);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
