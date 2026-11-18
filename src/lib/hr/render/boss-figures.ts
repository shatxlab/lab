/**
 * The people bosses — the middle manager, team lead, HR manager, lunch monitor, recruiter, sysadmin and auditor —
 * are the pack's own characters wearing the boss's suit: baked once from the sheet exactly like the hero's frames
 * (`heroPixels` machinery), scaled up so a boss reads bigger than the hero, and drawn with the walk cycle. The
 * furniture bosses (see `bosses.ts`) and the object bosses (still shape-drawn) are the other half of the ladder.
 */
import type { FoeKind } from "../sim/types";
import { figurePixels, type FigureLook, type HeroFrames, type Sheet } from "./heroes";

/** The bosses drawn as pack figures, and the look each wears: which character, hair (0 keeps the sheet's), suit ramp (1-based). */
export const BOSS_FIGURE_LOOKS: Partial<Record<FoeKind, FigureLook>> = {
  middleManager: { character: 0, hair: 2, shirt: 8 },
  teamLead: { character: 1, hair: 1, shirt: 2 },
  hrManager: { character: 2, hair: 4, shirt: 7 },
  lunchMonitor: { character: 3, hair: 3, shirt: 4 },
  recruiter: { character: 4, hair: 6, shirt: 3 },
  sysadmin: { character: 0, hair: 7, shirt: 6 },
  auditor: { character: 1, hair: 1, shirt: 9 },
};

export type FigureBossKind = keyof typeof BOSS_FIGURE_LOOKS;

/** World units per sprite pixel, per boss; the hero is drawn at 2, so a boss reads clearly bigger. */
export const FIGURE_PIXEL: Partial<Record<FoeKind, number>> = {
  middleManager: 2.8,
  teamLead: 3,
  hrManager: 2.8,
  lunchMonitor: 2.9,
  recruiter: 2.7,
  sysadmin: 2.7,
  auditor: 3.3,
};

export interface BossFigures {
  [kind: string]: HeroFrames | undefined;
}

/** The people bosses baked from the sheet at their native size; drawn scaled. */
export function bakeBossFigures(sheet: Sheet): BossFigures {
  const figures: BossFigures = {};
  for (const [kind, look] of Object.entries(BOSS_FIGURE_LOOKS)) {
    const pixels = figurePixels(sheet, look);
    const toCanvas = (data: { data: Uint8ClampedArray; width: number; height: number }): HTMLCanvasElement => {
      const canvas = document.createElement("canvas");
      canvas.width = data.width;
      canvas.height = data.height;
      canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(data.data), data.width, data.height), 0, 0);
      return canvas;
    };
    figures[kind] = {
      stand: toCanvas(pixels.stand),
      walk: pixels.walk.map(toCanvas),
      flash: toCanvas(pixels.flash),
      width: pixels.stand.width,
      height: pixels.stand.height,
    };
  }
  return figures;
}
