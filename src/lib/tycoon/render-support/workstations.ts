/**
 * What sits on each desk: a laptop, or a PC with a flat monitor. The pictures are drawn here, one character
 * per pixel, so the office needs no art beyond the pack. Typing is shown on the desk, not on the person:
 * the screen fills with lines of code and a few keys light up.
 */

export type WorkstationKind = 'pc' | 'laptop'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface WorkstationSpec {
  /** One string per row, one letter per pixel (see `PALETTE`); `.` is clear. */
  art: readonly string[]
  /** The glass, where the code goes. */
  screen: Rect
  /** The key area, where pressed keys flash. */
  keys: Rect
  /** Pixels between the edge of the desk nearest the person and the computer. */
  gap: number
  width: number
  height: number
}

const PALETTE: Readonly<Record<string, number>> = {
  o: 0x1a1c2c, // outline
  d: 0x333c57,
  k: 0x333c57, // a screen that is off
  g: 0x566c86,
  s: 0x94b0c2,
  w: 0xf4f4f4,
  l: 0x41a6f6, // blue light
  e: 0xa7f070, // green light
}

const spec = (art: readonly string[], screen: Rect, keys: Rect, gap: number): WorkstationSpec => ({
  art,
  screen,
  keys,
  gap,
  width: art[0]!.length,
  height: art.length,
})

export const WORKSTATIONS: Readonly<Record<WorkstationKind, WorkstationSpec>> = {
  // Seen from the side, with the screen turned towards the person at the near (left) end: the keyboard in front
  // of it, the monitor's thickness behind the glass, and a slim tower at the far end.
  pc: spec(
    [
      '....oooooogo....',
      '....okkkkodo....',
      '....okkkkodo....',
      '....okkkkodo.ooo',
      '....okkkkodo.odo',
      '....okkkkodo.olo',
      '....okkkkodo.odo',
      '....okkkkodo.ogo',
      '....ossseodo.odo',
      '....oooooodo.odo',
      'oooo..oso....odo',
      'ogso..oso....odo',
      'osgo.ossso...odo',
      'oooo..oooo...ooo',
      '................',
      '.ooo............',
      '.oso............',
      '.ooo............',
    ],
    { x: 5, y: 1, w: 4, h: 7 },
    { x: 1, y: 11, w: 2, h: 2 },
    1,
  ),
  // An open laptop in aluminium: the lid stands at the far end with its screen turned towards the person.
  laptop: spec(
    [
      '....oooooog',
      '....okkkkod',
      '....okkkkod',
      '....okkkkod',
      '....okkkkod',
      '....okkkkod',
      '....ooooood',
      'ooooooooooo',
      'ogsgsgsgsgo',
      'osgsgsgsgso',
      'ooooooooooo',
    ],
    { x: 5, y: 1, w: 4, h: 5 },
    { x: 1, y: 8, w: 5, h: 2 },
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
  const indent = (h % 3) % (cols - 3)
  return { indent, length: 2 + ((h >>> 4) % (cols - indent - 1)), color: LINE_COLORS[(h >>> 9) % LINE_COLORS.length]! }
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

/** Two keys that are down at this step, as positions within the key area. */
export function pressedKeys(step: number, width: number, height: number): [x: number, y: number][] {
  return [0, 1].map((i) => {
    const h = hash(step * 2 + i)
    return [h % width, (h >>> 8) % height] as [number, number]
  })
}
