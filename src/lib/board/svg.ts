/**
 * One description of every element, used twice: the page turns it into React
 * elements, and export turns it into a string. So the file is the board.
 */

import { arrowHead, boundsOf, unionOf } from "@/lib/board/geometry";
import { INK, STROKE, SURFACE, TEXT_SIZE, type BoardElement } from "@/lib/board/model";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children?: SvgNode[];
  text?: string;
}

const r = (value: number): number => Math.round(value * 100) / 100;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function describeElement(el: BoardElement): SvgNode {
  const stroke = { stroke: INK, "stroke-width": STROKE, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
  switch (el.type) {
    case "rect": {
      const b = boundsOf(el);
      return { tag: "rect", attrs: { x: r(b.x), y: r(b.y), width: r(b.w), height: r(b.h), rx: 4, ...stroke, fill: "none" } };
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
    default: {
      const lines = el.text.split("\n");
      return {
        tag: "text",
        attrs: { x: r(el.x), y: r(el.y + TEXT_SIZE * 0.95), "font-size": TEXT_SIZE, fill: INK, "font-family": FONT, style: "white-space:pre" },
        children: lines.map((line, i) => ({ tag: "tspan", attrs: { x: r(el.x), ...(i > 0 ? { dy: r(TEXT_SIZE * 1.25) } : {}) }, text: line })),
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

const PADDING = 24;

/** The whole board, cropped to its content, as a standalone SVG on the board's own background. */
export function boardSvg(elements: readonly BoardElement[]): BoardSvg {
  const content = unionOf(elements.map(boundsOf));
  const stroke = STROKE / 2 + 2;
  const box = content ?? { x: 0, y: 0, w: 240, h: 140 };
  const width = Math.max(16, Math.ceil(box.w + (content ? stroke * 2 : 0) + PADDING * 2));
  const height = Math.max(16, Math.ceil(box.h + (content ? stroke * 2 : 0) + PADDING * 2));
  const x = box.x - (content ? stroke : 0) - PADDING;
  const y = box.y - (content ? stroke : 0) - PADDING;
  const body = elements.map((el) => serializeNode(describeElement(el))).join("");
  const back = `<rect x="${r(x)}" y="${r(y)}" width="${width}" height="${height}" fill="${SURFACE}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${width} ${height}" width="${width}" height="${height}">${back}${body}</svg>`;
  return { svg, width, height };
}
