/** Turning a chart scene into files: a standalone SVG, and a PNG drawn through a canvas. */

import type { Scene } from "@/lib/charts/build";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** The SVG as a file: self-contained, with explicit colours and no external references. */
export function svgBytes(scene: Scene): Uint8Array {
  return new TextEncoder().encode(XML_HEADER + scene.svg);
}

/** `report.xlsx` → `report-chart.svg`: the file's name without its extension, plus what this is. */
export function exportName(sourceName: string, extension: "svg" | "png"): string {
  const base = sourceName.replace(/\.[^./\\]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "chart";
  return `${base}-chart.${extension}`;
}

/** Draw the SVG onto a canvas at `scale`× and return the PNG. Needs a browser (canvas and image decoding). */
export async function svgToPng(scene: Scene, scale = 2): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([scene.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The chart could not be drawn."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(scene.width * scale);
    canvas.height = Math.round(scene.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No PNG.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
