import QRCode from "qrcode";

export type ErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrStyle {
  errorCorrection: ErrorCorrection;
  /** Quiet-zone width in modules. */
  margin: number;
  foreground: string;
  background: string;
}

export const DEFAULT_QR_STYLE: QrStyle = {
  errorCorrection: "M",
  margin: 4,
  foreground: "#000000",
  background: "#ffffff",
};

export interface QrMatrix {
  size: number;
  /** Row-major dark-module flags. */
  modules: boolean[];
}

export class QrTooLongError extends Error {
  constructor() {
    super("That is too much data for a QR code.");
    this.name = "QrTooLongError";
  }
}

export function buildMatrix(text: string, errorCorrection: ErrorCorrection): QrMatrix {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: errorCorrection });
    return { size: qr.modules.size, modules: Array.from(qr.modules.data, (value) => value === 1) };
  } catch (error) {
    if (error instanceof Error && /too big|too long|capacity/i.test(error.message)) throw new QrTooLongError();
    throw error;
  }
}

/** Crisp vector output: one path with a rectangle per dark module. */
export function matrixToSvg(matrix: QrMatrix, style: QrStyle, pixelSize = 512): string {
  const total = matrix.size + style.margin * 2;
  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    let run = 0;
    for (let column = 0; column <= matrix.size; column += 1) {
      const dark = column < matrix.size && matrix.modules[row * matrix.size + column];
      if (dark) {
        run += 1;
      } else if (run > 0) {
        path += `M${column - run + style.margin} ${row + style.margin}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${style.background}"/><path d="${path}" fill="${style.foreground}"/></svg>`;
}

/** Whole-pixel module size so edges stay sharp; the canvas ends up ≤ `targetSize`. */
export function drawMatrix(canvas: HTMLCanvasElement, matrix: QrMatrix, style: QrStyle, targetSize = 512): void {
  const total = matrix.size + style.margin * 2;
  const scale = Math.max(1, Math.floor(targetSize / total));
  const side = total * scale;
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = style.background;
  context.fillRect(0, 0, side, side);
  context.fillStyle = style.foreground;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.modules[row * matrix.size + column]) {
        context.fillRect((column + style.margin) * scale, (row + style.margin) * scale, scale, scale);
      }
    }
  }
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Scanners need dark-on-light with decent contrast; inverted codes often fail. */
export function styleWarning(style: QrStyle): "lowContrast" | "inverted" | null {
  if (contrastRatio(style.foreground, style.background) < 3) return "lowContrast";
  if (luminance(style.foreground) > luminance(style.background)) return "inverted";
  return null;
}
