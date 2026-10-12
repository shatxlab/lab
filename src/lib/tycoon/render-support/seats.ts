/**
 * Who sits at which desk. Seats are stable: once someone has a desk they keep it until they leave,
 * whatever happens to the people around them or the size of the office. Newcomers take the lowest free desk.
 */
export class SeatMap {
  private readonly deskOf = new Map<number, number>()

  deskFor(id: number): number | undefined {
    return this.deskOf.get(id)
  }

  /**
   * Brings the seating in line with the people who work here now and the number of desks built.
   * Returns who sat down (with their desk) and who left; everyone else is untouched.
   */
  sync(ids: readonly number[], desks: number): { seated: [id: number, desk: number][]; left: number[] } {
    const present = new Set(ids)
    const left: number[] = []
    for (const id of this.deskOf.keys()) {
      if (present.has(id)) continue
      left.push(id)
      this.deskOf.delete(id)
    }

    const taken = new Set(this.deskOf.values())
    const seated: [number, number][] = []
    for (const id of ids) {
      if (this.deskOf.has(id)) continue
      let desk = 0
      while (taken.has(desk)) desk += 1
      if (desk >= desks) continue // no free desk (yet): they stand until the office grows
      taken.add(desk)
      this.deskOf.set(id, desk)
      seated.push([id, desk])
    }
    return { seated, left }
  }
}
