import { MAX_ZOOM, MIN_ZOOM, type View } from "@/lib/board/model";
import type { Point } from "@/lib/board/geometry";

/** screen = (world − view origin) × zoom */
export const toWorld = (view: View, sx: number, sy: number): Point => ({ x: view.x + sx / view.zoom, y: view.y + sy / view.zoom });
export const toScreen = (view: View, p: Point): Point => ({ x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom });

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zoom by `factor` keeping the world point under the screen point (sx, sy) where it is. */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const world = toWorld(view, sx, sy);
  return { zoom, x: world.x - sx / zoom, y: world.y - sy / zoom };
}

/** Move the view so the board slides by (dx, dy) screen pixels. */
export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom });
