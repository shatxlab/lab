/**
 * Chart settings are remembered per file and sheet, so reopening `sales.csv`
 * brings back the chart you made. Stored under `lab:charts:v1` (so the settings
 * backup carries it), a small least-recently-used map keyed by file name and size.
 * Everything read back is sanitised: a stale or hand-edited value can never
 * produce a spec that cannot be drawn (`normalizeSpec` repairs positions anyway).
 */

import type { Aggregate, ChartSpec, ChartType } from "@/lib/charts/spec";
import { CHART_TYPES } from "@/lib/charts/spec";

export const CHART_MEMORY_KEY = "lab:charts:v1";
export const MAX_FILES = 40;
export const MAX_SHEETS_PER_FILE = 12;

export interface SheetMemory {
  spec: Partial<ChartSpec>;
  title: string;
  /** The header override the user chose, or null for "as detected". */
  header: boolean | null;
}

export interface FileMemory {
  /** The sheet that was open, by name. */
  sheet: string;
  sheets: Record<string, SheetMemory>;
}

export type ChartMemory = Record<string, FileMemory>;

const AGGREGATES: readonly Aggregate[] = ["none", "sum", "mean", "count"];

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1000;

/** Keep only what a spec may hold. */
export function cleanSpec(raw: unknown): Partial<ChartSpec> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const spec: Partial<ChartSpec> = {};
  if (CHART_TYPES.includes(input.type as ChartType)) spec.type = input.type as ChartType;
  if (input.x === null || isIndex(input.x)) spec.x = input.x as number | null;
  if (Array.isArray(input.y)) spec.y = input.y.filter(isIndex).slice(0, 12);
  if (typeof input.area === "boolean") spec.area = input.area;
  if (input.bins === null || (typeof input.bins === "number" && Number.isFinite(input.bins))) spec.bins = input.bins as number | null;
  if (AGGREGATES.includes(input.aggregate as Aggregate)) spec.aggregate = input.aggregate as Aggregate;
  if (input.horizontal === null || typeof input.horizontal === "boolean") spec.horizontal = input.horizontal as boolean | null;
  if (typeof input.stacked === "boolean") spec.stacked = input.stacked;
  if (input.splitBy === null || isIndex(input.splitBy)) spec.splitBy = input.splitBy as number | null;
  return spec;
}

function cleanSheet(raw: unknown): SheetMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  return {
    spec: cleanSpec(input.spec),
    title: typeof input.title === "string" ? input.title.slice(0, 120) : "",
    header: typeof input.header === "boolean" ? input.header : null,
  };
}

export function cleanMemory(raw: unknown): ChartMemory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const memory: ChartMemory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_FILES)) {
    if (!value || typeof value !== "object") continue;
    const input = value as { sheet?: unknown; sheets?: unknown };
    const sheets: Record<string, SheetMemory> = {};
    if (input.sheets && typeof input.sheets === "object") {
      for (const [name, sheet] of Object.entries(input.sheets as Record<string, unknown>).slice(0, MAX_SHEETS_PER_FILE)) {
        const clean = cleanSheet(sheet);
        if (clean) sheets[name] = clean;
      }
    }
    memory[key] = { sheet: typeof input.sheet === "string" ? input.sheet : "", sheets };
  }
  return memory;
}

interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): MemoryStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readChartMemory(storage: MemoryStorage | undefined = storageOrUndefined()): ChartMemory {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CHART_MEMORY_KEY);
    return raw ? cleanMemory(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** The key a file is remembered by: its name and size, so two different `data.csv` files are not confused. */
export const fileKey = (name: string, size: number): string => `${name}|${size}`;

/** Remember one sheet's settings (and which sheet is open). Most recently used files stay; the oldest go. */
export function rememberSheet(
  file: string,
  sheetName: string,
  settings: SheetMemory,
  storage: MemoryStorage | undefined = storageOrUndefined(),
): ChartMemory {
  const memory = readChartMemory(storage);
  const previous = memory[file];
  const sheets = { ...(previous?.sheets ?? {}), [sheetName]: { ...settings, spec: cleanSpec(settings.spec) } };
  // Re-insert so this file is the newest, then drop the oldest beyond the limit.
  delete memory[file];
  const next: ChartMemory = { ...memory, [file]: { sheet: sheetName, sheets } };
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) delete next[key];
  const names = Object.keys(sheets);
  for (const name of names.slice(0, Math.max(0, names.length - MAX_SHEETS_PER_FILE))) if (name !== sheetName) delete sheets[name];
  try {
    storage?.setItem(CHART_MEMORY_KEY, JSON.stringify(next));
  } catch {
    // Remembering is a convenience.
  }
  return next;
}

/** Remember which sheet of a file is open, without touching its settings. */
export function rememberOpenSheet(file: string, sheetName: string, storage: MemoryStorage | undefined = storageOrUndefined()): void {
  const memory = readChartMemory(storage);
  const current = memory[file];
  rememberSheet(file, sheetName, current?.sheets[sheetName] ?? { spec: {}, title: "", header: null }, storage);
}
