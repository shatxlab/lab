/*
 * Export / import of everything lab keeps in localStorage.
 *
 * Every app stores its progress and preferences under a `lab:` key (the EPUB
 * reader predates that convention and uses `epub-reader:`). A backup is a
 * plain JSON file holding the raw string values, so restoring one is exactly
 * what the apps would have written themselves — no per-app migration code.
 *
 * The site shares an origin (shatxlab.github.io) with other projects, so only
 * keys matching KEY_PATTERN are ever read, written or removed.
 */

export const BACKUP_FORMAT = "lab-backup";
export const BACKUP_VERSION = 1;

/** Keys belonging to lab. Anything else on the origin is never touched. */
export const KEY_PATTERN = /^(lab:|epub-reader:)/;

/** Hard caps so a hostile or accidental huge file can't hang the tab. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_KEYS = 500;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

export interface BackupStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ImportMode = "merge" | "replace";

export type ParseError = "invalid" | "format" | "version" | "empty" | "tooLarge";

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: ParseError };

export function isLabKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function storageOrUndefined(): BackupStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** All lab keys currently in storage (snapshot, safe to mutate storage after). */
export function labKeys(storage: BackupStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isLabKey(key)) keys.push(key);
  }
  return keys.sort();
}

export function collectBackup(storage: BackupStorage | undefined = storageOrUndefined(), now: Date = new Date()): BackupFile {
  const data: Record<string, string> = {};
  if (storage) {
    for (const key of labKeys(storage)) {
      const value = storage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export function backupFilename(now: Date = new Date()): string {
  return `lab-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "tooLarge" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "format" };
  const candidate = raw as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT || typeof candidate.data !== "object" || candidate.data === null) {
    return { ok: false, error: "format" };
  }
  if (typeof candidate.version !== "number" || candidate.version > BACKUP_VERSION) {
    return { ok: false, error: "version" };
  }

  const data: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(candidate.data)) {
    // Foreign keys and non-string values are dropped, never written.
    if (!isLabKey(key) || typeof value !== "string") continue;
    data[key] = value;
    count += 1;
    if (count > MAX_BACKUP_KEYS) return { ok: false, error: "tooLarge" };
  }
  if (count === 0) return { ok: false, error: "empty" };

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: candidate.version,
      exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
      data,
    },
  };
}

/** Friendly group ids for the import summary ("reader", "crossword", ...). */
export function groupForKey(key: string): string {
  if (key.startsWith("epub-reader:")) return "reader";
  const match = /^lab:([a-z]+)/.exec(key);
  return match?.[1] ?? "other";
}

export function summarizeBackup(backup: BackupFile): { keys: number; groups: string[] } {
  const groups = new Set<string>();
  for (const key of Object.keys(backup.data)) groups.add(groupForKey(key));
  return { keys: Object.keys(backup.data).length, groups: [...groups].sort() };
}

/**
 * Write a parsed backup into storage.
 *  - "merge": imported values overwrite keys of the same name; every other
 *    existing lab key is kept.
 *  - "replace": all lab keys are removed first, so storage ends up holding
 *    exactly the backup.
 */
export function applyBackup(
  backup: BackupFile,
  mode: ImportMode,
  storage: BackupStorage | undefined = storageOrUndefined(),
): { written: number; removed: number } {
  if (!storage) return { written: 0, removed: 0 };
  let removed = 0;
  if (mode === "replace") {
    for (const key of labKeys(storage)) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  let written = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    if (!isLabKey(key)) continue;
    storage.setItem(key, value);
    written += 1;
  }
  return { written, removed };
}
