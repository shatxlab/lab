import { isAnimatedGif, stripJpeg, stripPng } from "@/lib/image/exif";
import {
  MAX_PIXELS,
  MIME_BY_FORMAT,
  outputName,
  resolveMime,
  targetSize,
  type OutputFormat,
  type ResizeSettings,
} from "@/lib/image/plan";
import { MAX_FILE_BYTES } from "@/lib/limits";

export type ImageTask = "convert" | "strip";

export interface ImageSettings {
  task: ImageTask;
  format: OutputFormat;
  /** 0.1–1, used by JPEG, WebP and AVIF. */
  quality: number;
  resize: ResizeSettings;
  /** Fill for transparent pixels when the output has no alpha channel (JPEG). */
  background: string;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  task: "convert",
  format: "keep",
  quality: 0.82,
  resize: { mode: "none", maxWidth: 1920, maxHeight: null, percent: 50, allowUpscale: false },
  background: "#ffffff",
};

export type ImageErrorCode = "fileTooLarge" | "tooManyPixels" | "decode" | "encode";

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) {
    super(code);
    this.name = "ImageError";
    this.code = code;
  }
}

export type ProcessNote = "alreadySmall" | "animatedGif" | "lossless" | "fallbackType";

export interface ProcessedImage {
  blob: Blob;
  name: string;
  mime: string;
  width: number;
  height: number;
  notes: ProcessNote[];
}

/** Input type from the file's bytes — `File.type` is empty or wrong surprisingly often. */
export function sniffImageMime(bytes: Uint8Array, declared: string): string {
  const at = (index: number) => bytes[index] ?? 0;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return "image/gif";
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "image/webp";
  if (at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
    const brand = String.fromCharCode(at(8), at(9), at(10), at(11));
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (at(0) === 0x42 && at(1) === 0x4d) return "image/bmp";
  return declared || "application/octet-stream";
}

let supportedPromise: Set<string> | undefined;

/** Which formats this browser can actually write (AVIF and WebP vary). */
export function supportedOutputMimes(): Set<string> {
  if (supportedPromise) return supportedPromise;
  const supported = new Set<string>(["image/png"]);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    for (const mime of Object.values(MIME_BY_FORMAT)) {
      if (canvas.toDataURL(mime).startsWith(`data:${mime}`)) supported.add(mime);
    }
  } catch {
    // Keep PNG only.
  }
  supportedPromise = supported;
  return supported;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

async function decode(file: Blob, mime: string): Promise<Decoded> {
  // SVG goes through <img>: createImageBitmap rejects SVG blobs in some browsers.
  if (mime !== "image/svg+xml" && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || 512;
    const height = image.naturalHeight || 512;
    return { source: image, width, height, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError("decode");
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function suffixFor(settings: ImageSettings, resized: boolean): string {
  if (settings.task === "strip") return "-clean";
  if (resized) return "-resized";
  return settings.format === "keep" ? "-min" : "";
}

/**
 * Convert / resize / compress one image, or strip its metadata. Re-encoding
 * through a canvas drops EXIF, GPS and other metadata on its own and bakes in
 * the EXIF rotation, so "strip" is lossless only where that is possible
 * (JPEG and PNG); everything else is re-encoded.
 */
export async function processImage(file: File, settings: ImageSettings): Promise<ProcessedImage> {
  if (file.size > MAX_FILE_BYTES) throw new ImageError("fileTooLarge");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inputMime = sniffImageMime(bytes, file.type);
  const notes: ProcessNote[] = [];
  if (inputMime === "image/gif" && isAnimatedGif(bytes)) notes.push("animatedGif");

  if (settings.task === "strip") {
    const stripped = inputMime === "image/jpeg" ? stripJpeg(bytes) : inputMime === "image/png" ? stripPng(bytes) : null;
    if (stripped) {
      const decoded = await decode(new Blob([stripped as unknown as BlobPart], { type: inputMime }), inputMime).catch(() => null);
      const dims = decoded ? { width: decoded.width, height: decoded.height } : { width: 0, height: 0 };
      decoded?.release();
      return {
        blob: new Blob([stripped as unknown as BlobPart], { type: inputMime }),
        name: outputName(file.name, inputMime, "-clean"),
        mime: inputMime,
        ...dims,
        notes: [...notes, "lossless"],
      };
    }
  }

  const decoded = await decode(file, inputMime);
  try {
    if (decoded.width * decoded.height > MAX_PIXELS) throw new ImageError("tooManyPixels");

    const resizing = settings.task === "convert" && settings.resize.mode !== "none";
    const size = resizing ? targetSize(decoded.width, decoded.height, settings.resize) : { width: decoded.width, height: decoded.height };
    const resized = size.width !== decoded.width || size.height !== decoded.height;

    // Strip falls back to a near-lossless re-encode in the original format.
    const format: OutputFormat = settings.task === "strip" ? "keep" : settings.format;
    const quality = settings.task === "strip" ? 0.95 : settings.quality;
    const supported = supportedOutputMimes();
    const mime = resolveMime(inputMime, format, supported);
    if (format !== "keep" && MIME_BY_FORMAT[format] !== mime) notes.push("fallbackType");

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageError("encode");
    if (mime === "image/jpeg") {
      context.fillStyle = settings.background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, size.width, size.height);

    let blob = await toBlob(canvas, mime, quality);
    if (!blob) throw new ImageError("encode");
    let outMime = blob.type || mime;

    // Re-encoding the same format must not make the file bigger.
    if (!resized && outMime === inputMime && blob.size >= file.size) {
      const original = inputMime === "image/jpeg" ? stripJpeg(bytes) : inputMime === "image/png" ? stripPng(bytes) : null;
      const candidate = original && original.length < file.size ? new Blob([original as unknown as BlobPart], { type: inputMime }) : null;
      if (candidate && candidate.size < blob.size) {
        blob = candidate;
        outMime = inputMime;
      }
      notes.push("alreadySmall");
    }

    return {
      blob,
      name: outputName(file.name, outMime, suffixFor(settings, resized)),
      mime: outMime,
      width: size.width,
      height: size.height,
      notes,
    };
  } finally {
    decoded.release();
  }
}
