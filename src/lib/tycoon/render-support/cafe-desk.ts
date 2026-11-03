import { WORKSTATIONS } from './workstations'

/** Desk top width in sprite pixels; the pixi-free copy of furniture.ts's DESK_WIDTH, guarded by a test. */
export const CAFE_DESK_WIDTH = 17

/** A 4x3 cup spans rows bottom-3..bottom-1: one clear row under the laptop and one above the desk's front edge. */
/** Centre x and bottom row of a café desk's cup: in the clear strip below the laptop, centred under it. */
export function deskCupAnchor(deskX: number, py: number, right: boolean): [x: number, bottom: number] {
  const laptop = WORKSTATIONS.laptop
  const left = right ? CAFE_DESK_WIDTH - laptop.gap - laptop.width : laptop.gap
  return [deskX + left + Math.floor(laptop.width / 2), py + 29]
}
