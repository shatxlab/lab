/**
 * Bosses with their own sprites, cut from the PixelOffice pack's own characters and dressed as the
 * bosses they are by `scripts/hr/bake-boss-sprites.ts`: the pack's face, hair, outline and hands,
 * with the suit, the tie, the glasses and the pen painted on, and the pack's own stride for the
 * walk. Shipped as PNGs under `assets/hr/<boss>/` and baked into the same frames the sheet-based
 * figure bosses use (see `boss-figures.ts`), so the renderer draws them exactly the same way — the
 * sheet-baked pack figures stay as the fallback when these PNGs fail to load. The pixel work here
 * is pure (see `spritePixels`), so it is tested without a browser; only `loadBossSprites` touches
 * the DOM.
 */
import { withBase } from "@/lib/apps/paths";
import type { FoeKind } from "../sim/types";
import type { BossFigures } from "./boss-figures";
import type { HeroFrames, HeroPixels } from "./heroes";
import type { Pixels } from "@/lib/tycoon/render-support/poses";

/** Which bosses ship their own sprite, and where its frames live, under the deployment base. */
export const BOSS_SPRITE_DIRS: Partial<Record<FoeKind, string>> = {
  auditor: "/hr/auditor",
  middleManager: "/hr/middle-manager",
};

/** World units per sprite pixel, per boss: the cut-and-dressed pack frames read as tall as the sheet-baked bosses. */
export const BOSS_SPRITE_PIXEL: Partial<Record<FoeKind, number>> = {
  auditor: 3.9,
  middleManager: 3.5,
};

/** The walk cycle shipped with every boss sprite: `walk-0.png` … `walk-5.png`. */
export const BOSS_SPRITE_WALK_FRAMES = 6;

/** A sprite's frames, cut from its own PNGs: standing, the walk cycle, and a white silhouette for the hit flash. */
export function spritePixels(stand: Pixels, walk: Pixels[]): HeroPixels {
  const flash = { ...stand, data: new Uint8ClampedArray(stand.data) };
  for (let index = 0; index < flash.data.length; index += 4) {
    if (flash.data[index + 3] === 0) continue;
    flash.data[index] = flash.data[index + 1] = flash.data[index + 2] = 255;
  }
  return { stand, walk, flash };
}

/** The frames cropped to the art's bounding box (the union over all of them): the feet reach the canvas's bottom
 * edge, which is what the renderer anchors on — some generations leave a few transparent rows under the feet, and
 * the boss then reads as floating above its shadow. The frames keep their relative placement, so the walk cycle
 * stays put; every frame is at least 1x1 even for a fully transparent one. */
export function trimToArt(frames: Pixels[]): Pixels[] {
  if (frames.length === 0) return frames;
  let left = frames[0].width, top = frames[0].height, right = 0, bottom = 0;
  for (const frame of frames) {
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        if (frame.data[(y * frame.width + x) * 4 + 3] === 0) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  const width = Math.max(1, right - left + 1);
  const height = Math.max(1, bottom - top + 1);
  return frames.map((frame) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const from = ((top + y) * frame.width + left) * 4;
      data.set(frame.data.subarray(from, from + width * 4), y * width * 4);
    }
    return { data, width, height };
  });
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

async function loadSprite(dir: string): Promise<HeroFrames | null> {
  const base = withBase(dir);
  const stand = await loadPixels(`${base}/stand.png`);
  if (!stand) return null;
  const walk: Pixels[] = [];
  for (let index = 0; index < BOSS_SPRITE_WALK_FRAMES; index += 1) {
    const frame = await loadPixels(`${base}/walk-${index}.png`);
    if (frame) walk.push(frame);
  }
  if (walk.length === 0) walk.push(stand);
  const [standPixels, ...walkPixels] = trimToArt([stand, ...walk]);
  const { flash } = spritePixels(standPixels, walkPixels);
  return {
    stand: toCanvas(standPixels),
    walk: walkPixels.map(toCanvas),
    flash: toCanvas(flash),
    width: standPixels.width,
    height: standPixels.height,
  };
}

/** Every boss sprite that loads, keyed by foe kind; empty when none do (the sheet figures take over). */
export async function loadBossSprites(): Promise<BossFigures | null> {
  const sprites = await Promise.all(
    Object.entries(BOSS_SPRITE_DIRS).map(async ([kind, dir]) => [kind, await loadSprite(dir)] as const),
  );
  const loaded = sprites.filter(([, frames]) => frames);
  if (loaded.length === 0) return null;
  return Object.fromEntries(loaded) as BossFigures;
}
