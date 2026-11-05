import { WORKSTATIONS } from './workstations'

/** The same pedestal-table/stool silhouette as the guest tables, widened for two laptops, at the office keyboard height. */
export const FOUNDER_TABLE = { left: 23, width: 30, feet: 36, top: WORKSTATIONS.laptop.top + WORKSTATIONS.laptop.height - 1 } as const

/** Laptop bottoms rest on the tabletop. No founder cups: the clear centre is intentional. */
export function founderCafeStation(px: number, py: number, right: boolean) {
  const tableX = px + FOUNDER_TABLE.left
  const top = py + FOUNDER_TABLE.top
  return {
    // Bring the whole seated figure and its stool 2px inward; do not lengthen the arms.
    seatX: px + (right ? 57.5 : 18.5),
    feet: py + FOUNDER_TABLE.feet,
    laptopX: right ? tableX + FOUNDER_TABLE.width - WORKSTATIONS.laptop.width : tableX,
    laptopY: top - WORKSTATIONS.laptop.height + 1,
  }
}
