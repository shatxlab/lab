import { hash } from './activity'
import type { Rect } from './bookshelf'

/**
 * An office's routines as they are seen: a stand-up at the Scrum board, a stretch of work, a coffee break, more
 * work, round and round. They are part of how every floor works, not something to switch on, so they only show.
 * They run on the time the game has been running, not on game days: at 2x a game day is under a second, and
 * a stand-up that lasted one would be gone before anyone reached the board.
 */

export type Routine = 'standup' | 'break'

/** One round of a floor's routines, and when in it the stand-up and the coffee break come and how long they last. */
export const ROUTINE_CYCLE_MS = 90_000
export const STANDUP_MS = 16_000
export const BREAK_START_MS = 45_000
export const BREAK_MS = 24_000

/** What the floor is doing at `timeMs` of running time, if anything, and for how long it has been at it. Floors keep their own times. */
export function routineAt(timeMs: number, officeId: number): { routine: Routine; elapsed: number } | null {
  const at = (timeMs + (hash(officeId, 0x51ab) % ROUTINE_CYCLE_MS)) % ROUTINE_CYCLE_MS
  if (at < STANDUP_MS) return { routine: 'standup', elapsed: at }
  if (at >= BREAK_START_MS && at < BREAK_START_MS + BREAK_MS) return { routine: 'break', elapsed: at - BREAK_START_MS }
  return null
}

/** Where someone stands at the stand-up: the middle of their feet, and which way they face (towards the board). */
export interface HuddleSpot {
  x: number
  feet: number
  rightwards: boolean
}

/**
 * Places for `count` people around a board whose middle is at `centerX`: rows of `perRow` a `spacing` apart, the
 * first at `feetRows[0]`, every other row shifted by `shift` so nobody stands right behind someone else.
 */
export function huddleSpots(count: number, centerX: number, feetRows: readonly number[], perRow: number, spacing: number, shift: number): HuddleSpot[] {
  const spots: HuddleSpot[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.min(Math.floor(i / perRow), feetRows.length - 1)
    const inRow = i - row * perRow
    const x = Math.round(centerX + (inRow - (perRow - 1) / 2) * spacing + (row % 2 === 1 ? shift : 0))
    spots.push({ x, feet: feetRows[row]!, rightwards: x < centerX })
  }
  return spots
}

/** The Scrum board's size in sprite pixels. */
export const BOARD_WIDTH = 30
export const BOARD_HEIGHT = 19

const OUTLINE = 0x1a1c2c
const SURFACE = 0xf4f4f4
const LINE = 0x94b0c2
const HEADER = 0x566c86
/** Sticky notes: sand, coral, sky, mint. */
const NOTES = [0xffcd75, 0xef7d57, 0x73eff7, 0xa7f070] as const
/** The notes on the board, and the most a column holds (two wide, three high). */
const NOTE_COUNT = 9
const COLUMN_NOTES = 6

/**
 * The Scrum board: three columns (to do, doing, done) of sticky notes on a whiteboard, the notes moving across as
 * the work is done; `progress` is 0 to 1. Rectangles from its top-left corner, in drawing order.
 */
export function scrumBoardRects(progress: number): Rect[] {
  const rects: Rect[] = [
    { x: 0, y: 0, w: BOARD_WIDTH, h: BOARD_HEIGHT, color: OUTLINE },
    { x: 1, y: 1, w: BOARD_WIDTH - 2, h: BOARD_HEIGHT - 2, color: SURFACE },
    { x: 1, y: 1, w: BOARD_WIDTH - 2, h: 2, color: HEADER },
    { x: 10, y: 3, w: 1, h: BOARD_HEIGHT - 4, color: LINE },
    { x: 20, y: 3, w: 1, h: BOARD_HEIGHT - 4, color: LINE },
  ]
  const done = Math.round(Math.min(Math.max(progress, 0), 1) * NOTE_COUNT)
  const doing = Math.min(2, NOTE_COUNT - done)
  const columns = [NOTE_COUNT - done - doing, doing, done]
  let note = 0
  columns.forEach((count, column) => {
    for (let k = 0; k < Math.min(count, COLUMN_NOTES); k++) {
      rects.push({ x: 2 + column * 10 + (k % 2) * 4, y: 4 + Math.floor(k / 2) * 4, w: 3, h: 3, color: NOTES[note++ % NOTES.length]! })
    }
  })
  return rects
}
