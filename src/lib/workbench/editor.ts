import type { AppLang } from "@/lib/apps/lang";

/**
 * Framework-agnostic editing core for the workbench.
 *
 * `EditSession` owns a draft value, a bounded undo/redo history and the
 * format list an editor can save into. It is a pure module: no React, no DOM,
 * no `window` — so it runs identically in the browser and in node tests.
 */

/** A save format an editor can serialize its draft into. */
export interface EditFormat {
  id: string;
  extension: string;
  mime: string;
  /** Optional localized display name; falls back to `id`. */
  label?: Partial<Record<AppLang, string>>;
}

export interface EditSessionOptions<T> {
  initial: T;
  formats: readonly EditFormat[];
  serialize: (value: T, formatId: string) => string | Uint8Array;
  /** Equality used for `dirty`; defaults to a JSON-ish deep equal. */
  equals?: (a: T, b: T) => boolean;
  /** Maximum number of retained snapshots (including the current one). Default 100. */
  historyLimit?: number;
}

const DEFAULT_HISTORY_LIMIT = 100;

/** Minimal structural deep equal: Object.is for primitives, then arrays/plain objects. */
function defaultEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => defaultEquals(item, b[index]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      defaultEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Draft + undo/redo history over an arbitrary value type.
 *
 * Snapshots live in a single array with a cursor: `snapshots[cursor]` is the
 * current draft, everything before it is undo history and everything after is
 * redo history. `set(..., { coalesce: true })` replaces the current snapshot
 * instead of pushing, which turns a burst of keystrokes into one undo step.
 */
export class EditSession<T> {
  private initial: T;
  private snapshots: T[];
  private cursor = 0;
  private readonly formatList: readonly EditFormat[];
  private readonly serializeValue: (value: T, formatId: string) => string | Uint8Array;
  private readonly equals: (a: T, b: T) => boolean;
  private readonly historyLimit: number;

  constructor(options: EditSessionOptions<T>) {
    this.initial = options.initial;
    this.snapshots = [options.initial];
    this.formatList = options.formats;
    this.serializeValue = options.serialize;
    this.equals = options.equals ?? (defaultEquals as (a: T, b: T) => boolean);
    const limit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.historyLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_HISTORY_LIMIT;
  }

  /** The current draft. */
  get value(): T {
    return this.snapshots[this.cursor]!;
  }

  /** True when the draft differs from the original document. */
  get dirty(): boolean {
    return !this.equals(this.value, this.initial);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.snapshots.length - 1;
  }

  get formats(): readonly EditFormat[] {
    return this.formatList;
  }

  /**
   * Replace the draft. With `coalesce` the current snapshot is overwritten
   * (used for continuous edits such as typing) so the previous undo point is
   * preserved; plain sets push a new snapshot.
   */
  set(next: T, options?: { coalesce?: boolean }): void {
    if (this.equals(this.value, next)) return;

    // Any new edit discards the redo branch.
    if (this.cursor < this.snapshots.length - 1) {
      this.snapshots.splice(this.cursor + 1);
    }

    if (options?.coalesce && this.cursor > 0) {
      this.snapshots[this.cursor] = next;
    } else {
      this.snapshots.push(next);
      this.cursor += 1;
    }

    if (this.snapshots.length > this.historyLimit) {
      const overflow = this.snapshots.length - this.historyLimit;
      this.snapshots.splice(0, overflow);
      this.cursor -= overflow;
    }
  }

  undo(): void {
    if (this.canUndo) this.cursor -= 1;
  }

  redo(): void {
    if (this.canRedo) this.cursor += 1;
  }

  /** Restore the original document and drop the whole history. */
  revert(): void {
    this.snapshots = [this.initial];
    this.cursor = 0;
  }

  /** The current draft was saved: it becomes the clean baseline, history kept. */
  markSaved(): void {
    this.initial = this.value;
  }

  /** Start a new document: `next` becomes both the initial and the draft. */
  reset(next: T): void {
    this.initial = next;
    this.snapshots = [next];
    this.cursor = 0;
  }

  /** Serialize the current draft through the callback supplied at construction. */
  serialize(formatId: string): string | Uint8Array {
    return this.serializeValue(this.value, formatId);
  }

  /**
   * Serialized bytes plus the naming metadata for a download. Strings are
   * normalized to UTF-8; `name(base)` appends the format's extension.
   */
  output(formatId: string): { bytes: Uint8Array; name: (base: string) => string; mime: string } {
    const format = this.formatList.find((entry) => entry.id === formatId);
    if (!format) throw new Error(`EditSession: unknown format "${formatId}"`);

    const serialized = this.serializeValue(this.value, formatId);
    const bytes =
      typeof serialized === "string" ? new TextEncoder().encode(serialized) : serialized;

    return {
      bytes,
      name: (base: string) => `${base}.${format.extension}`,
      mime: format.mime,
    };
  }
}

export function createEditSession<T>(options: EditSessionOptions<T>): EditSession<T> {
  return new EditSession(options);
}
