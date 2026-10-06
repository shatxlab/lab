import { describe, expect, it } from "vitest";

import {
  applyBackup,
  backupFilename,
  collectBackup,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupStorage,
} from "@/lib/apps/backup";

function memoryStorage(initial: Record<string, string> = {}): BackupStorage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe("backup", () => {
  it("collects only lab keys", () => {
    const storage = memoryStorage({
      "lab:lang": "ru",
      "lab:crossword:v1": "{}",
      "epub-reader:state:v1": "{}",
      "other-project:key": "secret",
    });
    const backup = collectBackup(storage, new Date("2025-03-04T05:06:07Z"));
    expect(Object.keys(backup.data).sort()).toEqual(["epub-reader:state:v1", "lab:crossword:v1", "lab:lang"]);
    expect(backup.exportedAt).toBe("2025-03-04T05:06:07.000Z");
    expect(backupFilename(new Date("2025-03-04T05:06:07Z"))).toBe("lab-backup-2025-03-04.json");
  });

  it("round-trips through serialize and parse", () => {
    const storage = memoryStorage({ "lab:lang": "en", "lab:theme:v1": "dark" });
    const parsed = parseBackup(serializeBackup(collectBackup(storage)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(summarizeBackup(parsed.backup)).toEqual({ keys: 2, groups: ["lang", "theme"] });
  });

  it("rejects malformed, foreign and future files", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "invalid" });
    expect(parseBackup("[]")).toEqual({ ok: false, error: "format" });
    expect(parseBackup(JSON.stringify({ format: "x", data: {} }))).toEqual({ ok: false, error: "format" });
    expect(
      parseBackup(JSON.stringify({ format: "lab-backup", version: 99, data: { "lab:a": "1" } })),
    ).toEqual({ ok: false, error: "version" });
    expect(parseBackup(JSON.stringify({ format: "lab-backup", version: 1, data: {} }))).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("drops foreign keys and non-string values on import", () => {
    const result = parseBackup(
      JSON.stringify({
        format: "lab-backup",
        version: 1,
        data: { "lab:ok": "1", "evil:key": "2", "lab:number": 3 },
      }),
    );
    expect(result.ok && Object.keys(result.backup.data)).toEqual(["lab:ok"]);
  });

  it("merge keeps untouched keys, replace removes them — never foreign keys", () => {
    const backup = {
      format: "lab-backup" as const,
      version: 1,
      exportedAt: "",
      data: { "lab:lang": "ru", "lab:new": "x" },
    };

    const merged = memoryStorage({ "lab:lang": "en", "lab:keep": "k", "foreign:key": "f" });
    expect(applyBackup(backup, "merge", merged)).toEqual({ written: 2, removed: 0 });
    expect(merged.getItem("lab:lang")).toBe("ru");
    expect(merged.getItem("lab:keep")).toBe("k");

    const replaced = memoryStorage({ "lab:lang": "en", "lab:keep": "k", "foreign:key": "f" });
    expect(applyBackup(backup, "replace", replaced)).toEqual({ written: 2, removed: 2 });
    expect(replaced.getItem("lab:keep")).toBeNull();
    expect(replaced.getItem("foreign:key")).toBe("f");
    expect(replaced.getItem("lab:new")).toBe("x");
  });
});
