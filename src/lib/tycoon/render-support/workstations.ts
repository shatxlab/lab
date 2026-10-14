/**
 * What sits on each desk: a laptop, or a PC with a flat monitor. The pictures are drawn here, one character
 * per pixel, so the office needs no art beyond the pack. Typing is shown on the desk, not on the person:
 * the screen fills with lines of code and a few keys light up.
 */

export type WorkstationKind = 'pc' | 'laptop'

/** One row of lit glass: `w` pixels from (`x`, `y`). */
export interface Segment {
  x: number
  y: number
  w: number
}

export interface WorkstationSpec {
  /** One string per row, one letter per pixel (see `PALETTE`); `.` is clear. */
  art: readonly string[]
  /** The glass that shows, a row at a time from the top, found from the `k` pixels of the art. */
  screen: readonly Segment[]
  /** Where the keys are (the `c` pixels), so a few can light up. */
  keys: readonly (readonly [x: number, y: number])[]
  /** Pixels between the edge of the desk nearest the person and the computer. */
  gap: number
  width: number
  height: number
}

const PALETTE: Readonly<Record<string, number>> = {
  o: 0x1a1c2c, // outline
  d: 0x333c57,
  k: 0x333c57, // glass that is off
  g: 0x566c86,
  s: 0x94b0c2,
  c: 0xd4dde6, // a key
  w: 0xf4f4f4,
  l: 0x41a6f6, // blue light
}

function spec(art: readonly string[], gap: number): WorkstationSpec {
  const screen: Segment[] = []
  const keys: [number, number][] = []
  art.forEach((row, y) => {
    const run = /k+/.exec(row)
    if (run) screen.push({ x: run.index, y, w: run[0].length })
    for (let x = 0; x < row.length; x++) if (row[x] === 'c') keys.push([x, y])
  })
  return { art, screen, keys, gap, width: art[0]!.length, height: art.length }
}

// Both are seen from the side, the person at the near (left) end, so the glass is only a thin sliver:
// a flat monitor on a stand with a keyboard in front of it, a mouse and a slim tower; a laptop with its
// lid standing at the hinge.
export const WORKSTATIONS: Readonly<Record<WorkstationKind, WorkstationSpec>> = {
  pc: spec(
    [
      '.......oooo.....',
      '......okkdo.....',
      '......okkdo.....',
      '......okkdo..ooo',
      '......okkdo..odo',
      '......okkdo..olo',
      '......okkdo..odo',
      '......okkdo..ogo',
      '......okkdo..odo',
      '......okkdo..odo',
      '.......oooo..odo',
      '........odo..odo',
      'ooooo...odo..odo',
      'ocsco..ossso.ooo',
      'ooooo..ooooo....',
      '................',
      '.ooo............',
      '.oso............',
    ],
    1,
  ),
  laptop: spec(
    [
      '........ooo',
      '.......okko',
      '.......okko',
      '.......okko',
      '.......okko',
      '.......okko',
      '.......okko',
      '.......okko',
      '.......okko',
      'ocscscsoooo',
      'ossssssssso',
      'ooooooooooo',
    ],
    3,
  ),
}

/** Which of the two a desk has. Fixed per desk, so a seat keeps its look whoever sits there, and mixed from the first pair. */
const DESK_PATTERN: readonly WorkstationKind[] = ['pc', 'laptop', 'laptop', 'pc', 'laptop', 'pc', 'pc', 'laptop']

export const workstationFor = (desk: number): WorkstationKind => DESK_PATTERN[desk % DESK_PATTERN.length]!

/** The picture as RGBA pixels. */
export function workstationPixels(kind: WorkstationKind): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const { art, width, height } = WORKSTATIONS[kind]
  const data = new Uint8ClampedArray(width * height * 4)
  art.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const color = PALETTE[row[x]!]
      if (color === undefined) continue
      const at = (y * width + x) * 4
      data[at] = (color >> 16) & 0xff
      data[at + 1] = (color >> 8) & 0xff
      data[at + 2] = color & 0xff
      data[at + 3] = 0xff
    }
  })
  return { data, width, height }
}

/** A screen that is on, and the colours of the code on it. */
export const SCREEN_ON = 0x29366f
export const CURSOR = 0xf4f4f4
export const KEY_DOWN = 0xf4f4f4
const LINE_COLORS = [0xf4f4f4, 0x73eff7, 0xa7f070, 0xffcd75, 0x73eff7, 0xef7d57] as const

const hash = (n: number): number => {
  let h = Math.imul(n + 1, 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  return (h ^ (h >>> 13)) >>> 0
}

/** The code on a screen is a fixed set of lines that comes round again and again. */
const LINE_COUNT = 12

export interface ScreenLine {
  indent: number
  length: number
  color: number
}

/** Line `n` of the code (it wraps), as wide as `cols` allows. */
function lineAt(n: number, cols: number): ScreenLine {
  const h = hash(((n % LINE_COUNT) + LINE_COUNT) % LINE_COUNT)
  const indent = (h % 3) % Math.max(cols - 3, 1)
  return { indent, length: 1 + ((h >>> 4) % (cols - indent)), color: LINE_COLORS[(h >>> 9) % LINE_COLORS.length]! }
}

/**
 * The screen at typing step `step`: `rows` lines, the last one being typed one character per step and
 * the ones above it complete. When a line is done the rest scroll up. `cursor.col` is where the next character goes.
 */
export function typingScreen(step: number, rows: number, cols: number): { lines: ScreenLine[]; cursor: { row: number; col: number } } {
  const all = Array.from({ length: LINE_COUNT }, (_, n) => lineAt(n, cols))
  // A line takes a step per character and one more to pause before the next.
  const period = all.reduce((sum, line) => sum + line.length + 1, 0)
  let left = ((step % period) + period) % period
  let current = 0
  while (left > all[current]!.length) {
    left -= all[current]!.length + 1
    current += 1
  }
  const typed = Math.min(left, all[current]!.length)

  const lines = Array.from({ length: rows }, (_, row) => {
    const line = lineAt(current - (rows - 1) + row, cols)
    return row === rows - 1 ? { ...line, length: typed } : line
  })
  return { lines, cursor: { row: rows - 1, col: lines[rows - 1]!.indent + typed } }
}

/** Two of `count` keys that are down at this step, by number. */
export function pressedKeys(step: number, count: number): number[] {
  return [0, 1].map((i) => hash(step * 2 + i) % count)
}
