/** Pixel-based board sizing: readable cells by default, an explicit overview on demand. */
export const READABLE_CELL = 44;
export const MIN_CELL = 28;
export const MAX_CELL = 68;
export const GRID_GAP = 2;
export const GRID_PADDING = 8;
export type GridZoom = "fit" | number;

export function gridMetrics(rows: number, cols: number, width: number, height: number, zoom: GridZoom) {
  if (zoom === "fit" && (width <= 0 || height <= 0)) return { cell: 1, width: cols, height: rows, gap: 0, padding: 0 };
  const padding = zoom === "fit" ? 4 : GRID_PADDING;
  // Gaps must shrink too: fixed 2px gaps alone can exceed a cramped viewport.
  const gap = zoom === "fit" ? Math.min(GRID_GAP, Math.max(0, Math.min((width - 8) / cols, (height - 8) / rows) / 8)) : GRID_GAP;
  const cell = zoom === "fit"
    ? Math.max(.1, Math.min(
      (width - padding * 2 - gap * (cols - 1)) / cols,
      (height - padding * 2 - gap * (rows - 1)) / rows,
      READABLE_CELL,
    ))
    : Math.min(MAX_CELL, Math.max(MIN_CELL, zoom));
  return { cell, width: cols * cell + (cols - 1) * gap, height: rows * cell + (rows - 1) * gap, gap, padding };
}

/** Move the viewport only enough to expose the cell; never scroll the document. */
export function revealDelta(start: number, end: number, viewStart: number, viewEnd: number, margin = 8): number {
  if (end - start > viewEnd - viewStart - 2 * margin) return (start + end - viewStart - viewEnd) / 2;
  if (start < viewStart + margin) return start - viewStart - margin;
  if (end > viewEnd - margin) return end - viewEnd + margin;
  return 0;
}
