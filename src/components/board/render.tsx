import * as React from "react";

import type { SvgNode } from "@/lib/board/svg";

/** SVG attribute names with hyphens are camelCase in React. */
const attrName = (name: string): string => (name.startsWith("data-") || name.startsWith("aria-") ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

function styleObject(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const part of css.split(";")) {
    const [key, value] = part.split(":");
    if (key && value) out[key.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value.trim();
  }
  return out as React.CSSProperties;
}

/** The same node description export serialises, as live React elements. */
export function renderNode(node: SvgNode, key?: React.Key): React.ReactElement {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) props[attrName(name)] = name === "style" ? styleObject(String(value)) : value;
  const children: React.ReactNode[] = (node.children ?? []).map((child, i) => renderNode(child, i));
  if (node.text !== undefined) children.push(node.text);
  return React.createElement(node.tag, props, ...children);
}
