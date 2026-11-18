import { createLimiter } from "@/lib/workbench/pool";

/**
 * Thumbnails for images. A photo shown 40 px wide must not be decoded at full
 * size: `createImageBitmap` with a target width lets the browser decode it
 * already shrunk (for JPEG, straight from the compressed data), and a small
 * limiter keeps the number of decodes in flight low.
 */

const limit = createLimiter(2);

export type ThumbFit = "cover" | "contain";

/**
 * Draw `blob` into `canvas`, a square of `px` pixels a side. Resolves to false when the
 * browser cannot decode it (the canvas is left empty) or the draw was cancelled.
 */
export async function drawThumb(
  blob: Blob,
  canvas: HTMLCanvasElement,
  px: number,
  fit: ThumbFit,
  isCancelled: () => boolean,
): Promise<boolean> {
  if (typeof createImageBitmap !== "function") return false;
  return limit(async () => {
    if (isCancelled()) return false;
    let bitmap: ImageBitmap;
    try {
      // Only the width is given, so the height follows the picture's own shape.
      bitmap = await createImageBitmap(blob, { resizeWidth: px, resizeQuality: "low", imageOrientation: "from-image" });
    } catch {
      return false;
    }
    try {
      if (isCancelled()) return false;
      const context = canvas.getContext("2d");
      if (!context) return false;
      const scale = (fit === "cover" ? Math.max : Math.min)(px / bitmap.width, px / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.clearRect(0, 0, px, px);
      context.drawImage(bitmap, (px - width) / 2, (px - height) / 2, width, height);
      return true;
    } finally {
      bitmap.close();
    }
  });
}
