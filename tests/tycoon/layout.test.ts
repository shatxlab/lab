import { describe, expect, it } from 'vitest'
import { arrange, MIN_VISIBLE_WIDTH, MIN_WIDTH, partitionAt, ROOM_TOP, roomBottom, SCENE_WIDTH, sceneLayout } from '@/lib/tycoon/render-support/layout'

const BOTTOMS = [170, 200, 224] // the room's last row for one, two and three rows of desks

const AREAS = [
  [1100, 600],
  [1920, 700],
  [390, 340],
  [430, 860],
  [768, 900],
  [500, 500],
  [2200, 400],
  [3000, 300],
]

describe('sceneLayout', () => {
  it('fills every area completely: no sky, no empty bands', () => {
    for (const bottom of BOTTOMS) {
      for (const [w, h] of AREAS) {
        const { scale, width, height, top } = sceneLayout(w, h, bottom)
        expect(width * scale, `${w}x${h}/${bottom}`).toBeGreaterThanOrEqual(w - 0.001)
        expect(height * scale, `${w}x${h}/${bottom}`).toBeGreaterThanOrEqual(h - 0.001)
        expect(top).toBe(ROOM_TOP) // it always starts at the top of the wall
      }
    }
  })

  it('on a wide area shows the whole room top to bottom, with walls and floor going on past the artwork', () => {
    const { scale, left, width, height } = sceneLayout(1920, 700, 224)
    expect(scale).toBeCloseTo(700 / (224 - ROOM_TOP))
    expect(height).toBeLessThanOrEqual(224 - ROOM_TOP + 1)
    expect(left).toBeLessThan(0)
    expect(left + width).toBeGreaterThan(SCENE_WIDTH)
  })

  it('keeps the artwork centred', () => {
    for (const [w, h] of AREAS) {
      const { left, width } = sceneLayout(w, h, 170)
      expect(Math.abs(left + width / 2 - SCENE_WIDTH / 2)).toBeLessThanOrEqual(1)
    }
  })

  it('never crops the artwork narrower than the desks need', () => {
    for (const bottom of BOTTOMS) {
      for (const [w, h] of AREAS) expect(sceneLayout(w, h, bottom).width).toBeGreaterThanOrEqual(Math.min(MIN_VISIBLE_WIDTH, w))
    }
  })

  it('on a phone held upright, fills the width by trimming the margins and runs the floor on below', () => {
    const { scale, width, height } = sceneLayout(430, 860, 170)
    expect(scale).toBeCloseTo(430 / MIN_VISIBLE_WIDTH)
    expect(width).toBeLessThan(SCENE_WIDTH)
    expect(ROOM_TOP + height).toBeGreaterThan(170) // more floor than the room needs
  })

  it('grows with the area, and stays finite for degenerate sizes', () => {
    expect(sceneLayout(1400, 800, 170).scale).toBeGreaterThan(sceneLayout(700, 400, 170).scale)
    for (const [w, h] of [[0, 0], [1, 1], [0, 500], [500, 0]]) {
      const layout = sceneLayout(w, h, 170)
      expect(Number.isFinite(layout.scale) && layout.scale > 0).toBe(true)
      expect(layout.width).toBeGreaterThanOrEqual(1)
      expect(layout.height).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(layout.left)).toBe(true)
    }
  })
})

describe('desk arrangements', () => {
  it('lay the desks out in rows of four on wide screens, as the artwork does', () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => partitionAt('wide', p))).toEqual([
      [33, 132],
      [145, 132],
      [33, 162],
      [145, 162],
      [33, 192],
      [145, 192],
    ])
    expect([4, 8, 12].map((desks) => roomBottom('wide', desks))).toEqual([170, 200, 224])
  })

  it('stack them two to a row in one centred column on tall screens, with the pets below', () => {
    for (let p = 0; p < 6; p++) {
      const [x, y] = partitionAt('tall', p)
      expect(x + 79 / 2).toBe(SCENE_WIDTH / 2 + 0.5) // the partition is an odd 79 wide, like the wide artwork's own rows
      expect(y).toBe(132 + 30 * p)
    }
    expect(roomBottom('tall', 4)).toBeGreaterThan(partitionAt('tall', 1)[1] + 30)
    expect(roomBottom('tall', 12)).toBeGreaterThan(roomBottom('tall', 4))
  })

  it('go tall on a phone held upright, so the room fills it and the people are bigger', () => {
    for (const desks of [4, 8, 12]) {
      const tall = arrange(412, 640, desks)
      expect(tall.arrangement, `${desks}`).toBe('tall')
      expect((tall.bottom - ROOM_TOP) * tall.layout.scale).toBeGreaterThanOrEqual(640 - 1) // no bare floor below
      expect(tall.layout.scale).toBeGreaterThan(sceneLayout(412, 640, roomBottom('wide', desks)).scale * 0.95)
      expect(tall.layout.width).toBeGreaterThanOrEqual(MIN_WIDTH.tall)
    }
    expect(arrange(412, 640, 4).layout.scale).toBeGreaterThan(sceneLayout(412, 640, 170).scale * 1.5)
  })

  it('stay wide on a desktop window or a landscape tablet', () => {
    for (const [w, h] of [[1100, 568], [1440, 700], [1024, 600], [768, 650]]) {
      for (const desks of [4, 8, 12]) expect(arrange(w, h, desks).arrangement, `${w}x${h}/${desks}`).toBe('wide')
    }
  })
})
