import { clampRoundSeconds, clampTargetScore, defaultSettings, SKIP_PENALTY_OPTIONS } from "./game";
import { THEME_IDS } from "./themes";
import type { AliasSettings, Lang, ThemeId } from "./types";

/** Persisted key for the Alias setup screen. */
export const ALIAS_STORAGE_KEY = "lab:alias:v1";

export interface StoredTeam {
  name: string;
  color: string;
}

export interface StoredAliasState {
  settings: AliasSettings;
  teams: StoredTeam[];
}

export interface AliasStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): AliasStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ru";
}

function isTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

function isSkipPenalty(value: unknown): value is number {
  return typeof value === "number" && (SKIP_PENALTY_OPTIONS as readonly number[]).includes(value);
}

export function defaultAliasState(): StoredAliasState {
  return { settings: defaultSettings(), teams: [] };
}

/** Validate a partial stored payload, falling back to defaults field by field. */
export function normalizeAliasState(raw: unknown): StoredAliasState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { settings?: unknown; teams?: unknown };
  const settings: AliasSettings = defaultSettings();

  if (candidate.settings && typeof candidate.settings === "object") {
    const stored = candidate.settings as Record<string, unknown>;
    if (isLang(stored.lang)) settings.lang = stored.lang;
    if (isTheme(stored.themeId)) settings.themeId = stored.themeId;
    settings.roundSeconds = clampRoundSeconds(
      typeof stored.roundSeconds === "number" ? stored.roundSeconds : settings.roundSeconds,
    );
    settings.targetScore = clampTargetScore(
      typeof stored.targetScore === "number" ? stored.targetScore : settings.targetScore,
    );
    if (isSkipPenalty(stored.skipPenalty)) settings.skipPenalty = stored.skipPenalty;
    if (typeof stored.sound === "boolean") settings.sound = stored.sound;
  }

  const teams: StoredTeam[] = [];
  if (Array.isArray(candidate.teams)) {
    for (const entry of candidate.teams) {
      if (!entry || typeof entry !== "object") continue;
      const team = entry as Record<string, unknown>;
      const name = typeof team.name === "string" ? team.name.trim().slice(0, 40) : "";
      const color = typeof team.color === "string" ? team.color : "";
      if (!name) continue;
      teams.push({ name, color });
      if (teams.length >= 8) break;
    }
  }

  return { settings, teams };
}

export function readAliasState(storage: AliasStorage | undefined = storageOrUndefined()): StoredAliasState | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(ALIAS_STORAGE_KEY);
    if (!value) return null;
    return normalizeAliasState(JSON.parse(value));
  } catch {
    return null;
  }
}

export function writeAliasState(
  state: StoredAliasState,
  storage: AliasStorage | undefined = storageOrUndefined(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A preference is never worth breaking a page over.
  }
}
