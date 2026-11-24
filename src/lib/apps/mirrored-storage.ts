/**
 * The storage every lab seam expects (`getItem`/`setItem`/`removeItem`, plus
 * `length`/`key` for the backup), backed by real localStorage — the hot path
 * stays synchronous — with every lab write mirrored into IndexedDB on the side.
 * A `setItem` that throws (private mode, full quota) never reaches the mirror,
 * so the mirror only ever holds values localStorage actually accepted.
 */

import { isLabKey } from "./lab-keys";
import { mirrorDelete, mirrorSet } from "./storage-mirror";

export interface MirroredStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `undefined` exactly where the old seams' `storageOrUndefined` returned it. */
export function mirroredStorage(): MirroredStorage | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return {
      get length() {
        return localStorage.length;
      },
      key(index: number) {
        return localStorage.key(index);
      },
      getItem(key: string) {
        return localStorage.getItem(key);
      },
      setItem(key: string, value: string) {
        localStorage.setItem(key, value);
        if (isLabKey(key)) mirrorSet(key, value);
      },
      removeItem(key: string) {
        localStorage.removeItem(key);
        if (isLabKey(key)) mirrorDelete(key);
      },
    };
  } catch {
    return undefined;
  }
}
