/*
 * What each canvas looks like. A canvas is a setting shared by ten maps (the
 * meadow for maps 1 to 10); `MapDef.canvas` names it and the drawing reads
 * everything that differs between settings from here, so a new setting is a new
 * entry. Shapes shared with Lone Tower (the wall, the tufts, the horde) still use
 * its `COLORS`.
 */
import { COLORS, treeline, type House, type Tree } from "@/lib/tower/render/sprites";
import { ARENA } from "../sim/balance";
import type { CanvasId } from "../sim/types";

export interface Theme {
  /** Beyond the field's top edge, where the woods carry on. */
  woods: string;
  /** The field itself. */
  ground: string;
  /** Beyond the wall's foot, and the paved street through the gate. */
  courtyard: string;
  road: { edge: string; fill: string; pebble: string };
  plot: { pad: string; rim: string };
  /** The town behind the wall, either side of the gate. */
  houses: House[];
  /** The row of trees along the top of the field. */
  treeline: Tree[];
  gate: { arch: string; door: string; pennants: [string, string] };
}

export const THEMES: Record<CanvasId, Theme> = {
  meadow: {
    woods: COLORS.forest,
    ground: COLORS.grass,
    courtyard: COLORS.courtyard,
    road: { edge: "#b39565", fill: "#d8c08c", pebble: "#c4a874" },
    plot: { pad: "#c8b184", rim: "#a08a62" },
    houses: [
      { x: 14, y: 602, width: 62, height: 34, roof: "#b5523b" },
      { x: 86, y: 612, width: 46, height: 28, roof: "#3f6fa0" },
      { x: 228, y: 612, width: 46, height: 28, roof: "#b5523b" },
      { x: 284, y: 602, width: 62, height: 34, roof: "#3f6fa0" },
    ],
    treeline: treeline(7, ARENA.width),
    gate: { arch: "#4a3a2e", door: "#8a6a45", pennants: ["#b5523b", "#3f6fa0"] },
  },
};
