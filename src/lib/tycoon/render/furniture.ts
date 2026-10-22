import { Graphics, Sprite, type Texture } from 'pixi.js'

/**
 * What the office up close and the building's floors draw the same way: a sprite put down (mirrored in place if
 * asked), and the measurements of a desk and of the person sitting at it.
 */

/** The width of the desk top, which is where a computer sits against its edge. */
export const DESK_WIDTH = 17
/** How far the desk top runs from the partition toward the viewer. */
export const DESK_DEPTH = 19

/**
 * Rows from the top of a partition to the top of a chair. The pack's chairs are drawn for a person standing beside
 * them; with the seat this low, the sitter's thighs rest on it rather than hanging past its front edge.
 */
export const CHAIR_TOP = 9

/** The row of a seated person's feet, counted from the top of their seat (5 rows below their partition's top). */
export const FEET_ROW = 22

const DARK = 0x333c57
const WOOD = 0xef7d57

export function placed(texture: Texture, x: number, y: number, flip = false): Sprite {
  const sprite = new Sprite(texture)
  if (flip) {
    sprite.scale.x = -1
    sprite.x = x + texture.width
  } else {
    sprite.x = x
  }
  sprite.y = y
  return sprite
}

/**
 * What a desk needs to stand on its own, in the garage (which has no partitions) or in an office's last row,
 * drawn from the desk's top-left corner: an edge down the side the pack leaves open (in an office it meets the
 * pole between two desks), the front of the desk and two legs. The pack only draws desks running up to the next
 * partition, so a bare desk top on the floor looks sunk into it.
 */
export function freestandingDesk(right: boolean): Graphics {
  const g = new Graphics()
  const front = DESK_DEPTH
  g.rect(right ? 0 : DESK_WIDTH - 1, 1, 1, front - 1)
  g.rect(0, front, DESK_WIDTH, 1).rect(0, front + 1, 1, 1).rect(DESK_WIDTH - 1, front + 1, 1, 1).rect(0, front + 2, DESK_WIDTH, 1)
  g.rect(0, front + 3, 2, 2).rect(DESK_WIDTH - 2, front + 3, 2, 2)
  g.fill(DARK)
  g.rect(1, front + 1, DESK_WIDTH - 2, 1).fill(WOOD)
  return g
}
