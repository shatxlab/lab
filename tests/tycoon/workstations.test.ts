import { describe, expect, it } from 'vitest'
import { pressedKeys, typingScreen, WORKSTATIONS, workstationFor, workstationPixels, type WorkstationKind } from '@/lib/tycoon/render-support/workstations'

const KINDS = Object.keys(WORKSTATIONS) as WorkstationKind[]

describe('workstation art', () => {
  it.each(KINDS)('the %s is a clean rectangle of known pixels', (kind) => {
    const { art, width, height } = WORKSTATIONS[kind]
    expect(art).toHaveLength(height)
    for (const row of art) {
      expect(row).toHaveLength(width)
      expect(row).toMatch(/^[.odkgswle]+$/)
    }
  })

  it.each(KINDS)('the %s has its screen and keys where the animation draws them', (kind) => {
    const { art, screen, keys, width, height } = WORKSTATIONS[kind]
    for (let y = screen.y; y < screen.y + screen.h; y++) expect(art[y]!.slice(screen.x, screen.x + screen.w)).toBe('k'.repeat(screen.w))
    expect(screen.x + screen.w).toBeLessThanOrEqual(width)
    expect(keys.x + keys.w).toBeLessThanOrEqual(width)
    expect(keys.y + keys.h).toBeLessThanOrEqual(height)
    // the screen is seen as an odd number of pixel rows, with a line on every other row
    expect(screen.h % 2).toBe(1)
  })

  it.each(KINDS)('paints the %s opaque where there is art and clear elsewhere', (kind) => {
    const { art, width } = WORKSTATIONS[kind]
    const { data } = workstationPixels(kind)
    art.forEach((row, y) => {
      for (let x = 0; x < width; x++) expect(data[(y * width + x) * 4 + 3]).toBe(row[x] === '.' ? 0 : 255)
    })
  })

  it('fits on a desk with room for the person', () => {
    for (const { width, gap } of Object.values(WORKSTATIONS)) expect(gap + width).toBeLessThanOrEqual(17)
  })
})

describe('workstationFor', () => {
  it('always gives the same desk the same computer', () => {
    for (let desk = 0; desk < 24; desk++) expect(workstationFor(desk)).toBe(workstationFor(desk))
  })

  it('mixes laptops and PCs, even in an office of two', () => {
    expect(new Set([0, 1].map(workstationFor))).toEqual(new Set(['pc', 'laptop']))
    expect(new Set(Array.from({ length: 12 }, (_, desk) => workstationFor(desk)))).toEqual(new Set(['pc', 'laptop']))
  })
})

describe('typingScreen', () => {
  const COLS = 9
  const ROWS = 4

  it('always fits the lines on the screen', () => {
    for (let step = 0; step < 400; step++) {
      const { lines, cursor } = typingScreen(step, ROWS, COLS)
      expect(lines).toHaveLength(ROWS)
      for (const line of lines) {
        expect(line.indent).toBeGreaterThanOrEqual(0)
        expect(line.length).toBeGreaterThanOrEqual(0)
        expect(line.indent + line.length).toBeLessThanOrEqual(COLS)
      }
      expect(cursor.row).toBe(ROWS - 1)
      expect(cursor.col).toBeLessThanOrEqual(COLS)
    }
  })

  it('types the last line one character at a time, with the cursor after it', () => {
    let previous = typingScreen(0, ROWS, COLS)
    let grew = 0
    for (let step = 1; step < 200; step++) {
      const now = typingScreen(step, ROWS, COLS)
      const last = (screen: typeof now) => screen.lines[ROWS - 1]!
      if (last(now).length === last(previous).length + 1) grew += 1
      expect(now.cursor.col).toBe(last(now).indent + last(now).length)
      previous = now
    }
    expect(grew).toBeGreaterThan(40)
  })

  it('scrolls the finished line up when the next one starts', () => {
    let scrolled = 0
    let previous = typingScreen(0, ROWS, COLS)
    for (let step = 1; step < 200; step++) {
      const now = typingScreen(step, ROWS, COLS)
      if (now.lines[ROWS - 1]!.length === 0 && previous.lines[ROWS - 1]!.length > 0) {
        expect(now.lines[ROWS - 2]).toEqual(previous.lines[ROWS - 1])
        scrolled += 1
      }
      previous = now
    }
    expect(scrolled).toBeGreaterThan(5)
  })

  it('comes round again, and works for the small laptop screen', () => {
    expect(typingScreen(3, 3, 9)).toEqual(typingScreen(3, 3, 9))
    expect(typingScreen(-5, 3, 9).lines).toHaveLength(3)
    const { lines } = typingScreen(10_000, 3, 9)
    for (const line of lines) expect(line.indent + line.length).toBeLessThanOrEqual(9)
  })
})

describe('pressedKeys', () => {
  it('presses keys inside the key area, and not always the same ones', () => {
    const seen = new Set<string>()
    for (let step = 0; step < 100; step++) {
      for (const [x, y] of pressedKeys(step, 9, 2)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThan(9)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThan(2)
        seen.add(`${x},${y}`)
      }
    }
    expect(seen.size).toBeGreaterThan(10)
  })
})
