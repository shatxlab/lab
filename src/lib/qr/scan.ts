import jsQR from "jsqr";

/** Minimal slice of the (not yet in lib.dom) BarcodeDetector API. */
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

let detectorPromise: Promise<BarcodeDetectorLike | null> | undefined;

/** The browser's native detector when present (Chromium, Safari): fast and reads many 1D/2D formats. */
function nativeDetector(): Promise<BarcodeDetectorLike | null> {
  detectorPromise ??= (async () => {
    const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) return null;
    try {
      const supported = (await Ctor.getSupportedFormats?.()) ?? [];
      return new Ctor(supported.length > 0 ? { formats: supported } : undefined);
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

/**
 * Read one code from a frame. Tries the native detector first and always
 * falls back to jsQR (QR only), so Firefox and older browsers work too.
 */
export async function decodeFrame(canvas: HTMLCanvasElement): Promise<string | null> {
  const detector = await nativeDetector();
  if (detector) {
    try {
      const found = await detector.detect(canvas);
      const value = found.find((item) => item.rawValue)?.rawValue;
      if (value) return value;
    } catch {
      // Fall through to jsQR.
    }
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return null;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return decodeImageData(image.data, image.width, image.height);
}

export function decodeImageData(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

const MAX_IMAGE_SIDE = 2000;

/** Decode a QR code from an image file; large photos are scaled down first. */
export async function decodeImageFile(file: Blob, canvas: HTMLCanvasElement): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d", { willReadFrequently: true })?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await decodeFrame(canvas);
  } finally {
    bitmap.close();
  }
}
