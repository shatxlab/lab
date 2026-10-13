import * as React from "react";

import { targetIndex } from "@/lib/cv/drag";

export interface Sortable {
  /** The item being dragged and where it would land, or null. */
  drag: { id: string; to: number } | null;
  /** Ids in their current order. */
  ids: readonly string[];
  /** Pass to an item's element so its position can be measured. */
  refFor: (id: string) => (element: HTMLElement | null) => void;
  /** Begin a drag from a handle's pointer-down. */
  start: (id: string, event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * Drag-to-reorder for a vertical list, with one Pointer Events path for mouse,
 * touch and pen. Only a handle starts a drag, so scrolling the page by touch still
 * works. The result is reported on release; the up/down buttons stay as the
 * keyboard-friendly way to do the same.
 */
export function useSortable(ids: readonly string[], onMove: (id: string, to: number) => void): Sortable {
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const live = React.useRef({ ids, onMove });
  live.current = { ids, onMove };
  const [drag, setDrag] = React.useState<Sortable["drag"]>(null);
  const cleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanup.current?.(), []);

  const refFor = React.useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) nodes.current.set(id, element);
      else nodes.current.delete(id);
    },
    [],
  );

  const start = React.useCallback((id: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const from = live.current.ids.indexOf(id);
    if (from < 0) return;
    const where = (y: number) =>
      targetIndex(
        live.current.ids.map((other) => {
          const rect = nodes.current.get(other)?.getBoundingClientRect();
          return rect ? rect.top + rect.height / 2 : 0;
        }),
        from,
        y,
      );
    setDrag({ id, to: from });
    const move = (e: PointerEvent) => setDrag({ id, to: where(e.clientY) });
    const finish = (e: PointerEvent, apply: boolean) => {
      cleanup.current?.();
      setDrag(null);
      const to = where(e.clientY);
      if (apply && to !== from) live.current.onMove(id, to);
    };
    const up = (e: PointerEvent) => finish(e, true);
    const cancel = (e: PointerEvent) => finish(e, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    };
  }, []);

  return { drag, ids, refFor, start };
}
