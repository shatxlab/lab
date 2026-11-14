/**
 * The furniture bosses cut out of the Pixel Office sheet: the meeting chair, the coffee machine and the vending
 * machine are the pack's own props, drawn small — they are baked once into canvases and scaled up by the renderer.
 * The sheet itself is loaded once for the hero's frames (see `heroes.ts`); the pixel work here is the same cut.
 * The rest of the bosses stay drawn from shapes.
 */
import type { Sheet } from "./heroes";

/** The furniture frames in PixelOfficeAssets.png: [x, y, width, height], as the tycoon atlas cuts them. */
const FRAMES = {
  meetingChair: [58, 41, 11, 20],
  coffeeMachine: [159, 91, 7, 11],
  vendingMachine: [159, 123, 24, 34],
} as const;

export type FurnitureBossKind = keyof typeof FRAMES;

export interface BossFrames {
  meetingChair: HTMLCanvasElement;
  coffeeMachine: HTMLCanvasElement;
  vendingMachine: HTMLCanvasElement;
}

/** World units per sprite pixel, per boss: the pack draws its furniture small, so the machines are blown up. */
export const BOSS_PIXEL: Record<FurnitureBossKind, number> = { meetingChair: 2, coffeeMachine: 3, vendingMachine: 2.4 };

/** The three furniture bosses cut from the sheet at their native pixel size; scaled when drawn. */
export function bakeBosses(sheet: Sheet): BossFrames {
  const bosses = {} as BossFrames;
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
