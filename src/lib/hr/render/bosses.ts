/**
 * The furniture bosses cut out of the Pixel Office sheet: the meeting chair, the coffee machine and the vending
 * machine are the pack's own props, drawn small — they are baked once into canvases and scaled up by the renderer.
 * The sheet itself is loaded once for the hero's frames (see `heroes.ts`); the pixel work here is the same cut.
 * The rest of the bosses stay drawn from shapes.
 */
import type { FoeKind } from "../sim/types";
import type { HeroFrames, Sheet } from "./heroes";

/** The furniture frames in PixelOfficeAssets.png: [x, y, width, height], as the tycoon atlas cuts them. */
const FRAMES = {
  meetingChair: [58, 41, 11, 20],
  coffeeMachine: [159, 91, 7, 11],
  vendingMachine: [159, 123, 24, 34],
} as const;

export type FurnitureBossKind = keyof typeof FRAMES;

export interface BossFrames {
  [kind: string]: HTMLCanvasElement | undefined;
}

/** World units per sprite pixel, per boss: the pack draws its furniture small, so the machines are blown up. */
export const BOSS_PIXEL: Record<FurnitureBossKind | keyof typeof AUTHORED_BOSS_SPRITES, number> = {
  meetingChair: 2,
  coffeeMachine: 3,
  vendingMachine: 2.4,
  shredder: 2.4,
  printerPrime: 2.4,
  blobPrime: 2.2,
};

// ---- The authored bosses ----------------------------------------------------------------------------------------
//
// The shredder, the printer prime and the blob prime are drawn here, pixel by pixel, as string rows: '.' leaves
// the pixel transparent, and a letter paints it with the sprite's own colour map. They bake into the same frames
// the furniture bosses use, with the shape draws kept as the fallback.

export interface AuthoredSprite {
  rows: readonly string[];
  colors: Readonly<Record<string, string>>;
  /** World units per sprite pixel. */
  pixel: number;
}

const OFFICE = { K: "#1a1c2c", P: "#f4f4f4", R: "#e0483f", Y: "#ffcd75" };

export const AUTHORED_BOSS_SPRITES: Partial<Record<"shredder" | "printerPrime" | "blobPrime", AuthoredSprite>> = {
  shredder: {
    pixel: 2.4,
    colors: { ...OFFICE, B: "#3a4256", D: "#2a3140", L: "#566c86" },
    rows: [
      "......PPPPPP......",
      "......PPPPPP......",
      "...KKKKKKKKKKKK...",
      "...KBBBBBBBBBBK...",
      "...KBPPPPPPPPBK...",
      "...KPTPTPTPTPTBK..".slice(0, 18),
      "...KBBBBBBBBBBK...",
      "...KBDBDBDBDBDBK..".slice(0, 18),
      "...KBDBDBDBDBDBK..".slice(0, 18),
      "...KBBBBBBBBBBK...",
      "...KBBBBBRBBBBK...",
      "...KBBBBBBBBBBK...",
      "...KKKKKKKKKKKK...",
      "....KDDDDDDDDK....",
      "....KDDDDDDDDK....",
      "....KDDDDDDDDK....",
      "....KDDDDDDDDK....",
      ".....KKKKKKKK.....",
    ],
  },
  printerPrime: {
    pixel: 2.4,
    colors: { ...OFFICE, Q: "#5d275d", D: "#3a1f38" },
    rows: [
      "........PPPPPP........",
      "........PPPPPP........",
      "..KKKKKKKKKKKKKKKKKK..",
      "..KQQQQQQQQQQQQQQQQK..",
      "..KQQQQQQQQQQQQQQQQK..",
      "..KQQRRQQQQQQQQYYQQK..",
      "..KQQRRQQQQQQQQYYQQK..",
      "..KQQQQQQQQQQQQQQQQK..",
      "..KQDDDDDDDDDDDDDDQK..",
      "..KQDDDDDDDDDDDDDDQK..",
      "..KKKKKKKKKKKKKKKKKK..",
      "...KQQQQQQQQQQQQQQK...",
      "...KQQQQQQQQQQQQQQK...",
      "...KKKKKKKKKKKKKKKK...",
    ],
  },
  blobPrime: {
    pixel: 2.2,
    colors: { ...OFFICE, B: "#4a5a7e", D: "#333c57" },
    rows: [
      "..........KKKKKKKK..........",
      "........KKBBBBBBBBKK........",
      "......KKBBBBBBBBBBBBKK......",
      ".....KBBBBBBBBBBBBBBBBK.....",
      "....KBBBBBBBBBBBBBBBBBBK....",
      "...KBBBBWWBBBBBBBBWWBBBBK...",
      "...KBBBBWKBBBBBBBBKWBBBBK...",
      "..KBBBBBBBBBBBBBBBBBBBBBBK..",
      "..KBBBBBBBBBBBBBBBBBBBBBBK..",
      "..KBBBBBBBKKKKKKKKKBBBBBBK..",
      "..KBBBBBBKDDDDDDDDDKBBBBBK..",
      "..KBBBBBBKDDDDDDDDDKBBBBBK..",
      "..KBBBBBBBKKKKKKKKKBBBBBBK..",
      "...KBBBBBBBBBBBBBBBBBBBBK...",
      "....KBBBBBBBBBBBBBBBBBBK....",
      ".....KKBBBBBBBBBBBBBBKK.....",
      ".......KKKKKKKKKKKKKKK......",
    ],
  },
};

/** An authored sprite's pixels: one RGBA per non-transparent cell of the rows. */
export function authoredSpritePixels(sprite: AuthoredSprite): { data: Uint8ClampedArray; width: number; height: number } {
  const width = Math.max(...sprite.rows.map((row) => row.length));
  const height = sprite.rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = sprite.rows[y];
    for (let x = 0; x < row.length; x += 1) {
      const mark = row[x];
      if (!mark || mark === "." || mark === " ") continue;
      const color = sprite.colors[mark];
      if (!color) continue;
      const index = (y * width + x) * 4;
      data[index] = Number.parseInt(color.slice(1, 3), 16);
      data[index + 1] = Number.parseInt(color.slice(3, 5), 16);
      data[index + 2] = Number.parseInt(color.slice(5, 7), 16);
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

/** The furniture bosses cut from the sheet at their native pixel size, plus the authored bosses' pixel sprites. */
export function bakeBosses(sheet: Sheet): BossFrames {
  const bosses = {} as BossFrames;
  for (const [kind, sprite] of Object.entries(AUTHORED_BOSS_SPRITES) as [FoeKind, AuthoredSprite][]) {
    const pixels = authoredSpritePixels(sprite);
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
    bosses[kind] = canvas;
  }
  for (const [kind, [x0, y0, width, height]] of Object.entries(FRAMES)) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const from = ((y0 + y) * sheet.width + x0) * 4;
      data.set(sheet.data.subarray(from, from + width * 4), y * width * 4);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.putImageData(new ImageData(data, width, height), 0, 0);
    bosses[kind as FurnitureBossKind] = canvas;
  }
  return bosses;
}
