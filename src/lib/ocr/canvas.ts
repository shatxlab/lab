/** The canvas operations the reader needs, in one place so tests can swap them for fakes. */

import { rotatedSize, type GrayImage } from "@/lib/ocr/layout";

export interface CanvasTools {
  /** A small grey copy of the page for analysis, and how many times smaller it is. */
  gray(canvas: HTMLCanvasElement): GrayImage & { scale: number };
  /** The page turned by `degrees` (clockwise positive), on a white page big enough to hold it. */
  rotate(canvas: HTMLCanvasElement, degrees: number): HTMLCanvasElement;
  /** A vertical strip of the page, from x0 up to x1. */
  crop(canvas: HTMLCanvasElement, x0: number, x1: number): HTMLCanvasElement;
  /** A JPEG of the page for showing it back to the user; null where a canvas cannot encode. */
  blob(canvas: HTMLCanvasElement): Promise<Blob | null>;
}

const context = (canvas: HTMLCanvasElement, willRead = false): CanvasRenderingContext2D => {
  const ctx = canvas.getContext("2d", willRead ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error("No canvas.");
  return ctx;
};

const ANALYSIS_SIDE = 800;

export const canvasTools: CanvasTools = {
  gray(canvas) {
    const scale = Math.min(1, ANALYSIS_SIDE / Math.max(canvas.width, canvas.height, 1));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = context(small, true);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, small.width, small.height);
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
    const pixels = ctx.getImageData(0, 0, small.width, small.height).data;
    const data = new Uint8Array(small.width * small.height);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.round(0.299 * pixels[i * 4]! + 0.587 * pixels[i * 4 + 1]! + 0.114 * pixels[i * 4 + 2]!);
    small.width = small.height = 0;
    return { data, width: Math.max(1, Math.round(canvas.width * scale)), height: Math.max(1, Math.round(canvas.height * scale)), scale };
  },

  rotate(canvas, degrees) {
    const size = rotatedSize(canvas.width, canvas.height, degrees);
    const out = document.createElement("canvas");
    out.width = size.width;
    out.height = size.height;
    const ctx = context(out);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  },

  crop(canvas, x0, x1) {
    const left = Math.max(0, Math.floor(x0));
    const width = Math.max(1, Math.min(canvas.width, Math.ceil(x1)) - left);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = canvas.height;
    const ctx = context(out);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, left, 0, width, canvas.height, 0, 0, width, canvas.height);
    return out;
  },

  blob(canvas) {
    return new Promise((resolve) => {
      if (typeof canvas.toBlob !== "function") return resolve(null);
      // An environment that cannot encode may never answer: do not wait for it.
      const timer = setTimeout(() => resolve(null), 4000);
      try {
        canvas.toBlob((blob) => {
          clearTimeout(timer);
          resolve(blob);
        }, "image/jpeg", 0.8);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  },
};
