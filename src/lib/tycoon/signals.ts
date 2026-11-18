/**
 * Minimal stand-in for the `@preact/signals` API the engine uses (store.ts and audio.ts read
 * `.value`, and autosave subscribes to `version`). The lab is a React app without Preact, so we
 * reimplement the tiny slice we need instead of adding a dependency; the UI subscribes to these
 * signals through `useSyncExternalStore` (see components/tycoon/context.ts).
 */

export interface Signal<T> {
  value: T
  /** Registers a listener called on every value change (including no-op writes); returns unsubscriber.
   *  Like @preact/signals, the listener also fires once immediately when subscribed (effect semantics,
   *  which createAutosave relies on to arm its first write). */
  subscribe(fn: () => void): () => void
}

class SignalImpl<T> implements Signal<T> {
  #value: T
  #subscribers = new Set<() => void>()

  constructor(initial: T) {
    this.#value = initial
  }

  get value(): T {
    return this.#value
  }

  set value(next: T) {
    this.#value = next
    for (const fn of this.#subscribers) fn()
  }

  /** Bound so it can be passed straight to `useSyncExternalStore` and other subscribe-first APIs. */
  readonly subscribe = (fn: () => void): (() => void) => {
    fn()
    this.#subscribers.add(fn)
    return () => {
      this.#subscribers.delete(fn)
    }
  }
}

export function signal<T>(initial: T): Signal<T> {
  return new SignalImpl(initial)
}
