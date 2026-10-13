/** Where a dragged item lands: the maths behind drag-to-reorder, apart from any DOM. */

/**
 * `mids` are the vertical midpoints of every item (the dragged one included), top to
 * bottom; `from` is the dragged item's index and `y` the pointer. The result is the
 * index the item will have once moved: the number of *other* items whose midpoint
 * lies above the pointer.
 */
export function targetIndex(mids: readonly number[], from: number, y: number): number {
  let above = 0;
  mids.forEach((mid, index) => {
    if (index !== from && mid < y) above += 1;
  });
  return above;
}
