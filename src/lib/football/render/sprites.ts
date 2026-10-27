/*
 * The footballers, painted pixel by pixel from layered parts: a head with one of four haircuts, a torso in the
 * kit, shorts, socks and boots, and arms and legs placed by pose. Every figure is seen from the side, facing
 * right (the renderer mirrors it for the other way), on a 16 x 24 grid with its feet on the bottom row.
 *
 * Nothing here is a bitmap: a figure is a grid of palette tokens, outlined automatically, so any kit, skin,
 * hair and pose combination exists without drawing it. `toRgba` turns a grid into pixels for one player.
 */
import type { Footballer } from "../sim/types";

export const SPRITE_W = 16;
export const SPRITE_H = 24;

export type Pose = "stand" | "run0" | "run1" | "run2" | "run3" | "kick" | "slide" | "dive" | "cheer";
export const RUN_CYCLE: readonly Pose[] = ["run0", "run1", "run2", "run3"];

const TOKENS = [
  "none",
  "outline",
  "skin",
  "skinShade",
  "hair",
  "hairLight",
  "jersey",
  "jerseyDark",
  "trim",
  "shorts",
  "socks",
  "sockTrim",
  "boot",
  "glove",
  "eye",
] as const;
type Token = (typeof TOKENS)[number];
const T = Object.fromEntries(TOKENS.map((name, index) => [name, index])) as Record<Token, number>;

/** One figure: `SPRITE_W * SPRITE_H` palette tokens, row by row. */
export type Grid = Uint8Array;

export type Pattern = "plain" | "hoops" | "band";

export interface Kit {
  name: string;
  jersey: string;
  jerseyDark: string;
  trim: string;
  shorts: string;
  socks: string;
  pattern: Pattern;
}

/** Eight club colours; a side's `kit` indexes this. Each pair of neighbours is easy to tell apart on a pitch. */
export const KITS: readonly Kit[] = [
  { name: "Reds", jersey: "#d0384e", jerseyDark: "#9a2438", trim: "#f4f4f4", shorts: "#f4f4f4", socks: "#d0384e", pattern: "plain" },
  { name: "Blues", jersey: "#3b6fd4", jerseyDark: "#2a4fa0", trim: "#f4f4f4", shorts: "#233b78", socks: "#3b6fd4", pattern: "plain" },
  { name: "Greens", jersey: "#38b764", jerseyDark: "#25834a", trim: "#f4f4f4", shorts: "#1f5a3a", socks: "#38b764", pattern: "hoops" },
  { name: "Oranges", jersey: "#f08a3c", jerseyDark: "#c0601f", trim: "#2a2a3c", shorts: "#2a2a3c", socks: "#f08a3c", pattern: "band" },
  { name: "Purples", jersey: "#8a56b8", jerseyDark: "#643a8a", trim: "#f4e06a", shorts: "#f4f4f4", socks: "#8a56b8", pattern: "plain" },
  { name: "Whites", jersey: "#f0f0f0", jerseyDark: "#b8c0cc", trim: "#d0384e", shorts: "#3b3b5c", socks: "#f0f0f0", pattern: "band" },
  { name: "Yellows", jersey: "#f2cc3a", jerseyDark: "#c09a1c", trim: "#2a4fa0", shorts: "#2a4fa0", socks: "#f2cc3a", pattern: "hoops" },
  { name: "Blacks", jersey: "#3a3d52", jerseyDark: "#24263a", trim: "#f08a3c", shorts: "#24263a", socks: "#3a3d52", pattern: "band" },
];

/** The keeper's colours: a loud shirt, picked so it never matches the side's own. */
export const KEEPER_KITS: readonly Pick<Kit, "jersey" | "jerseyDark" | "shorts" | "socks">[] = [
  { jersey: "#8ee04a", jerseyDark: "#5ca02a", shorts: "#2a2a3c", socks: "#2a2a3c" },
  { jersey: "#f08ac0", jerseyDark: "#b85a90", shorts: "#2a2a3c", socks: "#2a2a3c" },
  { jersey: "#f4a53a", jerseyDark: "#c0761c", shorts: "#2a2a3c", socks: "#2a2a3c" },
];

export const SKINS: readonly { skin: string; shade: string }[] = [
  { skin: "#f6d2ac", shade: "#d9a97e" },
  { skin: "#e0a878", shade: "#b87c50" },
  { skin: "#a8744a", shade: "#7e502e" },
  { skin: "#6e4630", shade: "#4c2e1e" },
];

export const HAIRS: readonly { main: string; light: string }[] = [
  { main: "#262638", light: "#566c86" },
  { main: "#5a3220", light: "#8a5a3a" },
  { main: "#c89a3a", light: "#f0cc6a" },
  { main: "#b8502a", light: "#e07a4a" },
  { main: "#8a8a9a", light: "#c4c8d4" },
  { main: "#3a2a5a", light: "#6a4a9a" },
];

export const HAIRCUTS = ["crop", "quiff", "bald", "long"] as const;
export type Haircut = (typeof HAIRCUTS)[number];

/** What one man looks like, apart from his kit. The same man always looks the same: it's hashed from his id. */
export interface Look {
  skin: number;
  hair: number;
  haircut: Haircut;
  beard: boolean;
}

export function lookFor(id: number): Look {
  const h = Math.imul(id + 7, 2654435761) >>> 0;
  return {
    skin: h % SKINS.length,
    hair: (h >>> 4) % HAIRS.length,
    haircut: HAIRCUTS[(h >>> 9) % HAIRCUTS.length],
    beard: ((h >>> 14) & 3) === 0,
  };
}

// ---- Painting ----

class Canvas {
  readonly cells: Grid = new Uint8Array(SPRITE_W * SPRITE_H);

  rect(x: number, y: number, w: number, h: number, token: Token): void {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        if (col >= 0 && col < SPRITE_W && row >= 0 && row < SPRITE_H) this.cells[row * SPRITE_W + col] = T[token];
      }
    }
  }

  dot(x: number, y: number, token: Token): void {
    this.rect(x, y, 1, 1, token);
  }

  at(x: number, y: number): number {
    return x < 0 || x >= SPRITE_W || y < 0 || y >= SPRITE_H ? 0 : this.cells[y * SPRITE_W + x];
  }

  /** Every empty cell touching the figure becomes outline. */
  outline(): Grid {
    const result = this.cells.slice();
    for (let y = 0; y < SPRITE_H; y += 1) {
      for (let x = 0; x < SPRITE_W; x += 1) {
        if (this.at(x, y) !== 0) continue;
        if (this.at(x - 1, y) || this.at(x + 1, y) || this.at(x, y - 1) || this.at(x, y + 1)) result[y * SPRITE_W + x] = T.outline;
      }
    }
    return result;
  }
}

interface Figure {
  haircut: Haircut;
  beard: boolean;
  pattern: Pattern;
  keeper: boolean;
}

/** A head with its top-left corner at (x, y): five wide, six tall, face to the right. */
function head(c: Canvas, x: number, y: number, figure: Figure): void {
  c.rect(x + 1, y, 3, 1, "skin");
  c.rect(x, y + 1, 5, 4, "skin");
  c.rect(x + 1, y + 5, 3, 1, "skin");
  c.dot(x + 5, y + 3, "skin");
  c.dot(x + 1, y + 3, "skinShade");
  c.dot(x + 3, y + 3, "eye");
  c.dot(x + 4, y + 5, "skinShade");
  const cut = figure.haircut;
  if (cut !== "bald") {
    c.rect(x, y, 4, 1, "hair");
    c.rect(x, y + 1, 5, 1, "hair");
    c.rect(x, y + 2, 2, 2, "hair");
    c.dot(x + 2, y + 1, "hairLight");
    c.dot(x + 3, y, "hairLight");
  } else {
    c.dot(x + 2, y, "hairLight");
  }
  if (cut === "quiff") {
    c.rect(x + 1, y - 1, 4, 1, "hair");
    c.dot(x + 4, y - 1, "hairLight");
  }
  if (cut === "long") {
    c.rect(x - 1, y + 1, 2, 5, "hair");
    c.dot(x - 1, y + 5, "hairLight");
  }
  if (figure.beard) {
    c.rect(x + 1, y + 4, 4, 1, "hair");
    c.rect(x + 2, y + 5, 2, 1, "hair");
    c.dot(x + 4, y + 3, "hair");
  }
}

/** The shirt, shorts and, by pattern, trim. (x, y) is the shirt's top-left; it's 6 wide, 7 tall. */
function torso(c: Canvas, x: number, y: number, figure: Figure): void {
  c.rect(x, y, 6, 7, "jersey");
  c.rect(x, y, 1, 7, "jerseyDark");
  c.rect(x + 5, y + 3, 1, 4, "jerseyDark");
  if (!figure.keeper) {
    if (figure.pattern === "hoops") {
      c.rect(x, y + 2, 6, 1, "trim");
      c.rect(x, y + 5, 6, 1, "trim");
    } else if (figure.pattern === "band") {
      c.rect(x, y + 3, 6, 2, "trim");
    }
  }
  c.rect(x + 2, y, 3, 1, "trim");
  c.rect(x, y + 7, 6, 3, "shorts");
  c.rect(x, y + 7, 1, 3, "shorts");
}

/**
 * One leg from the hip at column `x` (rows 18 to 23). `swing` carries the foot forward (positive) or back,
 * `lift` raises the shin behind the knee.
 */
function leg(c: Canvas, x: number, swing: number, lift: number): void {
  for (let row = 0; row < 6; row += 1) {
    const dx = Math.round((swing * row) / 5);
    const bent = lift > 0 && row >= 3;
    const px = x + dx - (bent ? lift : 0);
    const py = 18 + row - (bent ? lift : 0);
    const token: Token = row < 2 ? "skin" : row === 5 ? "boot" : row === 2 ? "sockTrim" : "socks";
    c.rect(px, py, 2, 1, token);
  }
  // The boot's toe.
  const toeDx = Math.round(swing);
  const toeLift = lift > 0 ? lift : 0;
  c.dot(x + toeDx + 2, 23 - toeLift, "boot");
}

/** An arm hanging or swung from the shoulder at (x, 9): sleeve, then bare arm, then a hand (a glove for the keeper). */
function arm(c: Canvas, x: number, swing: number, figure: Figure, up = false): void {
  const hand: Token = figure.keeper ? "glove" : "skin";
  if (up) {
    c.rect(x, 3, 2, 4, "skin");
    c.rect(x, 3, 2, 1, hand);
    c.rect(x, 7, 2, 3, "jersey");
    return;
  }
  for (let row = 0; row < 6; row += 1) {
    const dx = Math.round((swing * row) / 5);
    c.rect(x + dx, 9 + row, 2, 1, row < 3 ? "jersey" : row === 5 ? hand : "skin");
  }
}

export function paintFigure(pose: Pose, figure: Figure): Grid {
  const c = new Canvas();
  if (pose === "slide") {
    head(c, 2, 14, figure);
    c.rect(6, 17, 4, 5, "jersey");
    c.rect(6, 17, 4, 1, "jerseyDark");
    c.rect(10, 18, 2, 4, "shorts");
    c.rect(12, 18, 2, 2, "skin");
    c.rect(12, 20, 2, 2, "socks");
    c.rect(14, 18, 1, 4, "boot");
    c.rect(6, 22, 3, 1, "skin");
    return c.outline();
  }
  if (pose === "dive") {
    c.rect(1, 14, 2, 2, "socks");
    c.rect(1, 16, 2, 1, "boot");
    c.rect(3, 13, 3, 4, "shorts");
    c.rect(6, 12, 5, 5, "jersey");
    c.rect(6, 12, 5, 1, "jerseyDark");
    head(c, 9, 9, figure);
    c.rect(11, 14, 3, 2, "skin");
    c.rect(13, 13, 2, 3, "glove");
    c.rect(7, 17, 3, 1, "skin");
    return c.outline();
  }
  const run = pose.startsWith("run");
  const lean = run || pose === "kick" ? 1 : 0;
  // Back arm and leg first, so the near ones overlap the body.
  if (pose === "stand") {
    arm(c, 6, 0, figure);
    leg(c, 6, 0, 0);
    leg(c, 8, 0, 0);
  } else if (pose === "cheer") {
    arm(c, 3, 0, figure, true);
    leg(c, 6, -1, 0);
    leg(c, 8, 1, 0);
  } else if (pose === "kick") {
    arm(c, 7, -3, figure);
    leg(c, 5, -2, 0);
  } else {
    const phase = Number(pose.slice(3));
    const [front, back, lift] = [
      [4, -4, 0],
      [1, -2, 2],
      [-4, 4, 0],
      [-2, 1, 2],
    ][phase];
    arm(c, 6, front > 0 ? -2 : 2, figure);
    // In the passing frames one foot is up behind the knee and the other planted.
    leg(c, 7, back, phase === 1 ? lift : 0);
  }
  torso(c, 5 + lean * (pose === "kick" ? -1 : 0), 8, figure);
  head(c, 6 + lean, 1, figure);
  if (pose === "stand") {
    c.dot(7, 7, "skin");
  } else {
    c.rect(7 + lean, 7, 2, 1, "skin");
  }
  if (pose === "stand") {
    // Near arm hangs over the shirt.
    arm(c, 9, 0, figure);
  } else if (pose === "cheer") {
    arm(c, 11, 0, figure, true);
  } else if (pose === "kick") {
    leg(c, 8, 6, 1);
    arm(c, 3, 2, figure);
  } else {
    const phase = Number(pose.slice(3));
    const [front, , lift] = [
      [4, -4, 0],
      [1, -2, 2],
      [-4, 4, 0],
      [-2, 1, 2],
    ][phase];
    leg(c, 8, front, phase === 3 ? lift : 0);
    arm(c, 9, front > 0 ? 2 : -2, figure);
  }
  return c.outline();
}

// ---- Colours ----

function rgba(hex: string): [number, number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16), 255];
}

/** The palette one player's figure is drawn in. */
export function paletteFor(footballer: Pick<Footballer, "id" | "role">, kit: number): Record<Token, string | null> {
  const look = lookFor(footballer.id);
  const skin = SKINS[look.skin];
  const hair = HAIRS[look.hair];
  const club = KITS[kit % KITS.length];
  const keeper = footballer.role === "GK" ? KEEPER_KITS[kit % KEEPER_KITS.length] : null;
  return {
    none: null,
    outline: "#1a1c2c",
    skin: skin.skin,
    skinShade: skin.shade,
    hair: hair.main,
    hairLight: hair.light,
    jersey: keeper?.jersey ?? club.jersey,
    jerseyDark: keeper?.jerseyDark ?? club.jerseyDark,
    trim: keeper ? "#1a1c2c" : club.trim,
    shorts: keeper?.shorts ?? club.shorts,
    socks: keeper?.socks ?? club.socks,
    sockTrim: keeper ? "#f4f4f4" : club.trim,
    boot: "#1a1c2c",
    glove: "#f4f4f4",
    eye: "#1a1c2c",
  };
}

/** A footballer's figure in a pose, as RGBA bytes, `SPRITE_W * SPRITE_H * 4` of them. */
export function figureFor(footballer: Pick<Footballer, "id" | "role">, kit: number, pose: Pose): Uint8ClampedArray {
  const look = lookFor(footballer.id);
  const pattern = KITS[kit % KITS.length].pattern;
  const grid = paintFigure(pose, { haircut: look.haircut, beard: look.beard, pattern, keeper: footballer.role === "GK" });
  const palette = paletteFor(footballer, kit);
  const pixels = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4);
  grid.forEach((token, index) => {
    const hex = palette[TOKENS[token]];
    if (hex) pixels.set(rgba(hex), index * 4);
  });
  return pixels;
}

/** The ball, 5 x 5: white with dark patches. */
export const BALL_SIZE = 5;
export function ballPixels(): Uint8ClampedArray {
  const rows = [".OOO.", "OWWKO", "OWKWO", "OKWWO", ".OOO."];
  const colours: Record<string, string | null> = { ".": null, O: "#1a1c2c", W: "#f8f8f8", K: "#5a5e78" };
  const pixels = new Uint8ClampedArray(BALL_SIZE * BALL_SIZE * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const hex = colours[ch];
      if (hex) pixels.set(rgba(hex), (y * BALL_SIZE + x) * 4);
    }),
  );
  return pixels;
}
