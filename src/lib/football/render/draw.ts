/*
 * Draws a match on a 2D canvas: the pitch from above, the footballers as the side-on pixel sprites, and the
 * overlay a moment puts on top (who you can pass to, and the odds).
 *
 * The sim knows nothing about animation, so a `Stage` watches it frame by frame: it works out which way each
 * man faces, how far into his stride he is, and when a kick, a slide, a dive or a celebration is under way.
 */
import { GOAL_HALF, H, MID, W } from "../sim/balance";
import type { Match, Moment } from "../sim/types";
import { ballPixels, BALL_SIZE, figureFor, RUN_CYCLE, SPRITE_H, SPRITE_W, type Pose } from "./sprites";

/** The grass around the pitch that sprites and the goals stand on, in world units. */
export const MARGIN_X = 7;
export const MARGIN_Y = 6;
const WORLD_W = W + MARGIN_X * 2;
const WORLD_H = H + MARGIN_Y * 2;

export interface View {
  /** The canvas's size in CSS pixels. */
  width: number;
  height: number;
  /** Pixels per world unit, and where the world's top-left corner sits. */
  scale: number;
  ox: number;
  oy: number;
  /** Device pixels per CSS pixel. */
  ratio: number;
  /** Whole device pixels per sprite pixel, so the pixel art stays crisp. */
  sprite: number;
}

export function fitView(width: number, height: number, ratio = 1): View {
  const scale = Math.max(0.1, Math.min(width / WORLD_W, height / WORLD_H));
  return {
    width,
    height,
    scale,
    ox: (width - WORLD_W * scale) / 2,
    oy: (height - WORLD_H * scale) / 2,
    ratio,
    // A man stands about nine units tall, in whole device pixels per sprite pixel.
    sprite: Math.max(1, Math.round(scale * ratio * 0.375)) / ratio,
  };
}

export function toWorld(view: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - view.ox) / view.scale - MARGIN_X, y: (py - view.oy) / view.scale - MARGIN_Y };
}

const sx = (view: View, x: number): number => view.ox + (x + MARGIN_X) * view.scale;
const sy = (view: View, y: number): number => view.oy + (y + MARGIN_Y) * view.scale;

// ---- Animation state ----

interface Mover {
  face: 1 | -1;
  /** Strides taken, in whole and fractional frames of the run cycle. */
  stride: number;
  kickUntil: number;
  slideUntil: number;
  diveUntil: number;
}

/** Seconds the sim waits, and the scorers dance, after a goal. */
export const CELEBRATION = 2;

type SpriteSurface = HTMLCanvasElement | OffscreenCanvas;

export class Stage {
  private movers: Mover[] = [];
  private sprites = new Map<string, SpriteSurface>();
  private ball: SpriteSurface | null = null;
  private pitch: { key: string; surface: SpriteSurface } | null = null;
  private lastTime = 0;
  /** The wall clock at the last frame, in seconds. Celebrations run on it, because the sim stands still during one. */
  private clock = 0;
  private lastBall: { owner: number | null; last: number | null; kick: string | null } = { owner: null, last: null, kick: null };
  private events = 0;
  private lastTackleCd: number[] = [];
  /** Wall-clock time at which the celebration after a goal ends, and who is celebrating. */
  private cheer: { team: 0 | 1; until: number } | null = null;

  /** Call once a frame with the wall clock in seconds; returns the time since the last frame. */
  tick(now: number): number {
    const dt = this.lastTime === 0 ? 0 : Math.min(0.1, now - this.lastTime);
    this.lastTime = now;
    this.clock = now;
    return dt;
  }

  /** Who is celebrating a goal right now, if anyone. */
  celebrating(now: number): 0 | 1 | null {
    return this.cheer && this.cheer.until > now ? this.cheer.team : null;
  }

  celebrate(team: 0 | 1, now: number, seconds: number): void {
    this.cheer = { team, until: now + seconds };
  }

  private surface(width: number, height: number): SpriteSurface | null {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private paint(width: number, height: number, pixels: Uint8ClampedArray): SpriteSurface | null {
    const surface = this.surface(width, height);
    const ctx = surface?.getContext("2d") as CanvasRenderingContext2D | null | undefined;
    if (!surface || !ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return surface;
  }

  private spriteFor(footballer: { id: number; role: Match["players"][number]["role"] }, kit: number, pose: Pose): SpriteSurface | null {
    const key = `${footballer.id}:${footballer.role}:${kit}:${pose}`;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = this.paint(SPRITE_W, SPRITE_H, figureFor(footballer, kit, pose)) ?? undefined;
      if (sprite) this.sprites.set(key, sprite);
    }
    return sprite ?? null;
  }

  /** Update every man's animation from what the sim did since the last frame. */
  watch(m: Match, dt: number): void {
    const ball = m.ball;
    while (this.movers.length < m.players.length) {
      this.movers.push({ face: this.movers.length < m.players.length / 2 ? 1 : -1, stride: 0, kickUntil: 0, slideUntil: 0, diveUntil: 0 });
    }
    if (ball.kick && ball.last !== null && (ball.last !== this.lastBall.last || ball.kick !== this.lastBall.kick)) {
      this.movers[ball.last].kickUntil = m.t + 0.28;
    }
    this.lastBall = { owner: ball.owner, last: ball.last, kick: ball.kick };
    // A man whose tackle clock was just set has gone in for the ball.
    m.players.forEach((p, i) => {
      const before = this.lastTackleCd[i] ?? 0;
      if (p.tackleCd > before + 0.3) this.movers[i].slideUntil = m.t + 0.3;
      this.lastTackleCd[i] = p.tackleCd;
    });
    // The keeper goes down for a shot that's about to reach him.
    if (ball.kick === "shot" && ball.owner === null) {
      for (let i = 0; i < m.players.length; i += 1) {
        const p = m.players[i];
        if (p.role !== "GK" || (ball.vx > 0 ? p.team !== 1 : p.team !== 0)) continue;
        const gap = Math.abs(p.x - ball.x);
        if (gap < 11 && Math.abs(p.y - ball.y) > 1.5) this.movers[i].diveUntil = m.t + 0.45;
      }
    }
    if (m.events.length > this.events) {
      for (const event of m.events.slice(this.events)) if (event.kind === "goal") this.celebrate(event.team, this.clock, CELEBRATION);
      this.events = m.events.length;
    }
    m.players.forEach((p, i) => {
      const mover = this.movers[i];
      const speed = Math.hypot(p.vx, p.vy);
      if (Math.abs(p.vx) > 0.8) mover.face = p.vx > 0 ? 1 : -1;
      else if (speed < 0.8) mover.face = m.ball.x >= p.x ? 1 : -1;
      if (speed > 1) mover.stride += speed * dt * 0.1;
    });
  }

  poseOf(m: Match, i: number): Pose {
    const p = m.players[i];
    const mover = this.movers[i];
    if (this.cheer && this.cheer.until > this.clock && this.cheer.team === p.team) return "cheer";
    if (mover.diveUntil > m.t) return "dive";
    if (p.stun > 0 || mover.slideUntil > m.t) return "slide";
    if (mover.kickUntil > m.t) return "kick";
    if (Math.hypot(p.vx, p.vy) > 1) return RUN_CYCLE[Math.floor(mover.stride * 4) % 4];
    return "stand";
  }

  private ballSprite(): SpriteSurface | null {
    this.ball ??= this.paint(BALL_SIZE, BALL_SIZE, ballPixels());
    return this.ball;
  }

  /** The pitch drawn once at this scale, in device pixels, to blit each frame. */
  pitchSurface(view: View): SpriteSurface | null {
    const key = `${view.scale.toFixed(3)}@${view.ratio}`;
    if (this.pitch?.key === key) return this.pitch.surface;
    const surface = this.surface(Math.ceil(WORLD_W * view.scale * view.ratio), Math.ceil(WORLD_H * view.scale * view.ratio));
    const ctx = surface?.getContext("2d") as CanvasRenderingContext2D | null | undefined;
    if (!surface || !ctx) return null;
    ctx.scale(view.ratio, view.ratio);
    drawPitch(ctx, { ...view, width: WORLD_W * view.scale, height: WORLD_H * view.scale, ox: 0, oy: 0 });
    this.pitch = { key, surface };
    return surface;
  }

  draw(ctx: CanvasRenderingContext2D, m: Match, view: View, moment: Moment | null, hover: number | null, now: number): void {
    const dt = this.tick(now);
    this.watch(m, dt);
    ctx.fillStyle = "#3f7a3a";
    ctx.fillRect(0, 0, view.width, view.height);
    const pitch = this.pitchSurface(view);
    if (pitch) {
      const k = view.scale * view.ratio;
      ctx.drawImage(pitch as CanvasImageSource, 0, 0, WORLD_W * k, WORLD_H * k, view.ox, view.oy, WORLD_W * view.scale, WORLD_H * view.scale);
    }
    ctx.imageSmoothingEnabled = false;

    // Ground marks first, so nothing's shadow lands on a man.
    ctx.fillStyle = "rgba(20, 40, 20, 0.28)";
    for (const p of m.players) {
      ctx.beginPath();
      ctx.ellipse(sx(view, p.x), sy(view, p.y), 6.5 * view.sprite, 2.3 * view.sprite, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (moment) drawMomentGround(ctx, m, moment, hover, view, now);

    // Men and ball, back to front.
    const order = m.players.map((_, index) => index).sort((a, b) => m.players[a].y - m.players[b].y);
    const ballY = m.ball.y;
    let ballDrawn = false;
    const drawBall = () => {
      ballDrawn = true;
      const sprite = this.ballSprite();
      const bx = sx(view, m.ball.x);
      const by = sy(view, m.ball.y);
      ctx.fillStyle = "rgba(20, 40, 20, 0.3)";
      ctx.beginPath();
      ctx.ellipse(bx, by, 2.6 * view.sprite, 1.2 * view.sprite, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sprite) {
        const size = BALL_SIZE * view.sprite;
        ctx.drawImage(sprite as CanvasImageSource, Math.round(bx - size / 2), Math.round(by - size), size, size);
      }
    };
    for (const i of order) {
      const p = m.players[i];
      if (!ballDrawn && ballY < p.y) drawBall();
      const sprite = this.spriteFor(p, m.sides[p.team].kit, this.poseOf(m, i));
      if (!sprite) continue;
      const w = SPRITE_W * view.sprite;
      const h = SPRITE_H * view.sprite;
      const x = sx(view, p.x);
      const y = sy(view, p.y);
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(this.movers[i].face, 1);
      ctx.drawImage(sprite as CanvasImageSource, Math.round(-w / 2), Math.round(-h + view.sprite), w, h);
      ctx.restore();
    }
    if (!ballDrawn) drawBall();
    if (moment) drawMomentLabels(ctx, m, moment, hover, view);
  }
}

// ---- The pitch ----

function drawPitch(ctx: CanvasRenderingContext2D, view: View): void {
  const x0 = sx(view, 0);
  const y0 = sy(view, 0);
  const s = view.scale;
  ctx.fillStyle = "#3f7a3a";
  ctx.fillRect(0, 0, view.width, view.height);
  // A crowd along the top and bottom, dots in a few shirt colours.
  const colours = ["#d0384e", "#3b6fd4", "#f2cc3a", "#f4f4f4", "#38b764", "#8a56b8"];
  for (const edge of [0, 1]) {
    for (let col = 0; col < WORLD_W * 2; col += 1) {
      for (let row = 0; row < 2; row += 1) {
        const hash = Math.imul(col * 31 + row * 7 + edge * 13, 2654435761) >>> 0;
        ctx.fillStyle = colours[hash % colours.length];
        const x = view.ox + (col / 2) * s;
        const y = edge === 0 ? view.oy + (0.6 + row * 1.7) * s : view.oy + (WORLD_H - 2.9 + row * 1.7) * s;
        ctx.fillRect(x, y, s * 0.4, s * 0.7);
      }
    }
  }
  // Mown stripes.
  for (let stripe = 0; stripe < 10; stripe += 1) {
    ctx.fillStyle = stripe % 2 === 0 ? "#5fa04a" : "#69ac52";
    ctx.fillRect(x0 + stripe * W * 0.1 * s, y0, W * 0.1 * s + 0.5, H * s);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1.5, s * 0.45);
  ctx.lineJoin = "miter";
  const box = (x: number, y: number, w: number, h: number) => ctx.strokeRect(sx(view, x), sy(view, y), w * s, h * s);
  box(0, 0, W, H);
  ctx.beginPath();
  ctx.moveTo(sx(view, W / 2), y0);
  ctx.lineTo(sx(view, W / 2), sy(view, H));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx(view, W / 2), sy(view, MID), 9 * s, 0, Math.PI * 2);
  ctx.stroke();
  box(0, MID - 18, 16, 36);
  box(W - 16, MID - 18, 16, 36);
  box(0, MID - 9, 6, 18);
  box(W - 6, MID - 9, 6, 18);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [x, y] of [[W / 2, MID], [11, MID], [W - 11, MID]]) {
    ctx.beginPath();
    ctx.arc(sx(view, x), sy(view, y), Math.max(1.5, s * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  // The goals, nets behind the line.
  for (const side of [0, 1]) {
    const gx = side === 0 ? -3.2 : W;
    ctx.fillStyle = "rgba(240,240,240,0.2)";
    ctx.fillRect(sx(view, gx), sy(view, MID - GOAL_HALF), 3.2 * s, GOAL_HALF * 2 * s);
    ctx.strokeStyle = "rgba(240,240,240,0.55)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k += 1) {
      ctx.beginPath();
      ctx.moveTo(sx(view, gx), sy(view, MID - GOAL_HALF + k * 2));
      ctx.lineTo(sx(view, gx + 3.2), sy(view, MID - GOAL_HALF + k * 2));
      ctx.stroke();
    }
    ctx.strokeStyle = "#f4f4f4";
    ctx.lineWidth = Math.max(2, s * 0.6);
    ctx.strokeRect(sx(view, gx), sy(view, MID - GOAL_HALF), 3.2 * s, GOAL_HALF * 2 * s);
  }
}

// ---- The moment overlay ----

function chanceColour(chance: number): string {
  return chance >= 0.65 ? "#6fdc7a" : chance >= 0.35 ? "#f5c542" : "#ff7a6a";
}

function drawMomentGround(ctx: CanvasRenderingContext2D, m: Match, moment: Moment, hover: number | null, view: View, now: number): void {
  const carrier = m.players[moment.carrier];
  const pulse = 1 + Math.sin(now * 6) * 0.08;
  ctx.lineWidth = Math.max(2, view.sprite);
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(sx(view, carrier.x), sy(view, carrier.y), 9 * view.sprite * pulse, 3.6 * view.sprite * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  moment.choices.forEach((choice, index) => {
    const picked = hover === index;
    if (choice.kind === "pass" && choice.to !== undefined) {
      const target = m.players[choice.to];
      ctx.strokeStyle = chanceColour(choice.chance);
      ctx.lineWidth = Math.max(2, view.sprite) * (picked ? 1.6 : 1);
      ctx.beginPath();
      ctx.ellipse(sx(view, target.x), sy(view, target.y), 8 * view.sprite, 3.2 * view.sprite, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (picked) {
        ctx.setLineDash([view.sprite * 3, view.sprite * 2]);
        ctx.beginPath();
        ctx.moveTo(sx(view, carrier.x), sy(view, carrier.y));
        ctx.lineTo(sx(view, target.x), sy(view, target.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (choice.kind === "shoot" && picked) {
      const goalX = carrier.team === 0 ? W : 0;
      ctx.strokeStyle = chanceColour(choice.chance * 2);
      ctx.lineWidth = Math.max(2, view.sprite) * 1.6;
      ctx.setLineDash([view.sprite * 3, view.sprite * 2]);
      ctx.beginPath();
      ctx.moveTo(sx(view, carrier.x), sy(view, carrier.y));
      ctx.lineTo(sx(view, goalX), sy(view, MID));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function drawMomentLabels(ctx: CanvasRenderingContext2D, m: Match, moment: Moment, hover: number | null, view: View): void {
  const size = Math.round(Math.max(11, view.sprite * 5.5));
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  moment.choices.forEach((choice, index) => {
    if (choice.kind !== "pass" || choice.to === undefined) return;
    const target = m.players[choice.to];
    const label = `${index + 1} · ${Math.round(choice.chance * 100)}%`;
    const x = sx(view, target.x);
    const y = sy(view, target.y) - (SPRITE_H + 4) * view.sprite;
    const width = ctx.measureText(label).width + size * 0.9;
    ctx.fillStyle = hover === index ? "#ffffff" : "rgba(20, 24, 40, 0.82)";
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - size * 0.7, width, size * 1.4, size * 0.5);
    ctx.fill();
    ctx.fillStyle = hover === index ? "#1a1c2c" : chanceColour(choice.chance);
    ctx.fillText(label, x, y);
  });
}

/**
 * The choice a click or tap at this spot means: the pass to the man nearest it (within a thumb's reach), or
 * null if it's nowhere near any.
 */
export function pickAt(view: View, m: Match, moment: Moment, px: number, py: number): number | null {
  const reach = Math.max(7 * view.sprite, 18);
  let best: number | null = null;
  let bestD = reach;
  moment.choices.forEach((choice, index) => {
    if (choice.kind !== "pass" || choice.to === undefined) return;
    const target = m.players[choice.to];
    // Aim at the middle of the figure, not his feet.
    const d = Math.hypot(sx(view, target.x) - px, sy(view, target.y) - 10 * view.sprite - py);
    if (d < bestD) {
      best = index;
      bestD = d;
    }
  });
  return best;
}
