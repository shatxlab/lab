import { describe, expect, it } from 'vitest'
import { BREAK_MS, BREAK_START_MS, huddleSpots, ROUTINE_CYCLE_MS, routineAt, scrumBoardRects, STANDUP_MS } from '@/lib/tycoon/render-support/routines'

describe('routineAt', () => {
  it('gives every floor one stand-up and one coffee break a round, never at once, lasting as long as they say', () => {
    for (const officeId of [1, 2, 7, 40]) {
      const seen = { standup: 0, break: 0 }
      for (let t = 0; t < ROUTINE_CYCLE_MS; t += 100) {
        const routine = routineAt(t, officeId)
        if (routine) seen[routine.routine] += 100
      }
      expect(seen.standup).toBe(STANDUP_MS)
      expect(seen.break).toBe(BREAK_MS)
    }
  })

  it('counts how long the routine has been going', () => {
    let t = 0
    while (routineAt(t, 3)?.routine !== 'break') t += 100
    t -= routineAt(t, 3)!.elapsed
    expect(routineAt(t + 5000, 3)).toEqual({ routine: 'break', elapsed: 5000 })
    expect(routineAt(t + BREAK_MS, 3)).toBeNull()
    expect(BREAK_START_MS).toBeGreaterThan(STANDUP_MS)
  })
})

describe('huddleSpots', () => {
  it('puts everyone in rows round the board, facing it, and nobody on the same spot', () => {
    const spots = huddleSpots(12, 75, [121, 128], 6, 14, 7)
    expect(spots).toHaveLength(12)
    expect(new Set(spots.map((s) => `${s.x},${s.feet}`)).size).toBe(12)
    expect(spots.slice(0, 6).every((s) => s.feet === 121)).toBe(true)
    for (const s of spots) expect(s.rightwards).toBe(s.x < 75)
  })
})

describe('scrumBoardRects', () => {
  const notes = (progress: number) => scrumBoardRects(progress).filter((r) => r.w === 3 && r.h === 3)
  const column = (progress: number, c: number) => notes(progress).filter((r) => r.x >= 2 + c * 10 && r.x < 10 + c * 10).length

  it('moves the notes from to do to done as the work goes on', () => {
    expect(column(0, 2)).toBe(0)
    expect(column(0, 0)).toBeGreaterThan(column(1, 0))
    expect(column(1, 2)).toBeGreaterThan(column(0.5, 2))
    expect(column(0.5, 1)).toBe(2)
  })
})
