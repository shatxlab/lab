/*
 * Flat-vector canvas drawing for Lone Tower, seen from straight above.
 *
 * Draws in world units: the caller sets the context's transform to the
 * device pixel ratio and `drawRun` adds the arena fit on top, so nothing
 * here has to think about screen size.
 */
import { ARENA, ENEMIES, TOWER, WALL_Y } from "../sim/balance";
import { random } from "../sim/random";
import { stats } from "../sim/run";
import type { Caltrop, Effect, Enemy, Run, VolleyArrow } from "../sim/types";

export interface View {
  /** CSS pixels of the canvas. */
  width: number;
  height: number;
  /** CSS pixels per world unit. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

const COLORS = {
  forest: "#3d6e33",
  canopy: "#4f8a3f",
  canopyLight: "#62a04e",
  grass: "#8cc56b",
  tuft: "#79b35a",
  flower: "#f4e9a6",
  courtyard: "#cdbd94",
  cobble: "#bfae84",
  wall: "#aaa294",
  wallTop: "#c4bdb0",
  stone: "#b9b2a6",
  stoneDark: "#8c8478",
  merlon: "#d2cbbe",
  floor: "#a0703f",
  tunic: "#3b6ea5",
  skin: "#f1c9a0",
  bow: "#6b4423",
  shaft: "#5a3a1a",
  crit: "#f5b400",
  fletch: "#ffffff",
  shadow: "rgba(30, 40, 20, 0.22)",
  hpBack: "rgba(0, 0, 0, 0.18)",
  good: "#4fb35a",
  warn: "#f0a63a",
  bad: "#e0483f",
  burn: "#ff8a2a",
  frost: "#7fd4ff",
  crown: "#f5c542",
} as const;

/** Fit the portrait arena inside the canvas, centred, never cropped. */
export function fitView(width: number, height: number): View {
  const scale = Math.max(0.01, Math.min(width / ARENA.width, height / ARENA.height));
  return {
    width,
    height,
    scale,
    offsetX: (width - ARENA.width * scale) / 2,
    offsetY: (height - ARENA.height * scale) / 2,
  };
}

/** A point on the canvas (CSS pixels) in world units. */
export function toWorld(view: View, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
}

interface Tuft {
  x: number;
  y: number;
  size: number;
  flower: boolean;
}

interface Tree {
  x: number;
  y: number;
  radius: number;
}

interface House {
  x: number;
  y: number;
  width: number;
  height: number;
  roof: string;
}

// The town behind the wall, two houses either side of the tower.
const HOUSES: House[] = [
  { x: 14, y: 590, width: 62, height: 34, roof: "#b5523b" },
  { x: 86, y: 602, width: 46, height: 28, roof: "#3f6fa0" },
  { x: 228, y: 602, width: 46, height: 28, roof: "#b5523b" },
  { x: 284, y: 590, width: 62, height: 34, roof: "#3f6fa0" },
];

// The woods the enemies come out of, along the top edge.
const TREES: Tree[] = (() => {
  const source = { rng: 7 };
  const trees: Tree[] = [];
  for (let x = -14; x < ARENA.width + 20; x += 20 + random(source) * 8) {
    trees.push({ x, y: 2 + random(source) * 10, radius: 14 + random(source) * 7 });
  }
  return trees;
})();

// The same meadow every time: a fixed seed, not the run's.
const TUFTS: Tuft[] = (() => {
  const source = { rng: 20261022 };
  const tufts: Tuft[] = [];
  while (tufts.length < 70) {
    const x = random(source) * ARENA.width;
    const y = random(source) * ARENA.height;
    if (y > WALL_Y - 12 || y < 24) continue;
    tufts.push({ x, y, size: 3 + random(source) * 4, flower: random(source) < 0.2 });
  }
  return tufts;
})();

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, view: View, time: number): void {
  // Past the arena's edges the woods carry on above the wall and the courtyard below it.
  const wallOnScreen = view.offsetY + WALL_Y * view.scale;
  ctx.fillStyle = COLORS.forest;
  ctx.fillRect(0, 0, view.width, wallOnScreen);
  ctx.fillStyle = COLORS.courtyard;
  ctx.fillRect(0, wallOnScreen, view.width, view.height - wallOnScreen);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  // The wall runs the full width of the screen, not just the arena.
  const left = -view.offsetX / view.scale;
  const right = (view.width - view.offsetX) / view.scale;

  drawGround(ctx, run);
  drawCastle(ctx, left, right);
  for (const caltrop of run.caltrops) drawCaltrop(ctx, caltrop);
  for (const effect of run.effects) if (effect.kind === "mark") drawEffect(ctx, effect);
  for (const enemy of run.enemies) if (!enemy.flying) drawEnemy(ctx, enemy, time);
  drawTower(ctx, run, time);
  for (const arrow of run.arrows) drawArrow(ctx, arrow.x, arrow.y, Math.atan2(arrow.vy, arrow.vx), arrow.crit ? COLORS.crit : COLORS.shaft);
  for (const enemy of run.enemies) if (enemy.flying) drawEnemy(ctx, enemy, time);
  drawTreeline(ctx);
  for (const volley of run.volleys) drawVolleyArrow(ctx, volley);
  for (const effect of run.effects) if (effect.kind !== "mark") drawEffect(ctx, effect);

  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, run: Run): void {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, ARENA.width, WALL_Y);
  for (const tuft of TUFTS) {
    if (tuft.flower) {
      circle(ctx, tuft.x, tuft.y, tuft.size * 0.45, COLORS.flower);
      continue;
    }
    ctx.strokeStyle = COLORS.tuft;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const lean of [-0.5, 0, 0.5]) {
      ctx.moveTo(tuft.x + lean * 2, tuft.y);
      ctx.lineTo(tuft.x + lean * tuft.size, tuft.y - tuft.size);
    }
    ctx.stroke();
  }
  // A faint arc where the archer's arrows run out.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(TOWER.x, TOWER.y, stats(run).range, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCastle(ctx: CanvasRenderingContext2D, left: number, right: number): void {
  ctx.fillStyle = COLORS.courtyard;
  ctx.fillRect(left, WALL_Y, right - left, ARENA.height - WALL_Y + 400);
  // Cobbles: a loose grid of small flat stones.
  ctx.fillStyle = COLORS.cobble;
  for (let y = WALL_Y + 22; y < ARENA.height + 40; y += 9) {
    for (let x = left + ((y / 9) % 2) * 6; x < right; x += 12) ctx.fillRect(x, y, 7, 4);
  }
  for (const house of HOUSES) {
    ellipse(ctx, house.x + house.width / 2 + 3, house.y + house.height / 2 + 4, house.width / 2 + 2, house.height / 2, COLORS.shadow);
    ctx.fillStyle = house.roof;
    ctx.fillRect(house.x, house.y, house.width, house.height);
    // Two roof slopes meeting at the ridge: the lower one a shade darker.
    ctx.fillStyle = shade(house.roof, -0.18);
    ctx.fillRect(house.x, house.y + house.height / 2, house.width, house.height / 2);
    ctx.strokeStyle = shade(house.roof, -0.35);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(house.x, house.y, house.width, house.height);
  }

  // The wall: a walkway with battlements along the front face.
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(left, WALL_Y, right - left, 16);
  ctx.fillStyle = COLORS.wallTop;
  ctx.fillRect(left, WALL_Y + 4, right - left, 8);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(left, WALL_Y + 16, right - left, 4);
  for (let x = Math.floor(left / 16) * 16; x < right; x += 16) {
    ctx.fillStyle = COLORS.merlon;
    ctx.fillRect(x + 2, WALL_Y - 3, 9, 7);
    ctx.strokeStyle = COLORS.stoneDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, WALL_Y - 3, 9, 7);
  }
}

function drawTreeline(ctx: CanvasRenderingContext2D): void {
  for (const tree of TREES) circle(ctx, tree.x + 2, tree.y + 5, tree.radius, COLORS.forest);
  for (const tree of TREES) {
    circle(ctx, tree.x, tree.y, tree.radius, COLORS.canopy);
    circle(ctx, tree.x - tree.radius * 0.3, tree.y - tree.radius * 0.3, tree.radius * 0.45, COLORS.canopyLight);
  }
}

function drawTower(ctx: CanvasRenderingContext2D, run: Run, time: number): void {
  const { x, y, radius } = TOWER;
  const tower = stats(run);
  if (run.firing) {
    // Where the stream is going, out to the end of its reach.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(run.aim) * (radius + 6), y + Math.sin(run.aim) * (radius + 6));
    ctx.lineTo(x + Math.cos(run.aim) * tower.range, y + Math.sin(run.aim) * tower.range);
    ctx.stroke();
    ctx.restore();
  }
  ellipse(ctx, x + 4, y + 6, radius + 2, radius + 1, COLORS.shadow);
  circle(ctx, x, y, radius, COLORS.stone);
  ctx.strokeStyle = COLORS.stoneDark;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Battlements around the rim.
  const merlons = 10;
  ctx.fillStyle = COLORS.merlon;
  for (let index = 0; index < merlons; index += 1) {
    const angle = (index / merlons) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(angle) * (radius - 4), y + Math.sin(angle) * (radius - 4));
    ctx.rotate(angle);
    ctx.fillRect(-3, -3.5, 6, 7);
    ctx.restore();
  }
  circle(ctx, x, y, radius - 9, COLORS.floor);

  // The archer, bow towards the aim.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(run.aim);
  circle(ctx, 0, 0, 6.5, COLORS.tunic);
  circle(ctx, -1, 0, 4, COLORS.skin);
  ctx.strokeStyle = COLORS.bow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(2, 0, 8, -1.1, 1.1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(2 + Math.cos(-1.1) * 8, Math.sin(-1.1) * 8);
  ctx.lineTo(2 + Math.cos(1.1) * 8, Math.sin(1.1) * 8);
  ctx.stroke();
  ctx.restore();

  // Wall HP as a ring.
  const share = Math.max(0, run.hp / tower.maxHp);
  ring(ctx, x, y, radius + 5, 0, 1, COLORS.hpBack, 3.5);
  ring(ctx, x, y, radius + 5, 0, share, share > 0.5 ? COLORS.good : share > 0.25 ? COLORS.warn : COLORS.bad, 3.5);

  // Volley charge: a thin arc filling up, then a soft pulse once it's ready.
  if (run.volleyLeft > 0) {
    ring(ctx, x, y, radius + 10, 0, 1 - run.volleyLeft / tower.volleyCooldown, "rgba(255, 255, 255, 0.85)", 2);
  } else if (run.phase === "playing") {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ring(ctx, x, y, radius + 10 + pulse * 3, 0, 1, `rgba(255, 255, 255, ${0.35 + 0.4 * pulse})`, 2);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  const def = ENEMIES[enemy.kind];
  const { x, y, radius } = enemy;
  const facing = Math.atan2(WALL_Y - y, enemy.targetX - x);

  if (enemy.flying) {
    ellipse(ctx, x + 8, y + 14, radius * 0.8, radius * 0.45, COLORS.shadow);
    const flap = Math.sin(time * 18 + enemy.phase);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);
    ctx.fillStyle = shade(def.color, -0.15);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, side * radius * 0.4);
      ctx.lineTo(-radius * 0.6, side * (radius * 1.6 + flap * 4));
      ctx.lineTo(radius * 0.5, side * (radius * 1.2 + flap * 3));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else {
    ellipse(ctx, x + 2, y + radius * 0.7, radius, radius * 0.5, COLORS.shadow);
  }

  if (enemy.kind === "runner") {
    // Speed lines trailing behind.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const offset of [-3, 3]) {
      const backX = x - Math.cos(facing) * (radius + 3) - Math.sin(facing) * offset;
      const backY = y - Math.sin(facing) * (radius + 3) + Math.cos(facing) * offset;
      ctx.moveTo(backX, backY);
      ctx.lineTo(backX - Math.cos(facing) * 6, backY - Math.sin(facing) * 6);
    }
    ctx.stroke();
  }

  circle(ctx, x, y, radius, def.color);
  ctx.strokeStyle = shade(def.color, -0.3);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  if (enemy.kind === "brute") {
    ctx.fillStyle = "#efe6d2";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(radius * 0.1, side * radius * 0.7);
      ctx.lineTo(radius * 0.9, side * radius * 1.15);
      ctx.lineTo(radius * 0.5, side * radius * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (enemy.kind === "boss") {
    ctx.fillStyle = COLORS.crown;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.5, -radius * 0.45);
    ctx.lineTo(-radius * 0.5, radius * 0.45);
    for (const [px, py] of [
      [-radius * 0.05, radius * 0.45],
      [-radius * 0.25, radius * 0.22],
      [-radius * 0.05, 0],
      [-radius * 0.25, -radius * 0.22],
      [-radius * 0.05, -radius * 0.45],
    ]) {
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Eyes on the side facing the tower.
  const eye = Math.max(1.6, radius * 0.22);
  for (const side of [-1, 1]) {
    circle(ctx, radius * 0.45, side * radius * 0.35, eye, "#ffffff");
    circle(ctx, radius * 0.45 + eye * 0.35, side * radius * 0.35, eye * 0.55, "#1d1b26");
  }
  ctx.restore();

  if (enemy.slowLeft > 0) {
    ctx.strokeStyle = COLORS.frost;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.burnLeft > 0) {
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 3 + enemy.phase + (index * Math.PI * 2) / 3;
      const lift = (time * 2 + index / 3) % 1;
      ctx.globalAlpha = 1 - lift;
      circle(ctx, x + Math.cos(angle) * radius * 0.6, y - radius * 0.4 - lift * 8, 1.8, COLORS.burn);
    }
    ctx.globalAlpha = 1;
  }
  if (enemy.flash > 0) {
    ctx.globalAlpha = Math.min(1, enemy.flash / 0.08) * 0.7;
    circle(ctx, x, y, radius, "#ffffff");
    ctx.globalAlpha = 1;
  }
  if (enemy.hp < enemy.maxHp) {
    const width = Math.max(14, radius * 2);
    const top = y - radius - (enemy.flying ? 12 : 6);
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x - width / 2, top, width, 3);
    ctx.fillStyle = enemy.kind === "boss" ? COLORS.bad : COLORS.good;
    ctx.fillRect(x - width / 2, top, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, length = 12): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-length * 0.7, 0);
  ctx.lineTo(length * 0.3, 0);
  ctx.stroke();
  ctx.fillStyle = "#d9d9d9";
  ctx.beginPath();
  ctx.moveTo(length * 0.3 + 3, 0);
  ctx.lineTo(length * 0.3 - 1, -2);
  ctx.lineTo(length * 0.3 - 1, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.fletch;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-length * 0.7, 0);
  ctx.lineTo(-length * 0.7 - 2, -2);
  ctx.moveTo(-length * 0.7, 0);
  ctx.lineTo(-length * 0.7 - 2, 2);
  ctx.stroke();
  ctx.restore();
}

function drawVolleyArrow(ctx: CanvasRenderingContext2D, volley: VolleyArrow): void {
  const t = Math.min(1, volley.t);
  const dx = volley.toX - volley.fromX;
  const dy = volley.toY - volley.fromY;
  const groundX = volley.fromX + dx * t;
  const groundY = volley.fromY + dy * t;
  const peak = 40 + Math.hypot(dx, dy) * 0.25;
  const height = Math.sin(Math.PI * t) * peak;
  // Screen-space heading: along the ground, minus how fast it is rising.
  const angle = Math.atan2(dy - Math.cos(Math.PI * t) * Math.PI * peak, dx);
  ellipse(ctx, groundX, groundY, 2.5, 1.4, COLORS.shadow);
  drawArrow(ctx, groundX, groundY - height, angle, COLORS.shaft, 13);
}

function drawCaltrop(ctx: CanvasRenderingContext2D, caltrop: Caltrop): void {
  ctx.globalAlpha = Math.min(1, caltrop.life);
  // Stuck in at a slant: a short shaft and its fletching.
  drawArrow(ctx, caltrop.x, caltrop.y, caltrop.angle, COLORS.shaft, 7);
  ctx.globalAlpha = 1;
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect): void {
  const progress = 1 - effect.life / effect.duration;
  ctx.globalAlpha = 1 - progress;
  if (effect.kind === "mark") {
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * (1 - progress * 0.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (effect.kind === "pop") {
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const reach = effect.radius * (0.6 + progress * 1.2);
      circle(ctx, effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach, 2.5 * (1 - progress) + 0.5, effect.color);
    }
  } else {
    circle(ctx, effect.x, effect.y, effect.radius * (0.6 + progress), effect.color);
  }
  ctx.globalAlpha = 1;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** An arc from the top, clockwise, covering `to - from` of the circle. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, from: number, to: number, color: string, width: number): void {
  if (to <= from) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2);
  ctx.stroke();
}

/** Lighten (amount > 0) or darken a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const base = (value >> shift) & 0xff;
    const next = amount < 0 ? base * (1 + amount) : base + (255 - base) * amount;
    return Math.round(next).toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
