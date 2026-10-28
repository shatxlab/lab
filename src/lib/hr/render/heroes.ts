/**
 * The hero's frames, baked once per coworker from the Tycoon sprite sheet: standing, four strides of the walk, and a
 * white silhouette for the hit flash. The pixel work is pure (see `heroPixels`), so it is tested without a browser;
 * only `loadSheet` and `toCanvas` touch the DOM.
 */
import { withBase } from "@/lib/apps/paths";
import { rosterAppearance } from "@/lib/roster/appearance";
import type { DepartmentId } from "@/lib/roster/types";
import { CHARACTER_FRAMES, recolor, shirtColors } from "@/lib/tycoon/render-support/characters";
import { poseFrame, posePatches, STEP_CYCLE, type Pixels } from "@/lib/tycoon/render-support/poses";

export const SHEET_URL = withBase("/pixeloffice/PixelOfficeAssets.png");

export interface Sheet {
  data: Uint8ClampedArray;
  width: number;
}

export interface HeroPixels {
  stand: Pixels;
  walk: Pixels[];
  flash: Pixels;
}

/** The character's frame cut out of the sheet and recoloured for this coworker, then posed on a padded canvas. */
export function heroPixels(sheet: Sheet, id: number, department: DepartmentId): HeroPixels {
  const { character, hair, shirt } = rosterAppearance(id, department);
  const [x0, y0, width, height] = CHARACTER_FRAMES[character];
  const cut = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((y0 + y) * sheet.width + x0) * 4;
    cut.set(sheet.data.subarray(from, from + width * 4), y * width * 4);
  }
  recolor(cut, width, character, hair, shirt);
  const base = { data: cut, width, height };
  const colors = shirtColors(character, shirt);
  // Padded like every pose, so the standing frame and the strides share one anchor.
  const stand = poseFrame(base, [], colors);
  const walk = STEP_CYCLE.map((pose) => poseFrame(base, posePatches(character, pose), colors));
  const flash = { ...stand, data: new Uint8ClampedArray(stand.data) };
  for (let index = 0; index < flash.data.length; index += 4) {
    if (flash.data[index + 3] === 0) continue;
    flash.data[index] = flash.data[index + 1] = flash.data[index + 2] = 255;
  }
  return { stand, walk, flash };
}

export interface HeroFrames {
  stand: HTMLCanvasElement;
  walk: HTMLCanvasElement[];
  flash: HTMLCanvasElement;
  width: number;
  height: number;
}

function toCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  return canvas;
}

export function bakeHero(sheet: Sheet, id: number, department: DepartmentId): HeroFrames {
  const { stand, walk, flash } = heroPixels(sheet, id, department);
  return { stand: toCanvas(stand), walk: walk.map(toCanvas), flash: toCanvas(flash), width: stand.width, height: stand.height };
}

/** The sheet's raw pixels; null if the browser won't give them up, and the hero is then drawn as a plain figure. */
export async function loadSheet(): Promise<Sheet | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(SHEET_URL)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width };
  } catch {
    return null;
  }
}
