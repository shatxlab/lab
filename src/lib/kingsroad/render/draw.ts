/*
 * Flat-vector canvas drawing for Kingsroad, seen from straight above.
 *
 * The horde, the round stone towers, the archer, the arrows, the woods and
 * the castle are Lone Tower's (`@/lib/tower/render/sprites`); this adds the
 * road, the build plots, the gatehouse and the three new kinds of tower.
 * Draws in world units: the caller sets the context's transform to the device
 * pixel ratio and `drawGame` adds the arena fit on top.
 */
import { random } from "@/lib/tower/sim/random";
import {
  COLORS,
  arcPeak,
  circle,
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
  ellipse,
  shade,
  type FoeSprite,
  type Tree,
  type Tuft,
} from "@/lib/tower/render/sprites";
import { ARENA, FOES, GATE, HEAL_RANGE, PLOT_RADIUS, ROAD_HALF, TOWERS, WALL_Y } from "../sim/balance";
import { levelOf } from "../sim/game";
import { mapById, type MapDef } from "../sim/maps";
import { distanceToPath, poseAt } from "../sim/path";
import type { Foe, Game, MapId, Shot, Tower, TowerKind } from "../sim/types";
import { THEMES, type Theme } from "./themes";

export interface View {
  /** CSS pixels of the canvas. */
  width: number;
  height: number;
  /** CSS pixels per world unit. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** What the page has picked out on the field. */
export interface Selection {
  plot: number | null;
  /** A tower the player is weighing up for an empty plot: its range is shown there. */
  preview: TowerKind | null;
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

interface Scenery {
  tufts: Tuft[];
  /** Copses in the gaps the road and the plots leave. */
  trees: Tree[];
  pebbles: { x: number; y: number; size: number }[];
}

const SCENERY = new Map<MapId, Scenery>();

/** The same meadow every time for the same map: a fixed seed, not the game's. */
function sceneryFor(map: MapDef): Scenery {
  const cached = SCENERY.get(map.id);
  if (cached) return cached;
  const source = { rng: 20261026 + map.id.length };
  const clearOfRoads = (x: number, y: number, gap: number) => map.roads.every((road) => distanceToPath(road, x, y) > ROAD_HALF + gap);
  const clearOfPlots = (x: number, y: number, gap: number) => map.plots.every((plot) => Math.hypot(plot.x - x, plot.y - y) > PLOT_RADIUS + gap);

  const tufts: Tuft[] = [];
  for (let tries = 0; tufts.length < 70 && tries < 2000; tries += 1) {
    const x = random(source) * ARENA.width;
    const y = 24 + random(source) * (WALL_Y - 36);
    if (!clearOfRoads(x, y, 4)) continue;
    tufts.push({ x, y, size: 3 + random(source) * 4, flower: random(source) < 0.2 });
  }

  const trees: Tree[] = [];
  for (let tries = 0; trees.length < 16 && tries < 2000; tries += 1) {
    const x = 10 + random(source) * (ARENA.width - 20);
    const y = 50 + random(source) * (WALL_Y - 90);
    const radius = 8 + random(source) * 6;
    if (!clearOfRoads(x, y, radius + 6) || !clearOfPlots(x, y, radius + 8)) continue;
    if (trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < tree.radius + radius)) continue;
    trees.push({ x, y, radius });
  }

  const pebbles: Scenery["pebbles"] = [];
  for (const road of map.roads) {
    for (let along = 10; along < road.length; along += 14 + random(source) * 10) {
      const pose = poseAt(road, along);
      const side = (random(source) * 2 - 1) * (ROAD_HALF - 3);
      pebbles.push({ x: pose.x - Math.sin(pose.angle) * side, y: pose.y + Math.cos(pose.angle) * side, size: 1 + random(source) * 1.3 });
    }
  }

  const scenery = { tufts, trees, pebbles };
  SCENERY.set(map.id, scenery);
  return scenery;
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, view: View, selection: Selection, time: number): void {
  const map = mapById(game.map);
  const scenery = sceneryFor(map);
  const theme = THEMES[map.canvas];
  // Past the arena's edges the woods carry on above the wall and the courtyard below it.
  const wallOnScreen = view.offsetY + WALL_Y * view.scale;
  ctx.fillStyle = theme.woods;
  ctx.fillRect(0, 0, view.width, wallOnScreen);
  ctx.fillStyle = theme.courtyard;
  ctx.fillRect(0, wallOnScreen, view.width, view.height - wallOnScreen);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  const left = -view.offsetX / view.scale;
  const right = (view.width - view.offsetX) / view.scale;

  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, ARENA.width, WALL_Y);
  drawTufts(ctx, scenery.tufts);
  drawRoads(ctx, map, scenery, theme);
  drawCourtyard(ctx, left, right, WALL_Y, ARENA.height);
  drawStreet(ctx, theme);
  drawHouses(ctx, theme.houses);
  drawWall(ctx, left, right, WALL_Y);
  drawGatehouse(ctx, theme);

  for (const [index, plot] of map.plots.entries()) {
    if (!game.towers.some((tower) => tower.plot === index)) drawPlot(ctx, theme, plot.x, plot.y, index === selection.plot, time);
  }
  drawRange(ctx, game, map, selection);
  for (const effect of game.effects) if (effect.kind === "mark") drawEffect(ctx, effect);
  for (const foe of game.foes) if (!foe.flying) drawKingsroadFoe(ctx, foe, time);
  for (const foe of game.foes) if (foe.markLeft > 0) drawMarkRing(ctx, foe, time);
  drawTrees(ctx, scenery.trees);
  for (const tower of game.towers) drawTower(ctx, map, tower, tower.plot === selection.plot, time);
  for (const shot of game.shots) drawShot(ctx, shot, time);
  for (const foe of game.foes) if (foe.flying) drawKingsroadFoe(ctx, foe, time);
  drawTrees(ctx, theme.treeline);
  for (const volley of game.volleys) drawVolleyArrow(ctx, volley);
  for (const effect of game.effects) if (effect.kind !== "mark") drawEffect(ctx, effect);

  ctx.restore();
}

/** Every road's verge first, then every road's surface, so where two roads join they read as one. */
function drawRoads(ctx: CanvasRenderingContext2D, map: MapDef, scenery: Scenery, theme: Theme): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [color, width] of [
    [theme.road.edge, ROAD_HALF * 2 + 4],
    [theme.road.fill, ROAD_HALF * 2],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const road of map.roads) {
      ctx.beginPath();
      road.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.stroke();
    }
  }
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  for (const pebble of scenery.pebbles) circle(ctx, pebble.x, pebble.y, pebble.size, theme.road.pebble);
}

/** The road carries on through the gate as a paved street down between the houses. */
function drawStreet(ctx: CanvasRenderingContext2D, theme: Theme): void {
  ctx.fillStyle = shade(theme.courtyard, 0.12);
  ctx.fillRect(GATE.x - ROAD_HALF, WALL_Y, ROAD_HALF * 2, ARENA.height - WALL_Y + 400);
}

/** Which of Lone Tower's figures each new foe is dressed from. */
const DRESSED_AS = { knight: "grunt", imp: "runner", healer: "grunt", scamp: "grunt", gargoyle: "bat" } as const;

/** Lone Tower's five are drawn as they are; the new foes borrow a figure, take their own colour and add a mark. */
function drawKingsroadFoe(ctx: CanvasRenderingContext2D, foe: Foe, time: number): void {
  if (!(foe.kind in DRESSED_AS)) {
    drawFoe(ctx, foe as FoeSprite, foe.facing, time);
    return;
  }
  const kind = foe.kind as keyof typeof DRESSED_AS;
  if (kind === "healer") {
    ctx.fillStyle = `rgba(120, 220, 140, ${0.1 + 0.05 * Math.sin(time * 3)})`;
    ctx.beginPath();
    ctx.arc(foe.x, foe.y, HEAL_RANGE, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFoe(ctx, { ...foe, kind: DRESSED_AS[kind], color: FOES[kind].color }, foe.facing, time);
  const { x, y, radius } = foe;
  if (kind === "knight") {
    ctx.strokeStyle = "#e6ebf2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.75, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  } else if (kind === "imp") {
    for (const side of [-1, 1]) circle(ctx, x + Math.cos(foe.facing) * radius * 0.5 - Math.sin(foe.facing) * side * radius * 0.7, y + Math.sin(foe.facing) * radius * 0.5 + Math.cos(foe.facing) * side * radius * 0.7, 1.6, "#ffd27a");
  } else if (kind === "healer") {
    ctx.fillStyle = "#3fae5a";
    ctx.fillRect(x - 1.5, y - 5, 3, 10);
    ctx.fillRect(x - 5, y - 1.5, 10, 3);
  } else if (kind === "gargoyle") {
    circle(ctx, x, y, radius * 0.3, "#c9ced6");
  }
}

/** A pale ring round a foe the lune has marked. */
function drawMarkRing(ctx: CanvasRenderingContext2D, foe: Foe, time: number): void {
  ctx.strokeStyle = `rgba(190, 215, 255, ${0.6 + 0.3 * Math.sin(time * 8)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(foe.x, foe.y, foe.radius + 4, 0, Math.PI * 2);
  ctx.stroke();
}

/** The gate in the wall: a dark arch with its doors swung open, a small round tower either side. */
function drawGatehouse(ctx: CanvasRenderingContext2D, theme: Theme): void {
  const { x } = GATE;
  ctx.fillStyle = theme.gate.arch;
  ctx.fillRect(x - ROAD_HALF - 1, WALL_Y - 3, ROAD_HALF * 2 + 2, 19);
  ctx.fillStyle = theme.gate.door;
  ctx.fillRect(x - ROAD_HALF - 1, WALL_Y + 14, 6, 9);
  ctx.fillRect(x + ROAD_HALF - 5, WALL_Y + 14, 6, 9);
  for (const side of [-1, 1]) drawRoundTower(ctx, x + side * (ROAD_HALF + 12), WALL_Y + 6, 12);
  // Pennants on the gate towers, in the town's two roof colours.
  circle(ctx, x - (ROAD_HALF + 12), WALL_Y + 6, 3, theme.gate.pennants[0]);
  circle(ctx, x + (ROAD_HALF + 12), WALL_Y + 6, 3, theme.gate.pennants[1]);
}

/** An empty build plot: a levelled pad of packed earth with a ring of stones. */
function drawPlot(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, selected: boolean, time: number): void {
  ellipse(ctx, x + 1, y + 2, PLOT_RADIUS, PLOT_RADIUS * 0.9, COLORS.shadow);
  circle(ctx, x, y, PLOT_RADIUS, theme.plot.pad);
  ctx.strokeStyle = theme.plot.rim;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, PLOT_RADIUS - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // A faint cross where the first stone goes.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.stroke();
  ctx.lineCap = "butt";
  if (selected) selectionRing(ctx, x, y, PLOT_RADIUS + 3, time);
}

function selectionRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, radius + pulse * 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

/** The reach of the selected tower, or of the one being weighed up for the selected plot. */
function drawRange(ctx: CanvasRenderingContext2D, game: Game, map: MapDef, selection: Selection): void {
  if (selection.plot === null) return;
  const plot = map.plots[selection.plot];
  const tower = game.towers.find((entry) => entry.plot === selection.plot);
  const range = tower ? levelOf(tower).range : selection.preview ? TOWERS[selection.preview].levels[0].range : 0;
  if (range <= 0) return;
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(plot.x, plot.y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

const FLOORS: Record<TowerKind, string> = {
  archer: COLORS.floor,
  catapult: "#8a6a45",
  frost: "#9cc3df",
  ballista: "#7a5a3a",
};

/** A tower grows a little with each level, and wears its level as gold studs along the front. */
export function towerRadius(level: number): number {
  return 13.5 + level * 1.5;
}

function drawTower(ctx: CanvasRenderingContext2D, map: MapDef, tower: Tower, selected: boolean, time: number): void {
  const { x, y } = map.plots[tower.plot];
  const radius = towerRadius(tower.level);
  drawRoundTower(ctx, x, y, radius, FLOORS[tower.kind]);
  const scale = radius / 26;
  if (tower.kind === "archer") drawArcher(ctx, x, y, tower.aim, 0.55 + scale * 0.4);
  else if (tower.kind === "catapult") drawCatapult(ctx, x, y, tower, scale);
  else if (tower.kind === "frost") drawMage(ctx, x, y, tower, scale, time);
  else drawBallista(ctx, x, y, tower, scale);
  for (let index = 0; index < tower.level; index += 1) {
    const angle = Math.PI / 2 + (index - (tower.level - 1) / 2) * 0.42;
    circle(ctx, x + Math.cos(angle) * (radius + 1), y + Math.sin(angle) * (radius + 1), 2.2, COLORS.crown);
  }
  if (selected) selectionRing(ctx, x, y, radius + 4, time);
}

/** A throwing arm on a wooden frame: it swings forward on the throw and is winched back while reloading. */
function drawCatapult(ctx: CanvasRenderingContext2D, x: number, y: number, tower: Tower, scale: number): void {
  const reload = levelOf(tower).reload;
  const cocked = Math.min(1, tower.sinceShot / (reload * 0.8));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tower.aim);
  ctx.scale(scale * 1.6, scale * 1.6);
  ctx.fillStyle = "#5a3a1a";
  for (const side of [-1, 1]) ctx.fillRect(-7, side * 4.5 - 1.2, 13, 2.4);
  ctx.fillRect(-1.5, -5, 3, 10);
  // The arm: forward right after a throw, swinging back as it reloads.
  const reach = -6 + (1 - cocked) * 14;
  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(reach, 0);
  ctx.stroke();
  circle(ctx, reach, 0, 2.6, "#4a3a2e");
  if (cocked >= 1) circle(ctx, reach, 0, 1.8, "#9a958c");
  ctx.restore();
}

/** A frost mage from above: a wide-brimmed pointed hat, a robe, a glowing orb held out towards the aim. */
function drawMage(ctx: CanvasRenderingContext2D, x: number, y: number, tower: Tower, scale: number, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tower.aim);
  ctx.scale(scale * 1.5, scale * 1.5);
  ellipse(ctx, -1, 0, 4.5, 6, "#4a64a8");
  circle(ctx, 0, 0, 4.4, "#2f4a8a");
  circle(ctx, 0, 0, 2, "#c9d8ff");
  const glow = 0.6 + 0.4 * Math.sin(time * 5 + tower.id);
  const flare = tower.sinceShot < 0.15 ? 1.6 : 1;
  ctx.globalAlpha = 0.35 * glow;
  circle(ctx, 7, 2.5, 4 * flare, COLORS.frost);
  ctx.globalAlpha = 1;
  circle(ctx, 7, 2.5, 1.9, "#e8f7ff");
  ctx.restore();
}

/** A ballista on its swivel: a stock along the aim, a heavy bow across the front, a bolt laid in when loaded. */
function drawBallista(ctx: CanvasRenderingContext2D, x: number, y: number, tower: Tower, scale: number): void {
  const loaded = tower.reloadLeft <= 0 || tower.sinceShot > 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tower.aim);
  ctx.scale(scale * 1.6, scale * 1.6);
  ctx.fillStyle = "#4a3a2e";
  ctx.fillRect(-7, -1.6, 13, 3.2);
  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-1, 0, 7.5, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 0.6;
  const pull = loaded ? -3 : 1;
  ctx.beginPath();
  ctx.moveTo(-1 + Math.cos(-1.15) * 7.5, Math.sin(-1.15) * 7.5);
  ctx.lineTo(pull, 0);
  ctx.lineTo(-1 + Math.cos(1.15) * 7.5, Math.sin(1.15) * 7.5);
  ctx.stroke();
  if (loaded) {
    ctx.strokeStyle = "#3a2c22";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pull, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot, time: number): void {
  if (shot.kind === "archer") {
    drawArrow(ctx, shot.x, shot.y, Math.atan2(shot.toY - shot.y, shot.toX - shot.x), shot.burn > 0 ? "#e8662a" : shot.mark > 0 ? "#8fb8e8" : COLORS.shaft, 10);
  } else if (shot.kind === "ballista") {
    drawArrow(ctx, shot.x, shot.y, Math.atan2(shot.toY - shot.fromY, shot.toX - shot.fromX), "#3a2c22", 18);
  } else if (shot.kind === "frost") {
    ctx.globalAlpha = 0.45;
    circle(ctx, shot.x, shot.y, 4.5 + Math.sin(time * 20) * 0.6, COLORS.frost);
    ctx.globalAlpha = 1;
    circle(ctx, shot.x, shot.y, 2, "#ffffff");
  } else {
    // A stone in the air: its shadow on the ground and the stone above it on the arc.
    const t = Math.min(1, shot.t);
    const height = Math.sin(Math.PI * t) * arcPeak(shot.fromX, shot.fromY, shot.toX, shot.toY) * 0.6;
    ellipse(ctx, shot.x, shot.y, 3, 1.6, COLORS.shadow);
    circle(ctx, shot.x, shot.y - height, 3.6, "#8c867c");
    circle(ctx, shot.x - 1, shot.y - height - 1, 1.4, "#b3ada3");
  }
}
