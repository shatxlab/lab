/**
 * One description of every element, used twice: the page turns it into React
 * elements, and export turns it into a string. So the file is the board.
 */

import { arrowHead, boundsOf, unionOf } from "@/lib/board/geometry";
import type { BoardElement, ColorKey } from "@/lib/board/model";
import type { Palette } from "@/lib/charts/palette";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children?: SvgNode[];
  text?: string;
}

/** The colour a key wears on a palette (the chart palette's validated hues, plus its ink). */
export function colorOf(palette: Palette, key: ColorKey): string {
  switch (key) {
    case "ink":
      return palette.ink;
    case "blue":
      return palette.series[0]!;
    case "orange":
      return palette.series[1]!;
    case "green":
      return palette.series[2]!;
    case "violet":
      return palette.series[6]!;
    default:
      return palette.series[7]!;
  }
}

const r = (value: number): number => Math.round(value * 100) / 100;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const WASH = 0.14;

/** A smooth path through the points: quadratic curves between midpoints. */
export function penPath(points: readonly number[]): string {
  if (points.length < 2) return "";
  if (points.length < 4) return `M${r(points[0]!)} ${r(points[1]!)}l0.01 0`;
  let d = `M${r(points[0]!)} ${r(points[1]!)}`;
  if (points.length === 4) return `${d}L${r(points[2]!)} ${r(points[3]!)}`;
  for (let i = 2; i + 3 < points.length; i += 2) {
    const midX = (points[i]! + points[i + 2]!) / 2;
    const midY = (points[i + 1]! + points[i + 3]!) / 2;
    d += `Q${r(points[i]!)} ${r(points[i + 1]!)} ${r(midX)} ${r(midY)}`;
  }
  const n = points.length;
  return `${d}L${r(points[n - 2]!)} ${r(points[n - 1]!)}`;
}

export function describeElement(el: BoardElement, palette: Palette): SvgNode {
  const color = colorOf(palette, el.color);
  const stroke = { stroke: color, "stroke-width": el.width, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
  switch (el.type) {
    case "rect": {
      const b = boundsOf(el);
      return { tag: "rect", attrs: { x: r(b.x), y: r(b.y), width: r(b.w), height: r(b.h), rx: 4, ...stroke, fill: el.fill ? color : "none", ...(el.fill ? { "fill-opacity": WASH } : {}) } };
    }
    case "ellipse": {
      const b = boundsOf(el);
      return { tag: "ellipse", attrs: { cx: r(b.x + b.w / 2), cy: r(b.y + b.h / 2), rx: r(b.w / 2), ry: r(b.h / 2), ...stroke, fill: el.fill ? color : "none", ...(el.fill ? { "fill-opacity": WASH } : {}) } };
    }
    case "arrow": {
      const [a, b] = arrowHead(el);
      return {
        tag: "g",
        attrs: { fill: "none", ...stroke },
        children: [
          { tag: "line", attrs: { x1: r(el.x1), y1: r(el.y1), x2: r(el.x2), y2: r(el.y2) } },
          { tag: "path", attrs: { d: `M${r(a.x)} ${r(a.y)}L${r(el.x2)} ${r(el.y2)}L${r(b.x)} ${r(b.y)}` } },
        ],
      };
    }
    case "pen":
      return { tag: "path", attrs: { d: penPath(el.points), fill: "none", ...stroke } };
    default: {
      const lines = el.text.split("\n");
      return {
        tag: "text",
        attrs: { x: r(el.x), y: r(el.y + el.size * 0.95), "font-size": el.size, fill: color, "font-family": FONT, style: "white-space:pre" },
        children: lines.map((line, i) => ({ tag: "tspan", attrs: { x: r(el.x), ...(i > 0 ? { dy: r(el.size * 1.25) } : {}) }, text: line })),
      };
    }
  }
}

const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function serializeNode(node: SvgNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${esc(String(value))}"`)
    .join("");
  const inner = (node.children ?? []).map(serializeNode).join("") + (node.text !== undefined ? esc(node.text) : "");
  return inner === "" && node.text === undefined ? `<${node.tag}${attrs}/>` : `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

export interface BoardSvg {
  svg: string;
  width: number;
  height: number;
}

export interface BoardSvgOptions {
  palette: Palette;
  /** A solid background (the palette's surface); otherwise transparent. */
  background?: boolean;
  padding?: number;
}

/** The whole board, cropped to its content, as a standalone SVG. */
export function boardSvg(elements: readonly BoardElement[], options: BoardSvgOptions): BoardSvg {
  const { palette, background = true, padding = 24 } = options;
  const content = unionOf(elements.map(boundsOf));
  const stroke = Math.max(0, ...elements.map((el) => el.width)) / 2 + 2;
  const box = content ?? { x: 0, y: 0, w: 240, h: 140 };
  const width = Math.max(16, Math.ceil(box.w + (content ? stroke * 2 : 0) + padding * 2));
  const height = Math.max(16, Math.ceil(box.h + (content ? stroke * 2 : 0) + padding * 2));
  const x = box.x - (content ? stroke : 0) - padding;
  const y = box.y - (content ? stroke : 0) - padding;
  const body = elements.map((el) => serializeNode(describeElement(el, palette))).join("");
  const back = background ? `<rect x="${r(x)}" y="${r(y)}" width="${width}" height="${height}" fill="${palette.surface}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${width} ${height}" width="${width}" height="${height}">${back}${body}</svg>`;
  return { svg, width, height };
}
