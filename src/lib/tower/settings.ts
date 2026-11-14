/** Comfort settings, separate from permanent progress and active runs. */
export const TOWER_SETTINGS_KEY = "lab:tower:settings:v1";

export interface TowerSettings {
  /** The archer shoots on his own; holding the field still overrides him. */
  autofire: boolean;
  /** First-run hints have done their job and need not come back. */
  tutorialSeen: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): SettingsStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

export function defaultSettings(): TowerSettings {
  return { autofire: false, tutorialSeen: false };
}

/** A failed read is not a choice the player made: fall back to defaults without writing. */
export function readSettings(storage: SettingsStorage | undefined = storageOrUndefined()): TowerSettings {
  const settings = defaultSettings();
  try {
    const raw = storage?.getItem(TOWER_SETTINGS_KEY);
    if (!raw) return settings;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return settings;
    const candidate = parsed as Partial<Record<keyof TowerSettings, unknown>>;
    if (typeof candidate.autofire === "boolean") settings.autofire = candidate.autofire;
    if (typeof candidate.tutorialSeen === "boolean") settings.tutorialSeen = candidate.tutorialSeen;
    return settings;
  } catch {
    return settings;
  }
}

export function writeSettings(settings: TowerSettings, storage: SettingsStorage | undefined = storageOrUndefined()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(TOWER_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
