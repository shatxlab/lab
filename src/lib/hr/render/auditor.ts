/**
 * The auditor's own sprite, generated with PixelLab (MCP): a 64x64 south-facing figure in its dark suit, with a
 * six-frame walk cycle, shipped as PNGs under `assets/hr/auditor/`. Baked into the same frames the other people
 * bosses use (see `boss-figures.ts`), so the renderer draws it exactly the same way — the sheet-baked pack figure
 * stays as the fallback for when these PNGs fail to load. The pixel work here is pure (see `auditorPixels`), so it
 * is tested without a browser; only `loadAuditorFrames` touches the DOM.
 */
import { withBase } from "@/lib/apps/paths";
import type { HeroFrames, HeroPixels } from "./heroes";
import type { Pixels } from "@/lib/tycoon/render-support/poses";

/** The auditor's frames live here, under the deployment base. */
export const AUDITOR_SPRITE_URL = withBase("/hr/auditor");

/** The walk cycle shipped with the sprite: `walk-0.png` … `walk-5.png`. */
export const AUDITOR_WALK_FRAMES = 6;

/** World units per sprite pixel: the 64px canvas reads about as tall as the sheet-baked bosses (drawn at ~3). */
export const AUDITOR_PIXEL = 1.5;

/** The auditor's frames, cut from its own sprite: standing, the walk cycle, and a white silhouette for the hit flash. */
export function auditorPixels(stand: Pixels, walk: Pixels[]): HeroPixels {
  const flash = { ...stand, data: new Uint8ClampedArray(stand.data) };
  for (let index = 0; index < flash.data.length; index += 4) {
    if (flash.data[index + 3] === 0) continue;
    flash.data[index] = flash.data[index + 1] = flash.data[index + 2] = 255;
  }
  return { stand, walk, flash };
}

/** A PNG URL decoded into raw pixels; null if the fetch or the decode fails, and the pack figure stands in. */
async function loadPixels(url: string): Promise<Pixels | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: new Uint8ClampedArray(image.data), width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

function toCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  return canvas;
}

/** The auditor's baked frames from the shipped PNGs; null when they will not load (the sheet figure takes over). */
export async function loadAuditorFrames(): Promise<HeroFrames | null> {
  const stand = await loadPixels(`${AUDITOR_SPRITE_URL}/stand.png`);
  if (!stand) return null;
  const walk: Pixels[] = [];
  for (let index = 0; index < AUDITOR_WALK_FRAMES; index += 1) {
    const frame = await loadPixels(`${AUDITOR_SPRITE_URL}/walk-${index}.png`);
    if (frame) walk.push(frame);
  }
  if (walk.length === 0) walk.push(stand);
  const { stand: standPixels, walk: walkPixels, flash } = auditorPixels(stand, walk);
  return {
    stand: toCanvas(standPixels),
    walk: walkPixels.map(toCanvas),
    flash: toCanvas(flash),
    width: standPixels.width,
    height: standPixels.height,
  };
}
