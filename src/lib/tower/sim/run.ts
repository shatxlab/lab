import {
  ARENA,
  BOSS_SUMMON,
  ENEMIES,
  MAX_CALTROPS,
  RICOCHET_RANGE,
  LANE_MARGIN,
  TOWER,
  WALL_HP,
  WALL_Y,
  WAVE_CLEAR_HEAL,
  BASE,
  hpScale,
  speedScale,
} from "./balance";
import { random } from "./random";
import { towerStats, type TowerStats } from "./stats";
import { emptyPerks, emptyUpgrades, rollChoices } from "./upgrades";
import { buildSpawns, laneX } from "./waves";
import type { Arrow, Effect, EffectKind, Enemy, EnemyKind, PerkLevels, Run, UpgradeId } from "./types";

/** The fixed tick the page steps the sim with, so every device plays the same game. */
export const STEP = 1 / 60;

/** Extra reach an arrow gets on top of the enemy's radius. */
const ARROW_REACH = 3;
/** Radians between the arrows of one multishot. */
const MULTISHOT_SPREAD = 0.1;
/** The archer only faces the field: never back over the castle, never flat along the wall. */
const AIM_LIMIT = 0.1;
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
    firing: false,
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
    spawnEnemy(run, spawn.kind, laneX(run), 0);
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

/** The player is holding a finger (or the mouse button) on this spot: face it and keep shooting. */
export function aimAt(run: Run, x: number, y: number): void {
  run.aim = fieldAngle(x, y);
  run.firing = true;
}

/** The angle from the tower to a point, turned back to face the field if it points behind the wall. */
function fieldAngle(x: number, y: number): number {
  const angle = Math.atan2(y - TOWER.y, x - TOWER.x);
  if (angle > 0) return angle > Math.PI / 2 ? -Math.PI + AIM_LIMIT : -AIM_LIMIT;
  return clamp(angle, -Math.PI + AIM_LIMIT, -AIM_LIMIT);
}

/** The finger lifted: stop shooting, keep facing the same way. */
export function holdFire(run: Run): void {
  run.firing = false;
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
  run.aim = fieldAngle(centerX, centerY);
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
  run.firing = false;
  run.choices = [];
  run.phase = "playing";
}

function finishWave(run: Run, tower: TowerStats): void {
  run.gold += 2 * run.wave;
  run.hp = Math.min(tower.maxHp, run.hp + WAVE_CLEAR_HEAL);
  run.arrows = [];
  run.volleys = [];
  run.firing = false;
  run.picksLeft += 1;
  offerChoices(run);
}

function spawnEnemy(run: Run, kind: EnemyKind, x: number, y: number, targetX = laneX(run)): Enemy {
  const def = ENEMIES[kind];
  const hp = def.hp * hpScale(run.wave);
  const enemy: Enemy = {
    id: run.nextId++,
    kind,
    x,
    y,
    targetX,
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
  run.reloadLeft = Math.max(0, run.reloadLeft - dt);
  if (!run.firing || run.reloadLeft > 0) return;
  // Multishot fans the extra arrows out evenly either side of the aim.
  for (let index = 0; index < tower.multishot; index += 1) {
    fireArrow(run, tower, run.aim + (index - (tower.multishot - 1) / 2) * MULTISHOT_SPREAD);
  }
  run.reloadLeft = tower.reload;
}

function fireArrow(run: Run, tower: TowerStats, angle: number): void {
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
    life: tower.range / tower.arrowSpeed,
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
      // Bounce first so pierce never eats into ricochet: flying on straight would leave the
      // arrow where nothing is in range to bounce to. Pierce is the fallback when it can't.
      if (arrow.ricochetLeft > 0 && ricochet(run, arrow, tower)) break;
      if (arrow.pierceLeft > 0) {
        arrow.pierceLeft -= 1;
        continue;
      }
      spent = true;
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

    if (!atWall(enemy)) {
      const dx = enemy.targetX - enemy.x;
      const dy = WALL_Y - enemy.radius - enemy.y;
      const distance = Math.max(1e-6, Math.hypot(dx, dy));
      const move = Math.min(currentSpeed(run, enemy, tower) * dt, distance);
      enemy.x += (dx / distance) * move;
      enemy.y += (dy / distance) * move;
      if (enemy.flying) {
        // Bats weave side to side on their way in.
        enemy.phase += dt * 4;
        const weave = Math.cos(enemy.phase) * 28 * dt * Math.min(1, distance / 60);
        enemy.x += (-dy / distance) * weave;
        enemy.y += (dx / distance) * weave;
      }
      enemy.x = clamp(enemy.x, enemy.radius, ARENA.width - enemy.radius);
      enemy.y = Math.min(enemy.y, WALL_Y - enemy.radius);
    } else {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer += enemy.attackEvery;
        run.hp -= enemy.damage;
        addEffect(run, "puff", enemy.x, enemy.y + enemy.radius * 0.8, 6, 0.3, "#ffffff");
      }
    }

    if (enemy.kind === "boss") {
      enemy.summonTimer -= dt;
      if (enemy.summonTimer <= 0) {
        enemy.summonTimer += BOSS_SUMMON.every;
        for (let index = 0; index < BOSS_SUMMON.count; index += 1) {
          const angle = (index / BOSS_SUMMON.count) * Math.PI * 2 + enemy.phase;
          const x = clamp(enemy.x + Math.cos(angle) * (enemy.radius + 12), LANE_MARGIN, ARENA.width - LANE_MARGIN);
          const y = clamp(enemy.y + Math.sin(angle) * (enemy.radius + 12), 0, WALL_Y - 30);
          spawnEnemy(run, "grunt", x, y, clamp(enemy.targetX + (x - enemy.x) * 2, LANE_MARGIN, ARENA.width - LANE_MARGIN));
        }
      }
    }
  }
}

/** Up against the wall, or against the tower where it juts out of the wall. */
function atWall(enemy: Enemy): boolean {
  return enemy.y + enemy.radius >= WALL_Y - 0.01 || Math.hypot(enemy.x - TOWER.x, enemy.y - TOWER.y) <= TOWER.radius + enemy.radius;
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
