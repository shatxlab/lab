/*
 * Flat-vector canvas drawing for Lone Tower, seen from straight above; the
 * pieces themselves are in `sprites.ts`, shared with Kingsroad.
 *
 * Draws in world units: the caller sets the context's transform to the
 * device pixel ratio and `drawRun` adds the arena fit on top, so nothing
 * here has to think about screen size.
 */
import { ARENA, TOWER, WALL_Y } from "../sim/balance";
import { random } from "../sim/random";
import { stats } from "../sim/run";
import type { Caltrop, Enemy, Run } from "../sim/types";
import {
  COLORS,
  drawArcher,
  drawArrow,
  drawCourtyard,
  drawEffect,
  drawFoe,
  drawHouses,
  drawRoundTower,
  drawTrees,
  drawTufts,
  drawVolleyArrow,
  drawWall,
  ring,
  treeline,
  type House,
  type Tuft,
} from "./sprites";

export interface View {
  /** CSS pixels of the canvas. */
  width: number;
  height: number;
  /** CSS pixels per world unit. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

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

// The town behind the wall, two houses either side of the tower.
const HOUSES: House[] = [
  { x: 14, y: 590, width: 62, height: 34, roof: "#b5523b" },
  { x: 86, y: 602, width: 46, height: 28, roof: "#3f6fa0" },
  { x: 228, y: 602, width: 46, height: 28, roof: "#b5523b" },
  { x: 284, y: 590, width: 62, height: 34, roof: "#3f6fa0" },
];

// The woods the enemies come out of, along the top edge.
const TREES = treeline(7, ARENA.width);

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
  drawCourtyard(ctx, left, right, WALL_Y, ARENA.height);
  drawHouses(ctx, HOUSES);
  drawWall(ctx, left, right, WALL_Y);
  for (const caltrop of run.caltrops) drawCaltrop(ctx, caltrop);
  for (const effect of run.effects) if (effect.kind === "mark") drawEffect(ctx, effect);
  for (const enemy of run.enemies) if (!enemy.flying) drawEnemy(ctx, enemy, time);
  drawTower(ctx, run, time);
  for (const arrow of run.arrows) drawArrow(ctx, arrow.x, arrow.y, Math.atan2(arrow.vy, arrow.vx), arrow.crit ? COLORS.crit : COLORS.shaft);
  for (const enemy of run.enemies) if (enemy.flying) drawEnemy(ctx, enemy, time);
  drawTrees(ctx, TREES);
  for (const volley of run.volleys) drawVolleyArrow(ctx, volley);
  for (const effect of run.effects) if (effect.kind !== "mark") drawEffect(ctx, effect);

  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, run: Run): void {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, ARENA.width, WALL_Y);
  drawTufts(ctx, TUFTS);
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
  drawRoundTower(ctx, x, y, radius);
  drawArcher(ctx, x, y, run.aim);

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

/** An enemy faces the bit of wall it is heading for. */
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number): void {
  drawFoe(ctx, enemy, Math.atan2(WALL_Y - enemy.y, enemy.targetX - enemy.x), time);
}

function drawCaltrop(ctx: CanvasRenderingContext2D, caltrop: Caltrop): void {
  ctx.globalAlpha = Math.min(1, caltrop.life);
  // Stuck in at a slant: a short shaft and its fletching.
  drawArrow(ctx, caltrop.x, caltrop.y, caltrop.angle, COLORS.shaft, 7);
  ctx.globalAlpha = 1;
}
