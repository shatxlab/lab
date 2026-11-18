/**
 * The bookshelf the pack does not have: a wooden case with four shelves of books, drawn from rectangles in the
 * pack's own colours so it sits with the snack cabinet and the vending machine. The books' heights and colours
 * are fixed (a hash of their place), so it is the same bookshelf every time.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  color: number
}

export const BOOKSHELF_WIDTH = 21
export const BOOKSHELF_HEIGHT = 34

const OUTLINE = 0x1a1c2c
const WOOD = 0xa8743a
const WOOD_LIGHT = 0xc8935a
const BACK = 0x333c57
/** Book spines: red, blue, green, sky, sand, white, plum, orange. */
const SPINES = [0xb13e53, 0x3b5dc9, 0x38b764, 0x41a6f6, 0xffcd75, 0xf4f4f4, 0x5d275d, 0xef7d57] as const

/** Rows from the top of the case to the top of each shelf's books, and how tall a shelf's space is. */
const SHELF_TOPS = [3, 10, 17, 24] as const
const SHELF_HEIGHT = 6

/** The rectangles of the bookshelf, from its top-left corner, in the order they are drawn. */
export function bookshelfRects(): Rect[] {
  const rects: Rect[] = []
  const rect = (x: number, y: number, w: number, h: number, color: number) => rects.push({ x, y, w, h, color })
  // The case: outline, wooden sides and top, the dark back behind the shelves.
  rect(0, 0, BOOKSHELF_WIDTH, BOOKSHELF_HEIGHT, OUTLINE)
  rect(1, 1, BOOKSHELF_WIDTH - 2, BOOKSHELF_HEIGHT - 2, WOOD)
  rect(1, 1, BOOKSHELF_WIDTH - 2, 1, WOOD_LIGHT)
  rect(3, 3, BOOKSHELF_WIDTH - 6, BOOKSHELF_HEIGHT - 6, BACK)

  SHELF_TOPS.forEach((top, shelf) => {
    // A shelf board under the books, then the books standing side by side from the left, some a little shorter.
    rect(2, top + SHELF_HEIGHT, BOOKSHELF_WIDTH - 4, 1, WOOD_LIGHT)
    let x = 3
    for (let book = 0; x < BOOKSHELF_WIDTH - 3; book++) {
      const pick = (shelf * 7 + book * 5 + (shelf & 1) * 3) % SPINES.length
      const width = 2 + ((shelf + book) % 2)
      const w = Math.min(width, BOOKSHELF_WIDTH - 3 - x)
      const h = SHELF_HEIGHT - ((shelf * 3 + book * 2) % 3 === 0 ? 1 : 0)
      rect(x, top + SHELF_HEIGHT - h, w, h, SPINES[pick]!)
      // A dark line down each book's left edge, so neighbours of one colour still read apart.
      rect(x, top + SHELF_HEIGHT - h, 1, h, OUTLINE)
      x += w
    }
  })
  return rects
}
