import { describe, expect, it } from 'vitest'
import { BREAK_SPOTS, BUILDING_H, buildingLayout, DESK_TOP, floorHuddle, floorPartitionAt, FLOOR_H, FLOOR_W, MARGIN, WALL_BAND } from '@/lib/tycoon/render-support/building'
import { REGION_OFFICE_LIMIT } from '@/lib/tycoon/sim/balance'
import { createInitialState } from '@/lib/tycoon/sim/state'

function studio(floors: number) {
  const state = createInitialState(1)
  state.offices[0].kind = 'office'
  for (let i = 1; i < floors; i++) state.offices.push({ id: state.nextId++, kind: 'office', theme: i, region: 'us', project: null })
  return state
}

describe('buildingLayout', () => {
  it('always stands the whole building, the floors not rented yet empty above the ones that are', () => {
    for (const floors of [1, 3, REGION_OFFICE_LIMIT]) {
      const [us] = buildingLayout(studio(floors), 390, 560, 'us').buildings
      expect(us.floors).toHaveLength(floors)
      expect(us.vacant).toHaveLength(REGION_OFFICE_LIMIT - floors)
      expect(us.h).toBe(BUILDING_H)
      // Floors and vacant floors stack from the lobby up, one above the other.
      const levels = [...us.floors, ...us.vacant].map((box) => box.y)
      levels.forEach((y, i) => expect(y).toBe(us.lobby.y - (i + 1) * FLOOR_H))
      expect(us.vacant.at(-1)?.y ?? us.floors.at(-1)!.y).toBe(us.roof.y + us.roof.h)
    }
  })

  it('leaves an empty lot where there is no office yet', () => {
    const layout = buildingLayout(studio(1), 1280, 700)
    const eu = layout.buildings.find((b) => b.region === 'eu')!
    expect(eu.open).toBe(false)
    expect(eu.floors).toHaveLength(0)
    expect(eu.vacant).toHaveLength(0)
  })

  it('fits a phone at three quarters or more', () => {
    const layout = buildingLayout(studio(2), 390, 523, 'us')
    expect(layout.scale).toBeGreaterThanOrEqual(0.75)
    expect(layout.height * layout.scale).toBeLessThanOrEqual(523)
    expect(layout.height).toBe(BUILDING_H + 2 * MARGIN)
  })
})

describe('a floor inside', () => {
  it('lays twelve desks out as up close: two partitions to a row, three rows, inside the floor', () => {
    const tops = new Set<number>()
    for (let p = 0; p < 6; p++) {
      const [x, y] = floorPartitionAt(p)
      tops.add(y)
      expect(x + 79).toBeLessThanOrEqual(FLOOR_W)
      // The last row's desks stand on legs 35 rows below their partition, above the slab.
      expect(y + 35).toBeLessThanOrEqual(FLOOR_H - 4)
    }
    expect(tops.size).toBe(3)
    expect(floorPartitionAt(1)[0] - floorPartitionAt(0)[0]).toBe(112)
  })

  it('has room for the stand-up right of the desks and for a break at the wall', () => {
    const rightmost = floorPartitionAt(1)[0] + 79
    for (const spot of floorHuddle(12)) {
      expect(spot.x - 7).toBeGreaterThan(rightmost)
      expect(spot.x + 7).toBeLessThanOrEqual(FLOOR_W)
    }
    for (const spot of BREAK_SPOTS) expect(spot.feet).toBeLessThan(DESK_TOP)
    expect(BREAK_SPOTS.every((spot) => spot.feet > WALL_BAND)).toBe(true)
  })
})
