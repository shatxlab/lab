import { describe, expect, it } from "vitest";

import { defaultSettings, readSettings, TOWER_SETTINGS_KEY, writeSettings, type SettingsStorage } from "@/lib/tower/settings";

function storage(initial?: string): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[TOWER_SETTINGS_KEY, initial]]);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe("settings", () => {
  it("defaults without a stored choice and never writes on a failed read", () => {
    const empty = storage();
    expect(readSettings(empty)).toEqual(defaultSettings());
    expect(empty.data.has(TOWER_SETTINGS_KEY)).toBe(false);
    for (const raw of ["{broken", "null", "[]", "3", "{\"autofire\":\"yes\"}"]) {
      expect(readSettings(storage(raw))).toEqual(defaultSettings());
    }
  });

  it("keeps only real booleans and round-trips the rest", () => {
    const store = storage(JSON.stringify({ autofire: true, tutorialSeen: false, extra: 1 }));
    const settings = readSettings(store);
    expect(settings).toEqual({ autofire: true, tutorialSeen: false });
    expect(writeSettings({ ...settings, tutorialSeen: true }, store)).toBe(true);
    expect(readSettings(store)).toEqual({ autofire: true, tutorialSeen: true });
  });

  it("reports a failed write without throwing", () => {
    const store = storage();
    store.setItem = () => { throw Error("quota"); };
    expect(writeSettings({ autofire: true, tutorialSeen: true }, store)).toBe(false);
    expect(readSettings(undefined)).toEqual(defaultSettings());
  });
});
