import { describe, expect, it } from 'vitest'
import { partitionAt, type Arrangement } from '@/lib/tycoon/render-support/layout'
import { PARTITION_WIDTH, ROW_HEIGHT, WALL_LANE_FEET, pathLength, pointAlong, walkoutPath, type Point } from '@/lib/tycoon/render-support/walkout'

const DOOR_X = 127
const DOOR_FEET = 110
const SIZE = { width: 15, height: 23 }
const WIDE_WINDOW = { left: 0, width: 256 }
const DESKS = 12

/** Where OfficeScene seats someone: the middle of their workstation, head at the top of the row. */
function seatStart(arrangement: Arrangement, desk: number): Point {
  const [px, py] = partitionAt(arrangement, desk >> 1)
  const centre = px + (desk & 1 ? 59.5 : 14.5)
  return { x: Math.round(centre - SIZE.width / 2), y: py + 5 }
}

function partitions(arrangement: Arrangement) {
  return Array.from({ length: DESKS / 2 }, (_, p) => {
    const [x, y] = partitionAt(arrangement, p)
    return { x, y, w: PARTITION_WIDTH, h: ROW_HEIGHT }
  })
}

const overlaps = (at: Point, rect: { x: number; y: number; w: number; h: number }) =>
  at.x < rect.x + rect.w && at.x + SIZE.width > rect.x && at.y < rect.y + rect.h && at.y + SIZE.height > rect.y

function pathFor(arrangement: Arrangement, desk: number, window = WIDE_WINDOW) {
  return walkoutPath({ arrangement, desk, start: seatStart(arrangement, desk), size: SIZE, window, doorX: DOOR_X, doorFeet: DOOR_FEET })
}

describe.each(['wide', 'tall'] as const)('walkoutPath (%s arrangement)', (arrangement) => {
  it.each(Array.from({ length: DESKS }, (_, desk) => [desk]))('desk %i: steps out on the chair side and reaches the doors without crossing a desk', (desk) => {
    const path = pathFor(arrangement, desk)
    const start = seatStart(arrangement, desk)
    expect(path[0]).toEqual(start)
    // Ends in the doorway.
    const last = path[path.length - 1]!
    expect(last).toEqual({ x: Math.round(DOOR_X - SIZE.width / 2), y: DOOR_FEET - SIZE.height })
    // Every leg runs straight along one axis.
    for (let i = 1; i < path.length; i++) expect(path[i]!.x === path[i - 1]!.x || path[i]!.y === path[i - 1]!.y).toBe(true)

    // The first step is sideways, out of the chair's side: the right-hand workstation steps right, the left one left —
    // except that a chair already at the aisle may leave straight ahead only when it truly is in line.
    const right = (desk & 1) === 1
    const first = path[1]!
    if (first.x !== start.x) expect(Math.sign(first.x - start.x)).toBe(right ? 1 : -1)

    // Once clear of the desk, nobody overlaps a partition on the way to the doors.
    const firstLeg = Math.abs(first.x - start.x) + Math.abs(first.y - start.y)
    const total = pathLength(path)
    for (let d = firstLeg + 1; d <= total; d += 1) {
      const at = pointAlong(path, d)
      for (const rect of partitions(arrangement)) expect(overlaps(at, rect), `at ${Math.round(at.x)},${Math.round(at.y)} overlaps a partition`).toBe(false)
    }
  })

  it('walks the wall lane above the first row, on the floor', () => {
    const path = pathFor(arrangement, 4)
    const lane = path.filter((point) => point.y === WALL_LANE_FEET - SIZE.height)
    expect(lane.length).toBeGreaterThan(0)
    // The lane is above every partition.
    expect(WALL_LANE_FEET).toBeLessThan(partitionAt(arrangement, 0)[1])
  })

  it('is no longer than a sensible walk', () => {
    for (let desk = 0; desk < DESKS; desk++) expect(pathLength(pathFor(arrangement, desk))).toBeLessThan(400)
  })
})

describe('wide arrangement lanes', () => {
  it('sends seats whose chair faces the aisle straight up the aisle to the doors', () => {
    // Desk 1 (left partition, right workstation) and desk 2 (right partition, left workstation).
    for (const desk of [1, 2, 5, 6]) {
      const path = pathFor('wide', desk)
      const aisle = Math.round(DOOR_X - SIZE.width / 2)
      expect(path[1]!.x).toBe(aisle)
      expect(path.every((point, i) => i === 0 || point.x === aisle)).toBe(true)
    }
  })

  it('sends the outer workstations round the margins', () => {
    const leftOuter = pathFor('wide', 0)
    const rightOuter = pathFor('wide', 3)
    expect(leftOuter[1]!.x).toBeLessThan(33)
    expect(rightOuter[1]!.x).toBeGreaterThan(145 + PARTITION_WIDTH)
  })

  it('pulls a lane that is off screen to the edge of the window', () => {
    // A phone-sized crop shows only 28..228 of the artwork.
    const cropped = { left: 28, width: 200 }
    const path = pathFor('wide', 0, cropped)
    expect(path[1]!.x).toBe(29)
    const right = pathFor('wide', 3, cropped)
    expect(right[1]!.x).toBeLessThanOrEqual(228 - SIZE.width - 1)
  })
})

describe('pathLength and pointAlong', () => {
  const path: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 4, y: 20 },
  ]

  it('adds up the legs', () => {
    expect(pathLength(path)).toBe(36)
    expect(pathLength([{ x: 3, y: 3 }])).toBe(0)
  })

  it('finds the point a distance along, and the sideways heading', () => {
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0, dx: 1 })
    expect(pointAlong(path, 4)).toEqual({ x: 4, y: 0, dx: 1 })
    expect(pointAlong(path, 15)).toEqual({ x: 10, y: 5, dx: 1 })
    expect(pointAlong(path, 33)).toEqual({ x: 7, y: 20, dx: -1 })
  })

  it('clamps to the ends', () => {
    expect(pointAlong(path, -5)).toMatchObject({ x: 0, y: 0 })
    expect(pointAlong(path, 999)).toMatchObject({ x: 4, y: 20 })
  })
})
