/** Pure decisions for the image tool: sizes, formats and file names. */

export type OutputFormat = "keep" | "jpeg" | "png" | "webp" | "avif";
export type ResizeMode = "none" | "fit" | "percent";

export interface ResizeSettings {
  mode: ResizeMode;
  /** Bounding box for "fit"; either side may be left empty. */
  maxWidth: number | null;
  maxHeight: number | null;
  /** 1–400 for "percent". */
  percent: number;
  allowUpscale: boolean;
}

export const MAX_PIXELS = 100_000_000;

export function targetSize(width: number, height: number, resize: ResizeSettings): { width: number; height: number } {
  let scale = 1;
  if (resize.mode === "percent") {
    scale = Math.min(Math.max(resize.percent, 1), 400) / 100;
  } else if (resize.mode === "fit") {
    const limits: number[] = [];
    if (resize.maxWidth && resize.maxWidth > 0) limits.push(resize.maxWidth / width);
    if (resize.maxHeight && resize.maxHeight > 0) limits.push(resize.maxHeight / height);
    if (limits.length > 0) scale = Math.min(...limits);
  }
  if (!resize.allowUpscale && scale > 1) scale = 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
} as const;

export type EncodableMime = (typeof MIME_BY_FORMAT)[keyof typeof MIME_BY_FORMAT];

/**
 * Pick the output type. "keep" stays in the input's format when the browser
 * can write it; everything else (GIF, BMP, SVG, AVIF without support) becomes PNG.
 */
export function resolveMime(inputMime: string, format: OutputFormat, supported: ReadonlySet<string>): EncodableMime {
  if (format !== "keep") {
    const wanted = MIME_BY_FORMAT[format];
    return supported.has(wanted) ? wanted : "image/png";
  }
  const normalized = inputMime === "image/jpg" ? "image/jpeg" : inputMime;
  if ((normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp" || normalized === "image/avif") && supported.has(normalized)) {
    return normalized;
  }
  return "image/png";
}

export function extensionForMime(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[mime] ?? "png";
}

export function baseName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function outputName(name: string, mime: string, suffix: string): string {
  return `${baseName(name)}${suffix}.${extensionForMime(mime)}`;
}

/** Make names unique within one batch (a.png, a-2.png, ...). */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`;
  });
}

export function savedPercent(original: number, result: number): number {
  return original === 0 ? 0 : Math.round((1 - result / original) * 100);
}
