import { makePath, type Path, type Point } from "./path";
import type { CanvasId, MapId, NewFoeKind } from "./types";

export interface MapDef {
  id: MapId;
  /** Which look the map is drawn in; the simulation never reads it. */
  canvas: CanvasId;
  /** Every road starts in the woods above the field and ends at the gate. */
  roads: readonly Path[];
  plots: readonly Point[];
  /** The new foes this map sends, besides the meadow's five. */
  foes: readonly NewFoeKind[];
  /** Whether archers pick fire or lune arrows for their third level. */
  archerBranches: boolean;
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
    roads: [road([60, -24], [60, 110], [300, 110], [300, 225], [60, 225], [60, 340], [300, 340], [300, 440], [180, 440], [180, 572])],
    plots: plots([128, 48], [122, 162], [218, 168], [74, 174], [170, 174], [230, 270], [140, 282], [188, 294], [272, 294], [122, 390], [170, 390], [218, 396], [146, 432], [230, 486]),
    waves: 16,
    startGold: 320,
    toughness: 1.5,
  },
  {
    // Two roads that never meet until the gate: a tower sees only one of them.
    id: "rivers",
    canvas: "meadow",
    foes: [],
    archerBranches: false,
    roads: [road([50, -24], [50, 380], [180, 480], [180, 572]), road([310, -24], [310, 380], [180, 480], [180, 572])],
    plots: plots([86, 72], [86, 168], [86, 300], [272, 336], [86, 348], [140, 396], [218, 402], [176, 432], [92, 456], [272, 462], [230, 486], [128, 492], [266, 522], [92, 528], [218, 534], [140, 540]),
    waves: 18,
    startGold: 340,
    toughness: 1.25,
  },
  {
    // One road, nine bends and a lot of diagonals.
    id: "serpent",
    canvas: "meadow",
    foes: [],
    archerBranches: false,
    roads: [road([300, -24], [300, 90], [90, 160], [270, 250], [90, 340], [270, 430], [180, 500], [180, 572])],
    plots: plots([236, 60], [152, 102], [104, 114], [206, 174], [254, 180], [110, 234], [158, 234], [134, 276], [200, 324], [248, 324], [224, 366], [110, 390], [158, 414], [170, 462], [248, 498]),
    waves: 20,
    startGold: 340,
    toughness: 1.9,
  },
  {
    // Two roads cross in the middle of the field and swap sides.
    id: "saltire",
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
    roads: [road([180, -24], [180, 60], [110, 130], [250, 200], [110, 270], [250, 340], [110, 410], [180, 480], [180, 572])],
    plots: plots([128, 60], [206, 84], [200, 132], [242, 156], [110, 174], [152, 198], [110, 222], [236, 264], [188, 270], [110, 318], [152, 342], [110, 366], [200, 408], [206, 456], [134, 486]),
    waves: 24,
    startGold: 360,
    toughness: 2,
  },
  {
    // Three roads out of the woods run together into one for the last stretch to the gate.
    id: "trident",
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
    canvas: "meadow",
    foes: [],
    archerBranches: false,
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
  {
    // A spiral of a road: back and forth down the field, always turning toward the gate.
    id: "harvest",
    canvas: "autumn",
    foes: ["knight"],
    archerBranches: true,
    roads: [road([300, -24], [300, 90], [60, 90], [60, 200], [260, 200], [260, 310], [100, 310], [100, 420], [260, 420], [260, 490], [180, 530], [180, 572])],
    plots: plots([229, 32], [93, 124], [249, 128], [177, 140], [133, 144], [217, 160], [93, 252], [185, 252], [137, 260], [225, 272], [133, 344], [217, 356], [173, 364], [177, 456], [221, 468], [145, 488]),
    waves: 16,
    startGold: 380,
    toughness: 1.75,
  },
  {
    // Two roads run down either side of the orchard and meet before the gate.
    id: "orchards",
    canvas: "autumn",
    foes: ["knight", "scamp"],
    archerBranches: true,
    roads: [
      road([60, -24], [60, 330], [180, 470], [180, 572]),
      road([300, -24], [300, 330], [180, 470], [180, 572]),
    ],
    plots: plots([25, 60], [93, 248], [265, 276], [93, 296], [249, 324], [113, 336], [197, 376], [149, 380], [177, 416], [113, 448], [245, 452], [145, 480], [213, 484], [113, 512], [249, 512], [213, 540], [145, 544]),
    waves: 18,
    startGold: 380,
    toughness: 1.4,
  },
  {
    // Tight bends from edge to edge: every tower sees the road three times.
    id: "hairpin",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp"],
    archerBranches: true,
    roads: [road([300, -24], [300, 70], [60, 140], [300, 210], [60, 280], [300, 350], [60, 420], [180, 490], [180, 572])],
    plots: plots([133, 84], [261, 144], [217, 152], [165, 204], [121, 208], [77, 212], [285, 276], [177, 280], [241, 280], [137, 336], [97, 356], [205, 412], [153, 428], [189, 456], [113, 488]),
    waves: 20,
    startGold: 400,
    toughness: 2.45,
  },
  {
    // Two roads cross, and a third runs straight down the middle.
    id: "crows",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer"],
    archerBranches: true,
    roads: [
      road([60, -24], [60, 160], [300, 340], [300, 420], [180, 500], [180, 572]),
      road([300, -24], [300, 160], [60, 340], [60, 420], [180, 500], [180, 572]),
      road([180, -24], [180, 572]),
    ],
    plots: plots([129, 132], [225, 140], [145, 180], [213, 184], [121, 248], [237, 248], [213, 316], [145, 320], [249, 348], [137, 376], [217, 380], [253, 408], [145, 436], [213, 436], [125, 504], [229, 508], [145, 544], [213, 552]),
    waves: 22,
    startGold: 400,
    toughness: 1.3,
  },
  {
    // A road straight to the gate, and another that takes the long way round.
    id: "detour",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [
      road([180, -24], [180, 572]),
      road([40, -24], [40, 150], [320, 150], [320, 300], [40, 300], [40, 430], [180, 500], [180, 572]),
    ],
    plots: plots([117, 100], [257, 112], [213, 116], [117, 184], [213, 184], [145, 220], [245, 220], [101, 228], [285, 240], [137, 264], [237, 264], [145, 336], [213, 336], [105, 368], [125, 412], [213, 484], [121, 508]),
    waves: 22,
    startGold: 420,
    toughness: 1.3,
  },
  {
    // One road out of the woods splits in two and meets again at the gate.
    id: "parting",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [
      road([180, -24], [180, 150], [60, 260], [60, 400], [180, 500], [180, 572]),
      road([180, -24], [180, 150], [300, 260], [300, 400], [180, 500], [180, 572]),
    ],
    plots: plots([217, 48], [145, 56], [213, 92], [145, 104], [257, 112], [101, 116], [217, 136], [133, 148], [249, 168], [181, 196], [213, 228], [145, 428], [181, 456], [129, 500], [233, 500], [213, 540], [137, 544]),
    waves: 24,
    startGold: 420,
    toughness: 1.4,
  },
  {
    // One road winds the whole field; another hugs the edge and cuts in late.
    id: "winding",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [
      road([50, -24], [50, 120], [310, 200], [50, 280], [310, 360], [180, 460], [180, 572]),
      road([320, -24], [320, 300], [250, 420], [180, 500], [180, 572]),
    ],
    plots: plots([269, 152], [85, 200], [189, 200], [125, 220], [249, 268], [205, 272], [161, 280], [285, 296], [121, 336], [337, 336], [225, 380], [185, 400], [313, 400], [281, 432], [153, 440], [145, 484], [237, 484], [213, 524]),
    waves: 24,
    startGold: 430,
    toughness: 1.4,
  },
  {
    // Long straights from wall to wall: every shot has a long way to fall.
    id: "gauntlet",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [road([30, -24], [30, 100], [330, 100], [330, 190], [30, 190], [30, 280], [330, 280], [330, 370], [30, 370], [30, 460], [180, 500], [180, 572])],
    plots: plots([293, 136], [81, 140], [169, 140], [125, 144], [249, 144], [261, 224], [65, 228], [153, 228], [197, 232], [109, 236], [301, 244], [293, 316], [81, 320], [169, 320], [125, 324], [249, 324], [109, 416], [69, 436]),
    waves: 26,
    startGold: 440,
    toughness: 1.7,
  },
  {
    // Three roads, three kings: the outer two run straight, the middle one twists.
    id: "kings",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [
      road([40, -24], [40, 240], [180, 400], [180, 572]),
      road([320, -24], [320, 240], [180, 400], [180, 572]),
      road([180, -24], [110, 120], [250, 200], [110, 290], [180, 400], [180, 572]),
    ],
    plots: plots([85, 72], [117, 212], [249, 240], [101, 256], [185, 288], [181, 332], [93, 352], [249, 376], [125, 388], [217, 408], [101, 428], [145, 432], [257, 432], [213, 452], [145, 480], [217, 496], [141, 524], [213, 540]),
    waves: 28,
    startGold: 450,
    toughness: 1.3,
  },
  {
    // The long watch: three roads, the last of them straight and fast. The winter warlord waits.
    id: "watch",
    canvas: "autumn",
    foes: ["knight", "scamp", "imp", "healer", "gargoyle"],
    archerBranches: true,
    roads: [
      road([60, -24], [60, 180], [300, 260], [60, 340], [60, 430], [180, 500], [180, 572]),
      road([300, -24], [300, 100], [180, 150], [300, 330], [180, 480], [180, 572]),
      road([180, -24], [180, 572]),
    ],
    plots: plots([229, 52], [225, 96], [125, 120], [145, 160], [249, 192], [145, 244], [125, 284], [225, 320], [109, 364], [217, 364], [145, 392], [105, 412], [145, 440], [245, 452], [217, 488], [121, 504], [213, 532], [145, 544]),
    waves: 28,
    startGold: 480,
    toughness: 1.4,
  },
];

export const MAP_IDS = MAPS.map((map) => map.id);

export function mapById(id: MapId): MapDef {
  const map = MAPS.find((entry) => entry.id === id);
  if (!map) throw new Error(`unknown map ${id}`);
  return map;
}
