import { describe, expect, it } from 'vitest'
import { pressedKeys, typingScreen, WORKSTATIONS, workstationFor, workstationPixels, type WorkstationKind } from '@/lib/tycoon/render-support/workstations'

const KINDS = Object.keys(WORKSTATIONS) as WorkstationKind[]

describe('workstation art', () => {
  it.each(KINDS)('the %s is a clean rectangle of known pixels', (kind) => {
    const { art, width, height } = WORKSTATIONS[kind]
    expect(art).toHaveLength(height)
    for (const row of art) {
      expect(row).toHaveLength(width)
      expect(row).toMatch(/^[.odkgscwl]+$/)
    }
  })

  it.each(KINDS)('the %s shows a thin sliver of glass, a row at a time from the top', (kind) => {
    const { art, screen, width } = WORKSTATIONS[kind]
    expect(screen.length).toBeGreaterThanOrEqual(5)
    screen.forEach((row, i) => {
      expect(row.w).toBeGreaterThanOrEqual(1)
      expect(row.w).toBeLessThanOrEqual(2)
      expect(row.x + row.w).toBeLessThanOrEqual(width)
      expect(art[row.y]!.slice(row.x, row.x + row.w)).toBe('k'.repeat(row.w))
      if (i > 0) expect(row.y).toBe(screen[i - 1]!.y + 1)
    })
  })

  it.each(KINDS)('the %s has keys on it for the animation to light', (kind) => {
    const { art, keys } = WORKSTATIONS[kind]
    expect(keys.length).toBeGreaterThanOrEqual(2)
    for (const [x, y] of keys) expect(art[y]![x]).toBe('c')
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

  it('fits the lines on a sliver of glass two pixels wide', () => {
    for (let step = 0; step < 300; step++) {
      for (const line of typingScreen(step, 4, 2).lines) {
        expect(line.length).toBeGreaterThanOrEqual(0)
        expect(line.indent + line.length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('comes round again, and works for the small laptop screen', () => {
    expect(typingScreen(3, 3, 9)).toEqual(typingScreen(3, 3, 9))
    expect(typingScreen(-5, 3, 9).lines).toHaveLength(3)
    const { lines } = typingScreen(10_000, 3, 9)
    for (const line of lines) expect(line.indent + line.length).toBeLessThanOrEqual(9)
  })
})

describe('pressedKeys', () => {
  it('presses keys that exist, and not always the same ones', () => {
    const seen = new Set<number>()
    for (let step = 0; step < 100; step++) {
      for (const key of pressedKeys(step, 4)) {
        expect(key).toBeGreaterThanOrEqual(0)
        expect(key).toBeLessThan(4)
        seen.add(key)
      }
    }
    expect(seen.size).toBe(4)
  })
})
