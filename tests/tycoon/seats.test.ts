import { describe, expect, it } from 'vitest'
import { SeatMap } from '@/lib/tycoon/render-support/seats'

describe('SeatMap', () => {
  it('seats newcomers at the lowest free desk, in the order they are listed', () => {
    const seats = new SeatMap()
    expect(seats.sync([10, 11, 12], 5).seated).toEqual([[10, 0], [11, 1], [12, 2]])
    expect(seats.deskFor(11)).toBe(1)
  })

  it('keeps everyone where they sit when the team or the office changes', () => {
    const seats = new SeatMap()
    seats.sync([10, 11, 12], 5)
    // the first person leaves, the office grows: nobody else moves
    const change = seats.sync([11, 12], 8)
    expect(change).toEqual({ seated: [], left: [10] })
    expect([seats.deskFor(11), seats.deskFor(12)]).toEqual([1, 2])
  })

  it('gives a freed desk to the next hire, not to someone already seated', () => {
    const seats = new SeatMap()
    seats.sync([10, 11, 12], 5)
    seats.sync([11, 12], 5)
    const change = seats.sync([11, 12, 13], 5)
    expect(change.seated).toEqual([[13, 0]])
    expect([seats.deskFor(11), seats.deskFor(12)]).toEqual([1, 2])
  })

  it('leaves people standing until a desk exists, then seats them without disturbing anyone', () => {
    const seats = new SeatMap()
    seats.sync([1, 2, 3], 3)
    expect(seats.sync([1, 2, 3, 4], 3).seated).toEqual([])
    expect(seats.deskFor(4)).toBeUndefined()
    expect(seats.sync([1, 2, 3, 4], 5).seated).toEqual([[4, 3]])
    expect([1, 2, 3].map((id) => seats.deskFor(id))).toEqual([0, 1, 2])
  })

  it('reports nothing when nothing changed', () => {
    const seats = new SeatMap()
    seats.sync([1, 2], 3)
    expect(seats.sync([1, 2], 3)).toEqual({ seated: [], left: [] })
  })

  it('fire-then-upgrade: the person who sat at desk 1 still sits at desk 1', () => {
    const seats = new SeatMap()
    seats.sync([100, 101, 102], 3)
    seats.sync([101, 102], 3) // desk 0 is fired
    seats.sync([101, 102], 5) // office upgrade
    expect([seats.deskFor(101), seats.deskFor(102)]).toEqual([1, 2])
  })
})
