/*
 * Draws a hero run on a plain 2D canvas. Placeholder art: the hero is the real coworker sprite, everything else is
 * drawn from shapes until the run is proven fun. The camera follows the hero and stops at the walls (except below, on a tall view).
 */
import { DEPARTMENTS } from "@/lib/roster/data";
import { POSE_PAD } from "@/lib/tycoon/render-support/poses";
import { ARENA, BOARDROOM, CART, COFFEE, DUCK_RADIUS, enrageFactor, ESCORT, HERO_RADIUS, PAPERWORK, PILOT_BOSS, SERVER_ROOM, SHOCK, weaponNumbers } from "../sim/balance";
import type { Foe, Run } from "../sim/types";
import { BOSS_PIXEL, type BossFrames } from "./bosses";
import { FIGURE_PIXEL, type BossFigures } from "./boss-figures";
import { AUDITOR_PIXEL } from "./auditor";
import type { HeroFrames } from "./heroes";

export interface View {
  /** CSS pixels. */
  width: number;
  height: number;
  /** CSS pixels per world unit. */
  scale: number;
}

/**
 * About 420 world units across the short side, so a phone sees a little less than the distance foes spawn at; a wide
 * screen zooms in until its long side does too, so nobody watches foes pop into being.
 */
export function fitView(width: number, height: number): View {
  const scale = Math.max(Math.min(width, height) / 420, Math.max(width, height) / 880, 0.1);
  return { width, height, scale };
}

/**
 * Where the hero sits down the screen on a tall (phone) view, as a share of the height: above the middle, so the thumb
 * on the stick doesn't cover them or the ground ahead of them.
 */
const PORTRAIT_FOCUS = 0.4;

/**
 * The world point at the view's top-left corner: on the hero, held inside the arena at the top and the sides. On a tall
 * view the hero sits above the middle and the camera runs past the bottom wall, so the hero never ends up under the
 * thumb at the bottom of the map.
 */
export function cameraFor(run: Run, view: View): { x: number; y: number } {
  const across = view.width / view.scale;
  const down = view.height / view.scale;
  const fit = (centre: number, span: number, size: number) => (span >= size ? (size - span) / 2 : Math.min(size - span, Math.max(0, centre - span / 2)));
  if (view.height <= view.width) return { x: fit(run.hero.x, across, ARENA.width), y: fit(run.hero.y, down, ARENA.height) };
  return { x: fit(run.hero.x, across, ARENA.width), y: Math.max(0, run.hero.y - down * PORTRAIT_FOCUS) };
}

/** Where the thumb is: the stick appears where it went down and the knob follows it, in CSS pixels. */
export interface Stick {
  originX: number;
  originY: number;
  x: number;
  y: number;
}

export const STICK_RADIUS = 44;

/** World units per sprite pixel. */
const PIXEL = 2;
const INK = "#1a1c2c";
const FLOOR = "#4a5a6e";
const FLOOR_ALT = "#46566a";
const WALL = "#2a3140";
const KITCHEN_FLOOR = "#9db4b0";
const KITCHEN_ALT = "#8fa8a4";
const SERVER_FLOOR = "#3a4458";
const SERVER_ALT = "#343d51";
const BOARDROOM_FLOOR = "#54453c";
const BOARDROOM_ALT = "#4d3f37";
const SHADOW = "rgba(10, 12, 20, 0.28)";
/** The suit each boss wears; the shirt colours tell the interview bosses from the office ones. */
const SUIT_HEX: Partial<Record<string, string>> = { middleManager: "#566c86", auditor: "#333c57", teamLead: "#3b5dc9", hrManager: "#d6498a", recruiter: "#38b764", lunchMonitor: "#ef7d57", sysadmin: "#41a6f6" };

const SHIRT_HEX: Record<string, string> = {
  red: "#b13e53",
  blue: "#3b5dc9",
  green: "#38b764",
  orange: "#ef7d57",
  purple: "#8a4a8a",
  teal: "#257179",
  pink: "#d6498a",
};

export interface Scene {
  /** The hero's baked frames; null draws a plain figure (the sheet failed to load). */
  frames: HeroFrames | null;
  department: keyof typeof DEPARTMENTS;
  /** Whether the hero moved this frame, for the walk cycle. */
  moving: boolean;
  stick: Stick | null;
  /** The furniture bosses cut from the sheet; null draws their shape stand-ins. */
  bosses?: BossFrames | null;
  /** The people bosses baked from the sheet; null draws their shape stand-ins. */
  figures?: BossFigures | null;
  /** Bosses with their own generated sprites (the auditor), taking precedence over the sheet figures. */
  sprites?: BossFigures | null;
  /** The desk gear the hero carries; the wings and the loafers show on the sprite. */
  gear?: string[];
}

export function drawRun(ctx: CanvasRenderingContext2D, run: Run, view: View, scene: Scene, time: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, view.width, view.height);
  const camera = cameraFor(run, view);
  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(-camera.x, -camera.y);
  drawFloor(ctx, run, camera, view);
  drawHazards(ctx, run);
  drawAura(ctx, run);
  if (run.aura > 0) {
    const hero = run.hero;
    ctx.strokeStyle = "rgba(115, 214, 142, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, 34, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const gem of run.gems) drawGem(ctx, gem.x, gem.y, gem.value);
  for (const drop of run.drops) drawDropShadow(ctx, run, drop);
  const foes = [...run.foes].sort((a, b) => a.y - b.y);
  for (const foe of foes) drawFoe(ctx, foe, time, scene.bosses, scene.figures, scene.sprites, run.hero);
  drawHero(ctx, run, scene, time);
  drawDucks(ctx, run);
  for (const shot of run.shots) drawShot(ctx, shot.weapon, shot.x, shot.y, shot.vx, shot.vy, shot.radius, time);
  for (const shot of run.foeShots) drawFoeShot(ctx, shot, time);
  for (const drop of run.drops) drawFallingRack(ctx, drop.x, drop.y, drop.delay);
  for (const effect of run.effects) drawEffect(ctx, effect.kind, effect.x, effect.y, effect.radius, effect.age / effect.life);
  ctx.restore();
  drawBossPointers(ctx, run, view, camera);
  if (scene.stick) drawStick(ctx, scene.stick);
}

/** A stable pseudo-random number for a tile, so the floor's details stay where they are. */
function tileHash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function drawFloor(ctx: CanvasRenderingContext2D, run: Run, camera: { x: number; y: number }, view: View): void {
  const kitchen = run.stage === "kitchen";
  const server = run.stage === "serverRoom";
  const boardroom = run.stage === "boardroom";
  ctx.fillStyle = kitchen ? KITCHEN_FLOOR : server ? SERVER_FLOOR : boardroom ? BOARDROOM_FLOOR : FLOOR;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  // Tiles, only the ones in view: big carpet tiles in the open space, small glazed ones in the kitchen.
  const tile = kitchen ? 50 : server ? 60 : boardroom ? 80 : 100;
  ctx.fillStyle = kitchen ? KITCHEN_ALT : server ? SERVER_ALT : boardroom ? BOARDROOM_ALT : FLOOR_ALT;
  const fromX = Math.max(0, Math.floor(camera.x / tile));
  const fromY = Math.max(0, Math.floor(camera.y / tile));
  const toX = Math.min(ARENA.width / tile, Math.ceil((camera.x + view.width / view.scale) / tile));
  const toY = Math.min(ARENA.height / tile, Math.ceil((camera.y + view.height / view.scale) / tile));
  for (let ty = fromY; ty < toY; ty += 1) {
    for (let tx = fromX; tx < toX; tx += 1) if ((tx + ty) % 2 === 0) ctx.fillRect(tx * tile, ty * tile, tile, tile);
  }
  if (boardroom) {
    // The boardroom: parquet boards, a long rug down the middle, and a faint sheen on some boards.
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;
    ctx.fillStyle = "rgba(70, 50, 60, 0.5)";
    ctx.fillRect(cx - 260, cy - 90, 520, 180);
    ctx.strokeStyle = "rgba(220, 180, 110, 0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 260, cy - 90, 520, 180);
    ctx.strokeStyle = "rgba(20, 14, 10, 0.25)";
    ctx.lineWidth = 1;
    for (let ty = fromY; ty < toY; ty += 1) for (let tx = fromX; tx < toX; tx += 1) {
      ctx.beginPath();
      ctx.moveTo(tx * tile, ty * tile + (tx % 2 === 0 ? 0 : tile / 2));
      ctx.lineTo(tx * tile + tile, ty * tile + (tx % 2 === 0 ? 0 : tile / 2));
      ctx.stroke();
    }
  } else if (kitchen) {
    ctx.strokeStyle = "rgba(30, 50, 50, 0.22)";
    ctx.lineWidth = 1;
    for (let ty = fromY; ty < toY; ty += 1) for (let tx = fromX; tx < toX; tx += 1) ctx.strokeRect(tx * tile, ty * tile, tile, tile);
  } else if (server) {
    // Raised floor panels with a status light blinking on some of them.
    ctx.strokeStyle = "rgba(10, 14, 24, 0.5)";
    ctx.lineWidth = 1;
    for (let ty = fromY; ty < toY; ty += 1) {
      for (let tx = fromX; tx < toX; tx += 1) {
        ctx.strokeRect(tx * tile, ty * tile, tile, tile);
        const h = tileHash(tx, ty);
        if (h % 9 === 0) {
          ctx.fillStyle = (h >>> 5) % 3 === 0 ? "rgba(91, 220, 150, 0.8)" : "rgba(65, 166, 246, 0.8)";
          ctx.fillRect(tx * tile + 6, ty * tile + 6, 3, 3);
        }
      }
    }
  } else {
    // Wear on the carpet: speckles, stains and a stray sheet of paper, so the floor isn't a bare checkerboard.
    for (let ty = fromY; ty < toY; ty += 1) {
      for (let tx = fromX; tx < toX; tx += 1) {
        const h = tileHash(tx, ty);
        const ox = tx * tile + ((h >>> 3) % 70) + 15;
        const oy = ty * tile + ((h >>> 9) % 70) + 15;
        if (h % 5 === 0) {
          ctx.fillStyle = "rgba(20, 28, 40, 0.18)";
          for (let dot = 0; dot < 4; dot += 1) ctx.fillRect(ox + dot * 6 - ((h >>> dot) % 5), oy + ((h >>> (dot + 2)) % 9), 2, 2);
        }
        if (h % 17 === 3) {
          ctx.fillStyle = "rgba(60, 40, 30, 0.22)";
          ctx.beginPath();
          ctx.ellipse(ox, oy, 9, 6, (h % 7) / 3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (h % 29 === 7) {
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate((h % 11) / 4);
          ctx.fillStyle = "rgba(244, 244, 244, 0.75)";
          ctx.fillRect(-6, -4, 12, 8);
          ctx.restore();
        }
      }
    }
  }
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(-3, -3, ARENA.width + 6, ARENA.height + 6);
}

/** The stage's fixed hazards: coffee spills on the floor and microwaves that flash just before they fire. */
function drawHazards(ctx: CanvasRenderingContext2D, run: Run): void {
  for (const hazard of run.hazards) {
    if (hazard.kind === "spill") {
      ctx.fillStyle = "rgba(78, 50, 30, 0.85)";
      ctx.beginPath();
      ctx.ellipse(hazard.x, hazard.y, hazard.radius, hazard.radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(140, 100, 66, 0.55)";
      ctx.beginPath();
      ctx.ellipse(hazard.x - hazard.radius * 0.2, hazard.y - hazard.radius * 0.15, hazard.radius * 0.45, hazard.radius * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (hazard.kind === "puddle") {
      const fade = Math.min(1, (hazard.life ?? 0) / COFFEE.puddle.life);
      ctx.fillStyle = `rgba(60, 36, 20, ${0.75 * fade})`;
      ctx.beginPath();
      ctx.ellipse(hazard.x, hazard.y, hazard.radius, hazard.radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(190, 150, 110, ${0.4 * fade})`;
      ctx.beginPath();
      ctx.ellipse(hazard.x - hazard.radius * 0.2, hazard.y - hazard.radius * 0.15, hazard.radius * 0.4, hazard.radius * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (hazard.kind === "projector") {
      const warning = hazard.active === 0 && hazard.timer < BOARDROOM.warn;
      ctx.fillStyle = hazard.active > 0 ? "rgba(255, 245, 200, 0.4)" : warning ? (Math.floor(hazard.timer * 10) % 2 === 0 ? "rgba(255, 230, 140, 0.35)" : "rgba(255, 230, 140, 0.12)") : "rgba(20, 16, 12, 0.55)";
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hazard.active > 0 ? "#ffe28a" : "#8a7a5a";
      ctx.lineWidth = 2;
      ctx.stroke();
      // The projector itself: a small dark body aimed at the circle.
      ctx.fillStyle = "#2a3140";
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a9199";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      continue;
    }
    if (hazard.kind === "vent") {
      const warning = hazard.active === 0 && hazard.timer < SERVER_ROOM.warn;
      ctx.fillStyle = hazard.active > 0 ? "rgba(255, 120, 60, 0.55)" : warning ? (Math.floor(hazard.timer * 10) % 2 === 0 ? "rgba(255, 190, 90, 0.4)" : "rgba(255, 190, 90, 0.15)") : "rgba(20, 24, 36, 0.55)";
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hazard.active > 0 ? "#ff8a4a" : "#5a6478";
      ctx.lineWidth = 2;
      ctx.stroke();
      // The grate.
      ctx.strokeStyle = "rgba(10, 14, 24, 0.7)";
      ctx.lineWidth = 3;
      for (let bar = -2; bar <= 2; bar += 1) {
        ctx.beginPath();
        ctx.moveTo(hazard.x - hazard.radius * 0.7, hazard.y + bar * hazard.radius * 0.3);
        ctx.lineTo(hazard.x + hazard.radius * 0.7, hazard.y + bar * hazard.radius * 0.3);
        ctx.stroke();
      }
      continue;
    }
    const r = hazard.radius;
    if (hazard.timer < 0.9) {
      ctx.fillStyle = Math.floor(hazard.timer * 12) % 2 === 0 ? "rgba(255, 226, 138, 0.45)" : "rgba(255, 226, 138, 0.2)";
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e6e9ef";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.fillRect(hazard.x - r, hazard.y - r * 0.8, r * 2, r * 1.6);
    ctx.strokeRect(hazard.x - r, hazard.y - r * 0.8, r * 2, r * 1.6);
    ctx.fillStyle = "#262838";
    ctx.fillRect(hazard.x - r * 0.8, hazard.y - r * 0.55, r * 1.1, r * 1.1);
    ctx.fillStyle = hazard.timer < 0.9 ? "#e0483f" : "#38b764";
    ctx.fillRect(hazard.x + r * 0.5, hazard.y - r * 0.4, r * 0.3, r * 0.3);
  }
}

function ellipseShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.8, radius, radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHero(ctx: CanvasRenderingContext2D, run: Run, scene: Scene, time: number): void {
  const { hero } = run;
  ellipseShadow(ctx, hero.x, hero.y, HERO_RADIUS);
  const frames = scene.frames;
  if (!frames) {
    ctx.fillStyle = SHIRT_HEX[DEPARTMENTS[scene.department].shirt] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, HERO_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  const image = scene.moving ? frames.walk[Math.floor(time * 8) % frames.walk.length] : frames.stand;
  const width = frames.width * PIXEL;
  const height = frames.height * PIXEL;
  // The sprite's own middle sits `POSE_PAD.left` pixels in from the padded frame's edge.
  const middle = (POSE_PAD.left + (frames.width - POSE_PAD.left - POSE_PAD.right) / 2) * PIXEL;
  const feet = hero.y + HERO_RADIUS;
  const winged = scene.gear?.includes("guardianWings") ?? false;
  const wingSize = HERO_RADIUS * 2.6;
  // The guardian wings ride behind the hero and flap while they move.
  if (winged) {
    const flap = scene.moving ? Math.sin(time * 14) * 0.35 : Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.translate(hero.x, feet - height * 0.62);
    ctx.fillStyle = "rgba(255, 251, 240, 0.92)";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(-0.35 - flap);
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.quadraticCurveTo(wingSize * 0.7, -wingSize * 0.45, wingSize, -wingSize * 0.15);
      ctx.quadraticCurveTo(wingSize * 0.75, wingSize * 0.05, wingSize * 0.55, wingSize * 0.18);
      ctx.quadraticCurveTo(wingSize * 0.3, wingSize * 0.28, 2, wingSize * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.translate(hero.x, 0);
  if (hero.faceX < -0.1) ctx.scale(-1, 1);
  ctx.drawImage(image, -middle, feet - height, width, height);
  if (hero.hurt > 0) {
    ctx.globalAlpha = 0.75;
    ctx.drawImage(frames.flash, -middle, feet - height, width, height);
  }
  ctx.restore();
  // The winged loafers leave a little speed trail behind a moving hero.
  if (scene.gear?.includes("hermesLoafers") && scene.moving) {
    for (let step = 1; step <= 3; step += 1) {
      const alpha = 0.3 - step * 0.08;
      ctx.fillStyle = `rgba(255, 210, 122, ${alpha})`;
      ctx.beginPath();
      ctx.arc(hero.x - hero.faceX * step * 9, feet - step * 2, HERO_RADIUS * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawAura(ctx: CanvasRenderingContext2D, run: Run): void {
  const contract = run.weapons.find((weapon) => weapon.id === "contract");
  if (!contract) return;
  const { radius } = weaponNumbers("contract", contract.level, run.mutations?.contract, run.classId);
  ctx.fillStyle = "rgba(138, 74, 138, 0.18)";
  ctx.strokeStyle = "rgba(184, 124, 192, 0.6)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(run.hero.x, run.hero.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDucks(ctx: CanvasRenderingContext2D, run: Run): void {
  if (run.decoy) {
    // The decoy: the same rubber duck, planted, with the ring of attention around it.
    ctx.fillStyle = "rgba(255, 205, 42, 0.18)";
    ctx.strokeStyle = "rgba(255, 205, 42, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(run.decoy.x, run.decoy.y, 46 + Math.sin(performance.now() / 180) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffcd2a";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(run.decoy.x, run.decoy.y, DUCK_RADIUS + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const duck = run.weapons.find((weapon) => weapon.id === "rubberDuck");
  if (!duck) return;
  const { count, radius } = weaponNumbers("rubberDuck", duck.level);
  for (let index = 0; index < count; index += 1) {
    const angle = duck.spin + (index / count) * Math.PI * 2;
    const x = run.hero.x + Math.cos(angle) * radius;
    const y = run.hero.y + Math.sin(angle) * radius;
    ctx.fillStyle = "#ffcd2a";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, DUCK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 3, y - 6, DUCK_RADIUS * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ef7d57";
    ctx.fillRect(x + 6, y - 7, 5, 3);
  }
}

function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, value: number): void {
  const size = 4 + Math.min(7, Math.log2(value + 1) * 1.6);
  ctx.fillStyle = value >= 20 ? "#ffcd75" : value >= 4 ? "#73eff7" : "#41a6f6";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.7, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawDropShadow(ctx: CanvasRenderingContext2D, run: Run, drop: Run["drops"][number]): void {
  const rack = run.weapons.find((weapon) => weapon.id === "serverRack");
  const delay = rack ? weaponNumbers("serverRack", rack.level).life : 0.6;
  const share = 1 - Math.max(0, drop.delay) / delay;
  ctx.fillStyle = `rgba(224, 72, 63, ${0.12 + share * 0.25})`;
  ctx.beginPath();
  ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawFallingRack(ctx: CanvasRenderingContext2D, x: number, y: number, delay: number): void {
  const lift = Math.max(0, delay) * 420;
  ctx.fillStyle = "#333c57";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(x - 12, y - 30 - lift, 24, 30);
  ctx.strokeRect(x - 12, y - 30 - lift, 24, 30);
  ctx.fillStyle = "#38b764";
  for (let row = 0; row < 4; row += 1) ctx.fillRect(x - 8, y - 26 - lift + row * 7, 3, 2);
}

function drawShot(ctx: CanvasRenderingContext2D, weapon: string, x: number, y: number, vx: number, vy: number, radius: number, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  switch (weapon) {
    case "stickyNotes":
      ctx.rotate(time * 6);
      ctx.fillStyle = "#ffe066";
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
      break;
    case "spreadsheet": {
      ctx.rotate(time * 5);
      const w = radius * 2.4;
      const h = radius * 1.8;
      ctx.fillStyle = "#e8f5e9";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "#38b764";
      for (let line = 1; line < 3; line += 1) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + (w / 3) * line, -h / 2);
        ctx.lineTo(-w / 2 + (w / 3) * line, h / 2);
        ctx.moveTo(-w / 2, -h / 2 + (h / 3) * line);
        ctx.lineTo(w / 2, -h / 2 + (h / 3) * line);
        ctx.stroke();
      }
      ctx.strokeStyle = INK;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      break;
    }
    default:
      ctx.rotate(Math.atan2(vy, vx));
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(-radius * 1.4, -radius * 0.9, radius * 2.8, radius * 1.8);
      ctx.strokeRect(-radius * 1.4, -radius * 0.9, radius * 2.8, radius * 1.8);
      ctx.fillStyle = "#b13e53";
      ctx.fillRect(-radius * 1.1, -radius * 0.5, radius * 0.8, radius * 0.4);
  }
  ctx.restore();
}

/** The bosses' badges of office — clipboard, badge, glasses, briefcase and tie — at the figure's pixel scale. */
function drawBossAccessory(
  ctx: CanvasRenderingContext2D,
  foe: Foe,
  pixel: number,
  middle: number,
  feet: number,
  height: number,
): void {
  const px = (n: number) => n * pixel;
  const top = feet - height;
  // The pack's characters face their own left: held items sit on that side of the torso (the transform's flip
  // keeps them on the facing side whatever way the figure turns).
  const chest = middle - px(3.5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, pixel * 0.35);
  switch (foe.kind) {
    case "hrManager": {
      // The clipboard: a white board with two lines of print, held at the chest.
      const boardX = chest - px(1.2);
      const boardY = top + px(10);
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(boardX, boardY, px(3.4), px(4.6));
      ctx.strokeRect(boardX, boardY, px(3.4), px(4.6));
      ctx.fillStyle = INK;
      ctx.fillRect(boardX + px(0.7), boardY + px(1), px(2), px(0.5));
      ctx.fillRect(boardX + px(0.7), boardY + px(2.2), px(1.4), px(0.5));
      break;
    }
    case "recruiter": {
      // The badge on its lanyard: a strap from the collar to a yellow card with a photo dot.
      const strapTop = top + px(5.5);
      ctx.strokeStyle = "#b13e53";
      ctx.lineWidth = Math.max(1, pixel * 0.3);
      ctx.beginPath();
      ctx.moveTo(middle - px(1.2), strapTop);
      ctx.lineTo(chest, strapTop + px(2.6));
      ctx.moveTo(middle + px(1.2), strapTop);
      ctx.lineTo(chest, strapTop + px(2.6));
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, pixel * 0.35);
      ctx.fillStyle = "#ffe28a";
      const badgeY = strapTop + px(2.6);
      ctx.fillRect(chest - px(0.8), badgeY, px(1.8), px(2.4));
      ctx.strokeRect(chest - px(0.8), badgeY, px(1.8), px(2.4));
      ctx.fillStyle = "#41a6f6";
      ctx.fillRect(chest - px(0.5), badgeY + px(0.5), px(1.2), px(0.9));
      break;
    }
    case "sysadmin": {
      // The glasses: two dark lenses and a bridge, straight across the face.
      const eyes = top + px(4.2);
      ctx.fillStyle = INK;
      ctx.fillRect(middle - px(2.6), eyes, px(1.9), px(1.4));
      ctx.fillRect(middle + px(0.7), eyes, px(1.9), px(1.4));
      ctx.fillRect(middle - px(0.7), eyes + px(0.5), px(1.4), px(0.4));
      break;
    }
    case "auditor": {
      // The red tie down the chest, and the briefcase at the near hip.
      ctx.fillStyle = "#e0483f";
      ctx.fillRect(middle - px(0.5), top + px(6.5), px(1), px(4.5));
      ctx.fillStyle = "#5d275d";
      ctx.fillRect(middle - px(6), top + px(13), px(3.4), px(2.8));
      ctx.strokeRect(middle - px(6), top + px(13), px(3.4), px(2.8));
      ctx.fillStyle = "#ffcd75";
      ctx.fillRect(middle - px(4.9), top + px(13.9), px(1.2), px(0.5));
      break;
    }
    default:
      break;
  }
}

function drawFoeShot(ctx: CanvasRenderingContext2D, shot: Run["foeShots"][number], time: number): void {
  const { from, x, y, radius } = shot;
  if (shot.lob) {
    // A lob in the air: a growing shadow where it will land, and the can or glob itself overhead.
    const left = Math.max(0, shot.life) / shot.lob.flight;
    const splash = shot.lob.splash;
    ctx.fillStyle = from === "coffeeMachine" ? "rgba(120, 70, 40, 0.35)" : "rgba(20, 24, 36, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y, splash * (1 - left * 0.6), splash * 0.6 * (1 - left * 0.6), 0, 0, Math.PI * 2);
    ctx.fill();
    const height = Math.sin((1 - left) * Math.PI) * 30 + 6;
    ctx.fillStyle = from === "coffeeMachine" ? "#7a4a2b" : "#e0483f";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - height, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (from === "printerJam" || from === "printerPrime") {
    ctx.fillStyle = "#262838";
    ctx.strokeStyle = "#94b0c2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (from === "microwave") {
    ctx.fillStyle = "#ffe28a";
    ctx.strokeStyle = "#c28a2a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(shot.vy, shot.vx));
  // Paperwork is a white sheet, a ping is blue, grease fire burns orange; red tape is red.
  ctx.fillStyle = from === "hrManager" ? "#f4f4f4" : from === "sysadmin" || from === "hotRack" ? "#41a6f6" : from === "greaseFire" ? "#ff8a4a" : "#e0483f";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.fillRect(-radius * 1.5, -radius * 0.5, radius * 3, radius);
  ctx.strokeRect(-radius * 1.5, -radius * 0.5, radius * 3, radius);
  ctx.restore();
}

function drawEffect(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, radius: number, progress: number): void {
  const fade = 1 - progress;
  ctx.lineWidth = 3;
  switch (kind) {
    case "duckHit": {
      // A bright, short contact ring and four rays identify which duck actually hit.
      const size = radius * (0.6 + progress * 0.4);
      ctx.strokeStyle = `rgba(255, 205, 42, ${fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      for (let index = 0; index < 4; index += 1) {
        const angle = index * Math.PI / 2;
        ctx.moveTo(x + Math.cos(angle) * size * 1.2, y + Math.sin(angle) * size * 1.2);
        ctx.lineTo(x + Math.cos(angle) * size * 1.6, y + Math.sin(angle) * size * 1.6);
      }
      ctx.stroke();
      break;
    }
    case "swing":
      ctx.strokeStyle = `rgba(214, 73, 138, ${fade})`;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.6 + progress * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "blast":
      ctx.fillStyle = `rgba(255, 205, 117, ${fade * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.4 + progress * 0.6), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "spikeWarn":
      // The ambush ring's red circles: blink, then close.
      ctx.strokeStyle = `rgba(232, 76, 61, ${0.4 + 0.6 * Math.abs(Math.sin(progress * Math.PI * 3))})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * (1 - progress * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(232, 76, 61, ${fade * 0.25})`;
      ctx.fill();
      break;
    case "repair":
      ctx.strokeStyle = `rgba(111, 245, 178, ${fade * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.85 + progress * 0.15), 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      ctx.strokeStyle = `rgba(244, 244, 244, ${fade * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.5 + progress), 0, Math.PI * 2);
      ctx.stroke();
  }
}

// ---- Foes --------------------------------------------------------------------------------------------------------

function drawTell(ctx: CanvasRenderingContext2D, foe: Foe): void {
  const { x, y, radius, windup } = foe;
  if (!windup && (!foe.boss || !foe.recovery || foe.charge > 0 || foe.shock > 0)) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = windup ? "#ff7153" : "#9be5fa";
  ctx.beginPath();
  ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
  ctx.stroke();
  if (windup) {
    ctx.setLineDash([8, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const ring = foe.kind === "blobPrime" || (foe.kind === "hrManager" && (foe.cycles + 1) % PAPERWORK.ringEvery === 0);
    if (ring) {
      ctx.arc(x, y, foe.kind === "blobPrime" ? SHOCK.seconds * SHOCK.speed : radius + 32, 0, Math.PI * 2);
    } else {
      const reach = foe.kind === "rollingCart" ? CART.speed * CART.duration : foe.kind === "lunchMonitor" ? 150 : PILOT_BOSS.aim;
      ctx.moveTo(x + Math.cos(windup.angle) * (radius + 7), y + Math.sin(windup.angle) * (radius + 7));
      ctx.lineTo(x + Math.cos(windup.angle) * reach, y + Math.sin(windup.angle) * reach);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawFoe(ctx: CanvasRenderingContext2D, foe: Foe, time: number, bosses?: BossFrames | null, figures?: BossFigures | null, sprites?: BossFigures | null, hero?: { x: number; y: number }): void {
  const { x, y, radius: r } = foe;
  drawTell(ctx, foe);
  // A boss dragged out too long enrages: a rising red ring under it, the tell for its climbing damage.
  const enrage = enrageFactor(foe);
  if (enrage > 1) {
    ctx.save();
    ctx.strokeStyle = `rgba(232, 76, 61, ${0.35 + 0.3 * (enrage - 1)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.55, r * (0.9 + 0.15 * Math.sin(time * 6)), r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // An elite horde foe: a gold-orange outline, so the harder touch reads before it connects.
  if (foe.elite) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 176, 59, 0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // The people bosses wear the pack's characters in their own suits, scaled up, with the walk cycle; a boss with
  // its own generated sprite (the auditor) wears that instead, centred on its full canvas with no accessory drawn on.
  const sprite = sprites?.[foe.kind];
  const figure = sprite ?? figures?.[foe.kind];
  if (figure) {
    ellipseShadow(ctx, x, y, r);
    ctx.save();
    ctx.translate(x, 0);
    if (hero && hero.x < x - 0.1) ctx.scale(-1, 1);
    const pixel = sprite ? AUDITOR_PIXEL : (FIGURE_PIXEL[foe.kind] ?? 2.8);
    const walking = foe.speed > 0;
    const image = walking ? figure.walk[Math.floor(time * 8) % figure.walk.length] : figure.stand;
    const width = figure.width * pixel;
    const height = figure.height * pixel;
    const feet = y + r * 0.55;
    // The generated sprite fills its whole canvas; the sheet figure's own middle sits `POSE_PAD.left` pixels in
    // from the padded frame's edge (as for the hero).
    const middle = sprite ? width / 2 : (3 + (figure.width - 3 - 5) / 2) * pixel;
    ctx.drawImage(image, -middle, feet - height, width, height);
    if (!sprite) drawBossAccessory(ctx, foe, pixel, middle, feet, height);
    if (foe.hurt > 0) {
      ctx.globalAlpha = 0.75;
      ctx.drawImage(figure.flash, -width / 2, feet - height, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return;
  }
  // The furniture bosses wear the pack's own sprites when the sheet loaded; otherwise their shape stand-ins.
  const frame = bosses && foe.kind in bosses ? bosses[foe.kind as keyof BossFrames] : null;
  if (frame) {
    ellipseShadow(ctx, x, y, r);
    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    const pixel = BOSS_PIXEL[foe.kind as keyof typeof BOSS_PIXEL];
    const width = frame.width * pixel;
    const height = frame.height * pixel;
    ctx.drawImage(frame as CanvasImageSource, -width / 2, r * 0.55 - height, width, height);
    if (foe.hurt > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ellipseShadow(ctx, x, y, r);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  switch (foe.kind) {
    case "paperShredling":
      ctx.fillStyle = "#ffe3aa";
      ctx.fillRect(x - 9, y - 7, 18, 12);
      ctx.fillRect(x - 7, y + 4, 4, 5);
      ctx.fillRect(x + 3, y + 4, 4, 5);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 5, y - 3, 3, 3);
      ctx.fillRect(x + 2, y - 3, 3, 3);
      break;
    case "rollingCart":
      ctx.fillStyle = INK;
      ctx.fillRect(x - 17, y - 10, 34, 20);
      ctx.fillRect(x - 12, y + 8, 7, 6);
      ctx.fillRect(x + 5, y + 8, 7, 6);
      ctx.fillStyle = "#ff9755";
      ctx.fillRect(x - 14, y - 7, 28, 13);
      ctx.fillStyle = "#f9e1bf";
      ctx.fillRect(x - 10, y - 8, 4, 11);
      ctx.fillRect(x + 6, y - 8, 4, 11);
      break;
    case "patchDrone":
      ctx.fillStyle = INK;
      ctx.fillRect(x - 16, y - 4, 32, 9);
      ctx.fillRect(x - 8, y - 10, 16, 20);
      ctx.fillStyle = "#7ce5b0";
      ctx.fillRect(x - 13, y - 2, 26, 5);
      ctx.fillRect(x - 6, y - 8, 12, 16);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 2, y - 5, 4, 10);
      ctx.fillRect(x - 5, y - 2, 10, 4);
      break;
    case "securityEscort": {
      ctx.fillStyle = INK;
      ctx.fillRect(x - 11, y - 13, 22, 26);
      ctx.fillStyle = "#b8a4ff";
      ctx.fillRect(x - 8, y - 10, 16, 20);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 6, y - 6, 12, 4);
      const angle = foe.guardAngle ?? 0;
      ctx.strokeStyle = "#8edafa";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, angle - ESCORT.arc, angle + ESCORT.arc);
      ctx.stroke();
      break;
    }
    case "replyAll": {
      const bob = Math.sin(time * 10 + foe.id) * 1.5;
      ctx.translate(0, bob);
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      ctx.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.7);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(r, -r * 0.7);
      ctx.stroke();
      ctx.fillStyle = "#e0483f";
      ctx.fillRect(r * 0.4, -r * 1.1, r * 0.7, r * 0.7);
      break;
    }
    case "mondayBlob": {
      const squash = 1 + Math.sin(time * 3 + foe.id) * 0.06;
      ctx.fillStyle = "#6d7fa6";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * squash, r / squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Half-shut eyes.
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.5, -r * 0.2, r * 0.35, r * 0.12);
      ctx.fillRect(r * 0.15, -r * 0.2, r * 0.35, r * 0.12);
      break;
    }
    case "meetingInvite":
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = "#b13e53";
      ctx.fillRect(-r, -r, r * 2, r * 0.6);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = INK;
      for (let cell = 0; cell < 4; cell += 1) ctx.fillRect(-r * 0.6 + (cell % 2) * r * 0.8, -r * 0.1 + Math.floor(cell / 2) * r * 0.6, r * 0.3, r * 0.3);
      break;
    case "printerJam":
      ctx.fillStyle = "#94b0c2";
      ctx.fillRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.5);
      ctx.strokeRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.5);
      ctx.fillStyle = "#f4f4f4";
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.7);
      ctx.lineTo(-r * 0.4, -r * 1.4);
      ctx.lineTo(r * 0.1, -r * 1.1);
      ctx.lineTo(r * 0.6, -r * 1.5);
      ctx.lineTo(r * 0.6, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = Math.floor(time * 3) % 2 === 0 ? "#e0483f" : "#5d275d";
      ctx.fillRect(r * 0.6, -r * 0.4, r * 0.3, r * 0.3);
      break;
    case "middleManager":
    case "lunchMonitor":
    case "sysadmin":
    case "teamLead":
    case "hrManager":
    case "recruiter":
    case "auditor": {
      const auditor = foe.kind === "auditor";
      ctx.fillStyle = SUIT_HEX[foe.kind] ?? "#566c86";
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffcd75";
      ctx.beginPath();
      ctx.arc(0, -r * 0.75, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#b13e53";
      ctx.fillRect(-r * 0.1, -r * 0.3, r * 0.2, r * 0.7);
      if (auditor) {
        ctx.strokeStyle = "#e0483f";
        ctx.lineWidth = 2;
        ctx.strokeRect(-r * 0.35, -r * 0.85, r * 0.28, r * 0.18);
        ctx.strokeRect(r * 0.07, -r * 0.85, r * 0.28, r * 0.18);
        ctx.fillStyle = "#a8744a";
        ctx.fillRect(r * 0.5, -r * 0.1, r * 0.5, r * 0.7);
        if (foe.enraged) {
          // Enraged: red eyes and a hot ring, so the change of pace is visible.
          ctx.fillStyle = "#e0483f";
          ctx.fillRect(-r * 0.35, -r * 0.8, r * 0.22, r * 0.12);
          ctx.fillRect(r * 0.13, -r * 0.8, r * 0.22, r * 0.12);
          ctx.strokeStyle = "rgba(224, 72, 63, 0.5)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case "paperPlane": {
      // A paper plane: a light dart with a fold line, banking as it comes.
      const bank = Math.sin(time * 6 + foe.id) * 0.2;
      ctx.rotate(bank);
      ctx.fillStyle = "#f4f4f4";
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, r * 0.6);
      ctx.lineTo(r * 1.2, 0);
      ctx.lineTo(-r * 1.2, -r * 0.6);
      ctx.lineTo(-r * 0.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, 0);
      ctx.lineTo(r * 1.2, 0);
      ctx.stroke();
      break;
    }
    case "lunchThief": {
      // A lunch thief: like the reply-all, but a brown lunch bag with legs, and quicker about it.
      const bob = Math.sin(time * 14 + foe.id) * 1.5;
      ctx.translate(0, bob);
      ctx.fillStyle = "#a8744a";
      ctx.fillRect(-r * 0.7, -r * 0.9, r * 1.4, r * 1.6);
      ctx.strokeRect(-r * 0.7, -r * 0.9, r * 1.4, r * 1.6);
      ctx.fillStyle = "#8a5a34";
      ctx.fillRect(-r * 0.7, -r * 0.9, r * 1.4, r * 0.4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      break;
    }
    case "greaseFire": {
      // A burning pan: dark pan, flames that flicker higher as it fires.
      ctx.fillStyle = "#3a4256";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const flame = 0.7 + Math.sin(time * 12 + foe.id) * 0.3;
      ctx.fillStyle = "#ff8a4a";
      for (const side of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.5 - r * 0.2, r * 0.2);
        ctx.quadraticCurveTo(side * r * 0.5, -r * 0.9 * flame, side * r * 0.5 + r * 0.2, r * 0.2);
        ctx.fill();
      }
      break;
    }
    case "looseCable": {
      // A tangle of cables: a loose coil with a plug end that twitches.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#e0b13f";
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.4) {
        const rr = r * (0.35 + (a / (Math.PI * 4)) * 0.6);
        const px = Math.cos(a + foe.id) * rr;
        const py = Math.sin(a + foe.id) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      break;
    }
    case "hotRack": {
      // An overheating rack: a dark box with lights, hotter as it's about to ring.
      ctx.fillStyle = "#2a3140";
      ctx.fillRect(-r * 0.8, -r, r * 1.6, r * 2);
      ctx.strokeRect(-r * 0.8, -r, r * 1.6, r * 2);
      for (let light = 0; light < 4; light += 1) {
        const hot = Math.floor(time * (2 + light)) % 3 === 0;
        ctx.fillStyle = hot ? "#e0483f" : "#41a6f6";
        ctx.fillRect(-r * 0.5, -r * 0.75 + light * r * 0.45, r * 0.3, r * 0.14);
      }
      break;
    }
    case "meetingChair": {
      // An office chair seen from above: the seat, the back, and a small head behind it.
      ctx.fillStyle = "#8a9199";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffcd75";
      ctx.beginPath();
      ctx.arc(0, r * 0.35, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#5a6470";
      ctx.fillRect(-r * 0.7, -r * 0.75, r * 1.4, r * 0.35);
      ctx.strokeRect(-r * 0.7, -r * 0.75, r * 1.4, r * 0.35);
      break;
    }
    case "shredder": {
      // A shredder: a dark box, a paper slot with teeth, and a light that blinks as it works.
      ctx.fillStyle = "#3a4256";
      ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      ctx.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(-r * 0.7, -r * 0.55, r * 1.4, r * 0.22);
      ctx.fillStyle = INK;
      for (let tooth = 0; tooth < 4; tooth += 1) ctx.fillRect(-r * 0.65 + tooth * r * 0.38, -r * 0.55, r * 0.1, r * 0.22);
      ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? "#e0483f" : "#5d275d";
      ctx.fillRect(r * 0.55, r * 0.25, r * 0.25, r * 0.25);
      break;
    }
    case "coffeeMachine": {
      // The coffee machine: a dark body, a carafe of coffee, and a spout.
      ctx.fillStyle = "#3a4256";
      ctx.fillRect(-r * 0.9, -r, r * 1.8, r * 2);
      ctx.strokeRect(-r * 0.9, -r, r * 1.8, r * 2);
      ctx.fillStyle = "#7a4a2b";
      ctx.fillRect(-r * 0.55, r * 0.15, r * 1.1, r * 0.6);
      ctx.strokeRect(-r * 0.55, r * 0.15, r * 1.1, r * 0.6);
      ctx.fillStyle = "#94b0c2";
      ctx.fillRect(-r * 0.25, -r * 0.85, r * 0.5, r * 0.4);
      break;
    }
    case "vendingMachine": {
      // The vending machine: a tall lit window of shelves and a coin slot.
      ctx.fillStyle = "#b13e53";
      ctx.fillRect(-r * 0.8, -r, r * 1.6, r * 2);
      ctx.strokeRect(-r * 0.8, -r, r * 1.6, r * 2);
      ctx.fillStyle = "#ffe28a";
      ctx.fillRect(-r * 0.55, -r * 0.8, r * 0.9, r * 1.2);
      ctx.fillStyle = INK;
      for (let shelf = 0; shelf < 3; shelf += 1) ctx.fillRect(-r * 0.55, -r * 0.8 + shelf * r * 0.4, r * 0.9, r * 0.06);
      ctx.fillStyle = "#ffcd75";
      ctx.fillRect(r * 0.2, -r * 0.2, r * 0.35, r * 0.7);
      break;
    }
    case "printerPrime": {
      // The prime's printer: like the jammed one, but dark, bigger and angrier.
      ctx.fillStyle = "#5d275d";
      ctx.fillRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.5);
      ctx.strokeRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.5);
      ctx.fillStyle = "#f4f4f4";
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.7);
      ctx.lineTo(-r * 0.4, -r * 1.4);
      ctx.lineTo(r * 0.1, -r * 1.1);
      ctx.lineTo(r * 0.6, -r * 1.5);
      ctx.lineTo(r * 0.6, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = Math.floor(time * 6) % 2 === 0 ? "#e0483f" : "#ffcd75";
      ctx.fillRect(r * 0.6, -r * 0.4, r * 0.3, r * 0.3);
      break;
    }
    case "blobPrime": {
      // The prime's blob: the monday blob, huge and with an open frown.
      const squash = 1 + Math.sin(time * 3 + foe.id) * 0.06;
      ctx.fillStyle = "#4a5a7e";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * squash, r / squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.5, -r * 0.25, r * 0.3, r * 0.14);
      ctx.fillRect(r * 0.2, -r * 0.25, r * 0.3, r * 0.14);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, r * 0.3, r * 0.25, Math.PI, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  if (foe.hurt > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (foe.shock > 0) {
    // The expanding shockwave, drawn over the floor around the boss.
    const radius = (SHOCK.seconds - foe.shock) * SHOCK.speed;
    ctx.strokeStyle = "rgba(255, 190, 90, 0.8)";
    ctx.lineWidth = SHOCK.band * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** An arrow at the edge of the screen toward a boss out of view. */
function drawBossPointers(ctx: CanvasRenderingContext2D, run: Run, view: View, camera: { x: number; y: number }): void {
  for (const foe of run.foes) {
    if (!foe.boss) continue;
    const sx = (foe.x - camera.x) * view.scale;
    const sy = (foe.y - camera.y) * view.scale;
    if (sx >= 0 && sy >= 0 && sx <= view.width && sy <= view.height) continue;
    const cx = view.width / 2;
    const cy = view.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const reach = Math.min(cx / Math.abs(Math.cos(angle) || 1e-6), cy / Math.abs(Math.sin(angle) || 1e-6)) - 22;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
    ctx.rotate(angle);
    ctx.fillStyle = "#e0483f";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawStick(ctx: CanvasRenderingContext2D, stick: Stick): void {
  const dx = stick.x - stick.originX;
  const dy = stick.y - stick.originY;
  const length = Math.hypot(dx, dy);
  const reach = Math.min(length, STICK_RADIUS);
  const knobX = stick.originX + (length > 0 ? (dx / length) * reach : 0);
  const knobY = stick.originY + (length > 0 ? (dy / length) * reach : 0);
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(stick.originX, stick.originY, STICK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(knobX, knobY, 16, 0, Math.PI * 2);
  ctx.fill();
}

/** The stick's input: the knob's offset as a share of the ring, at most length 1. */
export function stickInput(stick: Stick | null): { dx: number; dy: number } {
  if (!stick) return { dx: 0, dy: 0 };
  const dx = (stick.x - stick.originX) / STICK_RADIUS;
  const dy = (stick.y - stick.originY) / STICK_RADIUS;
  const length = Math.hypot(dx, dy);
  // A small dead zone, so resting a thumb doesn't drift.
  if (length < 0.15) return { dx: 0, dy: 0 };
  return length > 1 ? { dx: dx / length, dy: dy / length } : { dx, dy };
}
