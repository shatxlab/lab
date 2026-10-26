import { makePath, type Path, type Point } from "./path";
import type { MapId } from "./types";

export interface MapDef {
  id: MapId;
  /** Every road starts in the woods above the field and ends at the gate. */
  roads: readonly Path[];
  plots: readonly Point[];
  waves: number;
  startGold: number;
  /** Multiplies every enemy's HP on this map. */
  toughness: number;
}

const road = (...points: [number, number][]) => makePath(points.map(([x, y]) => ({ x, y })));
const plots = (...points: [number, number][]) => points.map(([x, y]) => ({ x, y }));

/** In the order they unlock. */
export const MAPS: readonly MapDef[] = [
  {
    // A long road snaking back and forth across the meadow: plenty of time to learn.
    id: "meadow",
    roads: [road([70, -24], [70, 150], [290, 150], [290, 300], [70, 300], [70, 440], [180, 440], [180, 572])],
    plots: plots(
      [30, 100],
      [130, 100],
      [230, 100],
      [110, 225],
      [180, 225],
      [250, 225],
      [330, 225],
      [330, 330],
      [30, 370],
      [130, 370],
      [230, 370],
      [120, 510],
      [240, 510],
    ),
    waves: 12,
    startGold: 250,
    toughness: 1,
  },
  {
    // Two long diagonals: shorter, and the ballista's to sweep.
    id: "ford",
    roads: [road([300, -24], [300, 120], [60, 250], [60, 370], [180, 460], [180, 572])],
    plots: plots(
      [254, 64],
      [236, 112],
      [188, 142],
      [110, 184],
      [254, 184],
      [200, 214],
      [122, 256],
      [104, 304],
      [26, 304],
      [104, 358],
      [146, 388],
      [74, 424],
      [122, 460],
      [140, 508],
    ),
    waves: 15,
    startGold: 280,
    toughness: 1.3,
  },
  {
    // Two roads out of the woods that meet in the middle and run on together to the gate.
    id: "crossroads",
    roads: [
      road([50, -24], [50, 180], [180, 270], [180, 390], [100, 470], [180, 572]),
      road([310, -24], [310, 180], [180, 270], [180, 390], [100, 470], [180, 572]),
    ],
    plots: plots(
      [218, 196],
      [176, 226],
      [254, 262],
      [134, 280],
      [218, 304],
      [140, 334],
      [218, 358],
      [128, 388],
      [194, 424],
      [92, 430],
      [164, 466],
      [62, 472],
      [182, 514],
      [92, 514],
    ),
    waves: 20,
    startGold: 320,
    toughness: 1.6,
  },
];

export const MAP_IDS = MAPS.map((map) => map.id);

export function mapById(id: MapId): MapDef {
  const map = MAPS.find((entry) => entry.id === id);
  if (!map) throw new Error(`unknown map ${id}`);
  return map;
}
