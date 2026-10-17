/** Bounded parallelism for batch work, so a thousand files never mean a thousand things in flight. */

/**
 * How many files to work on at once. Decoding a photo can take hundreds of
 * megabytes, so this stays low; a phone with little memory gets one lane.
 */
export function defaultConcurrency(): number {
  if (typeof navigator === "undefined") return 1;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory <= 2) return 1;
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(3, Math.floor(cores / 2)));
}

/** Run `worker` over `items` with at most `concurrency` in flight; stop taking new ones once `shouldStop()`. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (!shouldStop()) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
}

/** A queue that lets at most `max` tasks run at a time. */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
