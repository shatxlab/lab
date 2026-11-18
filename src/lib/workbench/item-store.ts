import * as React from "react";

/**
 * The list behind a batch screen. A thousand files that each report progress
 * would re-render a thousand rows a thousand times if every update went through
 * `setState`; instead the items live in a ref, updates replace one entry in
 * O(1), and React is told about it at most once per `intervalMs`. Items are
 * replaced, never mutated, so memoised rows only re-render when theirs changed.
 */
export interface ItemStore<T extends { id: number }> {
  /** A snapshot that React renders from; refreshed at most every `intervalMs`. */
  items: readonly T[];
  /** The live list, always current (for effects and workers). */
  all(): readonly T[];
  get(id: number): T | undefined;
  /** Replace the whole list. */
  reset(list: readonly T[]): void;
  /** Merge `changes` into one item; `now` publishes immediately instead of on the next tick. */
  update(id: number, changes: Partial<T>, now?: boolean): void;
  /** Merge `changes` into many items and publish once. */
  updateMany(ids: readonly number[], changes: Partial<T>): void;
}

export function useItemStore<T extends { id: number }>(intervalMs = 120): ItemStore<T> {
  const data = React.useRef<T[]>([]);
  const index = React.useRef(new Map<number, number>());
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = React.useState<readonly T[]>([]);

  const publish = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setItems(data.current.slice());
  }, []);

  const schedule = React.useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setItems(data.current.slice());
    }, intervalMs);
  }, [intervalMs]);

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return React.useMemo<ItemStore<T>>(
    () => ({
      items,
      all: () => data.current,
      get: (id) => {
        const position = index.current.get(id);
        return position === undefined ? undefined : data.current[position];
      },
      reset: (list) => {
        data.current = list.slice();
        index.current = new Map(data.current.map((item, position) => [item.id, position]));
        publish();
      },
      update: (id, changes, now = false) => {
        const position = index.current.get(id);
        if (position === undefined) return;
        data.current[position] = { ...data.current[position]!, ...changes };
        if (now) publish();
        else schedule();
      },
      updateMany: (ids, changes) => {
        for (const id of ids) {
          const position = index.current.get(id);
          if (position !== undefined) data.current[position] = { ...data.current[position]!, ...changes };
        }
        publish();
      },
    }),
    [items, publish, schedule],
  );
}
