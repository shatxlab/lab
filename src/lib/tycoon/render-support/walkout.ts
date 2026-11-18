import type { Arrangement } from './layout'
import { partitionAt } from './layout'

/**
 * How someone leaves the office. The desks are packed edge to edge, so the only free floor is the lane
 * along the wall under the windows, the aisle between the two columns of partitions (which runs straight
 * up to the doors), and the margins beside the outer partitions. Everyone steps out on the side of their
 * chair, walks to the nearest of those, follows it up to the wall lane and along it to the doors.
 */

export interface Point {
  x: number
  y: number
}

/** The width of a desk partition in sprite pixels, and the height of a row of them. */
export const PARTITION_WIDTH = 79
export const ROW_HEIGHT = 30

/** Where a walker's feet are while on the wall lane: on the floor, above the first row of desks. */
export const WALL_LANE_FEET = 121

/** The gap kept between a walker and the partition they pass. */
const MARGIN_GAP = 4

export interface WalkoutInput {
  arrangement: Arrangement
  /** The desk they sit at: partition `desk >> 1`, the right-hand workstation when `desk` is odd. */
  desk: number
  /** Their top-left corner now. */
  start: Point
  size: { width: number; height: number }
  /** The part of the room on screen, in scene coordinates; lanes outside it are pulled in. */
  window: { left: number; width: number }
  /** The doors' middle, and where a person's feet end up at them. */
  doorX: number
  doorFeet: number
}

/** The top-left corners the walker passes through, from their desk to the doors. */
export function walkoutPath(input: WalkoutInput): Point[] {
  const { size, doorX, doorFeet } = input
  return routePath(input, { x: Math.round(doorX - size.width / 2), y: doorFeet - size.height })
}

/**
 * The top-left corners someone passes through from their desk to `end` (a spot at the wall lane, or in the doorway):
 * out by the lane, up it to the wall lane and along that to `end`'s column, then up or down to it.
 */
export function routePath(input: WalkoutInput, end: Point): Point[] {
  const { arrangement, desk, start, size, window, doorX } = input
  const partition = desk >> 1
  const right = (desk & 1) === 1
  const [px] = partitionAt(arrangement, partition)
  const doorLeft = Math.round(doorX - size.width / 2)

  // Which lane: the aisle when the chair faces it, otherwise the margin on the chair's side.
  let lane: number
  const leftMargin = px - size.width - MARGIN_GAP
  const rightMargin = px + PARTITION_WIDTH + MARGIN_GAP
  if (arrangement === 'wide') {
    const rightColumn = partition % 2 === 1
    const facesAisle = rightColumn ? !right : right
    lane = facesAisle ? doorLeft : rightColumn ? rightMargin : leftMargin
  } else {
    lane = right ? rightMargin : leftMargin
  }
  // A lane off screen (a cropped window) is pulled to the edge of what is shown.
  const lowest = window.left + 1
  const highest = window.left + window.width - size.width - 1
  lane = Math.round(Math.min(Math.max(lane, lowest), Math.max(lowest, highest)))

  const wallY = WALL_LANE_FEET - size.height
  const points: Point[] = [
    { x: start.x, y: start.y },
    { x: lane, y: start.y },
    { x: lane, y: wallY },
    { x: end.x, y: wallY },
    { x: end.x, y: end.y },
  ]
  // Drop corners that change nothing (a seat already in the aisle, a lane already at the doors).
  return points.filter((point, i) => i === 0 || point.x !== points[i - 1]!.x || point.y !== points[i - 1]!.y)
}

/**
 * Where someone already walking `path` (see `routePath`), `distance` along it, goes to leave by the doors instead: on to
 * the wall lane if they are not there yet, along it, to the doors. `start` is where they are now.
 */
export function pathToDoors(path: readonly Point[], distance: number, input: { start: Point; size: { width: number; height: number }; doorX: number; doorFeet: number }): Point[] {
  const { start, size, doorX, doorFeet } = input
  const wallY = WALL_LANE_FEET - size.height
  const doorLeft = Math.round(doorX - size.width / 2)
  const points: Point[] = [start]
  if (start.y > wallY) {
    // Still below the wall lane: carry on the way they were going, forward along the path, until they reach it.
    let left = Math.max(0, distance)
    for (let i = 1; i < path.length && points[points.length - 1]!.y > wallY; i++) {
      const leg = Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y)
      if (left < leg || i === path.length - 1) points.push(path[i]!)
      left -= leg
    }
  }
  // A seat above the wall lane (the sofa's) is left straight down to it.
  const last = points[points.length - 1]!
  if (last.y !== wallY) points.push({ x: last.x, y: wallY })
  points.push({ x: doorLeft, y: wallY }, { x: doorLeft, y: doorFeet - size.height })
  return points.filter((point, i) => i === 0 || point.x !== points[i - 1]!.x || point.y !== points[i - 1]!.y)
}

export function pathLength(path: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y)
  return total
}

/** The point `distance` along the path (every leg is horizontal or vertical), and which way it is heading sideways. */
export function pointAlong(path: readonly Point[], distance: number): { x: number; y: number; dx: number } {
  let left = Math.max(0, distance)
  let dx = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const leg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (b.x !== a.x) dx = Math.sign(b.x - a.x)
    if (left <= leg || i === path.length - 1) {
      const t = leg === 0 ? 1 : Math.min(1, left / leg)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx }
    }
    left -= leg
  }
  const last = path[path.length - 1]!
  return { x: last.x, y: last.y, dx }
}
