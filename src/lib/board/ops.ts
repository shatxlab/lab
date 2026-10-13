/** Whole-board edits as pure functions: the order things are stacked in. */

import type { BoardElement } from "@/lib/board/model";

export type Reorder = "front" | "back" | "forward" | "backward";

/**
 * Move the chosen elements within the drawing order (later is on top).
 * `front` and `back` pile them at the ends, keeping their order among themselves;
 * `forward` and `backward` step each past one neighbour that is not also chosen.
 * Returns the same array when nothing would change.
 */
export function reorder(elements: readonly BoardElement[], ids: readonly string[], mode: Reorder): BoardElement[] {
  const chosen = new Set(ids);
  if (chosen.size === 0 || !elements.some((el) => chosen.has(el.id))) return elements as BoardElement[];

  let next: BoardElement[];
  if (mode === "front" || mode === "back") {
    const picked = elements.filter((el) => chosen.has(el.id));
    const rest = elements.filter((el) => !chosen.has(el.id));
    next = mode === "front" ? [...rest, ...picked] : [...picked, ...rest];
  } else {
    next = [...elements];
    if (mode === "forward") {
      for (let i = next.length - 2; i >= 0; i -= 1) {
        if (chosen.has(next[i]!.id) && !chosen.has(next[i + 1]!.id)) [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
      }
    } else {
      for (let i = 1; i < next.length; i += 1) {
        if (chosen.has(next[i]!.id) && !chosen.has(next[i - 1]!.id)) [next[i], next[i - 1]] = [next[i - 1]!, next[i]!];
      }
    }
  }
  return next.every((el, i) => el === elements[i]) ? (elements as BoardElement[]) : next;
}

/** Round to the nearest multiple of `step` (0 or less leaves the value alone). */
export const snapTo = (value: number, step: number): number => (step > 0 ? Math.round(value / step) * step : value);
