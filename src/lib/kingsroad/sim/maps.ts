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
    toughness: 1.4,
  },
  {
    // Back and forth across the whole field: five long lanes, and the plots between them see two at once.
    id: "switchback",
    roads: [road([60, -24], [60, 110], [300, 110], [300, 225], [60, 225], [60, 340], [300, 340], [300, 440], [180, 440], [180, 572])],
    plots: plots([128, 48], [122, 162], [218, 168], [74, 174], [170, 174], [230, 270], [140, 282], [188, 294], [272, 294], [122, 390], [170, 390], [218, 396], [146, 432], [230, 486]),
    waves: 16,
    startGold: 320,
    toughness: 1.5,
  },
  {
    // Two roads that never meet until the gate: a tower sees only one of them.
    id: "rivers",
    roads: [road([50, -24], [50, 380], [180, 480], [180, 572]), road([310, -24], [310, 380], [180, 480], [180, 572])],
    plots: plots([86, 72], [86, 168], [86, 300], [272, 336], [86, 348], [140, 396], [218, 402], [176, 432], [92, 456], [272, 462], [230, 486], [128, 492], [266, 522], [92, 528], [218, 534], [140, 540]),
    waves: 18,
    startGold: 340,
    toughness: 1.25,
  },
  {
    // One road, nine bends and a lot of diagonals.
    id: "serpent",
    roads: [road([300, -24], [300, 90], [90, 160], [270, 250], [90, 340], [270, 430], [180, 500], [180, 572])],
    plots: plots([236, 60], [152, 102], [104, 114], [206, 174], [254, 180], [110, 234], [158, 234], [134, 276], [200, 324], [248, 324], [224, 366], [110, 390], [158, 414], [170, 462], [248, 498]),
    waves: 20,
    startGold: 340,
    toughness: 1.9,
  },
  {
    // Two roads cross in the middle of the field and swap sides.
    id: "saltire",
    roads: [
      road([60, -24], [60, 170], [300, 330], [300, 430], [180, 500], [180, 572]),
      road([300, -24], [300, 170], [60, 330], [60, 430], [180, 500], [180, 572]),
    ],
    plots: plots([224, 174], [140, 180], [182, 204], [290, 228], [110, 246], [248, 252], [68, 270], [182, 294], [140, 318], [224, 324], [128, 378], [134, 432], [218, 432], [176, 456], [116, 504], [248, 504]),
    waves: 22,
    startGold: 360,
    toughness: 1.3,
  },
  {
    // A narrow gorge with the road wandering from wall to wall.
    id: "gorge",
    roads: [road([180, -24], [180, 60], [110, 130], [250, 200], [110, 270], [250, 340], [110, 410], [180, 480], [180, 572])],
    plots: plots([128, 60], [206, 84], [200, 132], [242, 156], [110, 174], [152, 198], [110, 222], [236, 264], [188, 270], [110, 318], [152, 342], [110, 366], [200, 408], [206, 456], [134, 486]),
    waves: 24,
    startGold: 360,
    toughness: 2,
  },
  {
    // Three roads out of the woods run together into one for the last stretch to the gate.
    id: "trident",
    roads: [
      road([40, -24], [40, 170], [180, 300], [180, 572]),
      road([180, -24], [180, 300], [180, 572]),
      road([320, -24], [320, 170], [180, 300], [180, 572]),
    ],
    plots: plots([116, 168], [242, 174], [140, 216], [218, 216], [116, 288], [230, 300], [140, 336], [266, 336], [218, 348], [140, 384], [218, 396], [116, 432], [218, 444], [140, 474], [218, 492], [140, 522], [218, 540]),
    waves: 25,
    startGold: 400,
    toughness: 1.5,
  },
  {
    // The last stand: three roads, one of them a long way round.
    id: "citadel",
    roads: [
      road([40, -24], [40, 200], [180, 300], [180, 572]),
      road([320, -24], [320, 200], [180, 300], [180, 572]),
      road([180, -24], [180, 90], [300, 160], [60, 300], [60, 420], [180, 490], [180, 572]),
    ],
    plots: plots([260, 48], [260, 96], [224, 162], [134, 168], [176, 192], [134, 216], [62, 258], [134, 312], [224, 312], [134, 360], [218, 372], [98, 396], [140, 426], [218, 432], [218, 480], [122, 498], [218, 528], [140, 546]),
    waves: 28,
    startGold: 420,
    toughness: 1.3,
  },
];

export const MAP_IDS = MAPS.map((map) => map.id);

export function mapById(id: MapId): MapDef {
  const map = MAPS.find((entry) => entry.id === id);
  if (!map) throw new Error(`unknown map ${id}`);
  return map;
}
