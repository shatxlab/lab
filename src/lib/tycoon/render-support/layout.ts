/** Width of the room's artwork in sprite pixels. Walls and floor go on beyond it on either side as far as the screen needs. */
export const SCENE_WIDTH = 256

/**
 * The sides of the artwork can be cropped until this much of its width is left. The vending machine and
 * the snack cabinet live in the margins; the desks sit in the middle 200 pixels.
 */
export const MIN_VISIBLE_WIDTH = 200

/**
 * How the desks are laid out: in rows of four, two partitions side by side, for wide screens; or in a
 * single column of partitions, two desks to a row, for tall ones such as a phone held upright, so the
 * room is narrow and deep and can be shown bigger.
 */
export type Arrangement = 'wide' | 'tall'

/** The narrowest part of the artwork each arrangement can be cropped to: its desks and the people at them. */
export const MIN_WIDTH: Record<Arrangement, number> = { wide: MIN_VISIBLE_WIDTH, tall: 100 }

const FIRST_ROW = 132
const ROW_GAP = 30
/**
 * The room's last row worth showing in the wide arrangement, by rows of desks (fewer desks show less floor). The
 * last row's desks stand on legs reaching 5 rows past their front, which is where the next row would start.
 */
const WIDE_BOTTOMS = [170, 200, 230] as const
/** In the tall arrangement the pets lie below the desks, so the room runs this far past the last row. */
const TALL_MARGIN = 62

/** Top-left of desk partition `p` (each holds two desks) in an arrangement. */
export function partitionAt(arrangement: Arrangement, p: number): [x: number, y: number] {
  if (arrangement === 'tall') return [89, FIRST_ROW + ROW_GAP * p]
  return [p % 2 === 0 ? 33 : 145, FIRST_ROW + ROW_GAP * Math.floor(p / 2)]
}

/**
 * Whether partition `p`'s desks run up to another partition in front of them. The pack draws desks that way, so
 * the ones that do not (the last row, and a short one above a gap) need a front and legs to stand on.
 */
export function partitionInFront(arrangement: Arrangement, p: number, desks: number): boolean {
  return 2 * (p + (arrangement === 'tall' ? 1 : 2)) < desks
}

/** The room's last row worth showing with this many desks: just below the desks (and the pets). */
export function roomBottom(arrangement: Arrangement, desks: number): number {
  if (arrangement === 'wide') return WIDE_BOTTOMS[Math.min(Math.max(Math.ceil(desks / 4), 1), WIDE_BOTTOMS.length) - 1]
  return partitionAt('tall', Math.max(Math.ceil(desks / 2), 1) - 1)[1] + TALL_MARGIN
}

/**
 * Inside a partition the right-hand workstation is the left-hand one mirrored: a pixel at column x from the
 * partition's left edge has its twin at `MIRROR - 1 - x` (the desks run 19 to 35 and 40 to 56), and a point x
 * (a centre, say) at `MIRROR - x`.
 */
export const MIRROR = 76

/** The left-hand chair's column and the middle of the person sitting at the left-hand desk, from the partition's left edge. */
export const LEFT_CHAIR_X = 7
export const LEFT_SEAT_X = 14.5

/** The middle of the person at a workstation, across from its partition's left edge. */
export const seatX = (right: boolean): number => (right ? MIRROR - LEFT_SEAT_X : LEFT_SEAT_X)

/** The column of a workstation's chair, `width` wide (the right-hand one is drawn mirrored), from the partition's left edge. */
export const chairX = (right: boolean, width: number): number => (right ? MIRROR - LEFT_CHAIR_X - width : LEFT_CHAIR_X)

/** The room starts at the top of its wall: the artwork above that row was sky, and is never shown. */
export const ROOM_TOP = 48

export interface SceneLayout {
  /** Screen pixels per sprite pixel. */
  scale: number
  /** The window onto the room, in sprite pixels: its left and top edges in scene coordinates, and its size. */
  left: number
  top: number
  width: number
  height: number
}

/**
 * Fits the room into an area so that it fills it completely. It zooms until the room, from the top of
 * its wall down to `bottom` (the last row worth showing, below the desks), just fills the area's height;
 * walls and floor then run across the full width, past the artwork where the area is wider. On a narrow
 * area the zoom stops where only `minWidth` of the artwork would be left, and the floor goes on below
 * the desks instead. The artwork stays centred.
 */
export function sceneLayout(areaWidth: number, areaHeight: number, bottom: number, minWidth = MIN_VISIBLE_WIDTH): SceneLayout {
  const roomHeight = bottom - ROOM_TOP
  const scale = Math.max(Math.min(areaHeight / roomHeight, areaWidth / minWidth), 0.1)
  const width = Math.max(1, Math.ceil(areaWidth / scale))
  const height = Math.max(1, Math.ceil(areaHeight / scale))
  return { scale, left: Math.round((SCENE_WIDTH - width) / 2), top: ROOM_TOP, width, height }
}
