/*
 * The flat-vector pieces Lone Tower is drawn from, seen from straight above:
 * the horde, the round stone tower and its archer, arrows, trees, the castle
 * wall and the town behind it.
 *
 * Shared with Kingsroad, so both games look like the same kingdom. Everything
 * draws in world units at the context's current transform.
 */
import { ENEMIES } from "../sim/balance";
import { random } from "../sim/random";
import type { Effect, EnemyKind, VolleyArrow } from "../sim/types";

export const COLORS = {
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

/** What the renderer needs to know about one enemy, whichever game it marches in. */
export interface FoeSprite {
  kind: EnemyKind;
  /** Paints the body in this colour instead of the kind's own, for a foe dressed as another kind. */
  color?: string;
  x: number;
  y: number;
  radius: number;
  speed: number;
  flying: boolean;
  hp: number;
  maxHp: number;
  slowLeft: number;
  burnLeft: number;
  flash: number;
  /** Offsets the stride, flap and burn embers so a column doesn't move in step. */
  phase: number;
}

export interface Tuft {
  x: number;
  y: number;
  size: number;
  flower: boolean;
}

export interface Tree {
  x: number;
  y: number;
  radius: number;
}

export interface House {
  x: number;
  y: number;
  width: number;
  height: number;
  roof: string;
}

/** The woods along the top edge that the horde comes out of, the same row for the same seed. */
export function treeline(seed: number, width: number): Tree[] {
  const source = { rng: seed };
  const trees: Tree[] = [];
  for (let x = -14; x < width + 20; x += 20 + random(source) * 8) {
    trees.push({ x, y: 2 + random(source) * 10, radius: 14 + random(source) * 7 });
  }
  return trees;
}

export interface TreePalette {
  shadow: string;
  canopy: string;
  light: string;
}

export function drawTrees(
  ctx: CanvasRenderingContext2D,
  trees: readonly Tree[],
  palette: TreePalette = { shadow: COLORS.forest, canopy: COLORS.canopy, light: COLORS.canopyLight },
): void {
  for (const tree of trees) circle(ctx, tree.x + 2, tree.y + 5, tree.radius, palette.shadow);
  for (const tree of trees) {
    circle(ctx, tree.x, tree.y, tree.radius, palette.canopy);
    circle(ctx, tree.x - tree.radius * 0.3, tree.y - tree.radius * 0.3, tree.radius * 0.45, palette.light);
  }
}

export interface TuftPalette {
  blade: string;
  flower: string;
}

export function drawTufts(
  ctx: CanvasRenderingContext2D,
  tufts: readonly Tuft[],
  palette: TuftPalette = { blade: COLORS.tuft, flower: COLORS.flower },
): void {
  for (const tuft of tufts) {
    if (tuft.flower) {
      circle(ctx, tuft.x, tuft.y, tuft.size * 0.45, palette.flower);
      continue;
    }
    ctx.strokeStyle = palette.blade;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const lean of [-0.5, 0, 0.5]) {
      ctx.moveTo(tuft.x + lean * 2, tuft.y);
      ctx.lineTo(tuft.x + lean * tuft.size, tuft.y - tuft.size);
    }
    ctx.stroke();
  }
}

/** The cobbled courtyard behind the wall, from its top edge down past the bottom of the screen. */
export function drawCourtyard(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
  palette: { base: string; stone: string } = { base: COLORS.courtyard, stone: COLORS.cobble },
): void {
  ctx.fillStyle = palette.base;
  ctx.fillRect(left, top, right - left, bottom - top + 400);
  // Cobbles: a loose grid of small flat stones.
  ctx.fillStyle = palette.stone;
  for (let y = top + 22; y < bottom + 40; y += 9) {
    for (let x = left + ((y / 9) % 2) * 6; x < right; x += 12) ctx.fillRect(x, y, 7, 4);
  }
}

export function drawHouses(ctx: CanvasRenderingContext2D, houses: readonly House[]): void {
  for (const house of houses) {
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
}

/** The wall: a walkway with battlements along the front face at `y`. */
export function drawWall(ctx: CanvasRenderingContext2D, left: number, right: number, y: number): void {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(left, y, right - left, 16);
  ctx.fillStyle = COLORS.wallTop;
  ctx.fillRect(left, y + 4, right - left, 8);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(left, y + 16, right - left, 4);
  for (let x = Math.floor(left / 16) * 16; x < right; x += 16) {
    ctx.fillStyle = COLORS.merlon;
    ctx.fillRect(x + 2, y - 3, 9, 7);
    ctx.strokeStyle = COLORS.stoneDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y - 3, 9, 7);
  }
}

/**
 * A round stone tower with battlements around the rim and a wooden floor
 * inside. Lone Tower's is 26 across the radius; smaller ones scale down whole.
 */
export function drawRoundTower(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, floor: string = COLORS.floor): void {
  const k = radius / 26;
  ellipse(ctx, x + 4 * k, y + 6 * k, radius + 2 * k, radius + 1 * k, COLORS.shadow);
  circle(ctx, x, y, radius, COLORS.stone);
  ctx.strokeStyle = COLORS.stoneDark;
  ctx.lineWidth = 2 * k;
  ctx.stroke();

  // Battlements around the rim.
  const merlons = 10;
  ctx.fillStyle = COLORS.merlon;
  for (let index = 0; index < merlons; index += 1) {
    const angle = (index / merlons) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(angle) * (radius - 4 * k), y + Math.sin(angle) * (radius - 4 * k));
    ctx.rotate(angle);
    ctx.fillRect(-3 * k, -3.5 * k, 6 * k, 7 * k);
    ctx.restore();
  }
  circle(ctx, x, y, radius - 9 * k, floor);
}

/** The archer standing in a tower, bow towards `aim`. */
export function drawArcher(ctx: CanvasRenderingContext2D, x: number, y: number, aim: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);
  ctx.scale(scale, scale);
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
}

/** One enemy facing `facing` radians, with its shadow, frost, embers, hit flash and HP bar. */
export function drawFoe(ctx: CanvasRenderingContext2D, foe: FoeSprite, facing: number, time: number): void {
  const def = ENEMIES[foe.kind];
  const { x, y, radius } = foe;

  if (foe.flying) {
    ellipse(ctx, x + 8, y + 14, radius * 0.8, radius * 0.45, COLORS.shadow);
    const flap = Math.sin(time * 18 + foe.phase);
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

  if (foe.kind === "runner") {
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

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  if (foe.flying) drawBat(ctx, radius, foe.color ?? def.color);
  else drawSoldier(ctx, foe, foe.color ?? def.color, time);
  ctx.restore();

  if (foe.slowLeft > 0) {
    ctx.strokeStyle = COLORS.frost;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (foe.burnLeft > 0) {
    for (let index = 0; index < 3; index += 1) {
      const angle = time * 3 + foe.phase + (index * Math.PI * 2) / 3;
      const lift = (time * 2 + index / 3) % 1;
      ctx.globalAlpha = 1 - lift;
      circle(ctx, x + Math.cos(angle) * radius * 0.6, y - radius * 0.4 - lift * 8, 1.8, COLORS.burn);
    }
    ctx.globalAlpha = 1;
  }
  if (foe.flash > 0) {
    ctx.globalAlpha = Math.min(1, foe.flash / 0.08) * 0.7;
    circle(ctx, x, y, radius, "#ffffff");
    ctx.globalAlpha = 1;
  }
  if (foe.hp < foe.maxHp) {
    const width = Math.max(14, radius * 2);
    const top = y - radius - (foe.flying ? 12 : 6);
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x - width / 2, top, width, 3);
    ctx.fillStyle = foe.kind === "boss" ? COLORS.bad : COLORS.good;
    ctx.fillRect(x - width / 2, top, width * Math.max(0, foe.hp / foe.maxHp), 3);
  }
}

/** A bat seen from above: furry body, pricked ears, a pair of eyes. */
function drawBat(ctx: CanvasRenderingContext2D, radius: number, color: string): void {
  ellipse(ctx, 0, 0, radius * 0.8, radius * 0.6, color);
  for (const side of [-1, 1]) {
    ctx.fillStyle = shade(color, -0.3);
    ctx.beginPath();
    ctx.moveTo(radius * 0.4, side * radius * 0.2);
    ctx.lineTo(radius * 0.75, side * radius * 0.7);
    ctx.lineTo(radius * 0.05, side * radius * 0.45);
    ctx.closePath();
    ctx.fill();
    circle(ctx, radius * 0.5, side * radius * 0.25, 1.6, "#ff6b6b");
  }
}

/**
 * One soldier of the horde, seen from above and facing +x: boots that step,
 * shoulders in the army's colour, a helmet and whatever it carries.
 */
function drawSoldier(ctx: CanvasRenderingContext2D, foe: FoeSprite, color: string, time: number): void {
  const { kind, radius } = foe;
  const steel = "#b8bfc9";
  const dark = shade(color, -0.35);
  const stride = Math.sin(time * foe.speed * 0.22 + foe.phase);

  // Boots, stepping in turn.
  for (const side of [-1, 1]) {
    ellipse(ctx, stride * side * radius * 0.4, side * radius * 0.4, radius * 0.38, radius * 0.22, "#3a2c22");
  }

  if (kind === "boss") {
    // Cape trailing behind.
    ctx.fillStyle = "#7d1f2a";
    ctx.beginPath();
    ctx.moveTo(-radius * 0.1, -radius * 0.7);
    ctx.lineTo(-radius * 1.15, -radius * 0.45 + stride * 2);
    ctx.lineTo(-radius * 1.15, radius * 0.45 - stride * 2);
    ctx.lineTo(-radius * 0.1, radius * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  // Weapon arm and weapon, held forward.
  const swing = stride * 1.5;
  ctx.lineCap = "round";
  if (kind === "grunt") {
    ctx.strokeStyle = "#6b4423";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.3, radius * 0.55);
    ctx.lineTo(radius * 1.5, radius * 0.55 + swing * 0.3);
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(radius * 1.5, radius * 0.55 - 2.5 + swing * 0.3);
    ctx.lineTo(radius * 1.95, radius * 0.55 + swing * 0.3);
    ctx.lineTo(radius * 1.5, radius * 0.55 + 2.5 + swing * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "runner") {
    ctx.strokeStyle = steel;
    ctx.lineWidth = 1.8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(radius * 0.3, side * radius * 0.7);
      ctx.lineTo(radius * 1.15, side * radius * 0.7 + swing * side * 0.4);
      ctx.stroke();
    }
  } else if (kind === "brute") {
    ctx.strokeStyle = "#5a3a1a";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.1, radius * 0.75);
    ctx.lineTo(radius * 1.35, radius * 0.75 + swing * 0.4);
    ctx.stroke();
    circle(ctx, radius * 1.4, radius * 0.75 + swing * 0.4, radius * 0.3, "#4a3a2e");
  } else {
    ctx.strokeStyle = steel;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(radius * 0.2, radius * 0.7);
    ctx.lineTo(radius * 1.6, radius * 0.7 + swing * 0.3);
    ctx.stroke();
    ctx.strokeStyle = COLORS.crown;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(radius * 0.4, radius * 0.7 - 5);
    ctx.lineTo(radius * 0.4, radius * 0.7 + 5);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // Shield on the other arm for the footman and the brute.
  if (kind === "grunt" || kind === "brute") {
    const shield = kind === "brute" ? radius * 0.5 : radius * 0.42;
    ellipse(ctx, radius * 0.5, -radius * 0.75, shield, shield * 1.15, "#8a6a45");
    circle(ctx, radius * 0.5, -radius * 0.75, shield * 0.35, steel);
  }

  if (kind === "brute" || kind === "boss") {
    drawHeavy(ctx, kind, radius, color);
    return;
  }

  // Shoulders and torso.
  const shoulders = kind === "runner" ? 0.6 : 0.78;
  ellipse(ctx, 0, 0, radius * 0.5, radius * (shoulders + 0.12), color);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Helmet.
  const head = radius * (kind === "runner" ? 0.34 : 0.4);
  circle(ctx, 0, 0, head, kind === "runner" ? dark : steel);
  ctx.strokeStyle = shade(steel, -0.35);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * The brute's and the warlord's upper body: a broad back, shoulder plates that
 * curve over the edge of it, and a head pushed forward of the shoulder line, so
 * the three never read as a row of equal balls.
 */
function drawHeavy(ctx: CanvasRenderingContext2D, kind: "brute" | "boss", radius: number, color: string): void {
  const dark = shade(color, -0.35);
  const brute = kind === "brute";

  // Back and chest: wider than deep, rounder than the footmen's.
  ellipse(ctx, -radius * 0.05, 0, radius * 0.56, radius * 0.86, color);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // The shadowed spine where the back curves away from the light.
  ellipse(ctx, -radius * 0.28, 0, radius * 0.18, radius * 0.5, shade(color, -0.15));

  // Shoulder plates: curved bands hugging the outline over each shoulder.
  for (const side of [-1, 1]) {
    const plate = brute ? "#5b4636" : shade(color, -0.3);
    const rim = brute ? "#3a2c22" : COLORS.crown;
    shoulderBand(ctx, radius, side, 1.08, 0.62, 0.55, plate, rim);
    if (brute) {
      // Studs along the leather.
      for (const along of [-0.3, 0, 0.3]) {
        const angle = side * (Math.PI / 2) + along;
        circle(ctx, -radius * 0.05 + Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.73, radius * 0.055, "#b8bfc9");
      }
    } else {
      // A narrower plate on top: layered armour.
      shoulderBand(ctx, radius, side, 0.95, 0.75, 0.38, shade(color, -0.12), shade(color, -0.45));
    }
  }

  // The head, forward of the shoulders and smaller than either plate.
  const head = radius * 0.3;
  const headX = radius * 0.14;
  if (brute) {
    // Horns first, out to the sides and curling forward at the tips.
    ctx.fillStyle = "#efe6d2";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(headX - head * 0.35, side * head * 0.75);
      ctx.quadraticCurveTo(headX - head * 0.6, side * head * 2.6, headX + head * 1.3, side * head * 2.5);
      ctx.quadraticCurveTo(headX + head * 0.1, side * head * 1.8, headX + head * 0.35, side * head * 0.75);
      ctx.closePath();
      ctx.fill();
    }
    circle(ctx, headX, 0, head, "#6d6873");
    ctx.strokeStyle = "#45414b";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    return;
  }
  // The warlord: a dark helm ringed by a crown, seen from above.
  circle(ctx, headX, 0, head, "#5a2a2e");
  ctx.strokeStyle = COLORS.crown;
  ctx.lineWidth = radius * 0.1;
  ctx.beginPath();
  ctx.arc(headX, 0, head * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    circle(ctx, headX + Math.cos(angle) * head * 0.95, Math.sin(angle) * head * 0.95, radius * 0.07, "#fff4c2");
  }
}

/**
 * A band along the heavy torso's outline, centred on one shoulder: between the
 * outline scaled by `outer` and by `inner`, `spread` radians either side.
 */
function shoulderBand(
  ctx: CanvasRenderingContext2D,
  radius: number,
  side: number,
  outer: number,
  inner: number,
  spread: number,
  fill: string,
  rim: string,
): void {
  const centre = side * (Math.PI / 2);
  const cx = -radius * 0.05;
  ctx.beginPath();
  ctx.ellipse(cx, 0, radius * 0.56 * outer, radius * 0.86 * outer, 0, centre - spread, centre + spread);
  ctx.ellipse(cx, 0, radius * 0.56 * inner, radius * 0.86 * inner, 0, centre + spread, centre - spread, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

export function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, length = 12): void {
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

/** How high an arc from `from` to `to` peaks, so lobbed shots read as lobbed whatever the distance. */
export function arcPeak(fromX: number, fromY: number, toX: number, toY: number): number {
  return 40 + Math.hypot(toX - fromX, toY - fromY) * 0.25;
}

/** One arrow of a volley partway along its arc, with its shadow on the ground beneath. */
export function drawVolleyArrow(ctx: CanvasRenderingContext2D, volley: VolleyArrow): void {
  const t = Math.min(1, volley.t);
  const dx = volley.toX - volley.fromX;
  const dy = volley.toY - volley.fromY;
  const groundX = volley.fromX + dx * t;
  const groundY = volley.fromY + dy * t;
  const peak = arcPeak(volley.fromX, volley.fromY, volley.toX, volley.toY);
  const height = Math.sin(Math.PI * t) * peak;
  // Screen-space heading: along the ground, minus how fast it is rising.
  const angle = Math.atan2(dy - Math.cos(Math.PI * t) * Math.PI * peak, dx);
  ellipse(ctx, groundX, groundY, 2.5, 1.4, COLORS.shadow);
  drawArrow(ctx, groundX, groundY - height, angle, COLORS.shaft, 13);
}

/** Dust, a pop of bits when something falls, or the dashed ring where a volley is coming down. */
export function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect): void {
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

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** An arc from the top, clockwise, covering `to - from` of the circle. */
export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, from: number, to: number, color: string, width: number): void {
  if (to <= from) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2);
  ctx.stroke();
}

/** Lighten (amount > 0) or darken a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const base = (value >> shift) & 0xff;
    const next = amount < 0 ? base * (1 + amount) : base + (255 - base) * amount;
    return Math.round(next).toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
